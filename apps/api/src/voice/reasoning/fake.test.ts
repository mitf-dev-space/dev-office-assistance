import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeReasoningProvider } from "./fake.js";

describe("FakeReasoningProvider", () => {
  it("streams deltas and may emit a tool call for standup requests", async () => {
    const p = new FakeReasoningProvider();
    const events = [];
    for await (const ev of p.stream({
      systemPrompt: "test",
      userText: "Review today's standups and identify blocked projects",
      tools: [],
      maxOutputTokens: 128,
      model: "fake",
      correlationId: "c1",
    })) {
      events.push(ev);
    }
    assert.ok(events.some((e) => e.type === "tool.call"));
    assert.ok(events.some((e) => e.type === "assistant.done"));
    assert.ok(events.filter((e) => e.type === "assistant.delta").length >= 2);
  });
});
