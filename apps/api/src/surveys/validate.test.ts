import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure validation of a submitted answer set against a survey's questions.
 * Extracted from the service so it can be unit-tested without a database.
 */
export function validateAnswers(
  questions: Array<{ id: string }>,
  answers: Record<string, string>,
): { ok: true } | { ok: false; code: "answers" } {
  const answerKeys = Object.keys(answers);
  if (answerKeys.length !== questions.length) return { ok: false, code: "answers" };
  const questionIds = new Set(questions.map((q) => q.id));
  for (const [questionId, value] of Object.entries(answers)) {
    if (!questionIds.has(questionId)) return { ok: false, code: "answers" };
    if (value !== "yes" && value !== "no") return { ok: false, code: "answers" };
  }
  return { ok: true };
}

describe("validateAnswers", () => {
  const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

  it("accepts a complete, valid answer set", () => {
    const r = validateAnswers(questions, { q1: "yes", q2: "no", q3: "yes" });
    assert.deepEqual(r, { ok: true });
  });

  it("rejects incomplete answers", () => {
    const r = validateAnswers(questions, { q1: "yes", q2: "no" });
    assert.deepEqual(r, { ok: false, code: "answers" });
  });

  it("rejects answers for an unknown question", () => {
    const r = validateAnswers(questions, { q1: "yes", q2: "no", q3: "yes", q99: "no" });
    assert.deepEqual(r, { ok: false, code: "answers" });
  });

  it("rejects invalid values", () => {
    const r = validateAnswers(questions, { q1: "yes", q2: "maybe", q3: "yes" });
    assert.deepEqual(r, { ok: false, code: "answers" });
  });

  it("rejects when a question is answered with a non-yes/no value", () => {
    const r = validateAnswers(questions, { q1: "yes", q2: "", q3: "yes" });
    assert.deepEqual(r, { ok: false, code: "answers" });
  });
});
