import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../env.js";
import { resolveVoiceReasoningConfig } from "../../llm/workspaceSettings.js";
import { FakeReasoningProvider } from "./fake.js";
import { OpenAiCompatibleReasoningProvider } from "./openrouter.js";
import type { ReasoningProvider } from "./types.js";

export type { ReasoningEvent, ReasoningProvider, ReasoningRequest } from "./types.js";

export async function createVoiceReasoningProvider(
  prisma: PrismaClient,
  env: Env,
): Promise<{ provider: ReasoningProvider; model: string } | { error: string }> {
  if (env.HELM_LLM_MOCK === "1" || env.AI_REASONING_PROVIDER === "fake") {
    return { provider: new FakeReasoningProvider(), model: "fake" };
  }

  const cfg = await resolveVoiceReasoningConfig(prisma, env);
  if (!cfg) {
    return { error: "voice_disabled_or_unconfigured" };
  }
  if (cfg.providerPreset === "mock") {
    return { provider: new FakeReasoningProvider(), model: "fake" };
  }

  return {
    provider: new OpenAiCompatibleReasoningProvider({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      referer: cfg.referer,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    }),
    model: cfg.model,
  };
}
