import type { PrismaClient } from "@prisma/client";
import { ForgeBuildStatus } from "@prisma/client";
import { classifyBranch } from "../domain/branchClassification.js";
import { classifyJob } from "../domain/jobClassification.js";
import { OPEN_ORIGIN_END_AT } from "../domain/originHistory.js";
import { createProviderForConnection, type CatalogEnvSlice } from "../providers/factory.js";
import { refreshQualityChecks } from "./qualityService.js";

const IN_PROGRESS_FORGE: ForgeBuildStatus[] = [
  ForgeBuildStatus.Queued,
  ForgeBuildStatus.Claimed,
  ForgeBuildStatus.PreparingWorkspace,
  ForgeBuildStatus.CloningRepository,
  ForgeBuildStatus.Building,
  ForgeBuildStatus.InProgress,
];

export async function syncRepository(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  repositoryId: string,
): Promise<{ ok: boolean; itemsSynced: number }> {
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { connection: true },
  });
  if (!repo) throw new Error("repository_not_found");

  const syncRun = await prisma.syncRun.create({
    data: { repositoryId, connectionId: repo.connectionId, kind: "full", status: "running" },
  });

  let itemsSynced = 0;
  try {
    const provider = createProviderForConnection(repo.connection, env);
    const identity = {
      providerProjectId: repo.providerProjectId ?? "",
      normalizedProjectPath: repo.normalizedProjectPath,
      canonicalUrl: repo.canonicalUrl,
      webUrl: repo.canonicalUrl,
      defaultBranch: repo.defaultBranch ?? undefined,
    };

    const verify = await provider.verifyConnection();
    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        connectivityState: verify.state,
        defaultBranch: identity.defaultBranch,
      },
    });

    if (!verify.ok) {
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: { status: "failed", finishedAt: new Date() },
      });
      await prisma.repository.update({
        where: { id: repo.id },
        data: { freshnessState: "synchronization_failed" },
      });
      return { ok: false, itemsSynced: 0 };
    }

    const branches = await provider.listBranches(identity);
    for (const b of branches) {
      await prisma.repositoryBranch.upsert({
        where: { repositoryId_name: { repositoryId: repo.id, name: b.name } },
        create: {
          repositoryId: repo.id,
          name: b.name,
          isDefault: b.isDefault,
          isProtected: b.isProtected,
          classification: classifyBranch(b.name, repo.defaultBranch),
          latestCommitSha: b.latestCommitSha,
          latestCommitTitle: b.latestCommitTitle,
          latestCommitAuthor: b.latestCommitAuthor,
          latestCommitAt: b.latestCommitAt ? new Date(b.latestCommitAt) : null,
        },
        update: {
          isDefault: b.isDefault,
          isProtected: b.isProtected,
          classification: classifyBranch(b.name, repo.defaultBranch),
          latestCommitSha: b.latestCommitSha,
          latestCommitTitle: b.latestCommitTitle,
          latestCommitAuthor: b.latestCommitAuthor,
          latestCommitAt: b.latestCommitAt ? new Date(b.latestCommitAt) : null,
          syncedAt: new Date(),
        },
      });
      itemsSynced++;
    }

    const commits = await provider.listRecentCommits(identity, { limit: 30 });
    for (const c of commits) {
      await prisma.repositoryCommitSnapshot.upsert({
        where: { repositoryId_sha: { repositoryId: repo.id, sha: c.sha } },
        create: {
          repositoryId: repo.id,
          sha: c.sha,
          title: c.title,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          committedAt: new Date(c.committedAt),
          branchName: c.branchName,
          webUrl: c.webUrl,
        },
        update: { syncedAt: new Date() },
      });
      itemsSynced++;
    }

    const mergeRequests = await provider.listMergeRequests(identity, { state: "all", limit: 30 });
    for (const mr of mergeRequests) {
      await prisma.mergeRequestSnapshot.upsert({
        where: { repositoryId_providerMrId: { repositoryId: repo.id, providerMrId: mr.id } },
        create: {
          repositoryId: repo.id,
          providerMrId: mr.id,
          title: mr.title,
          state: mr.state,
          sourceBranch: mr.sourceBranch,
          targetBranch: mr.targetBranch,
          authorName: mr.authorName,
          isDraft: mr.isDraft,
          webUrl: mr.webUrl,
          createdAt: new Date(mr.createdAt),
          updatedAt: new Date(mr.updatedAt),
        },
        update: {
          title: mr.title,
          state: mr.state,
          sourceBranch: mr.sourceBranch,
          targetBranch: mr.targetBranch,
          authorName: mr.authorName,
          isDraft: mr.isDraft,
          webUrl: mr.webUrl,
          updatedAt: new Date(mr.updatedAt),
          syncedAt: new Date(),
        },
      });
      itemsSynced++;
    }

    const pipelines = await provider.listPipelines(identity, { limit: 20 });
    for (const p of pipelines) {
      const run = await prisma.pipelineRun.upsert({
        where: { repositoryId_providerRunId: { repositoryId: repo.id, providerRunId: p.id } },
        create: {
          repositoryId: repo.id,
          providerRunId: p.id,
          status: p.status,
          ref: p.ref,
          sha: p.sha,
          webUrl: p.webUrl,
          source: p.source,
          durationSeconds: p.durationSeconds,
          startedAt: p.startedAt ? new Date(p.startedAt) : null,
          finishedAt: p.finishedAt ? new Date(p.finishedAt) : null,
        },
        update: {
          status: p.status,
          syncedAt: new Date(),
        },
      });
      itemsSynced++;

      try {
        const jobs = await provider.listPipelineJobs(identity, p.id);
        for (const j of jobs) {
          await prisma.pipelineJob.upsert({
            where: { pipelineRunId_providerJobId: { pipelineRunId: run.id, providerJobId: j.id } },
            create: {
              pipelineRunId: run.id,
              providerJobId: j.id,
              name: j.name,
              stage: j.stage,
              status: j.status,
              classification: classifyJob(j.name, j.stage),
              durationSeconds: j.durationSeconds,
              coveragePercent: j.coveragePercent,
              webUrl: j.webUrl,
              allowFailure: j.allowFailure ?? false,
            },
            update: {
              status: j.status,
              classification: classifyJob(j.name, j.stage),
              syncedAt: new Date(),
            },
          });
        }
      } catch {
        /* jobs optional */
      }
    }

    await refreshQualityChecks(prisma, env, repo.id);

    await prisma.repository.update({
      where: { id: repo.id },
      data: { freshnessState: "current", connectivityState: "reachable" },
    });

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: "completed", finishedAt: new Date(), itemsSynced },
    });

    return { ok: true, itemsSynced };
  } catch (err) {
    await prisma.syncError.create({
      data: {
        syncRunId: syncRun.id,
        code: "sync_failed",
        message: err instanceof Error ? err.message : "Unknown sync error",
      },
    });
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: "failed", finishedAt: new Date(), itemsSynced },
    });
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { freshnessState: "synchronization_failed" },
    });
    return { ok: false, itemsSynced };
  }
}

