import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIncidentPdf } from "./pdf.js";

describe("buildIncidentPdf", () => {
  const base = {
    incidentNumber: "INC-0001",
    title: "Server outage",
    description: "The build server went down during the release.",
    reporterName: "Alice",
    involvedNames: ["Bob", "Carol"],
    incidentAt: "2026-08-01T10:30:00.000Z",
    createdAt: "2026-08-02T09:00:00.000Z",
    attachments: [
      { originalName: "screenshot.png", mimeType: "image/png", sizeBytes: 2048 },
      { originalName: "report.pdf", mimeType: "application/pdf", sizeBytes: 51200 },
    ],
  };

  it("returns a non-empty PDF buffer", async () => {
    const buf = await buildIncidentPdf(base);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 100, "PDF should be larger than 100 bytes");
  });

  it("starts with the PDF magic header", async () => {
    const buf = await buildIncidentPdf(base);
    assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("handles an incident with no attachments or involved employees", async () => {
    const buf = await buildIncidentPdf({
      ...base,
      involvedNames: [],
      attachments: [],
    });
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
