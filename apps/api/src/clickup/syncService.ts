import type { Prisma, PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { JOB_KINDS } from "../externalWork/constants.js";
import { upsertExternalWorkItem } from "../externalWork/upsert.js";
import { getClickUpClient } from "./connectionService.js";
import { buildEnrichedRawMetadata } from "./enrichment.js";
import { normalizeClickUpTask, type ClickUpTaskRaw } from "./normalize.js";
import { mapClickUpPriority } from "./priorityMap.js";
import { mapClickUpStatus } from "./statusMap.js";
import { resolveClickUpTaskAssignee } from "./resolveAssignee.js";

export async function enqueueClickUpSyncConnection(
  prisma: PrismaClient,
  connectionId: string,
) {
  const key = `clickup.sync_connection:${connectionId}:${new Date().toISOString().slice(0, 16)}`;
  await prisma.backgroundJob.create({
    data: {
      kind: JOB_KINDS.clickupSyncConnection,
      payload: { connectionId },
      idempotencyKey: key,
    },
  }).catch(() => {
    /* duplicate idempotency */
  });
}

export async function syncClickUpConnection(
  prisma: PrismaClient,
  env: Env,
  connectionId: string,
): Promise<{
  lists: number;
  upserted: number;
  linked: number;
  listErrors: Array<{ listId: string; listName: string | null; error: string }>;
}> {
  const connection = await prisma.clickUpConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("connection_not_found");

  const run = await prisma.externalSyncRun.create({
    data: {
      provider: "clickup",
      connectionId,
      kind: JOB_KINDS.clickupSyncConnection,
      status: "running",
    },
  });

  const mappings = await prisma.clickUpListMapping.findMany({
    where: { connectionId, enabled: true },
  });

  let upserted = 0;
  let linked = 0;
  const listErrors: Array<{ listId: string; listName: string | null; error: string }> = [];
  try {
    for (const m of mappings) {
      try {
        const r = await syncClickUpList(prisma, env, { connectionId, listId: m.listId });
        upserted += r.upserted;
        linked += r.linked;
      } catch (e) {
        listErrors.push({
          listId: m.listId,
          listName: m.listName,
          error: e instanceof Error ? e.message : "sync_failed",
        });
      }
    }
    const status =
      listErrors.length === 0
        ? "completed"
        : listErrors.length === mappings.length
          ? "failed"
          : "completed";
    const errSummary =
      listErrors.length > 0
        ? `${listErrors.length}/${mappings.length} lists failed: ${listErrors
            .slice(0, 5)
            .map((x) => x.listName ?? x.listId)
            .join(", ")}`
        : null;
    await prisma.externalSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        itemsUpserted: upserted,
        itemsSeen: upserted,
        itemsLinked: linked,
        errorMessage: errSummary,
      },
    });
    await prisma.clickUpConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: errSummary,
      },
    });
    if (status === "failed") {
      throw new Error(errSummary ?? "sync_failed");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    await prisma.externalSyncRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
    });
    await prisma.clickUpConnection.update({
      where: { id: connectionId },
      data: { lastSyncError: msg },
    });
    throw e;
  }

  return {
    lists: mappings.length,
    upserted,
    linked,
    listErrors,
  };
}

