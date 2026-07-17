import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { JOB_KINDS } from "../externalWork/constants.js";
import { enqueueMicrosoftTodoSync, syncMicrosoftTodoLists } from "../externalWork/todoSyncService.js";
import {
  enqueueClickUpSyncConnection,
  refreshClickUpTask,
  syncClickUpConnection,
  syncClickUpList,
} from "../clickup/syncService.js";

export async function processExternalWorkJob(
  prisma: PrismaClient,
  env: Env,
  job: { id: string; kind: string; payload: unknown },
) {
  if (job.kind === JOB_KINDS.clickupSyncConnection) {
    const payload = job.payload as { connectionId?: string };
    if (!payload.connectionId) throw new Error("missing connectionId");
    await syncClickUpConnection(prisma, env, payload.connectionId);
    return;
  }
  if (job.kind === JOB_KINDS.clickupSyncList) {
    const payload = job.payload as { connectionId?: string; listId?: string };
    if (!payload.connectionId || !payload.listId) throw new Error("missing connectionId/listId");
    await syncClickUpList(prisma, env, {
      connectionId: payload.connectionId,
      listId: payload.listId,
    });
    return;
  }
  if (job.kind === JOB_KINDS.clickupRefreshTask) {
    const payload = job.payload as { connectionId?: string; taskId?: string };
    if (!payload.connectionId || !payload.taskId) throw new Error("missing connectionId/taskId");
    await refreshClickUpTask(prisma, env, {
      connectionId: payload.connectionId,
      taskId: payload.taskId,
    });
    return;
  }
  if (job.kind === JOB_KINDS.microsoftTodoSyncLists) {
    const payload = job.payload as { graphAccessToken?: string };
    await syncMicrosoftTodoLists(prisma, {
      graphAccessToken: payload.graphAccessToken,
    });
    return;
  }
  throw new Error(`Unknown external job kind: ${job.kind}`);
}

/** Separate ClickUp cron: enqueue sync for auto-enabled connections. */
export function startClickUpScheduler(prisma: PrismaClient, env: Env) {
  if (!env.CLICKUP_SYNC_ENABLED) return;

  const intervalMs = Math.max(1, env.CLICKUP_SYNC_INTERVAL_MINUTES) * 60_000;
  const tick = async () => {
    try {
      const connections = await prisma.clickUpConnection.findMany({
        where: { autoSyncEnabled: true },
      });
      for (const c of connections) {
        await enqueueClickUpSyncConnection(prisma, c.id);
      }
    } catch {
      /* scheduler tick */
    }
  };

  void tick();
  setInterval(() => void tick(), intervalMs);
}

/** Separate Microsoft To Do cron: enqueue sync when auto-enabled. */
export function startMicrosoftTodoScheduler(prisma: PrismaClient, env: Env) {
  if (!env.MICROSOFT_TODO_SYNC_ENABLED) return;

  const intervalMs = Math.max(1, env.MICROSOFT_TODO_SYNC_INTERVAL_MINUTES) * 60_000;
  const tick = async () => {
    try {
      const settings = await prisma.microsoftTodoSyncSettings.findUnique({
        where: { id: "default" },
      });
      if (!settings?.autoSyncEnabled) return;
      await enqueueMicrosoftTodoSync(prisma);
    } catch {
      /* scheduler tick */
    }
  };

  void tick();
  setInterval(() => void tick(), intervalMs);
}
