import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSurveyResultsPdf } from "./pdf.js";
import type { SurveyResultsDto } from "@office/types";

const base: SurveyResultsDto = {
  surveyId: "s1",
  title: "Annual Safety Survey",
  description: "How safe do you feel?",
  status: "closed",
  publishedAt: "2026-08-01T09:00:00.000Z",
  closedAt: "2026-08-05T17:00:00.000Z",
  eligibleCount: 10,
  responseCount: 8,
  participationPercent: 80,
  revealed: true,
  questionResults: [
    {
      questionId: "q1",
      position: 1,
      text: "Do you feel safe at work?",
      yes: 6,
      no: 2,
      total: 8,
      yesPercent: 75,
      noPercent: 25,
    },
  ],
};

describe("buildSurveyResultsPdf", () => {
  it("returns a valid PDF buffer", async () => {
    const buf = await buildSurveyResultsPdf(base);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("handles empty results", async () => {
    const buf = await buildSurveyResultsPdf({
      ...base,
      responseCount: 0,
      participationPercent: 0,
      questionResults: [],
    });
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