export async function syncClickUpList(
  prisma: PrismaClient,
  env: Env,
  opts: { connectionId: string; listId: string },
): Promise<{ upserted: number; linked: number }> {
  const pair = await getClickUpClient(prisma, env, opts.connectionId);
  if (!pair) throw new Error("clickup_not_connected");

  const mapping = await prisma.clickUpListMapping.findUnique({
    where: {
      connectionId_listId: {
        connectionId: opts.connectionId,
        listId: opts.listId,
      },
    },
  });
  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: opts.connectionId },
  });
  const statusMaps = await prisma.clickUpStatusMapping.findMany({
    where: { connectionId: opts.connectionId },
  });
  const priorityMaps = await prisma.clickUpPriorityMapping.findMany({
    where: { connectionId: opts.connectionId },
  });
  const createdById =
    connection.createdById ??
    (
      await prisma.user.findFirst({ where: { role: "lead" }, orderBy: { createdAt: "asc" } })
    )?.id ??
    (await prisma.user.findFirst())?.id;
  if (!createdById) throw new Error("no_users");

  const category = mapping?.importCategory ?? "other";
  const maxPages = Math.max(1, env.CLICKUP_MAX_PAGES_PER_SYNC);
  let upserted = 0;
  let linked = 0;

  for (let page = 0; page < maxPages; page++) {
    const { tasks: batch, lastPage } = await pair.client.getTasksPage(opts.listId, page);
    for (const rawUnknown of batch) {
      const raw = rawUnknown as ClickUpTaskRaw;
      const n = normalizeClickUpTask(raw);
      if (!n) continue;

      const existing = await prisma.externalWorkItem.findUnique({
        where: {
          provider_connectionKey_externalId: {
            provider: "clickup",
            connectionKey: opts.connectionId,
            externalId: n.externalId,
          },
        },
      });

      const triageStatus = mapClickUpStatus(n.externalStatus, statusMaps);
      const pri = mapClickUpPriority(n.externalPriority, priorityMaps);
      const assigneeId = await resolveClickUpTaskAssignee(prisma, {
        connectionId: opts.connectionId,
        task: n,
        defaultAssigneeId: mapping?.defaultAssigneeId ?? null,
      });

      let triageItemId = existing?.triageItemId ?? null;
      if (triageItemId) {
        await prisma.triageItem.update({
          where: { id: triageItemId },
          data: {
            title: n.title,
            description: n.description,
            ...(mapping?.syncStatusToTriage !== false ? { status: triageStatus } : {}),
            ...(mapping?.syncDueToTriage !== false
              ? {
                  dueAt: triageStatus === "snoozed" ? null : n.dueAt,
                  snoozedUntil: triageStatus === "snoozed" && n.dueAt ? n.dueAt : null,
                }
              : {}),
            graphWebLink: n.externalUrl,
            sourcePreview: n.title.slice(0, 500),
            // Only overwrite assignee when ClickUp (or list default) resolved one.
            ...(assigneeId ? { assigneeDeveloperId: assigneeId } : {}),
            ...(pri.category ? { category: pri.category } : {}),
            ...(pri.escalated ? { escalated: true } : {}),
          },
        });
      } else if (assigneeId) {
        // Require a resolved ClickUp assignee (or list default) — never invent from creator.
        const created = await prisma.triageItem.create({
          data: {
            title: n.title,
            description: n.description,
            category: pri.category ?? category,
            status: triageStatus,
            dueAt: triageStatus === "snoozed" ? null : n.dueAt,
            snoozedUntil: triageStatus === "snoozed" && n.dueAt ? n.dueAt : null,
            assigneeDeveloperId: assigneeId,
            sourceType: "clickup",
            graphWebLink: n.externalUrl,
            sourcePreview: n.title.slice(0, 500),
            escalated: pri.escalated,
            createdById,
          },
        });
        triageItemId = created.id;
        linked += 1;
      }

      const rawMetadata = (await buildEnrichedRawMetadata(pair.client, raw, {
        fetchComments: env.CLICKUP_SYNC_COMMENTS,
      })) as Prisma.InputJsonValue;

      await upsertExternalWorkItem(prisma, {
        provider: "clickup",
        connectionKey: opts.connectionId,
        externalId: n.externalId,
        title: n.title,
        listId: n.listId ?? opts.listId,
        workspaceId: connection.workspaceId,
        spaceId: n.spaceId ?? mapping?.spaceId,
        folderId: n.folderId ?? mapping?.folderId,
        externalParentId: n.externalParentId,
        externalUrl: n.externalUrl,
        externalStatus: n.externalStatus,
        externalPriority: n.externalPriority,
        externalUpdatedAt: n.externalUpdatedAt,
        rawMetadata,
        triageItemId,
      });
      upserted += 1;
    }
    if (lastPage) break;
  }

  if (mapping) {
    await prisma.clickUpListMapping.update({
      where: { id: mapping.id },
      data: { lastSyncAt: new Date() },
    });
  }
  return { upserted, linked };
}

export async function refreshClickUpTask(
  prisma: PrismaClient,
  env: Env,
  opts: { connectionId: string; taskId: string },
): Promise<{ upserted: boolean }> {
  const pair = await getClickUpClient(prisma, env, opts.connectionId);
  if (!pair) throw new Error("clickup_not_connected");
  const raw = (await pair.client.getTask(opts.taskId)) as ClickUpTaskRaw;
  const n = normalizeClickUpTask(raw);
  if (!n) return { upserted: false };

  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: opts.connectionId },
  });
  const existing = await prisma.externalWorkItem.findUnique({
    where: {
      provider_connectionKey_externalId: {
        provider: "clickup",
        connectionKey: opts.connectionId,
        externalId: n.externalId,
      },
    },
  });

  if (existing?.triageItemId) {
    const statusMaps = await prisma.clickUpStatusMapping.findMany({
      where: { connectionId: opts.connectionId },
    });
    const triageStatus = mapClickUpStatus(n.externalStatus, statusMaps);
    await prisma.triageItem.update({
      where: { id: existing.triageItemId },
      data: {
        title: n.title,
        description: n.description,
        status: triageStatus,
        dueAt: triageStatus === "snoozed" ? null : n.dueAt,
        graphWebLink: n.externalUrl,
        sourcePreview: n.title.slice(0, 500),
      },
    });
  }

  const rawMetadata = (await buildEnrichedRawMetadata(pair.client, raw, {
    fetchComments: true,
  })) as Prisma.InputJsonValue;

  await upsertExternalWorkItem(prisma, {
    provider: "clickup",
    connectionKey: opts.connectionId,
    externalId: n.externalId,
    title: n.title,
    listId: n.listId,
    workspaceId: connection.workspaceId,
    spaceId: n.spaceId,
    folderId: n.folderId,
    externalParentId: n.externalParentId,
    externalUrl: n.externalUrl,
    externalStatus: n.externalStatus,
    externalPriority: n.externalPriority,
    externalUpdatedAt: n.externalUpdatedAt,
    rawMetadata,
    triageItemId: existing?.triageItemId,
  });
  return { upserted: true };
}
