import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { requireDbUser } from "../userService.js";
import {
  assistCatalogExplain,
  assistCatalogGapsTop,
  assistDecisionDraft,
  assistForgeExplainFailure,
  assistPlanningDraft,
  assistPriorityReorder,
  assistStandupDigest,
  assistTriageDuplicates,
  assistTriageNextAction,
  assistTriageSummarize,
  DailyCapExceededError,
} from "../llm/assistService.js";
import { assistWorkspaceChat } from "../llm/chatService.js";
import { getUsageSnapshot } from "../llm/usageGuard.js";
import { getLlmSettingsPublic, resolveWorkspaceLlmConfig, USAGE_SCOPE } from "../llm/workspaceSettings.js";
import { canAccessForge } from "@office/types";

function capReply(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, err: DailyCapExceededError) {
  return reply.status(429).send({ error: "daily_cap_exceeded", usage: err.usage });
}

export async function registerAssistRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/assist/status", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const settings = await getLlmSettingsPublic(prisma, env);
    const config = await resolveWorkspaceLlmConfig(prisma, env);
    return {
      enabled: Boolean(config),
      providerPreset: settings.providerPreset,
      model: settings.model,
      billingSource: config ? "workspace" : "none",
      usage: getUsageSnapshot(USAGE_SCOPE, settings.dailyCap),
      lastTestOk: settings.lastTestOk,
    };
  });

  app.post("/api/assist/triage-summarize", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z.object({ triageItemId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const item = await prisma.triageItem.findUnique({
      where: { id: body.data.triageItemId },
      include: { assignee: { select: { displayName: true } } },
    });
    if (!item) return reply.status(404).send({ error: "not_found" });

    try {
      const result = await assistTriageSummarize(prisma, env, {
        title: item.title,
        description: item.description,
        category: item.category,
        status: item.status,
        escalated: item.escalated,
        nextAction: item.nextAction,
        dueAt: item.dueAt,
        program: item.program,
        assigneeName: item.assignee.displayName,
        sourceType: item.sourceType,
        sourcePreview: item.sourcePreview,
      });
      return result;
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/triage-next-action", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z.object({ triageItemId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const item = await prisma.triageItem.findUnique({
      where: { id: body.data.triageItemId },
      include: { assignee: { select: { displayName: true } } },
    });
    if (!item) return reply.status(404).send({ error: "not_found" });

    try {
      const result = await assistTriageNextAction(prisma, env, {
        title: item.title,
        category: item.category,
        status: item.status,
        escalated: item.escalated,
        dueAt: item.dueAt,
        nextAction: item.nextAction,
        program: item.program,
        assigneeName: item.assignee.displayName,
        description: item.description,
      });
      return result;
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/standup-digest", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z
      .object({
        // Accept ISO datetime or date-only (standup UI sends weekStart as YYYY-MM-DD).
        weekStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/)
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const where = body.data.weekStart
      ? { weekStart: new Date(body.data.weekStart) }
      : undefined;

    const rows = await prisma.standupCheckIn.findMany({
      where,
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { weekStart: "desc" },
      take: 40,
    });

    try {
      return await assistStandupDigest(
        prisma,
        env,
        rows.map((r) => ({
          authorName: r.user.displayName ?? r.user.email,
          prior: r.priorWork,
          next: r.nextWork,
          blockers: r.blockers,
        })),
      );
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/catalog-explain", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z
      .object({
        gapId: z.string().uuid().optional(),
        repositoryId: z.string().uuid().optional(),
      })
      .refine((d) => d.gapId || d.repositoryId, { message: "gapId_or_repositoryId" })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    try {
      if (body.data.gapId) {
        const gap = await prisma.engineeringGap.findUnique({
          where: { id: body.data.gapId },
          include: {
            repository: {
              select: {
                name: true,
                freshnessState: true,
                connectivityState: true,
                technicalOwner: { select: { displayName: true } },
              },
            },
          },
        });
        if (!gap) return reply.status(404).send({ error: "not_found" });
        return await assistCatalogExplain(prisma, env, {
          title: gap.title,
          priority: gap.priority,
          checkSlug: gap.checkSlug,
          message: `${gap.repository.name}: ${gap.title}`,
          freshnessState: gap.repository.freshnessState,
          connectivityState: gap.repository.connectivityState,
          technicalOwnerName: gap.repository.technicalOwner?.displayName,
        });
      }

      const repoId = body.data.repositoryId!;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [repo, score, openGapCount, failedPipelines7d, branchCount] = await Promise.all([
        prisma.repository.findUnique({
          where: { id: repoId },
          include: {
            team: { select: { name: true } },
            technicalOwner: { select: { displayName: true } },
            connection: { select: { providerKind: true } },
          },
        }),
        prisma.scorecardSnapshot.findFirst({
          where: { repositoryId: repoId },
          orderBy: { capturedAt: "desc" },
        }),
        prisma.engineeringGap.count({
          where: { repositoryId: repoId, status: { not: "closed" } },
        }),
        prisma.pipelineRun.count({
          where: {
            repositoryId: repoId,
            status: "failed",
            finishedAt: { gte: weekAgo },
          },
        }),
        prisma.repositoryBranch.count({ where: { repositoryId: repoId } }),
      ]);
      if (!repo) return reply.status(404).send({ error: "not_found" });
      return await assistCatalogExplain(prisma, env, {
        title: repo.name,
        overallScore: score?.overallScore ?? null,
        message: `Scorecard and health for ${repo.name}`,
        freshnessState: repo.freshnessState,
        connectivityState: repo.connectivityState,
        lifecycleState: repo.lifecycleState,
        defaultBranch: repo.defaultBranch,
        technicalOwnerName: repo.technicalOwner?.displayName,
        teamName: repo.team?.name,
        reportedPipelineState: repo.reportedPipelineState,
        reportedUnitTestState: repo.reportedUnitTestState,
        openGapCount,
        failedPipelines7d,
        branchCount,
        providerKind: repo.connection.providerKind,
      });
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/triage-duplicates", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z.object({ triageItemId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const focus = await prisma.triageItem.findUnique({ where: { id: body.data.triageItemId } });
    if (!focus) return reply.status(404).send({ error: "not_found" });

    const candidates = await prisma.triageItem.findMany({
      where: {
        id: { not: focus.id },
        status: { in: ["inbox", "in_progress", "snoozed"] },
      },
      take: 80,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        category: true,
        program: true,
      },
    });

    try {
      return await assistTriageDuplicates(prisma, env, {
        focus: {
          id: focus.id,
          title: focus.title,
          description: focus.description,
          category: focus.category,
          program: focus.program,
        },
        candidates,
      });
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/planning-draft", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z
      .object({
        titleHint: z.string().max(200).optional(),
        program: z.string().max(200).optional(),
        department: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        triageItemIds: z.array(z.string().uuid()).max(20).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const openTriage = await prisma.triageItem.findMany({
      where: body.data.triageItemIds?.length
        ? { id: { in: body.data.triageItemIds } }
        : { status: { in: ["inbox", "in_progress", "snoozed"] } },
      take: 12,
      orderBy: [{ escalated: "desc" }, { updatedAt: "desc" }],
      select: { title: true, program: true },
    });

    try {
      return await assistPlanningDraft(prisma, env, {
        titleHint: body.data.titleHint,
        program: body.data.program ?? openTriage.find((t) => t.program)?.program,
        department: body.data.department,
        notes: body.data.notes,
        triageTitles: openTriage.map((t) => t.title),
      });
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/decision-draft", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z
      .object({
        titleHint: z.string().max(200).optional(),
        context: z.string().max(4000).optional(),
        options: z.array(z.string().max(300)).max(8).optional(),
        relatedTriageItemId: z.string().uuid().optional(),
        relatedPlanningItemId: z.string().uuid().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    let relatedTitle: string | null = null;
    let context = body.data.context;
    if (body.data.relatedTriageItemId) {
      const t = await prisma.triageItem.findUnique({
        where: { id: body.data.relatedTriageItemId },
        select: { title: true, description: true },
      });
      relatedTitle = t?.title ?? null;
      if (!context && t?.description) context = t.description;
    } else if (body.data.relatedPlanningItemId) {
      const p = await prisma.planningItem.findUnique({
        where: { id: body.data.relatedPlanningItemId },
        select: { title: true, description: true },
      });
      relatedTitle = p?.title ?? null;
      if (!context && p?.description) context = p.description;
    }

    try {
      return await assistDecisionDraft(prisma, env, {
        titleHint: body.data.titleHint,
        context,
        options: body.data.options,
        relatedTitle,
      });
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/catalog-gaps-top", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const gaps = await prisma.engineeringGap.findMany({
      where: { status: "open" },
      take: 40,
      orderBy: { updatedAt: "desc" },
      include: {
        repository: { select: { id: true, name: true, freshnessState: true } },
      },
    });

    try {
      return await assistCatalogGapsTop(
        prisma,
        env,
        gaps.map((g) => ({
          id: g.id,
          title: g.title,
          priority: g.priority,
          repositoryId: g.repository.id,
          repositoryName: g.repository.name,
          freshnessState: g.repository.freshnessState,
        })),
      );
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/priority-reorder", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const items = await prisma.triageItem.findMany({
      where: {
        status: { in: ["inbox", "in_progress", "snoozed"] },
        OR: [{ escalated: true }, { category: { in: ["blocker", "risk"] } }],
      },
      take: 40,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        escalated: true,
        dueAt: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    try {
      return await assistPriorityReorder(
        prisma,
        env,
        items.map((it) => ({
          id: it.id,
          title: it.title,
          category: it.category,
          status: it.status,
          escalated: it.escalated,
          dueAt: it.dueAt,
          ageDays: Math.floor((now - it.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
        })),
      );
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/chat", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const body = z
      .object({
        message: z.string().min(1).max(4000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            }),
          )
          .max(12)
          .optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    try {
      return await assistWorkspaceChat(prisma, env, body.data);
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });

  app.post("/api/assist/forge-explain-failure", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead" && !canAccessForge(me.role)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const body = z.object({ platformBuildId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const build = await prisma.forgePlatformBuild.findUnique({
      where: { id: body.data.platformBuildId },
      include: {
        runner: { select: { name: true } },
        buildRequest: {
          include: {
            application: { select: { name: true, bank: { select: { name: true } } } },
            buildProfile: { select: { name: true } },
          },
        },
      },
    });
    if (!build) return reply.status(404).send({ error: "not_found" });

    try {
      return await assistForgeExplainFailure(prisma, env, {
        status: build.status,
        platform: build.platform,
        errorMessage: build.failureSummary,
        failureCategory: build.failureCategory,
        applicationName: build.buildRequest.application.name,
        bankName: build.buildRequest.application.bank?.name,
        gitReference: build.buildRequest.gitReference,
        profileName: build.buildRequest.buildProfile?.name,
        runnerName: build.runner?.name,
      });
    } catch (err) {
      if (err instanceof DailyCapExceededError) return capReply(reply, err);
      throw err;
    }
  });
}
