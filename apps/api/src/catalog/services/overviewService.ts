import type { PrismaClient } from "@prisma/client";
import { calculateScorecard } from "../domain/scoreCalculator.js";

export async function getCatalogOverview(prisma: PrismaClient) {
  const [
    totalRepositories,
    reachableRepositories,
    withPipelines,
    unknownPipeline,
    openGaps,
    activeAlerts,
    neverSynced,
    stale,
    current,
    systems,
    applications,
    teams,
    connections,
    byLifecycle,
    byTeamRaw,
    byConnectionRaw,
    forgeLinked,
    recentSyncs,
    recentGaps,
    openMrs,
    branchCount,
  ] = await Promise.all([
    prisma.repository.count({ where: { archivedAt: null } }),
    prisma.repository.count({ where: { archivedAt: null, connectivityState: "reachable" } }),
    prisma.pipelineRun.groupBy({ by: ["repositoryId"], _count: true }).then((g) => g.length),
    prisma.repository.count({
      where: { archivedAt: null, OR: [{ reportedPipelineState: "unknown" }, { reportedPipelineState: null }] },
    }),
    prisma.engineeringGap.count({ where: { status: "open" } }),
    prisma.catalogAlert.count({ where: { isActive: true } }),
    prisma.repository.count({ where: { archivedAt: null, freshnessState: "never_synchronized" } }),
    prisma.repository.count({ where: { archivedAt: null, freshnessState: "stale" } }),
    prisma.repository.count({ where: { archivedAt: null, freshnessState: "current" } }),
    prisma.catalogSystem.count({ where: { archivedAt: null } }),
    prisma.catalogApplication.count({ where: { archivedAt: null } }),
    prisma.catalogTeam.count({ where: { archivedAt: null, isActive: true } }),
    prisma.repositoryConnection.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        providerKind: true,
        baseUrl: true,
        encryptedToken: true,
        lastVerifiedAt: true,
        _count: { select: { repositories: true } },
      },
    }),
    prisma.repository.groupBy({
      by: ["lifecycleState"],
      where: { archivedAt: null },
      _count: true,
    }),
    prisma.repository.groupBy({
      by: ["teamId"],
      where: { archivedAt: null },
      _count: true,
    }),
    prisma.repository.groupBy({
      by: ["connectionId"],
      where: { archivedAt: null },
      _count: true,
    }),
    prisma.forgeApplication.count({ where: { repositoryId: { not: null } } }),
    prisma.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { repository: { select: { id: true, name: true } } },
    }),
    prisma.engineeringGap.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { repository: { select: { id: true, name: true } } },
    }),
    prisma.mergeRequestSnapshot.count({ where: { state: { in: ["open", "opened"] } } }),
    prisma.repositoryBranch.count(),
  ]);

  const teamIds = byTeamRaw.map((r) => r.teamId).filter((id): id is string => Boolean(id));
  const teamRows = teamIds.length
    ? await prisma.catalogTeam.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

  const connectionNameById = new Map(connections.map((c) => [c.id, c]));
  const activeRepoCountByConnection = new Map(byConnectionRaw.map((r) => [r.connectionId, r._count]));

  return {
    totalRepositories,
    reachableRepositories,
    unreachableRepositories: totalRepositories - reachableRepositories,
    withPipelines,
    withoutPipelines: Math.max(0, totalRepositories - withPipelines),
    unknownStateCount: unknownPipeline,
    openGaps,
    activeAlerts,
    neverSyncedCount: neverSynced,
    staleCount: stale,
    freshCount: current,
    systemsCount: systems,
    applicationsCount: applications,
    teamsCount: teams,
    forgeLinkedCount: forgeLinked,
    openMergeRequestCount: openMrs,
    branchCount,
    connections: connections.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      providerKind: c.providerKind,
      baseUrl: c.baseUrl,
      hasToken: Boolean(c.encryptedToken),
      lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null,
      repositoryCount: activeRepoCountByConnection.get(c.id) ?? 0,
    })),
    byLifecycle: byLifecycle.map((r) => ({
      lifecycleState: r.lifecycleState,
      count: r._count,
    })),
    byTeam: byTeamRaw.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamId ? teamNameById.get(r.teamId) ?? "Unassigned" : "Unassigned",
      count: r._count,
    })),
    byConnection: byConnectionRaw.map((r) => {
      const conn = connectionNameById.get(r.connectionId);
      return {
        connectionId: r.connectionId,
        connectionSlug: conn?.slug ?? "unknown",
        connectionName: conn?.name ?? "Unknown",
        providerKind: conn?.providerKind ?? "unknown",
        count: r._count,
      };
    }),
    recentSyncs: recentSyncs.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      repositoryId: r.repositoryId,
      repositoryName: r.repository?.name ?? null,
    })),
    recentGaps: recentGaps.map((g) => ({
      id: g.id,
      title: g.title,
      priority: g.priority,
      repositoryId: g.repositoryId,
      repositoryName: g.repository.name,
    })),
  };
}

