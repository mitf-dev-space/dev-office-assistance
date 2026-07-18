import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { updateLlmSettings } from "./workspaceSettings.js";

/**
 * Optional local bootstrap: if OPENROUTER_API_KEY is set, enable workspace AI with OpenRouter.
 * Never commit real keys — use only in local `.env`.
 */
export async function seedOpenRouterFromEnv(prisma: PrismaClient, env: Env): Promise<void> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return;

  const lead = await prisma.user.findFirst({
    where: { role: "lead" },
    orderBy: { createdAt: "asc" },
  });
  if (!lead) return;

  const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  await updateLlmSettings(prisma, env, lead.id, {
    enabled: true,
    providerPreset: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model,
    apiKey: key,
    assistLocale: "en",
  });
}
