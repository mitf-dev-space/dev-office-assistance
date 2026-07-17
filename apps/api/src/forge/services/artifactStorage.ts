import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Env } from "../../env.js";

export function resolveForgeArtifactsRoot(env: Env): string {
  return resolve(process.cwd(), env.FORGE_ARTIFACTS_ROOT);
}

export function resolveForgeWorkspacesRoot(env: Env): string {
  return resolve(process.cwd(), env.FORGE_WORKSPACES_ROOT);
}

export function artifactStorageDir(env: Env, platformBuildId: string): string {
  return resolve(resolveForgeArtifactsRoot(env), platformBuildId);
}

export async function ensureArtifactDir(env: Env, platformBuildId: string): Promise<string> {
  const dir = artifactStorageDir(env, platformBuildId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveArtifactFile(
  env: Env,
  platformBuildId: string,
  fileName: string,
  data: Buffer,
): Promise<{ storagePath: string; checksumSha256: string; fileSizeBytes: bigint }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = await ensureArtifactDir(env, platformBuildId);
  const fullPath = resolve(dir, safeName);
  const root = resolveForgeArtifactsRoot(env);
  if (!fullPath.startsWith(root)) {
    throw new Error("invalid_artifact_path");
  }
  await writeFile(fullPath, data);
  const checksumSha256 = createHash("sha256").update(data).digest("hex");
  return {
    storagePath: fullPath,
    checksumSha256,
    fileSizeBytes: BigInt(data.length),
  };
}

export function resolveArtifactReadPath(env: Env, storagePath: string): string {
  const root = resolveForgeArtifactsRoot(env);
  const full = resolve(storagePath);
  if (!full.startsWith(root)) {
    throw new Error("invalid_artifact_path");
  }
  return full;
}
