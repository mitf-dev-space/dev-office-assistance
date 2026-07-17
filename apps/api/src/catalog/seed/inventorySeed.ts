import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient, SignalState } from "@prisma/client";
import {
  isUnpreparedProject,
  parseSpreadsheetBranch,
  parseSpreadsheetPipeline,
  parseSpreadsheetStaticAnalysis,
  parseSpreadsheetUnitTests,
} from "../domain/spreadsheetParse.js";
import { parseRepositoryUrl } from "../domain/urlNormalize.js";
import { OPEN_ORIGIN_END_AT } from "../domain/originHistory.js";

type InventoryRow = {
  name: string;
  url?: string;
  pipeline?: string;
  unitTests?: string;
  mainBranch?: string;
  developmentBranch?: string;
  staticAnalysis?: string;
  notes?: string;
  workDurationNotes?: string;
  startDate?: string;
  finishDate?: string;
  sharedCore?: string;
  group?: string;
};

type InventoryFile = {
  team: string;
  systemSlug: string;
  applicationTypeSlug: string;
  componentTypeSlug: string;
  rows?: InventoryRow[];
  groups?: {
    name: string;
    systemSlug?: string;
    applicationTypeSlug?: string;
    componentTypeSlug?: string;
    rows: InventoryRow[];
  }[];
};

