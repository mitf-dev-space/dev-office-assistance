export type ReasoningRequest = {
  systemPrompt: string;
  userText: string;
  tools: unknown[];
  maxOutputTokens: number;
  model: string;
  correlationId: string;
};

export type ReasoningEvent =
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.done"; text: string; inputTokens: number; outputTokens: number }
  | {
      type: "tool.call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "error"; code: string; message: string };

export interface ReasoningProvider {
  stream(request: ReasoningRequest): AsyncIterable<ReasoningEvent>;
}
