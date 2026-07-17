/**
 * Loop 0 inventory assessment — parses fixture JSON or XLSX when present.
 * Usage: npm run catalog:assess -w @office/api
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const importsDir = resolve(process.cwd(), "data/catalog-imports");

type CountReport = { file: string; rows: number; unknownPipeline: number };

function countBackend(file: string, data: { rows?: unknown[] }): CountReport {
  const rows = data.rows ?? [];
  let unknownPipeline = 0;
  for (const r of rows as { pipeline?: string }[]) {
    if (!r.pipeline?.trim()) unknownPipeline++;
  }
  return { file, rows: rows.length, unknownPipeline };
}

function countMobile(file: string, data: { groups?: { rows: unknown[] }[] }): CountReport {
  let rows = 0;
  let unknownPipeline = 0;
  for (const g of data.groups ?? []) {
    rows += g.rows.length;
    for (const r of g.rows as { pipeline?: string }[]) {
      if (!r.pipeline?.trim()) unknownPipeline++;
    }
  }
  return { file, rows, unknownPipeline };
}

function main() {
  if (!existsSync(importsDir)) {
    console.error("Missing catalog-imports directory:", importsDir);
    process.exit(1);
  }
  const files = readdirSync(importsDir).filter((f) => f.endsWith(".json") || f.endsWith(".fixture.json"));
  console.log("Engineering Catalog — inventory assessment\n");
  const reports: CountReport[] = [];
  for (const file of files) {
    const raw = readFileSync(join(importsDir, file), "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (file.includes("mobile")) {
      reports.push(countMobile(file, data as { groups?: { rows: unknown[] }[] }));
    } else {
      reports.push(countBackend(file, data as { rows?: unknown[] }));
    }
  }
  for (const r of reports) {
    console.log(`${r.file}: ${r.rows} rows, ${r.unknownPipeline} blank pipeline → unknown`);
  }
  console.log("\nTotal rows:", reports.reduce((s, r) => s + r.rows, 0));
}

main();
