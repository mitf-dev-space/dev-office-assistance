import PDFDocument from "pdfkit";
import type { SurveyResultsDto } from "@office/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

/**
 * Builds a professional survey results PDF with per-question Yes/No bars.
 * Contains no employee or invitation identifiers.
 */
export function buildSurveyResultsPdf(data: SurveyResultsDto): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ink = "#1f2937";
    const accent = "#0f766e";
    const muted = "#6b7280";
    const rule = "#d1d5db";
    const yesColor = "#15803d";
    const noColor = "#b91c1c";

    doc.rect(0, 0, doc.page.width, 8).fill(accent);
    doc.fillColor(accent).fontSize(20).font("Helvetica-Bold").text("Survey Results", 48, 40);
    doc.fillColor(muted).fontSize(10).font("Helvetica").text(data.title, 48, 68);

    if (data.description) {
      doc.fillColor(ink).fontSize(10).font("Helvetica").text(data.description, 48, 86, {
        width: doc.page.width - 96,
      });
    }

    let y = data.description ? 120 : 100;
    doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor(rule).lineWidth(1).stroke();
    y += 14;

    const meta = [
      ["Status", data.status],
      ["Published", formatDate(data.publishedAt)],
      ["Closed", formatDate(data.closedAt)],
      ["Eligible employees", String(data.eligibleCount)],
      ["Responses", String(data.responseCount)],
      ["Participation", `${data.participationPercent}%`],
    ];
    for (const [label, value] of meta) {
      doc.fillColor(muted).fontSize(9).font("Helvetica-Bold").text(label, 48, y, { width: 140 });
      doc
        .fillColor(ink)
        .fontSize(10)
        .font("Helvetica")
        .text(value, 195, y, { width: doc.page.width - 195 - 48 });
      y += 18;
    }

    y += 10;
    for (const q of data.questionResults) {
      if (y > doc.page.height - 130) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 8).fill(accent);
        y = 48;
      }
      doc
        .fillColor(ink)
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`Q${q.position}. ${q.text}`, 48, y, { width: doc.page.width - 96 });
      y += 20;

      const barWidth = doc.page.width - 96 - 130;
      const total = q.total;
      const yesFrac = total > 0 ? q.yes / total : 0;
      const noFrac = total > 0 ? q.no / total : 0;

      // Yes bar
      doc.fillColor(muted).fontSize(9).font("Helvetica-Bold").text("Yes", 48, y, { width: 70 });
      doc.roundedRect(125, y, barWidth, 12, 3).fillColor("#e5e7eb").fill();
      if (yesFrac > 0) {
        doc.roundedRect(125, y, Math.max(4, barWidth * yesFrac), 12, 3).fillColor(yesColor).fill();
      }
      doc
        .fillColor(ink)
        .fontSize(10)
        .font("Helvetica")
        .text(`${q.yes} (${pct(q.yes, total)})`, 125 + barWidth + 8, y - 1, { width: 110 });
      y += 18;

      // No bar
      doc.fillColor(muted).fontSize(9).font("Helvetica-Bold").text("No", 48, y, { width: 70 });
      doc.roundedRect(125, y, barWidth, 12, 3).fillColor("#e5e7eb").fill();
      if (noFrac > 0) {
        doc.roundedRect(125, y, Math.max(4, barWidth * noFrac), 12, 3).fillColor(noColor).fill();
      }
      doc
        .fillColor(ink)
        .fontSize(10)
        .font("Helvetica")
        .text(`${q.no} (${pct(q.no, total)})`, 125 + barWidth + 8, y - 1, { width: 110 });
      y += 24;
    }

    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fillColor(muted)
        .fontSize(8)
        .font("Helvetica")
        .text(
          `Generated ${new Date().toLocaleString("en-GB")} · ${data.title}`,
          48,
          doc.page.height - 40,
          { width: doc.page.width - 96, align: "center" },
        );
    }

    doc.end();
  });
}
