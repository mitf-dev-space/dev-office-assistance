import type { ForgeBuildStatus, ForgePlatform } from "@prisma/client";
import { prisma } from "../../db.js";
import {
  ACTIVE_BUILD_STATUSES,
  assertBuildStatusTransition,
  isTerminalBuildStatus,
  type ForgeBuildStatus as DomainStatus,
} from "../domain/buildStatus.js";
import { calculateOverallBuildStatus } from "../domain/overallStatus.js";

export async function transitionPlatformBuildStatus(
  platformBuildId: string,
  to: DomainStatus,
  extra?: {
    failureCategory?: string;
    failureSummary?: string;
    runnerId?: string;
    startedAtUtc?: Date;
    completedAtUtc?: Date;
  },
) {
  const row = await prisma.forgePlatformBuild.findUniqueOrThrow({
    where: { id: platformBuildId },
  });
  assertBuildStatusTransition(row.status as DomainStatus, to);

  const now = new Date();
  return prisma.forgePlatformBuild.update({
    where: { id: platformBuildId },
    data: {
      status: to,
      ...(extra?.runnerId !== undefined ? { runnerId: extra.runnerId } : {}),
      ...(extra?.failureCategory !== undefined ? { failureCategory: extra.failureCategory } : {}),
      ...(extra?.failureSummary !== undefined ? { failureSummary: extra.failureSummary } : {}),
      ...(extra?.startedAtUtc !== undefined ? { startedAtUtc: extra.startedAtUtc } : {}),
      ...(extra?.completedAtUtc !== undefined ? { completedAtUtc: extra.completedAtUtc } : {}),
      ...(to === "Claimed" && !row.startedAtUtc ? { startedAtUtc: now } : {}),
      ...(["Succeeded", "Failed", "Cancelled", "TimedOut", "SimulationCompleted"].includes(to)
        ? { completedAtUtc: extra?.completedAtUtc ?? now }
        : {}),
    },
  });
}

export async function refreshBuildRequestOverallStatus(buildRequestId: string) {
  const existing = await prisma.forgeBuildRequest.findUnique({
    where: { id: buildRequestId },
    select: { overallStatus: true },
  });
  const previousOverall = existing?.overallStatus ?? "Queued";

  const platforms = await prisma.forgePlatformBuild.findMany({
    where: { buildRequestId },
    select: { platform: true, status: true, simulationOnly: true },
  });

  const overall = calculateOverallBuildStatus(
    platforms.map((p) => ({
      platform: p.platform as "Android" | "iOS",
      status: p.status as DomainStatus,
      simulationOnly: p.simulationOnly,
    })),
  );

  const terminal = ["Succeeded", "Failed", "Cancelled", "TimedOut", "PartiallySucceeded", "SimulationCompleted"];
  const now = new Date();

  await prisma.forgeBuildRequest.update({
    where: { id: buildRequestId },
    data: {
      overallStatus: overall as ForgeBuildStatus,
      ...(terminal.includes(overall) ? { completedAtUtc: now } : {}),
      ...(["InProgress", "Claimed", "Building"].some((s) => platforms.some((p) => p.status === s))
        ? { startedAtUtc: now }
        : {}),
    },
  });

  return { previousOverall, newOverall: overall };
}

export type ClaimedJob = {
  platformBuildId: string;
  buildRequestId: string;
  platform: ForgePlatform;
  repositoryUrl: string;
  projectSubpath: string | null;
  defaultBranch: string;
  gitReferenceType: string;
  gitReference: string;
  dartEntryPoint: string;
  flutterFlavor: string | null;
  androidArtifactType: string;
  androidBuildMode: string;
  applicationName: string;
};

const RUNNER_STALE_MS = 2 * 60 * 1000;
const BUILD_STALE_MS = 45 * 60 * 1000;