const IMPORTS_DIR = join(process.cwd(), "data/catalog-imports");

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadInventory(name: "backend" | "mobile" | "web"): InventoryFile {
  const path = join(IMPORTS_DIR, `${name}.fixture.json`);
  if (!existsSync(path)) throw new Error(`Missing inventory fixture: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as InventoryFile;
}

function flattenRows(
  file: InventoryFile,
): Array<
  InventoryRow & {
    systemSlug: string;
    applicationTypeSlug: string;
    componentTypeSlug: string;
    group?: string;
  }
> {
  if (file.rows) {
    return file.rows.map((r) => ({
      ...r,
      systemSlug: file.systemSlug,
      applicationTypeSlug: file.applicationTypeSlug,
      componentTypeSlug: file.componentTypeSlug,
    }));
  }
  const out: Array<
    InventoryRow & {
      systemSlug: string;
      applicationTypeSlug: string;
      componentTypeSlug: string;
      group?: string;
    }
  > = [];
  for (const g of file.groups ?? []) {
    for (const r of g.rows) {
      out.push({
        ...r,
        group: g.name,
        systemSlug: g.systemSlug ?? file.systemSlug,
        applicationTypeSlug: g.applicationTypeSlug ?? file.applicationTypeSlug,
        componentTypeSlug: g.componentTypeSlug ?? file.componentTypeSlug,
      });
    }
  }
  return out;
}

async function upsertCatalogEntities(
  prisma: PrismaClient,
  teamId: string,
  row: InventoryRow & {
    systemSlug: string;
    applicationTypeSlug: string;
    componentTypeSlug: string;
    group?: string;
  },
): Promise<string> {
  const system = await prisma.catalogSystem.upsert({
    where: { teamId_slug: { teamId, slug: row.systemSlug } },
    create: { teamId, slug: row.systemSlug, name: row.systemSlug.replace(/-/g, " ") },
    update: {},
  });

  const appType = await prisma.applicationType.findUnique({ where: { slug: row.applicationTypeSlug } });
  const application = await prisma.catalogApplication.upsert({
    where: { systemId_slug: { systemId: system.id, slug: slugify(row.name) } },
    create: {
      systemId: system.id,
      slug: slugify(row.name),
      name: row.name,
      applicationTypeId: appType?.id,
      description: row.group ?? undefined,
    },
    update: { name: row.name, applicationTypeId: appType?.id ?? undefined },
  });

  const compType = await prisma.componentType.findUnique({ where: { slug: row.componentTypeSlug } });
  await prisma.component.upsert({
    where: { applicationId_slug: { applicationId: application.id, slug: slugify(row.name) } },
    create: {
      applicationId: application.id,
      slug: slugify(row.name),
      name: row.name,
      componentTypeId: compType?.id,
    },
    update: { name: row.name, componentTypeId: compType?.id ?? undefined },
  });

  return application.id;
}

async function upsertInventoryRow(
  prisma: PrismaClient,
  connectionId: string,
  teamId: string,
  row: InventoryRow & {
    systemSlug: string;
    applicationTypeSlug: string;
    componentTypeSlug: string;
    group?: string;
  },
): Promise<{ applicationId: string; sharedCoreName?: string; hasRepository: boolean }> {
  const applicationId = await upsertCatalogEntities(prisma, teamId, row);

  const url = row.url?.trim();
  if (!url) {
    return { applicationId, sharedCoreName: undefined, hasRepository: false };
  }

  const parsed = parseRepositoryUrl(url, "gitlab");
  const unitParsed = parseSpreadsheetUnitTests(row.unitTests);
  const sharedCoreName = row.sharedCore ?? unitParsed.sharedCoreName;
  const mainBranch = parseSpreadsheetBranch(row.mainBranch);
  const devBranch = parseSpreadsheetBranch(row.developmentBranch);
  const notes = [row.notes, row.workDurationNotes].filter(Boolean).join("\n").trim() || null;
  const unprepared = isUnpreparedProject(notes, mainBranch, devBranch);

  const component = await prisma.component.findFirst({
    where: { applicationId, slug: slugify(row.name) },
  });
  if (!component) throw new Error(`Component missing for ${row.name}`);

  const existing = await prisma.repository.findFirst({
    where: { connectionId, normalizedProjectPath: parsed.normalizedProjectPath },
  });

  const repoData = {
    connectionId,
    teamId,
    componentId: component.id,
    name: row.name,
    canonicalUrl: parsed.canonicalUrl,
    normalizedProjectPath: parsed.normalizedProjectPath,
    defaultBranch: mainBranch,
    reportedMainBranch: mainBranch,
    reportedDevelopmentBranch: devBranch,
    reportedPipelineState: parseSpreadsheetPipeline(row.pipeline),
    reportedUnitTestState: unitParsed.state as SignalState,
    reportedStaticAnalysisState: parseSpreadsheetStaticAnalysis(row.staticAnalysis) as SignalState,
    reportedSource: "spreadsheet",
    reportedAt: new Date(),
    lifecycleState: unprepared ? ("preparing" as const) : ("active" as const),
    notes,
  };

  if (existing) {
    await prisma.repository.update({
      where: { id: existing.id },
      data: repoData,
    });
  } else {
    const created = await prisma.repository.create({
      data: {
        ...repoData,
        connectivityState: "unknown",
        freshnessState: "never_synchronized",
      },
    });

    await prisma.repositoryOriginHistory.create({
      data: {
        repositoryId: created.id,
        connectionId,
        canonicalUrl: parsed.canonicalUrl,
        normalizedProjectPath: parsed.normalizedProjectPath,
        providerKind: "gitlab",
        defaultBranch: mainBranch,
        startedAt: new Date(),
        endedAt: OPEN_ORIGIN_END_AT,
      },
    });
  }

  return { applicationId, sharedCoreName: sharedCoreName ?? undefined, hasRepository: true };
}

async function linkSharedCore(prisma: PrismaClient, sourceApplicationId: string, targetApplicationId: string) {
  await prisma.sharedCoreRelationship.upsert({
    where: { sourceApplicationId_targetApplicationId: { sourceApplicationId, targetApplicationId } },
    create: {
      sourceApplicationId,
      targetApplicationId,
      inheritedChecks: ["unit_tests", "static_analysis"],
    },
    update: {},
  });
}

export async function seedCatalogInventory(prisma: PrismaClient): Promise<{ seeded: number; skipped: number }> {
  const gitlab = await prisma.repositoryConnection.findUnique({
    where: { slug: process.env.GITLAB_CONNECTION_NAME ?? "gitlab-internal" },
  });
  if (!gitlab) {
    console.warn("Catalog inventory seed skipped: gitlab-internal connection missing.");
    return { seeded: 0, skipped: 0 };
  }

  let seeded = 0;
  let skipped = 0;
  const appByName = new Map<string, string>();

  for (const dataset of ["backend", "mobile", "web"] as const) {
    const file = loadInventory(dataset);
    const team = await prisma.catalogTeam.findUnique({ where: { slug: file.team } });
    if (!team) {
      console.warn(`Catalog inventory: team ${file.team} not found, skipping ${dataset}`);
      continue;
    }

    for (const row of flattenRows(file)) {
      try {
        const result = await upsertInventoryRow(prisma, gitlab.id, team.id, row);
        appByName.set(row.name, result.applicationId);
        if (result.hasRepository) seeded++;
        else skipped++;
      } catch (err) {
        console.warn(`Catalog inventory row failed (${row.name}):`, err instanceof Error ? err.message : err);
        skipped++;
      }
    }
  }

  for (const dataset of ["mobile"] as const) {
    const file = loadInventory(dataset);
    for (const row of flattenRows(file)) {
      const unit = parseSpreadsheetUnitTests(row.unitTests);
      const sourceName = unit.sharedCoreName;
      if (!sourceName) continue;
      const sourceAppId = appByName.get(sourceName);
      const targetAppId = appByName.get(row.name);
      if (sourceAppId && targetAppId && sourceAppId !== targetAppId) {
        await linkSharedCore(prisma, sourceAppId, targetAppId);
      }
    }
  }

  console.log(`Seeded catalog inventory: ${seeded} repositories (${skipped} without URL or failed).`);
  return { seeded, skipped };
}
