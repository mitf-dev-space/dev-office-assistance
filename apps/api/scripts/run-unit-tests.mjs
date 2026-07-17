import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(root, "src");

function collectTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(relative(root, full).replaceAll("\\", "/"));
    }
  }
  return out;
}

const files = collectTests(srcRoot).sort();
if (files.length === 0) {
  console.error("No *.test.ts files found under src/");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { cwd: root, stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
