import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import { catalogEnvFrom } from "../env.js";
import { requireDbUser } from "../userService.js";
import { prisma } from "../db.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";
import { requireCatalogAccess, requireCatalogAdmin, requireCatalogWrite } from "../catalog/authz.js";
import {
  archiveRepository,
  fetchRepositoryIssues,
  getRepositoryDetail,
  listApplications,
  listConnections,
  listRepositories,
  listSystems,
  listTeams,
  previewRepositoryRegistration,
  redactConnection,
  registerRepository,
  updateRepository,
} from "../catalog/services/repositoryService.js";
import {
  migrateRepositoryOrigin,
  previewOriginMigration,
  syncRepository,
} from "../catalog/services/syncService.js";
import {
  commitImportJob,
  createImportJobFromFixture,
  previewImportJob,
} from "../catalog/services/importService.js";
import {
  createGapFromCheck,
  getCatalogOverview,
  linkForgeToCatalog,
  linkGapToPlanning,
  linkGapToTriage,
  reconcileForgeByUrl,
  refreshRepositoryScorecard,
} from "../catalog/services/overviewService.js";
import { createProviderForConnection } from "../catalog/providers/factory.js";
import { encryptToken } from "../catalog/lib/tokenCrypto.js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const registerSchema = z.object({
  url: z.string().min(1),
  name: z.string().min(1).max(200),
  connectionId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  reportedMainBranch: z.string().optional(),
  reportedDevelopmentBranch: z.string().optional(),
  notes: z.string().optional(),
});

const migrateOriginSchema = z.object({
  connectionId: z.string().uuid(),
  url: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

const updateRepositorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  lifecycleState: z.enum(["proposed", "active", "preparing", "deprecated", "archived"]).optional(),
  reportedMainBranch: z.string().max(200).nullable().optional(),
  reportedDevelopmentBranch: z.string().max(200).nullable().optional(),
  criticality: z.string().max(100).nullable().optional(),
});

