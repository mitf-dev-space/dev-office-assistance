import type { ReasoningEvent, ReasoningProvider, ReasoningRequest } from "./types.js";

/** Deterministic provider for CI — tool call then a short answer. */
export class FakeReasoningProvider implements ReasoningProvider {
  async *stream(request: ReasoningRequest): AsyncIterable<ReasoningEvent> {
    const lower = request.userText.toLowerCase();
    if (lower.includes("standup") || lower.includes("blocked")) {
      yield {
        type: "tool.call",
        id: "call_fake_standups",
        name: "summarize_standups",
        arguments: { limit: 8 },
      };
    }
    const answer =
      "I reviewed recent standups. Check the tool results for blockers, then confirm any follow-up drafts on screen.";
    for (const word of answer.split(" ")) {
      yield { type: "assistant.delta", text: `${word} ` };
    }
    yield {
      type: "assistant.done",
      text: answer,
      inputTokens: Math.max(1, Math.ceil(request.userText.length / 4)),
      outputTokens: Math.ceil(answer.length / 4),
    };
  }
}
