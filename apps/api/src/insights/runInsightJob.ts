import type { InsightSnapshotKind, Prisma, PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { generateInsightNarrative } from "../llm/assistService.js";
import {
  INSIGHT_JOB_KINDS,
  insightJobKindToSnapshotKind,
  isInsightJobKind,
  type InsightJobKind,
} from "./constants.js";
import {
  buildBlockerRadarMetrics,
  buildCatalogHealthMetrics,
  buildForgeBuildsMetrics,
  buildMorningBriefMetrics,
  buildWeeklyOpsMetrics,
} from "./metricsBuilders.js";

function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function enqueueInsightJob(
  prisma: PrismaClient,
  kind: InsightJobKind,
  opts?: { force?: boolean },
) {
  const idem =
    kind === INSIGHT_JOB_KINDS.weeklyOps
      ? `${kind}:${isoWeekKey()}`
      : `${kind}:${dayKey()}`;

  if (!opts?.force) {
    const existing = await prisma.backgroundJob.findUnique({
      where: { idempotencyKey: idem },
    });
    if (
      existing &&
      (existing.status === "pending" ||
        existing.status === "leased" ||
        existing.status === "running" ||
        existing.status === "completed")
    ) {
      return existing;
    }
  }

  const key = opts?.force ? `${idem}:manual:${Date.now()}` : idem;
  return prisma.backgroundJob.create({
    data: {
      kind,
      payload: {},
      idempotencyKey: key,
      maxAttempts: 3,
    },
  });
}

export async function processInsightJob(
  prisma: PrismaClient,
  env: Env,
  job: { id: string; kind: string; payload: unknown },
) {
  if (!isInsightJobKind(job.kind)) {
    throw new Error(`Unknown insight job kind: ${job.kind}`);
  }

  const snapshotKind = insightJobKindToSnapshotKind(job.kind);
  const periodEnd = new Date();
  let metrics: Prisma.InputJsonValue;

  switch (job.kind) {
    case INSIGHT_JOB_KINDS.weeklyOps:
      metrics = (await buildWeeklyOpsMetrics(prisma, periodEnd)) as Prisma.InputJsonValue;
      break;
    case INSIGHT_JOB_KINDS.catalogHealth:
      metrics = (await buildCatalogHealthMetrics(prisma, periodEnd)) as Prisma.InputJsonValue;
      break;
    case INSIGHT_JOB_KINDS.forgeBuilds:
      metrics = (await buildForgeBuildsMetrics(prisma, periodEnd)) as Prisma.InputJsonValue;
      break;
    case INSIGHT_JOB_KINDS.morningBrief:
      metrics = (await buildMorningBriefMetrics(prisma, periodEnd)) as Prisma.InputJsonValue;
      break;
    case INSIGHT_JOB_KINDS.blockerRadar:
      metrics = (await buildBlockerRadarMetrics(prisma, periodEnd)) as Prisma.InputJsonValue;
      break;
    default: {
      const _exhaustive: never = job.kind;
      throw new Error(`Unhandled insight kind: ${_exhaustive}`);
    }
  }

  const metricsObj = metrics as { periodStart: string };
  const periodStart = new Date(metricsObj.periodStart);
  const snap = await prisma.insightSnapshot.create({
    data: {
      kind: snapshotKind as InsightSnapshotKind,
      periodStart,
      periodEnd,
      metrics,
      status: "pending",
    },
  });

  try {
    const { narrative, llmUsed } = await generateInsightNarrative(
      prisma,
      env,
      snapshotKind,
      metrics,
    );
    await prisma.insightSnapshot.update({
      where: { id: snap.id },
      data: {
        narrative: narrative ? (narrative as unknown as Prisma.InputJsonValue) : undefined,
        llmUsed,
        status: "ready",
      },
    });
  } catch (err) {
    await prisma.insightSnapshot.update({
      where: { id: snap.id },
      data: {
        status: "ready",
        llmUsed: false,
        error: err instanceof Error ? err.message : "narrative_failed",
      },
    });
  }
}

export function startInsightsScheduler(prisma: PrismaClient, env: Env) {
  if (!env.INSIGHTS_SCHEDULER_ENABLED) return;

  const intervalMs = Math.max(1, env.INSIGHTS_SCHEDULER_INTERVAL_HOURS) * 60 * 60 * 1000;
  const tick = async () => {
    try {
      await enqueueInsightJob(prisma, INSIGHT_JOB_KINDS.weeklyOps);
      await enqueueInsightJob(prisma, INSIGHT_JOB_KINDS.catalogHealth);
      await enqueueInsightJob(prisma, INSIGHT_JOB_KINDS.forgeBuilds);
      await enqueueInsightJob(prisma, INSIGHT_JOB_KINDS.morningBrief);
      await enqueueInsightJob(prisma, INSIGHT_JOB_KINDS.blockerRadar);
    } catch {
      /* scheduler tick */
    }
  };

  void tick();
  setInterval(() => void tick(), intervalMs);
}
