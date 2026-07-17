import type { PrismaClient } from "@prisma/client";
import { createGraphClient } from "../graphClient.js";
import {
  fetchTasksForList,
  graphTaskStatusToTriageStatus,
  stripTaskBody,
  buildTodoSourcePreview,
} from "../todoTriageService.js";
import { upsertMicrosoftTodoExternal } from "./upsert.js";
import { JOB_KINDS } from "./constants.js";

export async function ensureTodoSyncSettings(prisma: PrismaClient) {
  return prisma.microsoftTodoSyncSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export async function enqueueMicrosoftTodoSync(prisma: PrismaClient) {
  const key = `microsoft_todo.sync_lists:${new Date().toISOString().slice(0, 16)}`;
  await prisma.backgroundJob
    .create({
      data: {
        kind: JOB_KINDS.microsoftTodoSyncLists,
        payload: {},
        idempotencyKey: key,
      },
    })
    .catch(() => undefined);
}

/**
 * Sync connected To Do lists when a Graph access token is provided (job payload or caller).
 * Unattended pull without a token marks settings with an informative error and no-ops.
 */
export async function syncMicrosoftTodoLists(
  prisma: PrismaClient,
  opts: { graphAccessToken?: string; createdById?: string } = {},
): Promise<{ upserted: number; skippedReason?: string }> {
  const settings = await ensureTodoSyncSettings(prisma);
  const listIds = Array.isArray(settings.connectedListIds)
    ? (settings.connectedListIds as string[])
    : [];

  if (!opts.graphAccessToken) {
    await prisma.microsoftTodoSyncSettings.update({
      where: { id: "default" },
      data: {
        lastSyncError:
          "Graph access token required for To Do pull. Trigger sync from Apps → To Do while signed in to Microsoft.",
      },
    });
    return { upserted: 0, skippedReason: "graph_token_required" };
  }

  if (listIds.length === 0) {
    // Fall back: refresh already-linked ExternalWorkItems by list
    const linked = await prisma.externalWorkItem.findMany({
      where: { provider: "microsoft_todo", listId: { not: null } },
      select: { listId: true },
      distinct: ["listId"],
    });
    for (const row of linked) {
      if (row.listId) listIds.push(row.listId);
    }
  }

  if (listIds.length === 0) {
    await prisma.microsoftTodoSyncSettings.update({
      where: { id: "default" },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: "No connected To Do lists configured.",
      },
    });
    return { upserted: 0, skippedReason: "no_lists" };
  }

  const run = await prisma.externalSyncRun.create({
    data: {
      provider: "microsoft_todo",
      kind: JOB_KINDS.microsoftTodoSyncLists,
      status: "running",
    },
  });

  const client = createGraphClient(opts.graphAccessToken);
  let upserted = 0;
  let createdById = opts.createdById;
  if (!createdById) {
    createdById =
      (
        await prisma.user.findFirst({ where: { role: "lead" }, orderBy: { createdAt: "asc" } })
      )?.id ?? (await prisma.user.findFirst())?.id;
  }
  const fallbackDev = await prisma.developer.findFirst({ orderBy: { displayName: "asc" } });

  try {
    for (const listId of listIds) {
      const tasks = await fetchTasksForList(client, listId, 100);
      const now = new Date();
      for (const t of tasks) {
        if (!t.id) continue;
        const triageStatus = graphTaskStatusToTriageStatus(t.status);
        const title = (t.title && t.title.trim()) || "(untitled)";
        const desc = stripTaskBody(t.body, 8000);
        const dueAt =
          t.dueDateTime?.dateTime && !Number.isNaN(new Date(t.dueDateTime.dateTime).getTime())
            ? new Date(t.dueDateTime.dateTime)
            : null;
        const preview = buildTodoSourcePreview(t);
        const snoozedUntil = triageStatus === "snoozed" && dueAt ? dueAt : null;
        const dueForRow = triageStatus === "snoozed" ? null : dueAt;

        const existing = await prisma.triageItem.findFirst({
          where: { graphTodoListId: listId, graphTodoTaskId: t.id },
        });

        let triageItemId: string;
        if (existing) {
          await prisma.triageItem.update({
            where: { id: existing.id },
            data: {
              title: title.slice(0, 500),
              description: desc,
              status: triageStatus,
              dueAt: dueForRow,
              snoozedUntil,
              graphWebLink: t.webUrl ?? null,
              sourcePreview: preview,
              lastTodoSyncedAt: now,
            },
          });
          triageItemId = existing.id;
        } else if (createdById && fallbackDev) {
          const created = await prisma.triageItem.create({
            data: {
              title: title.slice(0, 500),
              description: desc,
              category: "other",
              status: triageStatus,
              dueAt: dueForRow,
              snoozedUntil,
              assigneeDeveloperId: fallbackDev.id,
              sourceType: "microsoft_todo",
              graphWebLink: t.webUrl ?? null,
              sourcePreview: preview,
              graphTodoListId: listId,
              graphTodoTaskId: t.id,
              lastTodoSyncedAt: now,
              createdById,
            },
          });
          triageItemId = created.id;
        } else {
          continue;
        }

        await upsertMicrosoftTodoExternal(prisma, {
          listId,
          taskId: t.id,
          title: title.slice(0, 500),
          externalUrl: t.webUrl ?? null,
          externalStatus: t.status ?? null,
          triageItemId,
        });
        upserted += 1;
      }
    }

    await prisma.externalSyncRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        itemsUpserted: upserted,
        itemsSeen: upserted,
      },
    });
    await prisma.microsoftTodoSyncSettings.update({
      where: { id: "default" },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
    return { upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "todo_sync_failed";
    await prisma.externalSyncRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
    });
    await prisma.microsoftTodoSyncSettings.update({
      where: { id: "default" },
      data: { lastSyncError: msg },
    });
    throw e;
  }
}
