import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import {
  toConnectionDto,
  upsertClickUpConnection,
  getClickUpClient,
} from "../clickup/connectionService.js";
import {
  discoverAllAccessibleLists,
  discoverFlattenedLists,
  shouldSkipAutoMapList,
} from "../clickup/discoveryService.js";
import { commitClickUpImport, previewClickUpImport } from "../clickup/importService.js";
import {
  enqueueClickUpSyncConnection,
  refreshClickUpTask,
  syncClickUpConnection,
  syncClickUpList,
} from "../clickup/syncService.js";
import {
  handleClickUpWebhookDelivery,
  registerClickUpWebhook,
  verifyClickUpWebhookSignature,
} from "../clickup/webhookService.js";
import {
  commentOnClickUpTask,
  createClickUpTaskFromTriage,
  updateClickUpTaskFromTriage,
} from "../clickup/outboundService.js";
import { parseClickUpUrl } from "../clickup/urlParse.js";
import { mapClickUpListFromTaskUrl } from "../clickup/mapListFromUrl.js";
import { TRIAGE_CATEGORIES, TRIAGE_STATUSES } from "@office/types";

async function requireLead(me: { role: string } | null, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!me) return null;
  if (me.role !== "lead") {
    await reply.status(403).send({ error: "forbidden", message: "Lead role required." });
    return null;
  }
  return me;
}

const putConnectionBody = z.object({
  apiToken: z.string().min(8).optional(),
  name: z.string().min(1).max(120).optional(),
  autoSyncEnabled: z.boolean().optional(),
});

const listMappingBody = z.object({
  workspaceId: z.string().min(1),
  spaceId: z.string().min(1),
  spaceName: z.string().optional(),
  folderId: z.string().nullable().optional(),
  folderName: z.string().nullable().optional(),
  listId: z.string().min(1),
  listName: z.string().optional(),
  enabled: z.boolean().optional(),
  importCategory: z.enum(TRIAGE_CATEGORIES).optional(),
  defaultAssigneeId: z.string().nullable().optional(),
  syncStatusToTriage: z.boolean().optional(),
  syncDueToTriage: z.boolean().optional(),
});

export async function registerClickUpWebhookRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/integrations/clickup/webhook", async (request, reply) => {
    const connection = await prisma.clickUpConnection.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!connection) {
      return reply.status(404).send({ error: "not_configured" });
    }

    const rawBody =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {});
    const signature =
      (request.headers["x-signature"] as string | undefined) ??
      (request.headers["x-clickup-signature"] as string | undefined);

    if (connection.webhookSecret) {
      const ok = verifyClickUpWebhookSignature(
        rawBody,
        signature,
        connection.webhookSecret,
      );
      if (!ok && env.NODE_ENV === "production") {
        return reply.status(401).send({ error: "invalid_signature" });
      }
    }

    const body = (typeof request.body === "object" && request.body
      ? request.body
      : {}) as {
      event?: string;
      webhook_id?: string;
      task_id?: string;
      history_items?: Array<{ id?: string }>;
    };

    const deliveryId =
      body.history_items?.[0]?.id ??
      body.webhook_id ??
      `${Date.now()}`;
    const taskId = body.task_id ?? null;

    const result = await handleClickUpWebhookDelivery(prisma, {
      connectionId: connection.id,
      deliveryId,
      event: body.event ?? "unknown",
      taskId,
      payload: request.body,
    });
    return { ok: true, ...result };
  });
}

