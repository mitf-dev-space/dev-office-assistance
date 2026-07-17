import type { PrismaClient } from "@prisma/client";
import { registerRepository } from "../services/repositoryService.js";
import type { CatalogEnvSlice } from "../providers/factory.js";
import { createProviderForConnection } from "../providers/factory.js";

const HELM_REPO_URL = "https://github.com/anstwechy/dev-office-assistance";
const HELM_REPO_PATH = "anstwechy/dev-office-assistance";

export async function seedHelmGithubRepository(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  connectionSlug = "github-cloud",
): Promise<void> {
  const connection = await prisma.repositoryConnection.findUnique({ where: { slug: connectionSlug } });
  if (!connection) return;

  const existing = await prisma.repository.findFirst({
    where: {
      connectionId: connection.id,
      normalizedProjectPath: HELM_REPO_PATH,
      archivedAt: null,
    },
  });
  if (existing) return;

  const provider = createProviderForConnection(connection, env);
  const verify = await provider.verifyConnection();
  if (!verify.ok) {
    console.warn("Helm GitHub repository seed skipped: GitHub connection not reachable.");
    return;
  }

  const backendTeam = await prisma.catalogTeam.findUnique({ where: { slug: "backend" } });
  if (!backendTeam) return;

  try {
    await registerRepository(prisma, env, {
      url: HELM_REPO_URL,
      name: "dev-office-assistance (Helm)",
      teamId: backendTeam.id,
      notes: "Helm monorepo — Engineering Catalog, Forge, triage, and planning.",
    });
    console.log("Registered Helm GitHub repository in Engineering Catalog.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "duplicate_repository") {
      console.warn("Helm GitHub repository seed failed:", msg);
    }
  }
}