export type OriginMigrateInput = {
  repositoryId: string;
  connectionId: string;
  url: string;
  reason?: string;
  userId: string;
};

export async function previewOriginMigration(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  input: Omit<OriginMigrateInput, "userId" | "reason">,
) {
  const repo = await prisma.repository.findUnique({ where: { id: input.repositoryId } });
  if (!repo) return { ok: false as const, error: "repository_not_found" };

  const connection = await prisma.repositoryConnection.findUnique({ where: { id: input.connectionId } });
  if (!connection) return { ok: false as const, error: "connection_not_found" };

  const provider = createProviderForConnection(connection, env);
  const identity = await provider.resolveRepository({ url: input.url });
  const metadata = await provider.getProjectMetadata(identity);

  const existing = await prisma.repository.findMany({ where: { archivedAt: null } });
  const duplicate = existing.find(
    (r) =>
      r.id !== repo.id &&
      r.connectionId === connection.id &&
      r.normalizedProjectPath === identity.normalizedProjectPath,
  );

  const inProgressBuild = await prisma.forgeBuildRequest.findFirst({
    where: {
      application: { repositoryId: repo.id },
      overallStatus: { in: [...IN_PROGRESS_FORGE] },
    },
  });

  return {
    ok: true as const,
    current: {
      connectionId: repo.connectionId,
      canonicalUrl: repo.canonicalUrl,
      defaultBranch: repo.defaultBranch,
    },
    target: { connection, identity, metadata },
    duplicate: duplicate ? { id: duplicate.id, name: duplicate.name } : null,
    blockedByBuild: Boolean(inProgressBuild),
  };
}

export async function migrateRepositoryOrigin(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  input: OriginMigrateInput,
) {
  const preview = await previewOriginMigration(prisma, env, input);
  if (!preview.ok) throw new Error(preview.error);
  if (preview.duplicate) throw new Error("duplicate_target");
  if (preview.blockedByBuild) throw new Error("build_in_progress");

  const { target } = preview;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.repositoryOriginHistory.updateMany({
      where: { repositoryId: input.repositoryId, endedAt: { gt: now } },
      data: { endedAt: now },
    });

    await tx.repositoryOriginHistory.create({
      data: {
        repositoryId: input.repositoryId,
        connectionId: target.connection.id,
        canonicalUrl: target.identity.canonicalUrl,
        normalizedProjectPath: target.identity.normalizedProjectPath,
        providerProjectId: target.identity.providerProjectId,
        providerKind: target.connection.providerKind,
        defaultBranch: target.metadata.defaultBranch,
        startedAt: now,
        endedAt: OPEN_ORIGIN_END_AT,
        migratedByUserId: input.userId,
        reason: input.reason,
      },
    });

    const updated = await tx.repository.update({
      where: { id: input.repositoryId },
      data: {
        connectionId: target.connection.id,
        canonicalUrl: target.identity.canonicalUrl,
        normalizedProjectPath: target.identity.normalizedProjectPath,
        providerProjectId: target.identity.providerProjectId,
        defaultBranch: target.metadata.defaultBranch ?? target.identity.defaultBranch,
        freshnessState: "never_synchronized",
        connectivityState: "reachable",
      },
    });

    await tx.forgeApplication.updateMany({
      where: { repositoryId: input.repositoryId },
      data: {
        repositoryUrl: target.identity.canonicalUrl,
        repositoryProvider: target.connection.providerKind,
        defaultBranch: target.metadata.defaultBranch ?? target.identity.defaultBranch ?? "main",
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.userId,
        action: "repository.origin_migrated",
        entityType: "Repository",
        entityId: input.repositoryId,
        metadata: {
          from: preview.current,
          to: { connectionId: target.connection.id, url: target.identity.canonicalUrl },
        },
      },
    });

    await tx.backgroundJob.create({
      data: {
        kind: "catalog.sync_repository",
        payload: { repositoryId: input.repositoryId },
        idempotencyKey: `sync-after-migrate-${input.repositoryId}-${now.getTime()}`,
      },
    });

    return updated;
  });
}
