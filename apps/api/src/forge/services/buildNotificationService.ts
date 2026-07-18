import { loadEnv } from "../../env.js";
import { sendMail, isSmtpConfigured } from "../../mail/mailService.js";
import { escapeHtml, renderHelmEmail } from "../../mail/helmEmailLayout.js";
import { prisma } from "../../db.js";

const TERMINAL_STATUSES = new Set([
  "Succeeded",
  "Failed",
  "Cancelled",
  "TimedOut",
  "PartiallySucceeded",
  "SimulationCompleted",
]);

const FAILURE_STATUSES = new Set(["Failed", "Cancelled", "TimedOut", "PartiallySucceeded"]);

function isFailureStatus(status: string): boolean {
  return FAILURE_STATUSES.has(status);
}

async function mobileLeadEmails(): Promise<string[]> {
  const mobileLeads = await prisma.user.findMany({
    where: { role: "forge_mobile_lead" },
    select: { email: true },
  });
  return [
    ...new Set(
      mobileLeads
        .map((u) => u.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
}

export async function maybeNotifyBuildRequestComplete(
  buildRequestId: string,
  previousOverall: string,
  newOverall: string,
): Promise<boolean> {
  if (previousOverall === newOverall) return false;
  if (!TERMINAL_STATUSES.has(newOverall)) return false;
  if (TERMINAL_STATUSES.has(previousOverall)) return false;

  const env = loadEnv();
  if (!isSmtpConfigured(env)) {
    return false;
  }

  const row = await prisma.forgeBuildRequest.findUnique({
    where: { id: buildRequestId },
    include: {
      application: { include: { bank: true } },
      buildProfile: true,
      requestedBy: { select: { email: true, displayName: true } },
      platformBuilds: {
        include: {
          artifacts: { select: { id: true, fileName: true, fileSizeBytes: true } },
        },
      },
    },
  });

  if (!row) return false;

  const failure = isFailureStatus(newOverall);
  const leads = await mobileLeadEmails();
  const recipients = new Set<string>();

  // Failures: mobile lead only (issue triage). Success: requester + leads + optional PM.
  if (failure) {
    for (const e of leads) recipients.add(e);
  } else {
    if (row.requestedBy.email) recipients.add(row.requestedBy.email.toLowerCase());
    for (const e of leads) recipients.add(e);
    if (row.publishToSharedFolder && row.notifyEmail?.trim()) {
      recipients.add(row.notifyEmail.trim().toLowerCase());
    }
  }

  if (recipients.size === 0) return false;

  const baseUrl = env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5174";
  const detailUrl = `${baseUrl}/forge/builds/${row.id}`;
  const appLabel = `${row.application.name} (${row.application.bank.name})`;
  const requester = row.requestedBy.displayName ?? row.requestedBy.email;

  const issueHtml = row.platformBuilds
    .filter((pb) => FAILURE_STATUSES.has(pb.status) || pb.failureSummary)
    .map((pb) => {
      const cat = pb.failureCategory ? escapeHtml(pb.failureCategory) : "Issue";
      const summary = pb.failureSummary
        ? escapeHtml(pb.failureSummary)
        : escapeHtml(pb.status);
      return `<div style="margin:0 0 10px;padding:10px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
        <div style="font-weight:700;margin:0 0 4px;">${escapeHtml(pb.platform)} · ${cat}</div>
        <div style="font-size:13px;line-height:1.45;">${summary}</div>
      </div>`;
    })
    .join("");

  const artifactHtml = row.platformBuilds
    .flatMap((pb) =>
      pb.artifacts.map((a) => {
        const mb = Math.round(Number(a.fileSizeBytes) / 1024 / 1024);
        return `<li style="margin:0 0 4px;"><strong>${escapeHtml(pb.platform)}</strong>: ${escapeHtml(a.fileName)} (${mb} MB)</li>`;
      }),
    )
    .join("");

  let deliveryHtml = "";
  if (!failure && row.publishToSharedFolder) {
    if (row.sharedDeliveryStatus === "copied" && row.sharedDeliveryPath) {
      deliveryHtml = `<p style="margin:0 0 8px;">Copied for PM handoff (open the shared folder — no Helm login required).</p>
        <code style="display:block;padding:10px 12px;background:#f0f4f8;border-radius:8px;font-size:12px;word-break:break-all;">${escapeHtml(row.sharedDeliveryPath)}</code>
        ${row.sharedDeliveryFileName ? `<p style="margin:8px 0 0;font-size:13px;">File: <strong>${escapeHtml(row.sharedDeliveryFileName)}</strong></p>` : ""}`;
    } else if (row.sharedDeliveryStatus === "failed") {
      deliveryHtml = `<p style="margin:0;color:#b91c1c;">Shared-folder copy failed: ${escapeHtml(row.sharedDeliveryError ?? "unknown")}. The Forge artifact may still be available in Helm.</p>`;
    } else {
      deliveryHtml = `<p style="margin:0;">Shared delivery status: ${escapeHtml(row.sharedDeliveryStatus ?? "pending")}.</p>`;
    }
  }

  const sections: Array<{ heading: string; bodyHtml: string }> = [];
  if (failure && issueHtml) {
    sections.push({ heading: "What failed", bodyHtml: issueHtml });
  }
  if (!failure && artifactHtml) {
    sections.push({
      heading: "Artifacts",
      bodyHtml: `<ul style="margin:0;padding-left:18px;">${artifactHtml}</ul>`,
    });
  }
  if (deliveryHtml) {
    sections.push({ heading: "Shared folder delivery", bodyHtml: deliveryHtml });
  }

  const rows = [
    { label: "Application", value: appLabel },
    { label: "Profile", value: row.buildProfile.name },
    { label: "Git reference", value: row.gitReference },
    { label: "Status", value: newOverall },
    { label: "Requested by", value: requester },
  ];
  if (!failure && row.notifyEmail) {
    rows.push({ label: "PM notify", value: row.notifyEmail });
  }

  const rendered = renderHelmEmail({
    preheader: failure
      ? `Forge build ${newOverall}: ${row.application.name}`
      : `Forge build ready: ${row.application.name}`,
    eyebrow: failure ? "Build issue" : "Build complete",
    title: failure
      ? `${row.application.name} needs attention`
      : `${row.application.name} finished successfully`,
    intro: failure
      ? "A Forge build ended with an error. This notice goes to the mobile lead only so the issue can be triaged in Helm."
      : row.publishToSharedFolder
        ? "The Forge build finished. If shared-folder publish was requested, the path below is ready for the PM."
        : "The Forge build finished. Open Helm to download artifacts or inspect the run.",
    tone: failure ? "danger" : "success",
    rows,
    sections,
    cta: {
      label: failure ? "Open build in Helm" : "View build in Helm",
      href: detailUrl,
    },
    footerNote: failure
      ? "Failure alerts are sent only to forge_mobile_lead accounts. PMs are not emailed for errors."
      : "Sent by Masarat Helm · Forge. PMs use the shared folder path when publish was enabled.",
  });

  const subject = failure
    ? `[Helm Forge] ${newOverall}: ${row.application.name} (${row.gitReference})`
    : `[Helm Forge] ${row.application.name} ${newOverall} (${row.gitReference})`;

  await sendMail(env, {
    to: [...recipients].join(", "),
    subject,
    text: rendered.text,
    html: rendered.html,
  });

  return true;
}

/** Sample success + failure emails for format review (admin/test only). */
export function renderForgeEmailSamples(detailUrl: string): {
  success: { subject: string; html: string; text: string };
  failure: { subject: string; html: string; text: string };
} {
  const success = renderHelmEmail({
    preheader: "Forge build ready: Masarat Gateway Tester",
    eyebrow: "Build complete",
    title: "Masarat Gateway Tester finished successfully",
    intro:
      "The Forge build finished. Shared-folder publish was requested — the path below is ready for the PM (no Helm login).",
    tone: "success",
    rows: [
      { label: "Application", value: "Masarat Gateway Tester (Jumhoria Bank)" },
      { label: "Profile", value: "debug-demo" },
      { label: "Git reference", value: "dev" },
      { label: "Status", value: "Succeeded" },
      { label: "Requested by", value: "Forge Mobile Lead" },
      { label: "PM notify", value: "pm@example.com" },
    ],
    sections: [
      {
        heading: "Artifacts",
        bodyHtml:
          '<ul style="margin:0;padding-left:18px;"><li style="margin:0 0 4px;"><strong>Android</strong>: app-debug.apk (42 MB)</li></ul>',
      },
      {
        heading: "Shared folder delivery",
        bodyHtml: `<p style="margin:0 0 8px;">Copied for PM handoff (open the shared folder — no Helm login required).</p>
          <code style="display:block;padding:10px 12px;background:#f0f4f8;border-radius:8px;font-size:12px;word-break:break-all;">D:\\forge-shared-delivery\\jum\\JUM_Masarat_Gateway_Tester_dev_a1b2c3d4.apk</code>
          <p style="margin:8px 0 0;font-size:13px;">File: <strong>JUM_Masarat_Gateway_Tester_dev_a1b2c3d4.apk</strong></p>`,
      },
    ],
    cta: { label: "View build in Helm", href: detailUrl },
    footerNote:
      "Sent by Masarat Helm · Forge. PMs use the shared folder path when publish was enabled.",
  });

  const failure = renderHelmEmail({
    preheader: "Forge build Failed: Masarat Gateway Tester",
    eyebrow: "Build issue",
    title: "Masarat Gateway Tester needs attention",
    intro:
      "A Forge build ended with an error. This notice goes to the mobile lead only so the issue can be triaged in Helm.",
    tone: "danger",
    rows: [
      { label: "Application", value: "Masarat Gateway Tester (Jumhoria Bank)" },
      { label: "Profile", value: "debug-demo" },
      { label: "Git reference", value: "dev" },
      { label: "Status", value: "Failed" },
      { label: "Requested by", value: "Forge Mobile Lead" },
    ],
    sections: [
      {
        heading: "What failed",
        bodyHtml: `<div style="margin:0 0 10px;padding:10px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
          <div style="font-weight:700;margin:0 0 4px;">Android · CompileError</div>
          <div style="font-size:13px;line-height:1.45;">Gradle task assembleDebug failed: unresolved reference: FooBar</div>
        </div>`,
      },
    ],
    cta: { label: "Open build in Helm", href: detailUrl },
    footerNote:
      "Failure alerts are sent only to forge_mobile_lead accounts. PMs are not emailed for errors.",
  });

  return {
    success: {
      subject: "[Helm Forge] Masarat Gateway Tester Succeeded (dev) — sample",
      ...success,
    },
    failure: {
      subject: "[Helm Forge] Failed: Masarat Gateway Tester (dev) — sample",
      ...failure,
    },
  };
}
