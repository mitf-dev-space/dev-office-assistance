import type { Prisma, PrismaClient, TriageCategory } from "@prisma/client";
import type { Env } from "../env.js";
import { upsertExternalWorkItem } from "../externalWork/upsert.js";
import { getClickUpClient } from "./connectionService.js";
import { buildEnrichedRawMetadata } from "./enrichment.js";
import {
  normalizeClickUpTask,
  type ClickUpTaskRaw,
} from "./normalize.js";
import { mapClickUpPriority } from "./priorityMap.js";
import { mapClickUpStatus } from "./statusMap.js";
import { resolveClickUpTaskAssignee } from "./resolveAssignee.js";

export type ImportPreviewRow = {
  externalId: string;
  title: string;
  externalStatus: string | null;
  externalUrl: string | null;
  alreadyLinked: boolean;
  triageItemId: string | null;
};

export async function previewClickUpImport(
  prisma: PrismaClient,
  env: Env,
  opts: { connectionId: string; listId: string; maxTasks?: number },
): Promise<{ rows: ImportPreviewRow[]; listId: string }> {
  const pair = await getClickUpClient(prisma, env, opts.connectionId);
  if (!pair) throw new Error("clickup_not_connected");

  const max = opts.maxTasks ?? 50;
  const maxPages = Math.max(1, env.CLICKUP_MAX_PAGES_PER_SYNC);
  const tasks: ClickUpTaskRaw[] = [];
  for (let page = 0; page < maxPages && tasks.length < max; page++) {
    const { tasks: batch, lastPage } = await pair.client.getTasksPage(opts.listId, page);
    for (const t of batch) {
      tasks.push(t as ClickUpTaskRaw);
      if (tasks.length >= max) break;
    }
    if (lastPage) break;
  }

  const rows: ImportPreviewRow[] = [];
  for (const raw of tasks) {
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
    rows.push({
      externalId: n.externalId,
      title: n.title,
      externalStatus: n.externalStatus,
      externalUrl: n.externalUrl,
      alreadyLinked: Boolean(existing?.triageItemId),
      triageItemId: existing?.triageItemId ?? null,
    });
  }
  return { rows, listId: opts.listId };
}

export async function commitClickUpImport(
  prisma: PrismaClient,
  env: Env,
  opts: {
    connectionId: string;
    listId: string;
    createdById: string;
    maxTasks?: number;
    taskIds?: string[];
  },
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

  const statusMaps = await prisma.clickUpStatusMapping.findMany({
    where: { connectionId: opts.connectionId },
  });
  const priorityMaps = await prisma.clickUpPriorityMapping.findMany({
    where: { connectionId: opts.connectionId },
  });
  const category: TriageCategory = mapping?.importCategory ?? "other";
  const max = opts.maxTasks ?? 100;
  const maxPages = Math.max(1, env.CLICKUP_MAX_PAGES_PER_SYNC);
  const tasks: ClickUpTaskRaw[] = [];

  if (opts.taskIds?.length) {
    for (const id of opts.taskIds) {
      const raw = (await pair.client.getTask(id)) as ClickUpTaskRaw;
      tasks.push(raw);
    }
  } else {
    for (let page = 0; page < maxPages && tasks.length < max; page++) {
      const { tasks: batch, lastPage } = await pair.client.getTasksPage(opts.listId, page);
      for (const t of batch) {
        tasks.push(t as ClickUpTaskRaw);
        if (tasks.length >= max) break;
      }
      if (lastPage) break;
    }
  }

  let upserted = 0;
  let linked = 0;
  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: opts.connectionId },
  });

  for (const raw of tasks) {
    const n = normalizeClickUpTask(raw);
    if (!n) continue;

    const triageStatus = mapClickUpStatus(n.externalStatus, statusMaps);
    const pri = mapClickUpPriority(n.externalPriority, priorityMaps);
    const assigneeId = await resolveClickUpTaskAssignee(prisma, {
      connectionId: opts.connectionId,
      task: n,
      defaultAssigneeId: mapping?.defaultAssigneeId ?? null,
    });

    const dueAt =
      mapping?.syncDueToTriage === false
        ? undefined
        : triageStatus === "snoozed"
          ? null
          : n.dueAt;
    const snoozedUntil = triageStatus === "snoozed" && n.dueAt ? n.dueAt : null;

    const existingEwi = await prisma.externalWorkItem.findUnique({
      where: {
        provider_connectionKey_externalId: {
          provider: "clickup",
          connectionKey: opts.connectionId,
          externalId: n.externalId,
        },
      },
    });

    let triageItemId = existingEwi?.triageItemId ?? null;
    if (triageItemId) {
      await prisma.triageItem.update({
        where: { id: triageItemId },
        data: {
          title: n.title,
          description: n.description,
          ...(mapping?.syncStatusToTriage !== false ? { status: triageStatus } : {}),
          ...(dueAt !== undefined ? { dueAt, snoozedUntil } : {}),
          graphWebLink: n.externalUrl,
          sourcePreview: n.title.slice(0, 500),
          ...(pri.category ? { category: pri.category } : {}),
          ...(pri.escalated ? { escalated: true } : {}),
          ...(assigneeId ? { assigneeDeveloperId: assigneeId } : {}),
        },
      });
    } else if (assigneeId) {
      const created = await prisma.triageItem.create({
        data: {
          title: n.title,
          description: n.description,
          category: pri.category ?? category,
          status: triageStatus,
          dueAt: dueAt === undefined ? n.dueAt : dueAt,
          snoozedUntil,
          assigneeDeveloperId: assigneeId,
          sourceType: "clickup",
          graphWebLink: n.externalUrl,
          sourcePreview: n.title.slice(0, 500),
          escalated: pri.escalated,
          createdById: opts.createdById,
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

  if (mapping) {
    await prisma.clickUpListMapping.update({
      where: { id: mapping.id },
      data: { lastSyncAt: new Date() },
    });
  }

  return { upserted, linked };
}
