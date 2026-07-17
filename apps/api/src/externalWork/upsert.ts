import type { ExternalProvider, Prisma, PrismaClient } from "@prisma/client";
import {
  enrichmentFromRawMetadata,
  type ClickUpEnrichment,
} from "../clickup/enrichment.js";
import { M365_CONNECTION_KEY } from "./constants.js";

export type UpsertExternalWorkInput = {
  provider: ExternalProvider;
  connectionKey: string;
  externalId: string;
  title: string;
  listId?: string | null;
  workspaceId?: string | null;
  spaceId?: string | null;
  folderId?: string | null;
  externalParentId?: string | null;
  externalUrl?: string | null;
  externalStatus?: string | null;
  externalPriority?: string | null;
  externalUpdatedAt?: Date | null;
  rawMetadata?: Prisma.InputJsonValue;
  triageItemId?: string | null;
};

export async function upsertExternalWorkItem(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertExternalWorkInput,
) {
  const now = new Date();
  return prisma.externalWorkItem.upsert({
    where: {
      provider_connectionKey_externalId: {
        provider: input.provider,
        connectionKey: input.connectionKey,
        externalId: input.externalId,
      },
    },
    create: {
      provider: input.provider,
      connectionKey: input.connectionKey,
      externalId: input.externalId,
      title: input.title,
      listId: input.listId ?? null,
      workspaceId: input.workspaceId ?? null,
      spaceId: input.spaceId ?? null,
      folderId: input.folderId ?? null,
      externalParentId: input.externalParentId ?? null,
      externalUrl: input.externalUrl ?? null,
      externalStatus: input.externalStatus ?? null,
      externalPriority: input.externalPriority ?? null,
      externalUpdatedAt: input.externalUpdatedAt ?? null,
      rawMetadata: input.rawMetadata ?? undefined,
      triageItemId: input.triageItemId ?? null,
      lastSyncedAt: now,
      syncState: "idle",
    },
    update: {
      title: input.title,
      listId: input.listId ?? undefined,
      workspaceId: input.workspaceId ?? undefined,
      spaceId: input.spaceId ?? undefined,
      folderId: input.folderId ?? undefined,
      externalParentId: input.externalParentId ?? undefined,
      externalUrl: input.externalUrl ?? undefined,
      externalStatus: input.externalStatus ?? undefined,
      externalPriority: input.externalPriority ?? undefined,
      externalUpdatedAt: input.externalUpdatedAt ?? undefined,
      rawMetadata: input.rawMetadata ?? undefined,
      triageItemId: input.triageItemId === undefined ? undefined : input.triageItemId,
      lastSyncedAt: now,
      syncState: "idle",
    },
  });
}

export async function upsertMicrosoftTodoExternal(
  prisma: PrismaClient | Prisma.TransactionClient,
  opts: {
    listId: string;
    taskId: string;
    title: string;
    externalUrl: string | null;
    externalStatus: string | null;
    triageItemId: string;
    rawMetadata?: Prisma.InputJsonValue;
  },
) {
  return upsertExternalWorkItem(prisma, {
    provider: "microsoft_todo",
    connectionKey: M365_CONNECTION_KEY,
    externalId: opts.taskId,
    listId: opts.listId,
    title: opts.title,
    externalUrl: opts.externalUrl,
    externalStatus: opts.externalStatus,
    triageItemId: opts.triageItemId,
    rawMetadata: opts.rawMetadata,
  });
}

export function toExternalWorkItemDto(row: {
  id: string;
  provider: ExternalProvider;
  connectionKey: string;
  workspaceId: string | null;
  spaceId: string | null;
  folderId: string | null;
  listId: string | null;
  externalId: string;
  externalParentId: string | null;
  externalUrl: string | null;
  title: string;
  externalStatus: string | null;
  externalPriority: string | null;
  externalUpdatedAt: Date | null;
  lastSyncedAt: Date | null;
  syncState: string;
  triageItemId: string | null;
  rawMetadata?: Prisma.JsonValue | null;
}) {
  const clickUp =
    row.provider === "clickup" ? enrichmentFromRawMetadata(row.rawMetadata) : null;
  return {
    id: row.id,
    provider: row.provider,
    connectionKey: row.connectionKey,
    workspaceId: row.workspaceId,
    spaceId: row.spaceId,
    folderId: row.folderId,
    listId: row.listId,
    externalId: row.externalId,
    externalParentId: row.externalParentId,
    externalUrl: row.externalUrl,
    title: row.title,
    externalStatus: row.externalStatus,
    externalPriority: row.externalPriority,
    externalUpdatedAt: row.externalUpdatedAt?.toISOString() ?? null,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    syncState: row.syncState,
    triageItemId: row.triageItemId,
    ...(clickUp ? { clickUp } : {}),
  };
}

export type { ClickUpEnrichment };
