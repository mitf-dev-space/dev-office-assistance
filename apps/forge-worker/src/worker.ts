import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  classifyWorkerFailure,
  gitlabPackagesInsteadOfUrl,
  planAndroidArtifact,
  planIosArtifact,
  projectHasBuildRunner,
  resolveToolchainBins,
} from "./buildRecipe.js";

type ClaimedJob = {
  platformBuildId: string;
  buildRequestId: string;
  platform: string;
  repositoryUrl: string;
  projectSubpath: string | null;
  defaultBranch: string;
  gitReferenceType: string;
  gitReference: string;
  dartEntryPoint: string;
  flutterFlavor: string | null;
  androidArtifactType: string;
  androidBuildMode: string;
  iosExportMethod: string | null;
  applicationName: string;
};

const API_URL = process.env.FORGE_API_URL ?? "http://localhost:4000";
const RUNNER_ID = process.env.FORGE_RUNNER_ID ?? "";
const RUNNER_TOKEN = process.env.FORGE_RUNNER_TOKEN ?? "";
const WORKSPACES_ROOT =
  process.env.FORGE_WORKSPACES_ROOT ?? resolve(process.cwd(), "../../data/forge-workspaces");

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${RUNNER_TOKEN}` };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function postProgress(platformBuildId: string, status: string) {
  await apiJson(`/api/forge/platform-builds/${platformBuildId}/progress`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

async function postFail(platformBuildId: string, category: string, summary: string) {
  await apiJson(`/api/forge/platform-builds/${platformBuildId}/fail`, {
    method: "POST",
    body: JSON.stringify({ failureCategory: category, failureSummary: summary }),
  });
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true, env: process.env });
    child.stdout.on("data", (d) => process.stdout.write(d));
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function configureGitlabPackagesRewrite(projectDir: string) {
  const insteadOf = gitlabPackagesInsteadOfUrl(
    process.env.GITLAB_PACKAGES_USER,
    process.env.GITLAB_PACKAGES_TOKEN,
  );
  if (!insteadOf) {
    if (!process.env.GITLAB_PACKAGES_USER || !process.env.GITLAB_PACKAGES_TOKEN) {
      console.warn("Warning: GITLAB_PACKAGES_USER or GITLAB_PACKAGES_TOKEN is not set.");
    }
    return;
  }
  await runCommand(
    "git",
    ["config", "url." + insteadOf + ".insteadOf", "http://10.10.20.51/"],
    projectDir,
  );
}

async function runBuildRunnerIfNeeded(
  dartBin: string,
  projectDir: string,
): Promise<void> {
  if (!projectHasBuildRunner(projectDir)) {
    console.log("No build_runner in pubspec — skipping codegen.");
    return;
  }
  await runCommand(dartBin, ["run", "build_runner", "clean"], projectDir);
  await runCommand(
    dartBin,
    ["run", "build_runner", "build", "--delete-conflicting-outputs"],
    projectDir,
  );
}

async function findIpaFile(ipaDir: string): Promise<{ path: string; fileName: string }> {
  const entries = await readdir(ipaDir);
  const ipa = entries.find((e) => e.toLowerCase().endsWith(".ipa"));
  if (!ipa) {
    throw new Error(`No .ipa found in ${ipaDir}`);
  }
  return { path: join(ipaDir, ipa), fileName: ipa };
}

async function heartbeat() {
  await apiJson(`/api/forge/runners/${RUNNER_ID}/heartbeat`, { method: "POST", body: "{}" });
}

async function claim(): Promise<ClaimedJob | null> {
  const data = await apiJson<{ job: ClaimedJob | null }>(
    `/api/forge/runners/${RUNNER_ID}/claim`,
    { method: "POST", body: "{}" },
  );
  return data.job;
}

async function uploadArtifact(
  platformBuildId: string,
  filePath: string,
  fileName: string,
  contentType: string,
) {
  const artifactBytes = await readFile(filePath);
  const form = new FormData();
  form.append("artifact", new Blob([artifactBytes], { type: contentType }), fileName);

  const res = await fetch(`${API_URL}/api/forge/platform-builds/${platformBuildId}/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`complete failed ${res.status}: ${text}`);
  }
}

