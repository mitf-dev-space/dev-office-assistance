import type { LlmAssistConfig } from "./types.js";
import { mockLlmChatJson } from "./mockLlm.js";

export type OpenAiChatJsonResult<T> = {
  data: T | null;
  latencyMs: number;
};

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

  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  if (config.providerPreset === "openrouter") {
    headers["HTTP-Referer"] = process.env.APP_PUBLIC_URL || "http://localhost:5174";
    headers["X-Title"] = "Helm Office Assistance";
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

  let res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok && body.response_format) {
    const retryBody = { ...body };
    delete retryBody.response_format;
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(retryBody),
    });
  }

  const latencyMs = Date.now() - started;
  if (!res.ok) return { data: null, latencyMs };

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return { data: null, latencyMs };

  try {
    return { data: JSON.parse(content) as T, latencyMs };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { data: null, latencyMs };
    try {
      return { data: JSON.parse(match[0]) as T, latencyMs };
    } catch {
      return { data: null, latencyMs };
    }
  }
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
  if (config.apiKeyRequired && !config.apiKey) {
    return { ok: false, latencyMs: 0, error: "API key is required for this provider" };
  }

  try {
    const result = await openAiCompatibleChatJson<{ ok?: boolean }>(
      { ...config, enabled: true },
      'Reply with JSON only: {"ok":true}',
      "ping",
    );
    if (result.data) return { ok: true, latencyMs: result.latencyMs };
    return { ok: false, latencyMs: result.latencyMs, error: "Model did not return valid JSON" };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
