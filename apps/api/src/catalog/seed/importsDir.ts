import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve `data/catalog-imports` for both:
 * - local/prisma seed (cwd = apps/api)
 * - production Docker (cwd = /app, fixtures under apps/api/data/...)
 */
export function resolveCatalogImportsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "data/catalog-imports"),
    join(process.cwd(), "apps/api/data/catalog-imports"),
    // dist/catalog/seed → apps/api/data/catalog-imports
    join(here, "../../../data/catalog-imports"),
    join(here, "../../../../data/catalog-imports"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}