async function executeAndroidJob(
  job: ClaimedJob,
  projectDir: string,
  flutterBin: string,
  dartBin: string,
) {
  await runCommand(flutterBin, ["pub", "get"], projectDir);
  await runBuildRunnerIfNeeded(dartBin, projectDir);

  const plan = planAndroidArtifact({
    dartEntryPoint: job.dartEntryPoint,
    androidBuildMode: job.androidBuildMode,
    flutterFlavor: job.flutterFlavor,
  });

  await runCommand(flutterBin, plan.flutterArgs, projectDir);

  await postProgress(job.platformBuildId, "CollectingArtifact");
  const artifactPath = join(projectDir, plan.relativeDir, plan.onDiskFileName);
  await uploadArtifact(
    job.platformBuildId,
    artifactPath,
    plan.uploadFileName,
    plan.contentType,
  );
  console.log(`Android build succeeded for ${job.applicationName} → ${plan.uploadFileName}`);
}

async function executeIosJob(
  job: ClaimedJob,
  projectDir: string,
  flutterBin: string,
  dartBin: string,
) {
  await runCommand(flutterBin, ["pub", "get"], projectDir);
  await runBuildRunnerIfNeeded(dartBin, projectDir);

  const plan = planIosArtifact({
    dartEntryPoint: job.dartEntryPoint,
    flutterFlavor: job.flutterFlavor,
    iosExportMethod: job.iosExportMethod,
  });

  await postProgress(job.platformBuildId, "Signing");
  await runCommand(flutterBin, plan.flutterArgs, projectDir);

  await postProgress(job.platformBuildId, "CollectingArtifact");
  const ipaDir = join(projectDir, plan.relativeDir);
  const { path: artifactPath, fileName } = await findIpaFile(ipaDir);
  await uploadArtifact(job.platformBuildId, artifactPath, fileName, plan.contentType);
  console.log(`iOS build succeeded for ${job.applicationName} → ${fileName}`);
}

async function executeJob(job: ClaimedJob) {
  const workspace = join(WORKSPACES_ROOT, job.platformBuildId);
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });

  try {
    await postProgress(job.platformBuildId, "PreparingWorkspace");

    const gitRef = job.gitReference;

    await postProgress(job.platformBuildId, "CloningRepository");
    await runCommand(
      "git",
      ["clone", "--depth", "1", "--branch", gitRef, job.repositoryUrl, "repo"],
      workspace,
    );

    const projectDir = job.projectSubpath
      ? join(workspace, "repo", job.projectSubpath)
      : join(workspace, "repo");

    await configureGitlabPackagesRewrite(projectDir);

    const { flutterBin, dartBin } = resolveToolchainBins(projectDir);
    await postProgress(job.platformBuildId, "Building");

    if (job.platform === "iOS") {
      await executeIosJob(job, projectDir, flutterBin, dartBin);
    } else if (job.platform === "Android") {
      await executeAndroidJob(job, projectDir, flutterBin, dartBin);
    } else {
      throw new Error(`Unsupported platform: ${job.platform}`);
    }
  } catch (err) {
    const { category, summary } = classifyWorkerFailure(job.platform, err);
    await postFail(job.platformBuildId, category, summary);
    throw err;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  if (!RUNNER_ID || !RUNNER_TOKEN) {
    console.error("Set FORGE_RUNNER_ID and FORGE_RUNNER_TOKEN (64-char hex).");
    process.exit(1);
  }

  console.log(`Forge worker → ${API_URL} runner ${RUNNER_ID}`);

  await heartbeat();

  setInterval(() => {
    heartbeat().catch((e) => console.error("heartbeat failed", e));
  }, 30_000);

  for (;;) {
    try {
      const job = await claim();
      if (!job) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.log(`Claimed ${job.platformBuildId} (${job.applicationName} / ${job.platform})`);
      await executeJob(job);
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
