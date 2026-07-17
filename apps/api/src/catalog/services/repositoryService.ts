import type { PrismaClient, Repository, RepositoryConnection } from "@prisma/client";
import { detectConnectionSlug, parseRepositoryUrl } from "../domain/urlNormalize.js";
import { findDuplicateReason } from "../domain/duplicateDetection.js";
import { parseSpreadsheetSignal, parseSpreadsheetPipeline } from "../domain/effectiveState.js";
import { OPEN_ORIGIN_END_AT } from "../domain/originHistory.js";
import { createProviderForConnection, type CatalogEnvSlice } from "../providers/factory.js";

export type RegisterRepositoryInput = {
  url: string;
  name: string;
  connectionId?: string;
  teamId?: string;
  componentId?: string;
  reportedMainBranch?: string;
  reportedDevelopmentBranch?: string;
  notes?: string;
};

export async function listConnections(prisma: PrismaClient) {
  return prisma.repositoryConnection.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listRepositories(
  prisma: PrismaClient,
  filters: {
    teamId?: string;
    connectionId?: string;
    lifecycleState?: string;
    search?: string;
    skip: number;
    take: number;
  },
) {
  const where = {
    archivedAt: null,
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
    ...(filters.lifecycleState ? { lifecycleState: filters.lifecycleState as Repository["lifecycleState"] } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { normalizedProjectPath: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.repository.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      orderBy: { name: "asc" },
      include: {
        connection: true,
        team: true,
        pipelineRuns: { orderBy: { finishedAt: "desc" }, take: 1 },
        commits: { orderBy: { committedAt: "desc" }, take: 1 },
        _count: {
          select: {
            branches: true,
            mergeRequests: { where: { state: { in: ["open", "opened"] } } },
          },
        },
      },
    }),
    prisma.repository.count({ where }),
  ]);
  return { items, total };
}

export async function previewRepositoryRegistration(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  input: RegisterRepositoryInput,
) {
  const connections = await prisma.repositoryConnection.findMany({ where: { isActive: true } });
  const parsed = parseRepositoryUrl(input.url);
  const connectionSlug = input.connectionId
    ? connections.find((c) => c.id === input.connectionId)?.slug
    : detectConnectionSlug(
        parsed,
        connections.map((c) => ({ slug: c.slug, providerKind: c.providerKind, baseUrl: c.baseUrl })),
      );
  const connection = input.connectionId
    ? connections.find((c) => c.id === input.connectionId)
    : connections.find((c) => c.slug === connectionSlug);
  if (!connection) {
    return { ok: false as const, error: "connection_not_found" };
  }

  const provider = createProviderForConnection(connection, env);
  const identity = await provider.resolveRepository({ url: input.url });
  const metadata = await provider.getProjectMetadata(identity);

  const existing = await prisma.repository.findMany({ where: { archivedAt: null } });
  const duplicate = findDuplicateReason(
    connection.id,
    identity.normalizedProjectPath,
    identity.canonicalUrl,
    existing,
  );

  return {
    ok: true as const,
    connection,
    identity,
    metadata,
    duplicate,
  };
}

export async function registerRepository(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  input: RegisterRepositoryInput,
) {
  const preview = await previewRepositoryRegistration(prisma, env, input);
  if (!preview.ok) throw new Error(preview.error);
  if (preview.duplicate) throw new Error("duplicate_repository");

  const { connection, identity, metadata } = preview;

  const repo = await prisma.repository.create({
    data: {
      connectionId: connection.id,
      teamId: input.teamId,
      componentId: input.componentId,
      name: input.name || metadata.name,
      canonicalUrl: identity.canonicalUrl,
      normalizedProjectPath: identity.normalizedProjectPath,
      providerProjectId: identity.providerProjectId,
      defaultBranch: metadata.defaultBranch ?? identity.defaultBranch,
      reportedMainBranch: input.reportedMainBranch,
      reportedDevelopmentBranch: input.reportedDevelopmentBranch,
      notes: input.notes,
      lifecycleState: "active",
      connectivityState: "reachable",
      freshnessState: "never_synchronized",
    },
  });

  await prisma.repositoryOriginHistory.create({
    data: {
      repositoryId: repo.id,
      connectionId: connection.id,
      canonicalUrl: identity.canonicalUrl,
      normalizedProjectPath: identity.normalizedProjectPath,
      providerProjectId: identity.providerProjectId,
      providerKind: connection.providerKind,
      defaultBranch: metadata.defaultBranch,
      startedAt: new Date(),
      endedAt: OPEN_ORIGIN_END_AT,
    },
  });

  await prisma.backgroundJob.create({
    data: {
      kind: "catalog.sync_repository",
      payload: { repositoryId: repo.id },
      idempotencyKey: `sync-init-${repo.id}`,
    },
  });

  return repo;
}

