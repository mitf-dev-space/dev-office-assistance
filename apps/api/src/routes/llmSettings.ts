import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { requireDbUser } from "../userService.js";
import { testOpenAiCompatibleConnection } from "../llm/openaiCompatible.js";
import { decryptSecret, resolveLlmEncryptionKey } from "../llm/secretCipher.js";
import { isLlmProviderPreset, presetMeta } from "../llm/providerPresets.js";
import type { LlmAssistConfig } from "../llm/types.js";
import { getUsageSnapshot } from "../llm/usageGuard.js";
import {
  getLlmSettingsPublic,
  markLlmTestResult,
  resolveWorkspaceLlmConfig,
  updateLlmSettings,
  USAGE_SCOPE,
} from "../llm/workspaceSettings.js";

const putSchema = z.object({
  enabled: z.boolean().optional(),
  providerPreset: z.string().min(1).max(64).optional(),
  baseUrl: z.string().max(500).optional(),
  model: z.string().max(200).optional(),
  apiKey: z.string().max(2000).nullable().optional(),
  clearApiKey: z.boolean().optional(),
  assistLocale: z.enum(["en", "ar", "auto"]).optional(),
  dailyCap: z.number().int().min(1).max(100_000).optional(),
  voiceEnabled: z.boolean().optional(),
  voiceModel: z.string().min(1).max(200).optional(),
  voiceDeepModel: z.string().min(1).max(200).optional(),
});

async function buildTestConfig(env: Env): Promise<LlmAssistConfig | null> {
  const resolved = await resolveWorkspaceLlmConfig(prisma, env);
  if (resolved) return resolved;

  const row = await prisma.llmWorkspaceSettings.findUnique({ where: { id: "default" } });
  if (!row || !isLlmProviderPreset(row.providerPreset)) return null;
  const meta = presetMeta(row.providerPreset);
  if (!meta) return null;

  let apiKey: string | null = null;
  if (row.apiKeyCipher) {
    try {
      apiKey = decryptSecret(row.apiKeyCipher, resolveLlmEncryptionKey(env));
    } catch {
      return null;
    }
  }
  if (meta.apiKeyRequired && !apiKey && row.providerPreset !== "mock") return null;

  return {
    enabled: true,
    apiKey,
    apiKeyRequired: meta.apiKeyRequired,
    model: row.model,
    baseUrl: row.baseUrl,
    providerPreset: row.providerPreset,
    supportsJsonMode: row.providerPreset !== "ollama" && row.providerPreset !== "mock",
    assistLocale: row.assistLocale,
    dailyCap: row.dailyCap,
  };
}

export async function registerLlmSettingsRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/settings/llm", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    return getLlmSettingsPublic(prisma, env);
  });

  app.put("/api/settings/llm", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = putSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    try {
      await updateLlmSettings(prisma, env, me.id, parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      return reply.status(400).send({ error: msg });
    }

    return getLlmSettingsPublic(prisma, env);
  });

  app.post("/api/settings/llm/test", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const config = await buildTestConfig(env);
    if (!config) {
      return reply.status(400).send({
        error: "not_configured",
        message: "Save a provider configuration (and API key if required) before testing.",
      });
    }

    const result = await testOpenAiCompatibleConnection(config);
    await markLlmTestResult(prisma, result.ok);
    return {
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error ?? null,
      usage: getUsageSnapshot(USAGE_SCOPE, config.dailyCap),
    };
  });
}
