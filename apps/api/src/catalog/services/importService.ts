import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { detectConnectionSlug, parseRepositoryUrl } from "../domain/urlNormalize.js";
import { mapImportRowSignals } from "./repositoryService.js";
import type { CatalogEnvSlice } from "../providers/factory.js";
import { previewRepositoryRegistration, registerRepository } from "./repositoryService.js";

type FixtureRow = Record<string, unknown>;

function loadFixtureFile(name: string): { rows: FixtureRow[]; team: string } {
  const base = join(process.cwd(), "data/catalog-imports");
  const xlsxPath = join(base, `${name}.xlsx`);
  const jsonPath = join(base, `${name}.fixture.json`);
  if (existsSync(xlsxPath)) {
    throw new Error("XLSX parsing requires exceljs — use fixture JSON for now or install exceljs");
  }
  if (!existsSync(jsonPath)) {
    throw new Error(`Missing import file: ${name}`);
  }
  const data = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    team: string;
    rows?: FixtureRow[];
    groups?: { rows: FixtureRow[] }[];
  };
  const rows = data.rows ?? data.groups?.flatMap((g) => g.rows) ?? [];
  return { rows, team: data.team };
}

export async function createImportJobFromFixture(
  prisma: PrismaClient,
  userId: string,
  dataset: "backend" | "mobile" | "web",
) {
  const { rows, team } = loadFixtureFile(dataset);
  const job = await prisma.repositoryImportJob.create({
    data: {
      fileName: `${dataset}.fixture.json`,
      status: "preview",
      rowCount: rows.length,
      createdById: userId,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    await prisma.repositoryImportRow.create({
      data: {
        importJobId: job.id,
        rowNumber: i + 1,
        rawPayload: rows[i] as object,
        matchStatus: "pending",
      },
    });
  }

  return { job, team, rowCount: rows.length };
}

export async function commitImportJob(
  prisma: PrismaClient,
  env: CatalogEnvSlice,
  jobId: string,
  userId: string,
) {
  const job = await prisma.repositoryImportJob.findUnique({
    where: { id: jobId },
    include: { rows: true },
  });
  if (!job) throw new Error("import_job_not_found");

  const connections = await prisma.repositoryConnection.findMany({ where: { isActive: true } });
  const conflicts: { rowNumber: number; field: string; reported: string; detected: string }[] = [];
  let committed = 0;

  await prisma.repositoryImportJob.update({
    where: { id: jobId },
    data: { status: "committing" },
  });

  try {
    for (const row of job.rows) {
      const payload = row.rawPayload as FixtureRow;
      const url = String(payload.url ?? "").trim();
      const name = String(payload.name ?? "unknown");
      const signals = mapImportRowSignals(payload);

      if (!url) {
        await prisma.repositoryImportRow.update({
          where: { id: row.id },
          data: { matchStatus: "skipped_no_url" },
        });
        continue;
      }

      const parsed = parseRepositoryUrl(url);
      const connectionSlug = detectConnectionSlug(
        parsed,
        connections.map((c) => ({ slug: c.slug, providerKind: c.providerKind, baseUrl: c.baseUrl })),
      );
      const connection = connections.find((c) => c.slug === connectionSlug);
      if (!connection) {
        await prisma.repositoryImportRow.update({
          where: { id: row.id },
          data: { matchStatus: "connection_unmatched" },
        });
        continue;
      }

      const existing = await prisma.repository.findFirst({
        where: { connectionId: connection.id, normalizedProjectPath: parsed.normalizedProjectPath },
      });

      if (existing) {
        await prisma.repository.update({
          where: { id: existing.id },
          data: {
            reportedMainBranch: signals.reportedMainBranch,
            reportedDevelopmentBranch: signals.reportedDevelopmentBranch,
            reportedPipelineState: signals.reportedPipelineState,
            reportedUnitTestState: signals.reportedUnitTestState,
            reportedStaticAnalysisState: signals.reportedStaticAnalysisState,
            reportedSource: "spreadsheet",
            reportedAt: new Date(),
          },
        });
        await prisma.repositoryImportRow.update({
          where: { id: row.id },
          data: { matchStatus: "updated_existing", repositoryId: existing.id },
        });
        committed++;
        continue;
      }

      try {
        const repo = await registerRepository(prisma, env, {
          url,
          name,
          connectionId: connection.id,
          reportedMainBranch: signals.reportedMainBranch ?? undefined,
          reportedDevelopmentBranch: signals.reportedDevelopmentBranch ?? undefined,
        });
        await prisma.repository.update({
          where: { id: repo.id },
          data: {
            reportedPipelineState: signals.reportedPipelineState,
            reportedUnitTestState: signals.reportedUnitTestState,
            reportedStaticAnalysisState: signals.reportedStaticAnalysisState,
            reportedSource: "spreadsheet",
            reportedAt: new Date(),
          },
        });
        await prisma.repositoryImportRow.update({
          where: { id: row.id },
          data: { matchStatus: "created", repositoryId: repo.id },
        });
        committed++;
      } catch {
        await prisma.repositoryImportRow.update({
          where: { id: row.id },
          data: { matchStatus: "failed" },
        });
      }
    }

    await prisma.repositoryImportJob.update({
      where: { id: jobId },
      data: { status: "completed", completedAt: new Date() },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        action: "import.committed",
        entityType: "RepositoryImportJob",
        entityId: jobId,
        metadata: { committed, conflicts: conflicts.length },
      },
    });

    return { committed, conflicts };
  } catch (err) {
    await prisma.repositoryImportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "commit failed",
      },
    });
    throw err;
  }
}

export async function previewImportJob(prisma: PrismaClient, jobId: string) {
  const job = await prisma.repositoryImportJob.findUnique({
    where: { id: jobId },
    include: { rows: true, conflicts: true },
  });
  if (!job) return null;
  return job;
}