export function mapImportRowSignals(row: Record<string, unknown>) {
  return {
    reportedUnitTestState: parseSpreadsheetSignal(String(row.unitTests ?? "")),
    reportedStaticAnalysisState: parseSpreadsheetSignal(String(row.staticAnalysis ?? "")),
    reportedPipelineState: parseSpreadsheetPipeline(String(row.pipeline ?? "")),
    reportedMainBranch: row.mainBranch ? String(row.mainBranch) : null,
    reportedDevelopmentBranch: row.developmentBranch ? String(row.developmentBranch) : null,
  };
}

export type UpdateRepositoryInput = {
  name?: string;
  notes?: string | null;
  teamId?: string | null;
  lifecycleState?: Repository["lifecycleState"];
  reportedMainBranch?: string | null;
  reportedDevelopmentBranch?: string | null;
  criticality?: string | null;
};

export async function updateRepository(
  prisma: PrismaClient,
  id: string,
  input: UpdateRepositoryInput,
) {
  const existing = await prisma.repository.findFirst({ where: { id, archivedAt: null } });
  if (!existing) throw new Error("repository_not_found");

  return prisma.repository.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      ...(input.lifecycleState !== undefined ? { lifecycleState: input.lifecycleState } : {}),
      ...(input.reportedMainBranch !== undefined ? { reportedMainBranch: input.reportedMainBranch } : {}),
      ...(input.reportedDevelopmentBranch !== undefined
        ? { reportedDevelopmentBranch: input.reportedDevelopmentBranch }
        : {}),
      ...(input.criticality !== undefined ? { criticality: input.criticality } : {}),
    },
    include: { connection: true, team: true },
  });
}

export async function archiveRepository(prisma: PrismaClient, id: string) {
  const existing = await prisma.repository.findFirst({ where: { id, archivedAt: null } });
  if (!existing) throw new Error("repository_not_found");

  return prisma.repository.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      lifecycleState: "archived",
    },
  });
}

export async function fetchRepositoryIssues(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  repositoryId: string,
  state: "open" | "closed" | "all" = "open",
  limit = 30,
) {
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { connection: true },
  });
  if (!repo || repo.archivedAt) throw new Error("repository_not_found");

  const provider = createProviderForConnection(repo.connection, env);
  const identity = {
    providerProjectId: repo.providerProjectId ?? "",
    normalizedProjectPath: repo.normalizedProjectPath,
    canonicalUrl: repo.canonicalUrl,
    webUrl: repo.canonicalUrl,
    defaultBranch: repo.defaultBranch ?? undefined,
  };
  const issues = await provider.listIssues(identity, { state, limit });
  return issues;
}

export async function getRepositoryDetail(prisma: PrismaClient, id: string) {
  return prisma.repository.findUnique({
    where: { id },
    include: {
      connection: true,
      team: true,
      component: { include: { application: { include: { system: true } } } },
      branches: { orderBy: { name: "asc" } },
      commits: { orderBy: { committedAt: "desc" }, take: 50 },
      mergeRequests: { orderBy: { updatedAt: "desc" }, take: 50 },
      pipelineRuns: { orderBy: { finishedAt: "desc" }, take: 30, include: { jobs: true } },
      checkResults: { include: { checkDefinition: true } },
      scorecardSnapshots: { orderBy: { capturedAt: "desc" }, take: 10 },
      originHistory: { orderBy: { startedAt: "desc" } },
      gaps: { where: { status: "open" } },
      forgeApplications: { include: { bank: true } },
    },
  });
}

export async function listTeams(prisma: PrismaClient) {
  return prisma.catalogTeam.findMany({ where: { archivedAt: null, isActive: true }, orderBy: { name: "asc" } });
}

export async function listSystems(prisma: PrismaClient, teamId?: string) {
  return prisma.catalogSystem.findMany({
    where: { archivedAt: null, ...(teamId ? { teamId } : {}) },
    include: { team: true },
    orderBy: { name: "asc" },
  });
}

export async function listApplications(prisma: PrismaClient, systemId?: string) {
  return prisma.catalogApplication.findMany({
    where: { archivedAt: null, ...(systemId ? { systemId } : {}) },
    include: { system: true, applicationType: true },
    orderBy: { name: "asc" },
  });
}

export type ConnectionWithRedactedToken = RepositoryConnection & { hasToken: boolean };

export function redactConnection(conn: RepositoryConnection): ConnectionWithRedactedToken {
  return { ...conn, encryptedToken: null, webhookSecret: null, hasToken: Boolean(conn.encryptedToken) };
}
