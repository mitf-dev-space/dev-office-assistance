import type { PrismaClient } from "@prisma/client";

const CHECK_DEFINITIONS = [
  { slug: "team-assigned", name: "Team assigned", category: "ownership", isRequired: true },
  { slug: "technical-owner", name: "Technical owner assigned", category: "ownership", isRequired: true },
  { slug: "repository-reachable", name: "Repository reachable", category: "health", isRequired: true },
  { slug: "default-branch-exists", name: "Default branch exists", category: "health", isRequired: true },
  { slug: "readme-present", name: "README present", category: "documentation", isRequired: false },
  { slug: "unit-tests-detected", name: "Unit tests detected", category: "testing", isRequired: true },
  { slug: "unit-tests-passing", name: "Unit tests passing", category: "testing", isRequired: true },
  { slug: "static-analysis-configured", name: "Static analysis configured", category: "quality", isRequired: false },
  { slug: "ci-config-exists", name: "CI configuration exists", category: "cicd", isRequired: true },
  { slug: "latest-pipeline-passing", name: "Latest pipeline passing", category: "cicd", isRequired: true },
  { slug: "protected-main-branch", name: "Protected main branch", category: "security", isRequired: true },
] as const;

const COMPONENT_TYPES = [
  { slug: "backend-microservice", name: "Backend microservice" },
  { slug: "backend-gateway", name: "Backend gateway" },
  { slug: "web-application", name: "Web application" },
  { slug: "flutter-shared-core", name: "Flutter shared core" },
  { slug: "flutter-bank-app", name: "Flutter bank application" },
  { slug: "flutter-payment-app", name: "Flutter payment application" },
  { slug: "shared-library", name: "Shared library" },
  { slug: "integration-adapter", name: "Integration adapter" },
] as const;

const APPLICATION_TYPES = [
  { slug: "service", name: "Service" },
  { slug: "mobile-banking", name: "Mobile banking" },
  { slug: "mobile-payment", name: "Mobile payment" },
  { slug: "web-portal", name: "Web portal" },
] as const;

const TEAMS = [
  { slug: "backend", name: "Backend", devTeamSlug: "backend" as const },
  { slug: "frontend_web", name: "Frontend Web", devTeamSlug: "frontend_web" as const },
  { slug: "frontend_mobile", name: "Frontend Mobile", devTeamSlug: "frontend_mobile" as const },
  { slug: "qa", name: "QA", devTeamSlug: "qa" as const },
] as const;

/** Idempotent catalog teams, connections (GitLab/GitHub), checks, and systems. */
export async function seedCatalog(prisma: PrismaClient) {
  for (const t of TEAMS) {
    await prisma.catalogTeam.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, devTeamSlug: t.devTeamSlug },
      update: { name: t.name, devTeamSlug: t.devTeamSlug },
    });
  }

  for (const ct of COMPONENT_TYPES) {
    await prisma.componentType.upsert({
      where: { slug: ct.slug },
      create: { slug: ct.slug, name: ct.name },
      update: { name: ct.name },
    });
  }

  for (const at of APPLICATION_TYPES) {
    await prisma.applicationType.upsert({
      where: { slug: at.slug },
      create: { slug: at.slug, name: at.name },
      update: { name: at.name },
    });
  }

  for (const check of CHECK_DEFINITIONS) {
    await prisma.repositoryCheckDefinition.upsert({
      where: { slug: check.slug },
      create: check,
      update: { name: check.name, category: check.category, isRequired: check.isRequired },
    });
  }

  const gitlabBase = process.env.GITLAB_BASE_URL ?? "http://10.10.20.51";
  const gitlabApi = process.env.GITLAB_API_URL ?? `${gitlabBase.replace(/\/$/, "")}/api/v4`;
  const githubBase = process.env.GITHUB_BASE_URL ?? "https://github.com";
  const githubApi = process.env.GITHUB_API_URL ?? "https://api.github.com";

  await prisma.repositoryConnection.upsert({
    where: { slug: process.env.GITLAB_CONNECTION_NAME ?? "gitlab-internal" },
    create: {
      slug: process.env.GITLAB_CONNECTION_NAME ?? "gitlab-internal",
      name: "GitLab (self-hosted)",
      providerKind: "gitlab",
      baseUrl: gitlabBase,
      apiUrl: gitlabApi,
      syncEnabled: process.env.CATALOG_SYNC_ENABLED !== "false",
    },
    update: { baseUrl: gitlabBase, apiUrl: gitlabApi },
  });

  await prisma.repositoryConnection.upsert({
    where: { slug: process.env.GITHUB_CONNECTION_NAME ?? "github-cloud" },
    create: {
      slug: process.env.GITHUB_CONNECTION_NAME ?? "github-cloud",
      name: "GitHub (cloud)",
      providerKind: "github",
      baseUrl: githubBase,
      apiUrl: githubApi,
      syncEnabled: process.env.CATALOG_SYNC_ENABLED !== "false",
    },
    update: { baseUrl: githubBase, apiUrl: githubApi },
  });

  const systems = [
    { teamSlug: "backend", slug: "backend-services", name: "Backend services" },
    { teamSlug: "backend", slug: "core-services", name: "Core services" },
    { teamSlug: "backend", slug: "payment-ecosystem", name: "Payment ecosystem" },
    { teamSlug: "frontend_mobile", slug: "mobile-banking", name: "Mobile banking" },
    { teamSlug: "frontend_mobile", slug: "mobile-payment", name: "Mobile payment" },
    { teamSlug: "frontend_web", slug: "web-portals", name: "Web portals" },
  ] as const;

  for (const sys of systems) {
    const team = await prisma.catalogTeam.findUnique({ where: { slug: sys.teamSlug } });
    if (!team) continue;
    await prisma.catalogSystem.upsert({
      where: { teamId_slug: { teamId: team.id, slug: sys.slug } },
      create: { teamId: team.id, slug: sys.slug, name: sys.name },
      update: { name: sys.name },
    });
  }

  console.log("Seeded Engineering Catalog teams, connections, checks, and systems.");
}
