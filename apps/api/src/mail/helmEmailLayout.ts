/** Shared Helm-branded HTML email chrome for transactional mail. */

const HELM_NAVY = "#0f2744";
const HELM_TEAL = "#0d9488";
const HELM_BG = "#f0f4f8";
const HELM_CARD = "#ffffff";
const HELM_MUTED = "#5b6b7c";
const HELM_BORDER = "#d8e0e8";
const HELM_DANGER = "#b91c1c";
const HELM_DANGER_BG = "#fef2f2";
const HELM_OK = "#047857";
const HELM_OK_BG = "#ecfdf5";

export type HelmEmailTone = "neutral" | "success" | "danger";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHelmEmail(input: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  tone?: HelmEmailTone;
  rows?: Array<{ label: string; value: string }>;
  sections?: Array<{ heading: string; bodyHtml: string }>;
  cta?: { label: string; href: string };
  footerNote?: string;
}): { html: string; text: string } {
  const tone = input.tone ?? "neutral";
  const accent =
    tone === "danger" ? HELM_DANGER : tone === "success" ? HELM_OK : HELM_TEAL;
  const bannerBg =
    tone === "danger" ? HELM_DANGER_BG : tone === "success" ? HELM_OK_BG : "#e6f7f5";

  const rowsHtml =
    input.rows && input.rows.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
        ${input.rows
          .map(
            (r) => `<tr>
            <td style="padding:10px 0;border-bottom:1px solid ${HELM_BORDER};width:34%;font-size:13px;color:${HELM_MUTED};vertical-align:top;">${escapeHtml(r.label)}</td>
            <td style="padding:10px 0;border-bottom:1px solid ${HELM_BORDER};font-size:14px;color:${HELM_NAVY};font-weight:600;vertical-align:top;">${escapeHtml(r.value)}</td>
          </tr>`,
          )
          .join("")}
      </table>`
      : "";

  const sectionsHtml = (input.sections ?? [])
    .map(
      (s) => `<div style="margin:0 0 18px;">
        <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${HELM_MUTED};font-weight:700;margin:0 0 8px;">${escapeHtml(s.heading)}</div>
        <div style="font-size:14px;line-height:1.55;color:${HELM_NAVY};">${s.bodyHtml}</div>
      </div>`,
    )
    .join("");

  const ctaHtml = input.cta
    ? `<div style="margin:24px 0 8px;">
        <a href="${escapeHtml(input.cta.href)}" style="display:inline-block;background:${HELM_TEAL};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">${escapeHtml(input.cta.label)}</a>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${HELM_BG};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${HELM_BG};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${HELM_CARD};border-radius:14px;overflow:hidden;border:1px solid ${HELM_BORDER};box-shadow:0 8px 24px rgba(15,39,68,0.06);">
          <tr>
            <td style="background:${HELM_NAVY};padding:22px 28px;">
              <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9fb3c8;font-weight:700;">Masarat · Helm</div>
              <div style="font-size:22px;font-weight:750;color:#ffffff;margin-top:6px;letter-spacing:-0.02em;">Forge</div>
              <div style="font-size:13px;color:#c5d4e4;margin-top:4px;">Engineering office · mobile builds</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;">
              <div style="background:${bannerBg};border-left:4px solid ${accent};border-radius:0 8px 8px 0;padding:12px 14px;margin:16px 0 0;">
                ${input.eyebrow ? `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${accent};font-weight:700;margin:0 0 4px;">${escapeHtml(input.eyebrow)}</div>` : ""}
                <div style="font-size:18px;font-weight:700;color:${HELM_NAVY};line-height:1.3;">${escapeHtml(input.title)}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;">
              ${input.intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:${HELM_NAVY};">${escapeHtml(input.intro)}</p>` : ""}
              ${rowsHtml}
              ${sectionsHtml}
              ${ctaHtml}
              <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:${HELM_MUTED};">
                ${escapeHtml(input.footerNote ?? "This message was sent by Helm Forge at Masarat. Do not reply to this address unless your mail server is monitored.")}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f7fafc;border-top:1px solid ${HELM_BORDER};padding:14px 28px;font-size:11px;color:${HELM_MUTED};">
              © Masarat · Helm Office Assistance · Tripoli
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    "Masarat Helm · Forge",
    input.eyebrow ? input.eyebrow.toUpperCase() : "",
    input.title,
    "",
    input.intro ?? "",
    "",
    ...(input.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    "",
    ...(input.sections ?? []).flatMap((s) => [s.heading, s.bodyHtml.replace(/<[^>]+>/g, ""), ""]),
    input.cta ? `${input.cta.label}: ${input.cta.href}` : "",
    "",
    input.footerNote ?? "— Masarat Helm Forge",
  ].filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""));

  return { html, text: textParts.join("\n") };
}