/** Fail orphaned in-flight jobs and fix runner slot drift after API/worker restarts. */
export async function reconcileStaleForgeJobs(now = new Date()): Promise<number> {
  const heartbeatCutoff = new Date(now.getTime() - RUNNER_STALE_MS);
  const buildCutoff = new Date(now.getTime() - BUILD_STALE_MS);

  const staleRows = await prisma.forgePlatformBuild.findMany({
    where: {
      status: {
        in: [...ACTIVE_BUILD_STATUSES].filter(
          (s) => s !== "Queued" && s !== "WaitingForCompatibleRunner",
        ),
      },
    },
    include: { runner: { select: { id: true, lastHeartbeatAtUtc: true, status: true } } },
  });

  let reconciled = 0;
  for (const row of staleRows) {
    const heartbeatStale =
      !row.runner?.lastHeartbeatAtUtc || row.runner.lastHeartbeatAtUtc < heartbeatCutoff;
    const buildStale = row.startedAtUtc != null && row.startedAtUtc < buildCutoff;
    if (!heartbeatStale && !buildStale) continue;

    if (!isTerminalBuildStatus(row.status as DomainStatus)) {
      await transitionPlatformBuildStatus(row.id, "TimedOut", {
        failureCategory: "stale_job",
        failureSummary: heartbeatStale
          ? "Runner stopped responding; job timed out."
          : "Build exceeded maximum active duration; job timed out.",
        completedAtUtc: now,
      });
    }
    if (row.runnerId) {
      await releaseRunnerJobSlot(row.runnerId);
    }
    await refreshBuildRequestOverallStatus(row.buildRequestId);
    reconciled += 1;
  }

  const runners = await prisma.forgeRunner.findMany({
    where: { currentJobCount: { gt: 0 } },
    select: { id: true, currentJobCount: true },
  });
  for (const runner of runners) {
    const activeCount = await prisma.forgePlatformBuild.count({
      where: {
        runnerId: runner.id,
        status: {
          in: [...ACTIVE_BUILD_STATUSES].filter(
            (s) => s !== "Queued" && s !== "WaitingForCompatibleRunner",
          ),
        },
      },
    });
    if (activeCount !== runner.currentJobCount) {
      await prisma.forgeRunner.update({
        where: { id: runner.id },
        data: { currentJobCount: activeCount },
      });
    }
  }

  return reconciled;
}

export async function claimNextPlatformBuild(
  runnerId: string,
  supportedPlatforms: ForgePlatform[],
): Promise<ClaimedJob | null> {
  await reconcileStaleForgeJobs();

  return prisma.$transaction(async (tx) => {
    const runner = await tx.forgeRunner.findUnique({ where: { id: runnerId } });
    if (!runner || runner.currentJobCount >= runner.maximumConcurrentJobs) {
      return null;
    }

    const next = await tx.forgePlatformBuild.findFirst({
      where: {
        status: "Queued",
        platform: { in: supportedPlatforms },
      },
      orderBy: { queuedAtUtc: "asc" },
      include: {
        buildRequest: {
          include: {
            application: true,
            buildProfile: true,
          },
        },
      },
    });

    if (!next) {
      return null;
    }

    const platformBuild = await tx.forgePlatformBuild.update({
      where: { id: next.id },
      data: {
        status: "Claimed",
        runnerId,
        startedAtUtc: new Date(),
      },
      include: {
        buildRequest: {
          include: {
            application: true,
            buildProfile: true,
          },
        },
      },
    });

    await tx.forgeRunner.update({
      where: { id: runnerId },
      data: { currentJobCount: { increment: 1 } },
    });

    await tx.forgeBuildRequest.update({
      where: { id: platformBuild.buildRequestId },
      data: { overallStatus: "InProgress", startedAtUtc: new Date() },
    });

    const app = platformBuild.buildRequest.application;
    const profile = platformBuild.buildRequest.buildProfile;

    return {
      platformBuildId: platformBuild.id,
      buildRequestId: platformBuild.buildRequestId,
      platform: platformBuild.platform,
      repositoryUrl: app.repositoryUrl,
      projectSubpath: app.projectSubpath,
      defaultBranch: app.defaultBranch,
      gitReferenceType: platformBuild.buildRequest.gitReferenceType,
      gitReference: platformBuild.buildRequest.gitReference,
      dartEntryPoint: profile.dartEntryPoint,
      flutterFlavor: profile.flutterFlavor,
      androidArtifactType: profile.androidArtifactType,
      androidBuildMode: profile.androidBuildMode,
      applicationName: app.name,
    };
  });
}

export async function releaseRunnerJobSlot(runnerId: string) {
  const runner = await prisma.forgeRunner.findUnique({ where: { id: runnerId } });
  if (!runner || runner.currentJobCount <= 0) {
    return;
  }
  await prisma.forgeRunner.update({
    where: { id: runnerId },
    data: { currentJobCount: { decrement: 1 } },
  });
}
