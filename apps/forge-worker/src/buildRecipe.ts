import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AndroidArtifactPlan = {
  flutterArgs: string[];
  onDiskFileName: string;
  uploadFileName: string;
  contentType: string;
  relativeDir: string;
};

export type IosArtifactPlan = {
  flutterArgs: string[];
  contentType: string;
  relativeDir: string;
  exportMethod: string;
};

export type ToolchainBins = {
  flutterBin: string;
  dartBin: string;
};

/** Resolve flutter/dart bins from env or android/local.properties (mobile-team recipe). */
export function resolveToolchainBins(
  projectDir: string,
  env: NodeJS.ProcessEnv = process.env,
): ToolchainBins {
  let flutterBin = env.FLUTTER_BIN?.trim() || "flutter";

  if (flutterBin === "flutter" || !flutterBin) {
    const localProps = join(projectDir, "android", "local.properties");
    if (existsSync(localProps)) {
      const text = readFileSync(localProps, "utf8");
      const match = text.match(/^flutter\.sdk=(.+)$/m);
      const sdk = match?.[1]?.trim();
      if (sdk && existsSync(join(sdk, "bin", "flutter"))) {
        flutterBin = join(sdk, "bin", "flutter");
      }
    }
  }

  let dartBin = env.DART_BIN?.trim();
  if (!dartBin) {
    dartBin = flutterBin === "flutter" ? "dart" : join(dirname(flutterBin), "dart");
  }

  return { flutterBin, dartBin };
}

export function projectHasBuildRunner(projectDir: string): boolean {
  const pubspecPath = join(projectDir, "pubspec.yaml");
  if (!existsSync(pubspecPath)) return false;
  const text = readFileSync(pubspecPath, "utf8");
  return /\bbuild_runner\b/.test(text);
}

export function isMockEntryPoint(dartEntryPoint: string): boolean {
  const normalized = dartEntryPoint.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("main_mock.dart") || normalized.includes("/main_mock.dart");
}

export function planAndroidArtifact(input: {
  dartEntryPoint: string;
  androidBuildMode: string;
  flutterFlavor?: string | null;
}): AndroidArtifactPlan {
  const mode = (input.androidBuildMode || "debug").toLowerCase();
  const releaseLike = mode === "release";
  const mock = isMockEntryPoint(input.dartEntryPoint);

  const flutterArgs = [
    "build",
    "apk",
    releaseLike ? "--release" : mode === "profile" ? "--profile" : "--debug",
    "--target",
    input.dartEntryPoint,
  ];
  if (input.flutterFlavor) {
    flutterArgs.push("--flavor", input.flutterFlavor);
  }

  const onDiskFileName = releaseLike ? "app-release.apk" : mode === "profile" ? "app-profile.apk" : "app-debug.apk";
  const uploadFileName = releaseLike && mock ? "app-mock-release.apk" : onDiskFileName;

  return {
    flutterArgs,
    onDiskFileName,
    uploadFileName,
    contentType: "application/vnd.android.package-archive",
    relativeDir: join("build", "app", "outputs", "flutter-apk"),
  };
}

export function planIosArtifact(input: {
  dartEntryPoint: string;
  flutterFlavor?: string | null;
  iosExportMethod?: string | null;
}): IosArtifactPlan {
  const exportMethod = (input.iosExportMethod?.trim() || "ad-hoc").toLowerCase();
  const flutterArgs = [
    "build",
    "ipa",
    "--release",
    "--target",
    input.dartEntryPoint,
    "--export-method",
    exportMethod,
  ];
  if (input.flutterFlavor) {
    flutterArgs.push("--flavor", input.flutterFlavor);
  }

  return {
    flutterArgs,
    contentType: "application/octet-stream",
    relativeDir: join("build", "ios", "ipa"),
    exportMethod,
  };
}

export function classifyWorkerFailure(
  platform: string,
  err: unknown,
): { category: string; summary: string } {
  const summary = (err instanceof Error ? err.message : String(err)).slice(0, 4000);
  const lower = summary.toLowerCase();

  if (platform === "iOS") {
    if (
      lower.includes("no valid code signing") ||
      lower.includes("signing") ||
      lower.includes("provisioning") ||
      lower.includes("certificate")
    ) {
      if (lower.includes("provisioning")) {
        return { category: "IosProvisioningProfileMissing", summary };
      }
      if (lower.includes("certificate") || lower.includes("identity")) {
        return { category: "IosCertificateMissing", summary };
      }
      return { category: "IosSigningConfigurationMissing", summary };
    }
    return { category: "IosBuildFailed", summary };
  }

  if (lower.includes("flutter") && (lower.includes("not found") || lower.includes("enoent"))) {
    return { category: "FlutterSdkUnavailable", summary };
  }
  if (lower.includes("signing")) {
    return { category: "AndroidSigningFailed", summary };
  }
  return { category: "AndroidBuildFailed", summary };
}

export function gitlabPackagesInsteadOfUrl(
  user: string | undefined,
  token: string | undefined,
  host = "10.10.20.51",
): string | null {
  if (!user?.trim() || !token?.trim()) return null;
  return `http://${user.trim()}:${token.trim()}@${host}/`;
}
