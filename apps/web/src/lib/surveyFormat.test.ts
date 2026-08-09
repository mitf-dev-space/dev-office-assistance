import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVotingUrl, participationPercent, slugifyTitle } from "./surveyFormat.js";

describe("participationPercent", () => {
  it("computes rounded percentage", () => {
    assert.equal(participationPercent(8, 10), 80);
    assert.equal(participationPercent(1, 3), 33);
  });

  it("returns 0 when no eligible employees", () => {
    assert.equal(participationPercent(5, 0), 0);
  });
});

describe("buildVotingUrl", () => {
  it("builds the invitation voting URL", () => {
    assert.equal(
      buildVotingUrl("http://localhost:5174", "abc123"),
      "http://localhost:5174/survey/respond/abc123",
    );
  });

  it("strips a trailing slash from origin", () => {
    assert.equal(
      buildVotingUrl("http://localhost:5174/", "tok"),
      "http://localhost:5174/survey/respond/tok",
    );
  });
});

describe("slugifyTitle", () => {
  it("produces a URL-safe slug", () => {
    assert.equal(slugifyTitle("Annual Safety Survey 2026"), "annual-safety-survey-2026");
  });

  it("falls back to survey", () => {
    assert.equal(slugifyTitle("!!!"), "survey");
  });
});
