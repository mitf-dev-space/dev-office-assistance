import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import {
  apiKeyHint,
  decryptSecret,
  encryptSecret,
  resolveLlmEncryptionKey,
} from "./secretCipher.js";
import {
  isLlmProviderPreset,
  LLM_PROVIDER_PRESETS,
  normalizeBaseUrl,
  presetMeta,
  type LlmProviderPreset,
} from "./providerPresets.js";
import type { LlmAssistConfig } from "./types.js";
import { getUsageSnapshot } from "./usageGuard.js";

const SETTINGS_ID = "default";
export const USAGE_SCOPE = "workspace";

export type LlmSettingsPublicDto = {
  enabled: boolean;
  providerPreset: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  assistLocale: string;
  dailyCap: number;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string;
  usage: ReturnType<typeof getUsageSnapshot>;
  presets: Array<{
    id: string;
    label: string;
    description: string;
    baseUrl: string;
    defaultModel: string;
    apiKeyRequired: boolean;
  }>;
};

async function ensureRow(prisma: PrismaClient) {
  return prisma.llmWorkspaceSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

function supportsJsonMode(preset: LlmProviderPreset): boolean {
  return preset !== "ollama" && preset !== "mock";
}

export async function getLlmSettingsPublic(
  prisma: PrismaClient,
  env: Env,
): Promise<LlmSettingsPublicDto> {
  const row = await ensureRow(prisma);
  return {
    enabled: row.enabled,
    providerPreset: row.providerPreset,
    baseUrl: row.baseUrl,
    model: row.model,
    hasApiKey: Boolean(row.apiKeyCipher),
    apiKeyHint: row.apiKeyHint,
    assistLocale: row.assistLocale,
    dailyCap: row.dailyCap,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    updatedAt: row.updatedAt.toISOString(),
    usage: getUsageSnapshot(USAGE_SCOPE, row.dailyCap),
    presets: LLM_PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      apiKeyRequired: p.apiKeyRequired,
    })),
  };
}

export type UpdateLlmSettingsInput = {
  enabled?: boolean;
  providerPreset?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string | null;
  clearApiKey?: boolean;
  assistLocale?: string;
  dailyCap?: number;
};

export async function updateLlmSettings(
  prisma: PrismaClient,
  env: Env,
  userId: string,
  input: UpdateLlmSettingsInput,
) {
  const row = await ensureRow(prisma);
  const key = resolveLlmEncryptionKey(env);

  let providerPreset = row.providerPreset;
  if (input.providerPreset !== undefined) {
    if (!isLlmProviderPreset(input.providerPreset)) {
      throw new Error("invalid_provider_preset");
    }
    providerPreset = input.providerPreset;
  }

  const meta = presetMeta(providerPreset);
  let baseUrl = input.baseUrl !== undefined ? normalizeBaseUrl(input.baseUrl) : row.baseUrl;
  let model = input.model !== undefined ? input.model.trim() : row.model;
  if (input.providerPreset !== undefined && meta) {
    if (!input.baseUrl) baseUrl = meta.baseUrl || baseUrl;
    if (!input.model) model = meta.defaultModel || model;
  }

  let apiKeyCipher = row.apiKeyCipher;
  let apiKeyHintValue = row.apiKeyHint;
  if (input.clearApiKey) {
    apiKeyCipher = null;
    apiKeyHintValue = null;
  } else if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey.trim()) {
    const plain = input.apiKey.trim();
    apiKeyCipher = encryptSecret(plain, key);
    apiKeyHintValue = apiKeyHint(plain);
  }

  const assistLocale = input.assistLocale?.trim() || row.assistLocale;
  if (!["en", "ar", "auto"].includes(assistLocale)) {
    throw new Error("invalid_assist_locale");
  }

  return prisma.llmWorkspaceSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      enabled: input.enabled ?? row.enabled,
      providerPreset,
      baseUrl,
      model,
      apiKeyCipher,
      apiKeyHint: apiKeyHintValue,
      assistLocale,
      dailyCap: input.dailyCap ?? row.dailyCap,
      updatedById: userId,
    },
  });
}

export async function resolveWorkspaceLlmConfig(
  prisma: PrismaClient,
  env: Env,
): Promise<LlmAssistConfig | null> {
  if (env.HELM_LLM_MOCK === "1" || env.HELM_LLM_MOCK === "true") {
    return {
      enabled: true,
      apiKey: null,
      apiKeyRequired: false,
      model: "mock-model",
      baseUrl: "mock://local",
      providerPreset: "mock",
      supportsJsonMode: false,
      assistLocale: "en",
      dailyCap: 10_000,
    };
  }

  const row = await ensureRow(prisma);
  if (!row.enabled) return null;

  if (!isLlmProviderPreset(row.providerPreset)) return null;
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
  if (meta.apiKeyRequired && !apiKey) return null;

  return {
    enabled: true,
    apiKey,
    apiKeyRequired: meta.apiKeyRequired,
    model: row.model,
    baseUrl: row.baseUrl,
    providerPreset: row.providerPreset,
    supportsJsonMode: supportsJsonMode(row.providerPreset),
    assistLocale: row.assistLocale,
    dailyCap: row.dailyCap,
  };
}

export async function markLlmTestResult(
  prisma: PrismaClient,
  ok: boolean,
): Promise<void> {
  await prisma.llmWorkspaceSettings.update({
    where: { id: SETTINGS_ID },
    data: { lastTestedAt: new Date(), lastTestOk: ok },
  });
}
