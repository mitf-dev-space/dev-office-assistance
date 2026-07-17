import type { PrismaClient } from "@prisma/client";
import type { RepositoryTreeItem } from "@office/types";
import { createProviderForConnection, type CatalogEnvSlice } from "../providers/factory.js";
import { resolveEffectiveSignal } from "../domain/effectiveState.js";

const TEST_MARKERS = [/\.csproj/i, /test\//i, /vitest/i, /jest/i, /xunit/i, /flutter_test/i];
const STATIC_MARKERS = [/sonar/i, /\.eslintrc/i, /analysis_options\.yaml/i, /dotnet format/i];

export function detectQualityFromTree(files: RepositoryTreeItem[]) {
  const paths = files.map((f) => f.path.toLowerCase());
  const hasUnitTestFiles = paths.some((p) => TEST_MARKERS.some((m) => m.test(p)));
  const hasStaticAnalysisConfig = paths.some((p) => STATIC_MARKERS.some((m) => m.test(p)));
  const hasCiConfig =
    paths.some((p) => p === ".gitlab-ci.yml") || paths.some((p) => p.startsWith(".github/workflows/"));

  return {
    unitTests: hasUnitTestFiles ? ("detected" as const) : ("unknown" as const),
    staticAnalysis: hasStaticAnalysisConfig ? ("configured" as const) : ("unknown" as const),
    ciConfig: hasCiConfig ? ("detected" as const) : ("unknown" as const),
  };
}

export async function refreshQualityChecks(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  repositoryId: string,
) {
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { connection: true, pipelineRuns: { include: { jobs: true }, take: 5 } },
  });
  if (!repo) return;

  const provider = createProviderForConnection(repo.connection, env);
  const identity = {
    providerProjectId: repo.providerProjectId ?? "",
    normalizedProjectPath: repo.normalizedProjectPath,
    canonicalUrl: repo.canonicalUrl,
    webUrl: repo.canonicalUrl,
    defaultBranch: repo.defaultBranch ?? undefined,
  };

  let tree: RepositoryTreeItem[] = [];
  try {
    tree = await provider.getRepositoryTree(identity, repo.defaultBranch ?? undefined);
  } catch {
    /* tree optional */
  }

  const detected = detectQualityFromTree(tree);
  const unitTestJob = repo.pipelineRuns
    .flatMap((r) => r.jobs)
    .find((j) => j.classification === "unit_test" && j.status === "success");

  const effectiveUnitTests = resolveEffectiveSignal({
    reported: repo.reportedUnitTestState,
    detected: unitTestJob ? "passing" : detected.unitTests,
  });

  const defs = await prisma.repositoryCheckDefinition.findMany({
    where: { slug: { in: ["unit-tests-detected", "ci-config-exists", "static-analysis-configured"] } },
  });

  for (const def of defs) {
    let status = "unknown";
    if (def.slug === "unit-tests-detected") status = effectiveUnitTests;
    if (def.slug === "ci-config-exists") status = detected.ciConfig;
    if (def.slug === "static-analysis-configured") status = detected.staticAnalysis;

    const existing = await prisma.repositoryCheckResult.findFirst({
      where: { repositoryId: repo.id, checkDefinitionId: def.id },
    });
    if (existing) {
      await prisma.repositoryCheckResult.update({
        where: { id: existing.id },
        data: {
          status,
          detectedAt: new Date(),
          effectiveAt: new Date(),
          syncedAt: new Date(),
        },
      });
    } else {
      await prisma.repositoryCheckResult.create({
        data: {
          repositoryId: repo.id,
          checkDefinitionId: def.id,
          status,
          evidenceSource: "repository_tree_and_pipelines",
          sourceType: "detected",
          detectedAt: new Date(),
          effectiveAt: new Date(),
        },
      });
    }
  }
}
