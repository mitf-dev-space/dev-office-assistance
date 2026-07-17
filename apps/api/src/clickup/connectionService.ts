import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { encryptToken, decryptToken } from "../catalog/lib/tokenCrypto.js";
import { ClickUpClient } from "./client.js";
import { clickUpTokenSecret, tokenHintFromPlain } from "./tokenSecret.js";

export function createClickUpClientFromPlain(env: Env, token: string) {
  return new ClickUpClient({
    baseUrl: env.CLICKUP_API_BASE_URL,
    token,
  });
}

export async function getDecryptedClickUpToken(
  prisma: PrismaClient,
  env: Env,
  connectionId?: string,
): Promise<{ connectionId: string; token: string } | null> {
  const secret = clickUpTokenSecret(env);
  if (!secret) return null;
  const connection = connectionId
    ? await prisma.clickUpConnection.findUnique({ where: { id: connectionId } })
    : await prisma.clickUpConnection.findFirst({ orderBy: { createdAt: "asc" } });
  if (!connection) return null;
  return {
    connectionId: connection.id,
    token: decryptToken(connection.encryptedToken, secret),
  };
}

export async function getClickUpClient(
  prisma: PrismaClient,
  env: Env,
  connectionId?: string,
): Promise<{ client: ClickUpClient; connectionId: string } | null> {
  const dec = await getDecryptedClickUpToken(prisma, env, connectionId);
  if (!dec) return null;
  return {
    connectionId: dec.connectionId,
    client: createClickUpClientFromPlain(env, dec.token),
  };
}

export async function upsertClickUpConnection(
  prisma: PrismaClient,
  env: Env,
  opts: {
    apiToken: string;
    name?: string;
    userId: string;
    autoSyncEnabled?: boolean;
  },
) {
  const secret = clickUpTokenSecret(env);
  if (!secret) {
    throw new Error("CLICKUP_TOKEN_ENCRYPTION_KEY or CATALOG_TOKEN_ENCRYPTION_KEY required");
  }
  const client = createClickUpClientFromPlain(env, opts.apiToken);
  const teams = await client.getTeams();
  const preferredWorkspaceId = process.env.CLICKUP_WORKSPACE_ID?.trim();
  const team =
    (preferredWorkspaceId
      ? teams.teams?.find((t) => t.id === preferredWorkspaceId)
      : undefined) ??
    teams.teams?.find((t) => t.id === "9012077309") ??
    teams.teams?.[0];
  const encrypted = encryptToken(opts.apiToken, secret);
  const hint = tokenHintFromPlain(opts.apiToken);

  const existing = await prisma.clickUpConnection.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) {
    return prisma.clickUpConnection.update({
      where: { id: existing.id },
      data: {
        name: opts.name ?? existing.name,
        encryptedToken: encrypted,
        tokenHint: hint,
        workspaceId: team?.id ?? existing.workspaceId,
        workspaceName: team?.name ?? existing.workspaceName,
        autoSyncEnabled: opts.autoSyncEnabled ?? existing.autoSyncEnabled,
        updatedById: opts.userId,
        lastSyncError: null,
      },
    });
  }
  return prisma.clickUpConnection.create({
    data: {
      name: opts.name ?? "default",
      encryptedToken: encrypted,
      tokenHint: hint,
      workspaceId: team?.id ?? null,
      workspaceName: team?.name ?? null,
      autoSyncEnabled: opts.autoSyncEnabled ?? true,
      createdById: opts.userId,
      updatedById: opts.userId,
    },
  });
}

export function toConnectionDto(c: {
  id: string;
  name: string;
  workspaceId: string | null;
  workspaceName: string | null;
  encryptedToken: string;
  tokenHint: string | null;
  autoSyncEnabled: boolean;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  webhookId: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    workspaceId: c.workspaceId,
    workspaceName: c.workspaceName,
    hasToken: Boolean(c.encryptedToken),
    tokenHint: c.tokenHint,
    autoSyncEnabled: c.autoSyncEnabled,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastSyncError: c.lastSyncError,
    webhookConfigured: Boolean(c.webhookId),
  };
}

export async function seedClickUpTokenFromEnv(prisma: PrismaClient, env: Env): Promise<void> {
  const token = env.CLICKUP_ACCESS_TOKEN?.trim();
  if (!token) return;
  const secret = clickUpTokenSecret(env);
  if (!secret) return;
  const existing = await prisma.clickUpConnection.findFirst();
  if (existing) return;
  try {
    await upsertClickUpConnection(prisma, env, {
      apiToken: token,
      userId: (
        await prisma.user.findFirst({ where: { role: "lead" }, orderBy: { createdAt: "asc" } })
      )?.id ?? (await prisma.user.findFirst())!.id,
    });
  } catch {
    /* non-fatal seed */
  }
}
