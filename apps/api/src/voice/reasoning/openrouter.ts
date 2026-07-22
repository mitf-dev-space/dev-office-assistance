import type { ReasoningEvent, ReasoningProvider, ReasoningRequest } from "./types.js";

export type CompatibleLlmCredentials = {
  apiKey: string | null;
  baseUrl: string;
  referer?: string;
  timeoutMs: number;
};

/** OpenAI-compatible chat completions streaming (OpenRouter, LM Studio, etc.). */
export class OpenAiCompatibleReasoningProvider implements ReasoningProvider {
  constructor(private readonly creds: CompatibleLlmCredentials) {}

  async *stream(request: ReasoningRequest): AsyncIterable<ReasoningEvent> {
    const key = this.creds.apiKey?.trim();
    const base = this.creds.baseUrl.replace(/\/+$/, "");
    if (!base) {
      yield { type: "error", code: "missing_base_url", message: "Workspace LLM base URL is not set" };
      return;
    }

    const url = `${base}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (this.creds.referer) {
      headers["HTTP-Referer"] = this.creds.referer;
      headers["X-Title"] = "Helm Voice Assistant";
    }

    const body = {
      model: request.model,
      stream: true,
      max_tokens: request.maxOutputTokens,
      tools: request.tools,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userText },
      ],
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.creds.timeoutMs),
      });
    } catch (err) {
      yield {
        type: "error",
        code: "provider_unreachable",
        message: err instanceof Error ? err.message : "fetch_failed",
      };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield {
        type: "error",
        code: `http_${res.status}`,
        message: text.slice(0, 500) || res.statusText,
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const toolArgs = new Map<string, { name: string; args: string }>();
    /** Streaming tool_calls only include `id` on the first delta; later chunks use `index`. */
    const toolIdByIndex = new Map<number, string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const chunk = json as {
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          full += delta.content;
          yield { type: "assistant.delta", text: delta.content };
        }
        for (const tc of delta?.tool_calls ?? []) {
          const index = tc.index ?? 0;
          if (tc.id) toolIdByIndex.set(index, tc.id);
          const id = toolIdByIndex.get(index) ?? tc.id ?? `idx_${index}`;
          const prev = toolArgs.get(id) ?? { name: "", args: "" };
          if (tc.function?.name) prev.name = tc.function.name;
          if (tc.function?.arguments) prev.args += tc.function.arguments;
          toolArgs.set(id, prev);
        }
      }
    }

    for (const [id, t] of toolArgs) {
      let args: Record<string, unknown> = {};
      try {
        args = t.args ? (JSON.parse(t.args) as Record<string, unknown>) : {};
      } catch {
        args = { _raw: t.args };
      }
      yield { type: "tool.call", id, name: t.name, arguments: args };
    }

    yield {
      type: "assistant.done",
      text: full,
      inputTokens,
      outputTokens,
    };
  }
}

/** @deprecated Use OpenAiCompatibleReasoningProvider */
export const OpenRouterReasoningProvider = OpenAiCompatibleReasoningProvider;
