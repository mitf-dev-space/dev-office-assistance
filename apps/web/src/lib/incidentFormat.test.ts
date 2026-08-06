import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIncidentDate, formatSize } from "./incidentFormat.js";

describe("formatSize", () => {
  it("formats bytes, KB, and MB", () => {
    assert.equal(formatSize(512), "512 B");
    assert.equal(formatSize(2048), "2.0 KB");
    assert.equal(formatSize(5 * 1024 * 1024), "5.0 MB");
  });
});

describe("formatIncidentDate", () => {
  it("formats a valid ISO date", () => {
    const out = formatIncidentDate("2026-08-01T10:30:00.000Z");
    assert.ok(out.includes("2026"));
    assert.ok(out.includes("Aug"));
  });

  it("returns the input unchanged for invalid dates", () => {
    assert.equal(formatIncidentDate("not-a-date"), "not-a-date");
  });
});
