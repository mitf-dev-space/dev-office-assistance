import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  parseJsonFromModelText,
  testOpenAiCompatibleConnection,
} from "./openaiCompatible.js";
import type { LlmAssistConfig } from "./types.js";

const baseConfig = (): LlmAssistConfig => ({
  enabled: true,
  apiKey: "sk-or-v1-test-key",
  apiKeyRequired: true,
  model: "openai/gpt-4o-mini",
  baseUrl: "https://openrouter.ai/api/v1",
  providerPreset: "openrouter",
  supportsJsonMode: true,
  assistLocale: "en",
  dailyCap: 200,
});

describe("parseJsonFromModelText", () => {
  it("parses raw JSON", () => {
    assert.deepEqual(parseJsonFromModelText<{ ok: boolean }>('{"ok":true}'), { ok: true });
  });

  it("parses fenced JSON", () => {
    assert.deepEqual(
      parseJsonFromModelText<{ ok: boolean }>("```json\n{\"ok\":true}\n```"),
      { ok: true },
    );
  });

  it("extracts embedded JSON object", () => {
    assert.deepEqual(parseJsonFromModelText<{ ok: boolean }>('Sure: {"ok":true}'), {
      ok: true,
    });
  });
});

describe("testOpenAiCompatibleConnection", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects non sk-or OpenRouter keys before calling the network", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("should not fetch");
    });
    const result = await testOpenAiCompatibleConnection({
      ...baseConfig(),
      apiKey: "pk_not_a_real_openrouter_key",
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /sk-or-/i);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("surfaces HTTP auth errors instead of a JSON parse message", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ error: { message: "Missing Authentication header", code: 401 } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await testOpenAiCompatibleConnection(baseConfig());
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Missing Authentication header/i);
    assert.doesNotMatch(result.error ?? "", /valid JSON/i);
  });

  it("succeeds when the model returns plain text", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "pong" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await testOpenAiCompatibleConnection(baseConfig());
    assert.equal(result.ok, true);
  });

  it("succeeds for mock preset without network", async () => {
    const result = await testOpenAiCompatibleConnection({
      ...baseConfig(),
      providerPreset: "mock",
      apiKeyRequired: false,
      apiKey: null,
    });
    assert.equal(result.ok, true);
  });
});
