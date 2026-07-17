import { loadEnv } from "../../env.js";
import { sendMail, isSmtpConfigured } from "../../mail/mailService.js";
import { prisma } from "../../db.js";

const TERMINAL_STATUSES = new Set([
  "Succeeded",
  "Failed",
  "Cancelled",
  "TimedOut",
  "PartiallySucceeded",
  "SimulationCompleted",
]);

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

  if (!row?.requestedBy.email) return false;

  const baseUrl = env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5174";
  const detailUrl = `${baseUrl}/forge/builds/${row.id}`;
  const recipientName = row.requestedBy.displayName ?? row.requestedBy.email;
  const artifactLines = row.platformBuilds.flatMap((pb) =>
    pb.artifacts.map(
      (a) =>
        `- ${pb.platform}: ${a.fileName} (${Math.round(Number(a.fileSizeBytes) / 1024 / 1024)} MB)`,
    ),
  );

  const subject = `[Forge] ${row.application.name} build ${newOverall} (${row.gitReference})`;
  const text = [
    `Hello ${recipientName},`,
    "",
    `Your Forge build request has finished with status: ${newOverall}.`,
    "",
    `Application: ${row.application.name} (${row.application.bank.name})`,
    `Profile: ${row.buildProfile.name}`,
    `Branch: ${row.gitReference}`,
    "",
    ...(artifactLines.length > 0 ? ["Artifacts:", ...artifactLines, ""] : []),
    `View build: ${detailUrl}`,
    "",
    "— Masarat Forge (Helm)",
  ].join("\n");

  await sendMail(env, {
    to: row.requestedBy.email,
    subject,
    text,
  });

  return true;
}
