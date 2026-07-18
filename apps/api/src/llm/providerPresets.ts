export type LlmProviderPreset =
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "openai_compatible"
  | "mock";

export type LlmProviderPresetMeta = {
  id: LlmProviderPreset;
  label: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyRequired: boolean;
};

export const LLM_PROVIDER_PRESETS: LlmProviderPresetMeta[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Cloud gateway to many models (OpenAI-compatible)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    apiKeyRequired: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local models on your machine (default port 11434)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    apiKeyRequired: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    description: "Local OpenAI-compatible server (default port 1234)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "google/gemma-4-e4b",
    apiKeyRequired: false,
  },
  {
    id: "openai_compatible",
    label: "OpenAI-compatible",
    description: "Any custom endpoint exposing /v1/chat/completions",
    baseUrl: "",
    defaultModel: "",
    apiKeyRequired: false,
  },
  {
    id: "mock",
    label: "Mock (CI/E2E)",
    description: "Deterministic responses — no network calls (tests only)",
    baseUrl: "mock://local",
    defaultModel: "mock-model",
    apiKeyRequired: false,
  },
];

export function presetMeta(id: string): LlmProviderPresetMeta | undefined {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === id);
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function isLlmProviderPreset(value: string): value is LlmProviderPreset {
  return LLM_PROVIDER_PRESETS.some((p) => p.id === value);
}