export async function refreshRepositoryScorecard(prisma: PrismaClient, repositoryId: string) {
  const checks = await prisma.repositoryCheckResult.findMany({
    where: { repositoryId },
    include: { checkDefinition: true },
  });

  const input = checks.map((c) => ({
    slug: c.checkDefinition.slug,
    status: c.status,
    isRequired: c.checkDefinition.isRequired,
    weight: 1,
    category: c.checkDefinition.category,
  }));

  const result = calculateScorecard(input);

  await prisma.scorecardSnapshot.create({
    data: {
      repositoryId,
      scores: result.dimensions,
      overallScore: result.overall,
    },
  });

  return result;
}

export async function createGapFromCheck(
  prisma: PrismaClient,
  repositoryId: string,
  checkSlug: string,
  title: string,
  priority = "medium",
  ownerTeamId?: string,
) {
  const existing = await prisma.engineeringGap.findFirst({
    where: { repositoryId, checkSlug, status: "open" },
  });
  if (existing) return existing;

  return prisma.engineeringGap.create({
    data: { repositoryId, checkSlug, title, priority, ownerTeamId, status: "open" },
  });
}

export async function upsertAlert(
  prisma: PrismaClient,
  fingerprint: string,
  alertType: string,
  message: string,
  repositoryId?: string,
  severity = "warning",
) {
  return prisma.catalogAlert.upsert({
    where: { fingerprint },
    create: { fingerprint, alertType, message, repositoryId, severity, isActive: true },
    update: { message, isActive: true, resolvedAt: null, updatedAt: new Date() },
  });
}

export async function resolveAlert(prisma: PrismaClient, fingerprint: string) {
  return prisma.catalogAlert.updateMany({
    where: { fingerprint, isActive: true },
    data: { isActive: false, resolvedAt: new Date() },
  });
}

export async function linkGapToTriage(prisma: PrismaClient, gapId: string, triageItemId: string) {
  return prisma.engineeringGap.update({
    where: { id: gapId },
    data: { triageItemId },
  });
}

export async function linkGapToPlanning(prisma: PrismaClient, gapId: string, planningItemId: string) {
  return prisma.engineeringGap.update({
    where: { id: gapId },
    data: { planningItemId },
  });
}

export async function linkForgeToCatalog(
  prisma: PrismaClient,
  forgeApplicationId: string,
  catalogApplicationId?: string,
  repositoryId?: string,
) {
  return prisma.forgeApplication.update({
    where: { id: forgeApplicationId },
    data: {
      catalogApplicationId: catalogApplicationId ?? undefined,
      repositoryId: repositoryId ?? undefined,
    },
  });
}

export async function reconcileForgeByUrl(prisma: PrismaClient) {
  const forgeApps = await prisma.forgeApplication.findMany();
  let linked = 0;
  for (const app of forgeApps) {
    if (app.repositoryId) continue;
    const parsed = app.repositoryUrl.trim().toLowerCase();
    const repo = await prisma.repository.findFirst({
      where: { canonicalUrl: { equals: parsed, mode: "insensitive" } },
    });
    if (repo) {
      await prisma.forgeApplication.update({
        where: { id: app.id },
        data: { repositoryId: repo.id },
      });
      linked++;
    }
  }
  return linked;
}