export async function registerCatalogRoutes(app: FastifyInstance, env: Env) {
  const catalogEnv = catalogEnvFrom(env);

  app.get("/api/catalog/check-definitions", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const checks = await prisma.repositoryCheckDefinition.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return reply.send({ checks });
  });

  app.get("/api/catalog/overview", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const overview = await getCatalogOverview(prisma);
    return reply.send(overview);
  });

  app.get("/api/catalog/teams", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    return reply.send({ teams: await listTeams(prisma) });
  });

  app.get("/api/catalog/systems", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const q = z.object({ teamId: z.string().uuid().optional() }).parse(request.query);
    return reply.send({ systems: await listSystems(prisma, q.teamId) });
  });

  app.get("/api/catalog/applications", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const q = z.object({ systemId: z.string().uuid().optional() }).parse(request.query);
    return reply.send({ applications: await listApplications(prisma, q.systemId) });
  });

  app.get("/api/catalog/repositories", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const listQ = parseListQuery(request.query as Record<string, string | undefined>);
    const filters = z
      .object({
        teamId: z.string().uuid().optional(),
        lifecycleState: z.string().optional(),
        connectionSlug: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(request.query);
    const connectionFilter = filters.connectionSlug
      ? await prisma.repositoryConnection.findUnique({ where: { slug: filters.connectionSlug } })
      : null;
    const { items, total } = await listRepositories(prisma, {
      ...filters,
      teamId: filters.teamId,
      lifecycleState: filters.lifecycleState,
      connectionId: connectionFilter?.id,
      search: filters.search ?? listQ.q,
      skip: listQ.skip,
      take: listQ.limit,
    });
    return reply.send(
      withPageMeta(
        {
          repositories: items.map((r) => ({
            id: r.id,
            name: r.name,
            canonicalUrl: r.canonicalUrl,
            connectionSlug: r.connection.slug,
            providerKind: r.connection.providerKind,
            teamName: r.team?.name ?? null,
            lifecycleState: r.lifecycleState,
            connectivityState: r.connectivityState,
            freshnessState: r.freshnessState,
            defaultBranch: r.defaultBranch,
            latestCommitAt: r.commits[0]?.committedAt?.toISOString() ?? null,
            latestPipelineStatus: r.pipelineRuns[0]?.status ?? null,
            reportedPipelineState: r.reportedPipelineState,
            reportedUnitTestState: r.reportedUnitTestState,
            reportedMainBranch: r.reportedMainBranch,
            reportedDevelopmentBranch: r.reportedDevelopmentBranch,
            notes: r.notes,
            branchCount: r._count.branches,
            openMergeRequestCount: r._count.mergeRequests,
          })),
        },
        listQ.page,
        listQ.limit,
        total,
      ),
    );
  });

  app.patch("/api/catalog/repositories/:id", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateRepositorySchema.parse(request.body);
    try {
      const repository = await updateRepository(prisma, id, body);
      return reply.send({ repository });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/catalog/repositories/:id", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      await archiveRepository(prisma, id);
      return reply.send({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete_failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/catalog/repositories/:id/issues", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = z
      .object({ state: z.enum(["open", "closed", "all"]).optional(), limit: z.coerce.number().optional() })
      .parse(request.query);
    try {
      const issues = await fetchRepositoryIssues(prisma, catalogEnv, id, q.state ?? "open", q.limit ?? 30);
      return reply.send({ issues });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "issues_failed";
      return reply.status(502).send({ error: msg });
    }
  });

  app.get("/api/catalog/repositories/:id", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const repo = await getRepositoryDetail(prisma, id);
    if (!repo) return reply.status(404).send({ error: "not_found" });
    return reply.send({ repository: repo });
  });

  app.post("/api/catalog/repositories/preview", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const body = registerSchema.parse(request.body);
    try {
      const preview = await previewRepositoryRegistration(prisma, catalogEnv, body);
      if (!preview.ok) return reply.status(400).send({ error: preview.error });
      return reply.send({
        connection: redactConnection(preview.connection),
        identity: preview.identity,
        metadata: preview.metadata,
        duplicate: preview.duplicate,
      });
    } catch {
      return reply.status(502).send({ error: "provider_unreachable" });
    }
  });

  app.post("/api/catalog/repositories", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const body = registerSchema.parse(request.body);
    try {
      const repo = await registerRepository(prisma, catalogEnv, body);
      return reply.status(201).send({ repository: repo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "register_failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/catalog/repositories/:id/sync", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await syncRepository(prisma, catalogEnv, id);
    return reply.send(result);
  });

  app.post("/api/catalog/repositories/:id/origin/preview", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = migrateOriginSchema.parse(request.body);
    try {
      const preview = await previewOriginMigration(prisma, catalogEnv, {
        repositoryId: id,
        connectionId: body.connectionId,
        url: body.url,
      });
      if (!preview.ok) return reply.status(400).send({ error: preview.error });
      return reply.send(preview);
    } catch {
      return reply.status(502).send({ error: "provider_unreachable" });
    }
  });

  app.post("/api/catalog/repositories/:id/origin/migrate", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = migrateOriginSchema.parse(request.body);
    try {
      const updated = await migrateRepositoryOrigin(prisma, catalogEnv, {
        repositoryId: id,
        connectionId: body.connectionId,
        url: body.url,
        reason: body.reason,
        userId: me.id,
      });
      return reply.send({ repository: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "migrate_failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/catalog/repositories/:id/origin/history", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const history = await prisma.repositoryOriginHistory.findMany({
      where: { repositoryId: id },
      orderBy: { startedAt: "desc" },
      include: { connection: true, migratedBy: true },
    });
    return reply.send({ history });
  });

  app.get("/api/catalog/connections", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const connections = (await listConnections(prisma)).map(redactConnection);
    return reply.send({ connections });
  });

  app.post("/api/catalog/connections/:id/verify", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const connection = await prisma.repositoryConnection.findUnique({ where: { id } });
    if (!connection) return reply.status(404).send({ error: "not_found" });
    const provider = createProviderForConnection(connection, catalogEnv);
    const result = await provider.verifyConnection();
    await prisma.repositoryConnection.update({
      where: { id },
      data: { lastVerifiedAt: new Date() },
    });
    return reply.send(result);
  });

  app.put("/api/catalog/connections/:id/token", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ token: z.string().min(1) }).parse(request.body);
    if (!env.CATALOG_TOKEN_ENCRYPTION_KEY) {
      return reply.status(400).send({ error: "encryption_key_not_configured" });
    }
    const encrypted = encryptToken(body.token, env.CATALOG_TOKEN_ENCRYPTION_KEY);
    await prisma.repositoryConnection.update({
      where: { id },
      data: { encryptedToken: encrypted },
    });
    return reply.send({ ok: true, hasToken: true });
  });

  app.post("/api/catalog/imports/:dataset", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { dataset } = z.object({ dataset: z.enum(["backend", "mobile", "web"]) }).parse(request.params);
    const result = await createImportJobFromFixture(prisma, me.id, dataset);
    return reply.status(201).send(result);
  });

  app.get("/api/catalog/imports/:jobId", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const job = await previewImportJob(prisma, jobId);
    if (!job) return reply.status(404).send({ error: "not_found" });
    return reply.send({ job });
  });

  app.post("/api/catalog/imports/:jobId/commit", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const result = await commitImportJob(prisma, catalogEnv, jobId, me.id);
    return reply.send(result);
  });

  app.get("/api/catalog/gaps", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const gaps = await prisma.engineeringGap.findMany({
      where: { status: "open" },
      include: { repository: true, ownerTeam: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ gaps });
  });

  app.post("/api/catalog/gaps", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const body = z
      .object({
        repositoryId: z.string().uuid(),
        checkSlug: z.string(),
        title: z.string(),
        priority: z.string().optional(),
        ownerTeamId: z.string().uuid().optional(),
      })
      .parse(request.body);
    const gap = await createGapFromCheck(
      prisma,
      body.repositoryId,
      body.checkSlug,
      body.title,
      body.priority,
      body.ownerTeamId,
    );
    return reply.status(201).send({ gap });
  });

  app.post("/api/catalog/gaps/:id/link-triage", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ triageItemId: z.string().uuid() }).parse(request.body);
    const gap = await linkGapToTriage(prisma, id, body.triageItemId);
    return reply.send({ gap });
  });

  app.post("/api/catalog/gaps/:id/link-planning", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ planningItemId: z.string().uuid() }).parse(request.body);
    const gap = await linkGapToPlanning(prisma, id, body.planningItemId);
    return reply.send({ gap });
  });

  app.post("/api/catalog/repositories/:id/scorecard/refresh", async (request, reply) => {
    const me = await requireCatalogWrite(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const scorecard = await refreshRepositoryScorecard(prisma, id);
    return reply.send({ scorecard });
  });

  app.post("/api/catalog/forge/reconcile", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const linked = await reconcileForgeByUrl(prisma);
    return reply.send({ linked });
  });

  app.post("/api/catalog/forge/link", async (request, reply) => {
    const me = await requireCatalogAdmin(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const body = z
      .object({
        forgeApplicationId: z.string().uuid(),
        catalogApplicationId: z.string().uuid().optional(),
        repositoryId: z.string().uuid().optional(),
      })
      .parse(request.body);
    const appRow = await linkForgeToCatalog(
      prisma,
      body.forgeApplicationId,
      body.catalogApplicationId,
      body.repositoryId,
    );
    return reply.send({ forgeApplication: appRow });
  });

  app.get("/api/catalog/sync-runs", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const runs = await prisma.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { repository: true, errors: true },
    });
    return reply.send({ runs });
  });

  app.get("/api/catalog/alerts", async (request, reply) => {
    const me = await requireCatalogAccess(await requireDbUser(request.authUser, reply), reply);
    if (!me) return;
    const alerts = await prisma.catalogAlert.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ alerts });
  });
}

