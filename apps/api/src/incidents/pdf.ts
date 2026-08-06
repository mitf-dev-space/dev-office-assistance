import PDFDocument from "pdfkit";

export type IncidentPdfData = {
  incidentNumber: string;
  title: string;
  description: string;
  reporterName: string;
  involvedNames: string[];
  incidentAt: string;
  createdAt: string;
  attachments: Array<{ originalName: string; mimeType: string; sizeBytes: number }>;
};

function formatDate(iso: string): string {
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

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Builds a professional, printable incident report PDF and returns it as a Buffer.
 */
export function buildIncidentPdf(data: IncidentPdfData): Promise<Buffer> {
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

  // Header band
  doc.rect(0, 0, doc.page.width, 8).fill(accent);
  doc
    .fillColor(accent)
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("Incident Report", 48, 40);
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text(`Reference: ${data.incidentNumber}`, 48, 68);

  // Title
  doc
    .fillColor(ink)
    .fontSize(15)
    .font("Helvetica-Bold")
    .text(data.title, 48, 96, { width: doc.page.width - 96 });

  // Meta block
  const metaTop = 128;
  doc.moveTo(48, metaTop).lineTo(doc.page.width - 48, metaTop).strokeColor(rule).lineWidth(1).stroke();

  const meta = [
    ["Reported by", data.reporterName],
    ["Incident date & time", formatDate(data.incidentAt)],
    ["Record created", formatDate(data.createdAt)],
  ];
  let y = metaTop + 14;
  for (const [label, value] of meta) {
    doc
      .fillColor(muted)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(label, 48, y, { width: 130 });
    doc
      .fillColor(ink)
      .fontSize(10)
      .font("Helvetica")
      .text(value, 185, y, { width: doc.page.width - 185 - 48 });
    y += 18;
  }

  // Involved employees
  doc
    .fillColor(ink)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Employees involved", 48, y + 6);
  y += 24;
  if (data.involvedNames.length === 0) {
    doc.fillColor(muted).fontSize(10).font("Helvetica").text("None", 48, y);
    y += 16;
  } else {
    for (const name of data.involvedNames) {
      doc.fillColor(ink).fontSize(10).font("Helvetica").text(`• ${name}`, 48, y);
      y += 16;
    }
  }

  // Description
  y += 8;
  doc
    .fillColor(ink)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Description", 48, y);
  y += 20;
  doc
    .fillColor(ink)
    .fontSize(10)
    .font("Helvetica")
    .text(data.description, 48, y, {
      width: doc.page.width - 96,
      align: "left",
    });

  // Attachments
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 8).fill(accent);
  doc
    .fillColor(accent)
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("Attachments", 48, 40);
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text(`Incident ${data.incidentNumber}`, 48, 66);

  let ay = 96;
  if (data.attachments.length === 0) {
    doc.fillColor(muted).fontSize(10).font("Helvetica").text("No attachments.", 48, ay);
  } else {
    for (const a of data.attachments) {
      doc
        .fillColor(ink)
        .fontSize(10)
        .font("Helvetica")
        .text(a.originalName, 48, ay, { continued: true });
      doc
        .fillColor(muted)
        .fontSize(9)
        .font("Helvetica")
        .text(`  (${a.mimeType} · ${formatSize(a.sizeBytes)})`, { width: doc.page.width - 96 });
      ay += 18;
    }
  }

  // Footer
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(muted)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Generated ${new Date().toLocaleString("en-GB")} · ${data.incidentNumber}`,
        48,
        doc.page.height - 40,
        { width: doc.page.width - 96, align: "center" },
      );
  }

  doc.end();
  });
}
