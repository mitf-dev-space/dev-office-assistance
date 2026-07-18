import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { requireDbUser } from "../userService.js";
import { INSIGHT_JOB_KINDS, type InsightJobKind } from "../insights/constants.js";
import { enqueueInsightJob } from "../insights/runInsightJob.js";

const KIND_VALUES = [
  INSIGHT_JOB_KINDS.weeklyOps,
  INSIGHT_JOB_KINDS.catalogHealth,
  INSIGHT_JOB_KINDS.forgeBuilds,
  INSIGHT_JOB_KINDS.morningBrief,
  INSIGHT_JOB_KINDS.blockerRadar,
] as const;

const SNAPSHOT_KINDS = [
  "weekly_ops",
  "catalog_health",
  "forge_builds",
  "morning_brief",
  "blocker_radar",
] as const;

const runSchema = z.object({
  kind: z.enum(KIND_VALUES),
});

function serializeSnapshot(row: {
  id: string;
  kind: string;
  periodStart: Date;
  periodEnd: Date;
  metrics: unknown;
  narrative: unknown;
  llmUsed: boolean;
  status: string;
  error: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    metrics: row.metrics,
    narrative: row.narrative,
    llmUsed: row.llmUsed,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerInsightsRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/insights", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = z
      .object({
        kind: z.enum(SNAPSHOT_KINDS).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ error: "validation", details: q.error.flatten() });
    }

    const rows = await prisma.insightSnapshot.findMany({
      where: q.data.kind ? { kind: q.data.kind } : undefined,
      orderBy: { createdAt: "desc" },
      take: q.data.limit ?? 20,
    });

    return { items: rows.map(serializeSnapshot) };
  });

  app.get("/api/insights/latest/:kind", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const kind = (request.params as { kind: string }).kind;
    if (!(SNAPSHOT_KINDS as readonly string[]).includes(kind)) {
      return reply.status(400).send({ error: "invalid_kind" });
    }

    const row = await prisma.insightSnapshot.findFirst({
      where: { kind: kind as (typeof SNAPSHOT_KINDS)[number], status: "ready" },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return serializeSnapshot(row);
  });

  app.get("/api/insights/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const id = (request.params as { id: string }).id;
    const row = await prisma.insightSnapshot.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return serializeSnapshot(row);
  });

  app.post("/api/insights/run", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = runSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const job = await enqueueInsightJob(prisma, parsed.data.kind as InsightJobKind, {
      force: true,
    });
    return {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString(),
    };
  });

  void env;
}