export async function registerCatalogWebhookRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/catalog/webhooks/gitlab/:connectionId", async (request, reply) => {
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(request.params);
    const token = request.headers["x-gitlab-token"];
    const connection = await prisma.repositoryConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.webhookSecret || token !== connection.webhookSecret) {
      return reply.status(401).send({ error: "invalid_webhook" });
    }
    const body = request.body as { object_kind?: string; project?: { path_with_namespace?: string } };
    const deliveryId = String(request.headers["x-gitlab-event-uuid"] ?? randomUUID());
    const idempotencyKey = `gitlab-${connectionId}-${deliveryId}`;
    try {
      await prisma.webhookDelivery.create({
        data: {
          connectionId,
          deliveryId,
          eventType: body.object_kind ?? "unknown",
          status: "accepted",
          idempotencyKey,
        },
      });
    } catch {
      return reply.send({ ok: true, duplicate: true });
    }
    if (body.project?.path_with_namespace) {
      const repo = await prisma.repository.findFirst({
        where: {
          connectionId,
          normalizedProjectPath: body.project.path_with_namespace.toLowerCase(),
        },
      });
      if (repo) {
        await prisma.backgroundJob.create({
          data: {
            kind: "catalog.sync_repository",
            payload: { repositoryId: repo.id },
            idempotencyKey: `wh-sync-${idempotencyKey}`,
          },
        });
      }
    }
    return reply.send({ ok: true });
  });

  app.post("/api/catalog/webhooks/github/:connectionId", async (request, reply) => {
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(request.params);
    const connection = await prisma.repositoryConnection.findUnique({ where: { id: connectionId } });
    const sig = request.headers["x-hub-signature-256"];
    if (!connection?.webhookSecret || typeof sig !== "string") {
      return reply.status(401).send({ error: "invalid_webhook" });
    }
    const raw = JSON.stringify(request.body);
    const expected = `sha256=${createHmac("sha256", connection.webhookSecret).update(raw).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.status(401).send({ error: "invalid_signature" });
    }
    const deliveryId = String(request.headers["x-github-delivery"] ?? randomUUID());
    const idempotencyKey = `github-${connectionId}-${deliveryId}`;
    try {
      await prisma.webhookDelivery.create({
        data: {
          connectionId,
          deliveryId,
          eventType: String(request.headers["x-github-event"] ?? "unknown"),
          status: "accepted",
          idempotencyKey,
        },
      });
    } catch {
      return reply.send({ ok: true, duplicate: true });
    }
    return reply.send({ ok: true });
  });
}