export async function registerClickUpRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/integrations/clickup", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const c = await prisma.clickUpConnection.findFirst({ orderBy: { createdAt: "asc" } });
    if (!c) return { connection: null };
    return { connection: toConnectionDto(c) };
  });

  app.put("/api/integrations/clickup", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;

    const parsed = putConnectionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const existing = await prisma.clickUpConnection.findFirst();
    if (!parsed.data.apiToken && !existing) {
      return reply.status(400).send({ error: "api_token_required" });
    }

    try {
      if (parsed.data.apiToken) {
        const c = await upsertClickUpConnection(prisma, env, {
          apiToken: parsed.data.apiToken,
          name: parsed.data.name,
          autoSyncEnabled: parsed.data.autoSyncEnabled,
          userId: me.id,
        });
        return { connection: toConnectionDto(c) };
      }
      const c = await prisma.clickUpConnection.update({
        where: { id: existing!.id },
        data: {
          name: parsed.data.name ?? undefined,
          autoSyncEnabled: parsed.data.autoSyncEnabled ?? undefined,
          updatedById: me.id,
        },
      });
      return { connection: toConnectionDto(c) };
    } catch (e) {
      request.log.error({ err: e }, "clickup_connection_error");
      return reply.status(502).send({
        error: "clickup_unavailable",
        message: e instanceof Error ? e.message : "Failed to connect",
      });
    }
  });

  app.post("/api/integrations/clickup/test", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const pair = await getClickUpClient(prisma, env);
    if (!pair) return reply.status(400).send({ error: "not_connected" });
    try {
      const teams = await pair.client.getTeams();
      return {
        ok: true,
        teams: (teams.teams ?? []).map((t) => ({ id: t.id, name: t.name })),
      };
    } catch (e) {
      return reply.status(502).send({
        error: "clickup_unavailable",
        message: e instanceof Error ? e.message : "test failed",
      });
    }
  });

  app.get("/api/integrations/clickup/teams", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const pair = await getClickUpClient(prisma, env);
    if (!pair) return reply.status(400).send({ error: "not_connected" });
    const teams = await pair.client.getTeams();
    return { teams: (teams.teams ?? []).map((t) => ({ id: t.id!, name: t.name ?? t.id! })) };
  });

  app.get("/api/integrations/clickup/spaces", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const pair = await getClickUpClient(prisma, env);
    if (!pair) return reply.status(400).send({ error: "not_connected" });
    const connection = await prisma.clickUpConnection.findUnique({
      where: { id: pair.connectionId },
    });
    const workspaceId =
      (request.query as { workspaceId?: string }).workspaceId ?? connection?.workspaceId;
    if (!workspaceId) return reply.status(400).send({ error: "workspace_required" });
    const spaces = await pair.client.getSpaces(workspaceId);
    return {
      spaces: (spaces.spaces ?? []).map((s) => ({ id: s.id!, name: s.name ?? s.id! })),
    };
  });

  app.get("/api/integrations/clickup/flattened-lists", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const pair = await getClickUpClient(prisma, env);
    if (!pair) return reply.status(400).send({ error: "not_connected" });
    const connection = await prisma.clickUpConnection.findUnique({
      where: { id: pair.connectionId },
    });
    const q = request.query as { workspaceId?: string; allWorkspaces?: string };
    try {
      // Default: every workspace the token can see (owned + Shared with me).
      // Pass workspaceId to scope; allWorkspaces=0 keeps legacy single-workspace mode.
      if (q.workspaceId && q.allWorkspaces !== "1") {
        const lists = await discoverFlattenedLists(pair.client, q.workspaceId);
        return { lists };
      }
      const lists = await discoverAllAccessibleLists(
        pair.client,
        connection?.workspaceId ?? null,
      );
      return { lists };
    } catch (e) {
      request.log.error({ err: e }, "clickup_discovery_error");
      return reply.status(502).send({ error: "clickup_unavailable" });
    }
  });

  app.get("/api/integrations/clickup/list-mappings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return { mappings: [] };
    const mappings = await prisma.clickUpListMapping.findMany({
      where: { connectionId: c.id },
      orderBy: { listName: "asc" },
    });
    return { mappings };
  });

  app.put("/api/integrations/clickup/list-mappings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    const parsed = listMappingBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const mapping = await prisma.clickUpListMapping.upsert({
      where: {
        connectionId_listId: { connectionId: c.id, listId: d.listId },
      },
      create: {
        connectionId: c.id,
        workspaceId: d.workspaceId,
        spaceId: d.spaceId,
        spaceName: d.spaceName,
        folderId: d.folderId ?? null,
        folderName: d.folderName ?? null,
        listId: d.listId,
        listName: d.listName,
        enabled: d.enabled ?? true,
        importCategory: d.importCategory ?? "other",
        defaultAssigneeId: d.defaultAssigneeId ?? null,
        syncStatusToTriage: d.syncStatusToTriage ?? true,
        syncDueToTriage: d.syncDueToTriage ?? true,
      },
      update: {
        spaceId: d.spaceId,
        spaceName: d.spaceName,
        folderId: d.folderId ?? null,
        folderName: d.folderName ?? null,
        listName: d.listName,
        enabled: d.enabled,
        importCategory: d.importCategory,
        defaultAssigneeId: d.defaultAssigneeId,
        syncStatusToTriage: d.syncStatusToTriage,
        syncDueToTriage: d.syncDueToTriage,
      },
    });
    return { mapping };
  });

  app.post("/api/integrations/clickup/list-mappings/from-task-url", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    const body = z.object({ urlOrTaskId: z.string().min(3) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    try {
      // Shared spaces often missing from discovery — resolve list via a known task.
      return await mapClickUpListFromTaskUrl(prisma, env, {
        connectionId: c.id,
        urlOrTaskId: body.data.urlOrTaskId,
      });
    } catch (e) {
      return reply.status(400).send({
        error: "map_from_url_failed",
        message: e instanceof Error ? e.message : "failed",
      });
    }
  });

  /** Discover + enable every accessible list (skips CSV import dumps). */
  app.post("/api/integrations/clickup/list-mappings/enable-all-discovered", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    const pair = await getClickUpClient(prisma, env, c.id);
    if (!pair) return reply.status(400).send({ error: "not_connected" });
    const body = z
      .object({
        source: z.enum(["all", "shared", "owned"]).optional(),
        includeCsvImports: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    const sourceFilter = body.success ? (body.data.source ?? "all") : "all";
    const includeCsv = body.success ? Boolean(body.data.includeCsvImports) : false;
    try {
      const lists = await discoverAllAccessibleLists(pair.client, c.workspaceId);
      let mapped = 0;
      let skipped = 0;
      for (const list of lists) {
        if (sourceFilter !== "all" && list.source !== sourceFilter) {
          skipped += 1;
          continue;
        }
        if (!includeCsv && shouldSkipAutoMapList(list.listName)) {
          skipped += 1;
          continue;
        }
        await prisma.clickUpListMapping.upsert({
          where: {
            connectionId_listId: { connectionId: c.id, listId: list.listId },
          },
          create: {
            connectionId: c.id,
            workspaceId: list.workspaceId,
            spaceId: list.spaceId,
            spaceName: list.spaceName,
            folderId: list.folderId,
            folderName: list.folderName,
            listId: list.listId,
            listName: list.listName,
            enabled: true,
            importCategory: "other",
          },
          update: {
            workspaceId: list.workspaceId,
            spaceId: list.spaceId,
            spaceName: list.spaceName,
            folderId: list.folderId,
            folderName: list.folderName,
            listName: list.listName,
            enabled: true,
          },
        });
        mapped += 1;
      }
      return { mapped, skipped, discovered: lists.length };
    } catch (e) {
      request.log.error({ err: e }, "clickup_enable_all_error");
      return reply.status(502).send({
        error: "enable_all_failed",
        message: e instanceof Error ? e.message : "failed",
      });
    }
  });

  /** Wipe ClickUp ExternalWorkItems + linked Triage rows for a clean retest. */
  app.post("/api/integrations/clickup/clear-imported", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const body = z
      .object({ clearMappings: z.boolean().optional() })
      .safeParse(request.body ?? {});
    const clearMappings = body.success ? Boolean(body.data.clearMappings) : false;

    const external = await prisma.externalWorkItem.findMany({
      where: { provider: "clickup" },
      select: { id: true, triageItemId: true },
    });
    const triageIds = [
      ...new Set(external.map((e) => e.triageItemId).filter((id): id is string => Boolean(id))),
    ];
    const clickupTriage = await prisma.triageItem.findMany({
      where: { sourceType: "clickup" },
      select: { id: true },
    });
    for (const t of clickupTriage) {
      if (!triageIds.includes(t.id)) triageIds.push(t.id);
    }

    const deletedExternal = await prisma.externalWorkItem.deleteMany({
      where: { provider: "clickup" },
    });
    let deletedTriage = 0;
    if (triageIds.length > 0) {
      const r = await prisma.triageItem.deleteMany({ where: { id: { in: triageIds } } });
      deletedTriage = r.count;
    }
    let deletedMappings = 0;
    if (clearMappings) {
      const c = await prisma.clickUpConnection.findFirst();
      if (c) {
        const r = await prisma.clickUpListMapping.deleteMany({ where: { connectionId: c.id } });
        deletedMappings = r.count;
      }
    }
    return {
      deletedExternal: deletedExternal.count,
      deletedTriage,
      deletedMappings,
    };
  });

  app.get("/api/integrations/clickup/status-mappings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return { mappings: [] };
    return {
      mappings: await prisma.clickUpStatusMapping.findMany({ where: { connectionId: c.id } }),
    };
  });

  app.put("/api/integrations/clickup/status-mappings", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    const body = z
      .object({
        clickUpStatus: z.string().min(1),
        triageStatus: z.enum(TRIAGE_STATUSES),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    const mapping = await prisma.clickUpStatusMapping.upsert({
      where: {
        connectionId_clickUpStatus: {
          connectionId: c.id,
          clickUpStatus: body.data.clickUpStatus,
        },
      },
      create: {
        connectionId: c.id,
        clickUpStatus: body.data.clickUpStatus,
        triageStatus: body.data.triageStatus,
      },
      update: { triageStatus: body.data.triageStatus },
    });
    return { mapping };
  });

  app.post("/api/integrations/clickup/import/preview", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const body = z
      .object({
        listId: z.string().min(1),
        maxTasks: z.number().int().min(1).max(200).optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    try {
      return await previewClickUpImport(prisma, env, {
        connectionId: c.id,
        listId: body.data.listId,
        maxTasks: body.data.maxTasks,
      });
    } catch (e) {
      request.log.error({ err: e }, "clickup_preview_error");
      return reply.status(502).send({ error: "clickup_unavailable" });
    }
  });

  app.post("/api/integrations/clickup/import", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const body = z
      .object({
        listId: z.string().min(1),
        maxTasks: z.number().int().min(1).max(200).optional(),
        taskIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    try {
      const result = await commitClickUpImport(prisma, env, {
        connectionId: c.id,
        listId: body.data.listId,
        maxTasks: body.data.maxTasks,
        taskIds: body.data.taskIds,
        createdById: me.id,
      });
      return { ...result, message: "ClickUp tasks merged into ExternalWorkItem + Triage." };
    } catch (e) {
      request.log.error({ err: e }, "clickup_import_error");
      const msg = e instanceof Error ? e.message : "import_failed";
      if (msg === "no_developers") {
        return reply.status(400).send({ error: "no_developers" });
      }
      return reply.status(502).send({ error: "clickup_unavailable", message: msg });
    }
  });

  app.post("/api/integrations/clickup/sync", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    const body = z
      .object({ listId: z.string().optional(), enqueue: z.boolean().optional() })
      .safeParse(request.body ?? {});
    const data = body.success ? body.data : {};
    try {
      if (data.enqueue) {
        await enqueueClickUpSyncConnection(prisma, c.id);
        return { queued: true };
      }
      if (data.listId) {
        const r = await syncClickUpList(prisma, env, {
          connectionId: c.id,
          listId: data.listId,
        });
        return r;
      }
      return await syncClickUpConnection(prisma, env, c.id);
    } catch (e) {
      request.log.error({ err: e }, "clickup_sync_error");
      return reply.status(502).send({
        error: "sync_failed",
        message: e instanceof Error ? e.message : "sync failed",
      });
    }
  });

  app.post("/api/integrations/clickup/webhooks/register", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const c = await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    try {
      return await registerClickUpWebhook(prisma, env, c.id);
    } catch (e) {
      return reply.status(400).send({
        error: "webhook_register_failed",
        message: e instanceof Error ? e.message : "failed",
      });
    }
  });

  app.get("/api/integrations/clickup/parse-url", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const url = (request.query as { url?: string }).url ?? "";
    return parseClickUpUrl(url);
  });

  app.post("/api/triage-items/:id/clickup/create", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const body = z
      .object({ listId: z.string().min(1), connectionId: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    const c = body.data.connectionId
      ? await prisma.clickUpConnection.findUnique({ where: { id: body.data.connectionId } })
      : await prisma.clickUpConnection.findFirst();
    if (!c) return reply.status(400).send({ error: "not_connected" });
    try {
      const ewi = await createClickUpTaskFromTriage(prisma, env, {
        triageItemId: (request.params as { id: string }).id,
        connectionId: c.id,
        listId: body.data.listId,
        actorUserId: me.id,
      });
      return { externalWorkItem: ewi };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/triage-items/:id/clickup/sync", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    const triageId = (request.params as { id: string }).id;
    const ewi = await prisma.externalWorkItem.findFirst({
      where: { provider: "clickup", triageItemId: triageId },
    });
    if (!ewi) return reply.status(404).send({ error: "not_linked" });
    try {
      await refreshClickUpTask(prisma, env, {
        connectionId: ewi.connectionKey,
        taskId: ewi.externalId,
      });
      return { ok: true };
    } catch (e) {
      return reply.status(502).send({
        error: "sync_failed",
        message: e instanceof Error ? e.message : "failed",
      });
    }
  });

  app.post("/api/triage-items/:id/clickup/push", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    try {
      await updateClickUpTaskFromTriage(prisma, env, {
        triageItemId: (request.params as { id: string }).id,
        actorUserId: me.id,
      });
      return { ok: true };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "failed",
      });
    }
  });

  app.post("/api/triage-items/:id/clickup/comment", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const body = z.object({ comment: z.string().min(1).max(4000) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }
    try {
      await commentOnClickUpTask(prisma, env, {
        triageItemId: (request.params as { id: string }).id,
        comment: body.data.comment,
        actorUserId: me.id,
      });
      return { ok: true };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "failed",
      });
    }
  });

  app.delete("/api/triage-items/:id/clickup/link", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireLead(me, reply))) return;
    const triageId = (request.params as { id: string }).id;
    await prisma.externalWorkItem.updateMany({
      where: { provider: "clickup", triageItemId: triageId },
      data: { triageItemId: null },
    });
    return { ok: true };
  });
}
