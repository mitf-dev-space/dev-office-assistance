import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createGraphClient } from "../graphClient.js";
import { graphStatusCode, readGraphToken } from "../graphHelpers.js";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import {
  buildTodoSourcePreview,
  fetchTasksForList,
  graphTaskStatusToTriageStatus,
  stripTaskBody,
  type GraphTask,
} from "../todoTriageService.js";
import { upsertMicrosoftTodoExternal } from "../externalWork/upsert.js";
import {
  ensureTodoSyncSettings,
  syncMicrosoftTodoLists,
} from "../externalWork/todoSyncService.js";

const tasksQuery = z.object({
  top: z.coerce.number().int().min(1).max(200).default(100),
});

const importBody = z.object({
  listId: z.string().min(1),
  maxTasks: z.coerce.number().int().min(1).max(200).default(100),
  assigneeDeveloperId: z.string().min(1).optional(),
});

type GraphList = { id?: string; displayName?: string };
type GraphLists = { value?: GraphList[] };

type GraphTasks = { value?: GraphTask[] };

export async function registerMicrosoftTodoRoutes(app: FastifyInstance) {
  app.get("/api/todo/lists", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const graphToken = readGraphToken(request);
    if (!graphToken) {
      return reply.status(400).send({
        error: "graph_token_required",
        message:
          "Microsoft 365: sign in on the To Do or Outlook app page to obtain a token for this request.",
      });
    }

    const client = createGraphClient(graphToken);
    try {
      const res = (await client.api("/me/todo/lists").get()) as GraphLists;
      const rows = (res.value ?? [])
        .filter((r): r is GraphList & { id: string } => Boolean(r?.id))
        .map((r) => ({
          id: r.id!,
          displayName:
            typeof r.displayName === "string" && r.displayName.trim() ? r.displayName.trim() : "Tasks",
        }));
      return { lists: rows };
    } catch (e) {
      const code = graphStatusCode(e);
      if (code === 401 || code === 403) {
        return reply.status(403).send({
          error: "tasks_read_required",
          message:
            "Microsoft Graph denied To Do access. Sign in and accept Tasks.Read or Tasks.ReadWrite in Entra and retry.",
        });
      }
      request.log.error({ err: e }, "todo_lists_graph_error");
      return reply.status(502).send({ error: "graph_unavailable" });
    }
  });

  app.get<{
    Params: { listId: string };
  }>("/api/todo/lists/:listId/tasks", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const graphToken = readGraphToken(request);
    if (!graphToken) {
      return reply.status(400).send({
        error: "graph_token_required",
        message:
          "Microsoft 365: sign in on the To Do or Outlook app page to obtain a token for this request.",
      });
    }

    const { listId } = request.params;
    if (!listId) {
      return reply.status(400).send({ error: "list_id_required" });
    }

    const q = tasksQuery.safeParse(request.query);
    if (!q.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: q.error.flatten() });
    }
    const { top } = q.data;

    const client = createGraphClient(graphToken);
    const select = [
      "id",
      "title",
      "status",
      "importance",
      "dueDateTime",
      "body",
      "webUrl",
      "createdDateTime",
      "lastModifiedDateTime",
    ].join(",");

    try {
      const res = (await client
        .api(`/me/todo/lists/${listId}/tasks`)
        .top(top)
        .select(select)
        .get()) as GraphTasks;

      const tasks = (res.value ?? [])
        .filter((t) => t.id)
        .map((t) => ({
          id: t.id!,
          title: t.title ?? "(untitled)",
          status: t.status ?? "notStarted",
          importance: t.importance ?? "normal",
          dueDateTime: t.dueDateTime ?? null,
          bodyPreview:
            t.body?.content && typeof t.body.content === "string"
              ? t.body.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
              : null,
          webUrl: t.webUrl ?? null,
          createdDateTime: t.createdDateTime ?? null,
          lastModifiedDateTime: t.lastModifiedDateTime ?? null,
        }));

      return { tasks };
    } catch (e) {
      const code = graphStatusCode(e);
      if (code === 401 || code === 403) {
        return reply.status(403).send({
          error: "tasks_read_required",
          message:
            "Microsoft Graph denied To Do access. Sign in and accept Tasks permissions in Entra and retry.",
        });
      }
      if (code === 404) {
        return reply.status(404).send({ error: "list_not_found" });
      }
      request.log.error({ err: e }, "todo_tasks_graph_error");
      return reply.status(502).send({ error: "graph_unavailable" });
    }
  });

  app.post("/api/todo/import", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const graphToken = readGraphToken(request);
    if (!graphToken) {
      return reply.status(400).send({
        error: "graph_token_required",
        message:
          "Microsoft 365: sign in on the To Do app page to obtain a token for this request.",
      });
    }

    const parsed = importBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: parsed.error.flatten() });
    }
    const { listId, maxTasks, assigneeDeveloperId: assigneeFromBody } = parsed.data;

    const client = createGraphClient(graphToken);
    let tasks: GraphTask[];
    try {
      tasks = await fetchTasksForList(client, listId, maxTasks);
    } catch (e) {
      const code = graphStatusCode(e);
      if (code === 401 || code === 403) {
        return reply.status(403).send({
          error: "tasks_read_required",
          message:
            "Microsoft Graph denied To Do access. Sign in and accept Tasks.Read or Tasks.ReadWrite in Entra and retry.",
        });
      }
      if (code === 404) {
        return reply.status(404).send({ error: "list_not_found" });
      }
      request.log.error({ err: e }, "todo_import_graph_error");
      return reply.status(502).send({ error: "graph_unavailable" });
    }

    let assigneeDeveloperId: string;
    if (assigneeFromBody) {
      const d = await prisma.developer.findUnique({ where: { id: assigneeFromBody } });
      if (!d) {
        return reply.status(400).send({ error: "unknown_assignee" });
      }
      assigneeDeveloperId = d.id;
    } else {
      const fallback = await prisma.developer.findFirst({
        orderBy: { displayName: "asc" },
      });
      if (!fallback) {
        return reply.status(400).send({
          error: "no_developers",
          message: "Add at least one person in Dev management (roster) before importing tasks.",
        });
      }
      assigneeDeveloperId = fallback.id;
    }

    const now = new Date();
    let upserted = 0;
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
      } else {
        const created = await prisma.triageItem.create({
          data: {
            title: title.slice(0, 500),
            description: desc,
            category: "other",
            status: triageStatus,
            nextAction: null,
            dueAt: dueForRow,
            snoozedUntil,
            assigneeDeveloperId,
            sourceType: "microsoft_todo",
            graphMessageId: null,
            graphWebLink: t.webUrl ?? null,
            sourcePreview: preview,
            graphTodoListId: listId,
            graphTodoTaskId: t.id,
            lastTodoSyncedAt: now,
            createdById: me.id,
          },
        });
        triageItemId = created.id;
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

    const settings = await ensureTodoSyncSettings(prisma);
    const connected = Array.isArray(settings.connectedListIds)
      ? (settings.connectedListIds as string[])
      : [];
    if (!connected.includes(listId)) {
      await prisma.microsoftTodoSyncSettings.update({
        where: { id: "default" },
        data: { connectedListIds: [...connected, listId] },
      });
    }

    return {
      upserted,
      listId,
      message:
        "Tasks merged into triage and ExternalWorkItem. Re-run import or scheduled sync to pick up To Do changes.",
    };
  });

  app.get("/api/todo/sync-settings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const settings = await ensureTodoSyncSettings(prisma);
    return {
      autoSyncEnabled: settings.autoSyncEnabled,
      connectedListIds: settings.connectedListIds,
      lastSyncAt: settings.lastSyncAt?.toISOString() ?? null,
      lastSyncError: settings.lastSyncError,
    };
  });

  app.put("/api/todo/sync-settings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (me.role !== "lead") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const body = z
      .object({
        autoSyncEnabled: z.boolean().optional(),
        connectedListIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    await ensureTodoSyncSettings(prisma);
    const settings = await prisma.microsoftTodoSyncSettings.update({
      where: { id: "default" },
      data: {
        autoSyncEnabled: body.data.autoSyncEnabled,
        connectedListIds: body.data.connectedListIds,
      },
    });
    return {
      autoSyncEnabled: settings.autoSyncEnabled,
      connectedListIds: settings.connectedListIds,
      lastSyncAt: settings.lastSyncAt?.toISOString() ?? null,
      lastSyncError: settings.lastSyncError,
    };
  });

  app.post("/api/todo/sync", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const graphToken = readGraphToken(request);
    if (!graphToken) {
      return reply.status(400).send({
        error: "graph_token_required",
        message: "Sign in on the To Do page to sync lists.",
      });
    }
    try {
      const result = await syncMicrosoftTodoLists(prisma, {
        graphAccessToken: graphToken,
        createdById: me.id,
      });
      return result;
    } catch (e) {
      request.log.error({ err: e }, "todo_sync_error");
      return reply.status(502).send({ error: "sync_failed" });
    }
  });
}
