import type { PrismaClient } from "@prisma/client";
import { syncRepository } from "../services/syncService.js";
import type { CatalogEnvSlice } from "../providers/factory.js";
import type { Env } from "../../env.js";
import { processExternalWorkJob } from "../../jobs/externalWorkWorker.js";
import { JOB_KINDS } from "../../externalWork/constants.js";
import { isInsightJobKind } from "../../insights/constants.js";
import { processInsightJob } from "../../insights/runInsightJob.js";

const LEASE_MS = 60_000;

export async function claimNextBackgroundJob(prisma: PrismaClient, workerId: string) {
  const now = new Date();
  const job = await prisma.backgroundJob.findFirst({
    where: {
      status: "pending",
      scheduledFor: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: { scheduledFor: "asc" },
  });
  if (!job) return null;

  const leased = await prisma.backgroundJob.updateMany({
    where: { id: job.id, status: "pending" },
    data: {
      status: "leased",
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      attempts: { increment: 1 },
    },
  });
  if (leased.count === 0) return null;
  return prisma.backgroundJob.findUnique({ where: { id: job.id } });
}

export async function completeBackgroundJob(prisma: PrismaClient, jobId: string) {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "completed", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
  });
}

export async function failBackgroundJob(prisma: PrismaClient, jobId: string, error: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const dead = job.attempts >= job.maxAttempts;
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: dead ? "dead_letter" : "pending",
      lastError: error,
      leaseOwner: null,
      leaseExpiresAt: null,
      scheduledFor: dead ? job.scheduledFor : new Date(Date.now() + job.attempts * 60_000),
    },
  });
}

export async function processBackgroundJob(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  job: { id: string; kind: string; payload: unknown },
  fullEnv?: Env,
) {
  if (job.kind === "catalog.sync_repository") {
    const payload = job.payload as { repositoryId?: string };
    if (!payload.repositoryId) throw new Error("missing repositoryId");
    await syncRepository(prisma, env, payload.repositoryId);
    return;
  }
  if (
    job.kind === JOB_KINDS.clickupSyncConnection ||
    job.kind === JOB_KINDS.clickupSyncList ||
    job.kind === JOB_KINDS.clickupRefreshTask ||
    job.kind === JOB_KINDS.microsoftTodoSyncLists
  ) {
    if (!fullEnv) throw new Error("full env required for external work jobs");
    await processExternalWorkJob(prisma, fullEnv, job);
    return;
  }
  if (isInsightJobKind(job.kind)) {
    if (!fullEnv) throw new Error("full env required for insight jobs");
    await processInsightJob(prisma, fullEnv, job);
    return;
  }
  throw new Error(`Unknown job kind: ${job.kind}`);
}

export function startCatalogWorker(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  fullEnv?: Env,
) {
  const workerId = `catalog-worker-${process.pid}`;
  const intervalMs = Number(process.env.CATALOG_SYNC_INTERVAL_MINUTES ?? 30) * 60_000;

  const tick = async () => {
    try {
      const job = await claimNextBackgroundJob(prisma, workerId);
      if (!job) return;
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "running", startedAt: new Date() },
      });
      try {
        await processBackgroundJob(prisma, env, job, fullEnv);
        await completeBackgroundJob(prisma, job.id);
      } catch (err) {
        await failBackgroundJob(prisma, job.id, err instanceof Error ? err.message : "failed");
      }
    } catch {
      /* worker tick errors are logged at route level */
    }
  };

  void tick();
  setInterval(() => void tick(), Math.min(intervalMs, 60_000));
}
