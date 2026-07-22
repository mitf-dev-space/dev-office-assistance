import type { LlmAssistConfig } from "./types.js";
import { mockLlmChatJson } from "./mockLlm.js";

export type OpenAiChatJsonResult<T> = {
  data: T | null;
  latencyMs: number;
  error?: string;
};

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string; code?: string | number };
};

function buildChatHeaders(config: LlmAssistConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }
  if (config.providerPreset === "openrouter") {
    headers["HTTP-Referer"] = process.env.APP_PUBLIC_URL || "http://localhost:5174";
    headers["X-Title"] = "Helm Office Assistance";
  }
  return headers;
}

function extractAssistantText(payload: ChatCompletionPayload): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

function extractApiError(status: number, payload: ChatCompletionPayload, rawText: string): string {
  const fromJson = payload.error?.message?.trim();
  if (fromJson) {
    if (status === 401 || status === 403) {
      return `${fromJson}. Check that your API key is valid for this provider.`;
    }
    return fromJson;
  }
  const snippet = rawText.trim().slice(0, 240);
  if (snippet) return `HTTP ${status}: ${snippet}`;
  return `HTTP ${status}`;
}

/** Pull a JSON object from model text (raw JSON or fenced ```json blocks). */
export function parseJsonFromModelText<T>(content: string): T | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      // continue
    }
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function formatNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Connection failed";
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : null;
  const code =
    cause && "code" in cause && typeof (cause as { code?: unknown }).code === "string"
      ? (cause as { code: string }).code
      : null;
  const detail = [code, cause?.message].filter(Boolean).join(": ");
  if (message === "fetch failed" || message.includes("fetch failed")) {
    const base = detail
      ? `Could not reach the LLM provider (${detail}).`
      : "Could not reach the LLM provider (network error).";
    return (
      `${base} On LAN deploys this usually means the API host cannot open outbound HTTPS ` +
      "to openrouter.ai:443 — allow egress (or set HTTPS_PROXY / use LM Studio on the LAN), then recreate the API."
    );
  }
  return detail ? `${message} (${detail})` : message;
}

async function postChatCompletion(
  config: LlmAssistConfig,
  body: Record<string, unknown>,
  opts?: { retries?: number },
): Promise<{ ok: boolean; status: number; payload: ChatCompletionPayload; rawText: string }> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const headers = buildChatHeaders(config);
  const retries = Math.max(0, opts?.retries ?? 0);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      let payload: ChatCompletionPayload = {};
      try {
        payload = JSON.parse(rawText) as ChatCompletionPayload;
      } catch {
        payload = {};
      }
      return { ok: res.ok, status: res.status, payload, rawText };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

export async function openAiCompatibleChatJson<T>(
  config: LlmAssistConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<OpenAiChatJsonResult<T>> {
  const started = Date.now();
  if (!config.enabled) {
    return { data: null, latencyMs: 0 };
  }

  if (config.providerPreset === "mock") {
    const data = mockLlmChatJson<T>(systemPrompt, userPrompt);
    return { data, latencyMs: Math.max(1, Date.now() - started) };
  }

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (config.supportsJsonMode !== false) {
    body.response_format = { type: "json_object" };
  }

  let result = await postChatCompletion(config, body);

  if (!result.ok && body.response_format) {
    const retryBody = { ...body };
    delete retryBody.response_format;
    result = await postChatCompletion(config, retryBody);
  }

  const latencyMs = Date.now() - started;
  if (!result.ok) {
    return {
      data: null,
      latencyMs,
      error: extractApiError(result.status, result.payload, result.rawText),
    };
  }

  const content = extractAssistantText(result.payload);
  if (!content) {
    return { data: null, latencyMs, error: "Model returned an empty response" };
  }

  const data = parseJsonFromModelText<T>(content);
  if (!data) {
    return { data: null, latencyMs, error: "Model did not return valid JSON" };
  }
  return { data, latencyMs };
}

/** Redact obvious secrets before sending text to an LLM. */
export function redactForLlm(text: string, maxLen = 8000): string {
  const redacted = text
    .replace(
      /"(accessToken|refreshToken|token|password|apiKey|authorization|api_key)"\s*:\s*"[^"]+"/gi,
      '"$1":"[REDACTED]"',
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted;
}

/**
 * Connection test: verify the provider accepts auth and returns a chat completion.
 * Does not require JSON mode — many models ignore response_format.
 */
export async function testOpenAiCompatibleConnection(
  config: LlmAssistConfig,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  if (config.providerPreset === "mock") {
    return { ok: true, latencyMs: 1 };
  }
  if (!config.baseUrl.trim()) {
    return { ok: false, latencyMs: 0, error: "Base URL is required" };
  }
  if (!config.model.trim()) {
    return { ok: false, latencyMs: 0, error: "Model is required" };
  }
  if (config.apiKeyRequired && !config.apiKey?.trim()) {
    return { ok: false, latencyMs: 0, error: "API key is required for this provider" };
  }
  if (
    config.providerPreset === "openrouter" &&
    config.apiKey &&
    !/^sk-or-/i.test(config.apiKey.trim())
  ) {
    return {
      ok: false,
      latencyMs: 0,
      error:
        "OpenRouter API keys usually start with sk-or-. Re-save the key from openrouter.ai/keys.",
    };
  }

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: 0,
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: "Reply with the single word: pong",
        },
      ],
    };

    // Retry transient Docker/DNS blips common on Windows Docker Desktop.
    const result = await postChatCompletion({ ...config, enabled: true }, body, { retries: 2 });
    const latencyMs = Date.now() - started;

    if (!result.ok) {
      return {
        ok: false,
        latencyMs,
        error: extractApiError(result.status, result.payload, result.rawText),
      };
    }

    const content = extractAssistantText(result.payload);
    if (!content && !result.payload.choices?.length) {
      return {
        ok: false,
        latencyMs,
        error: "Provider returned no completion choices",
      };
    }

    return { ok: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: formatNetworkError(err),
    };
  }
}
