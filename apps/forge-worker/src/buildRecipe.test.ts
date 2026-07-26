import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  classifyWorkerFailure,
  gitlabPackagesInsteadOfUrl,
  isMockEntryPoint,
  planAndroidArtifact,
  planIosArtifact,
  projectHasBuildRunner,
  resolveToolchainBins,
} from "./buildRecipe.js";

describe("planAndroidArtifact", () => {
  it("plans release mock upload name", () => {
    const plan = planAndroidArtifact({
      dartEntryPoint: "lib/main_mock.dart",
      androidBuildMode: "release",
    });
    assert.deepEqual(plan.flutterArgs.slice(0, 4), ["build", "apk", "--release", "--target"]);
    assert.equal(plan.onDiskFileName, "app-release.apk");
    assert.equal(plan.uploadFileName, "app-mock-release.apk");
  });

  it("plans debug artifact without mock rename", () => {
    const plan = planAndroidArtifact({
      dartEntryPoint: "lib/main.dart",
      androidBuildMode: "debug",
    });
    assert.ok(plan.flutterArgs.includes("--debug"));
    assert.equal(plan.onDiskFileName, "app-debug.apk");
    assert.equal(plan.uploadFileName, "app-debug.apk");
  });
});

describe("planIosArtifact", () => {
  it("defaults export method to ad-hoc", () => {
    const plan = planIosArtifact({ dartEntryPoint: "lib/main_mock.dart" });
    assert.ok(plan.flutterArgs.includes("ipa"));
    assert.ok(plan.flutterArgs.includes("--export-method"));
    assert.equal(plan.exportMethod, "ad-hoc");
    assert.match(plan.relativeDir, /ios/);
  });
});

describe("isMockEntryPoint / build_runner / toolchain", () => {
  it("detects main_mock entrypoints", () => {
    assert.equal(isMockEntryPoint("lib/main_mock.dart"), true);
    assert.equal(isMockEntryPoint("lib/main.dart"), false);
  });

  it("detects build_runner in pubspec", () => {
    const dir = mkdtempSync(join(tmpdir(), "forge-recipe-"));
    writeFileSync(join(dir, "pubspec.yaml"), "dev_dependencies:\n  build_runner: ^2.0.0\n");
    assert.equal(projectHasBuildRunner(dir), true);
  });

  it("resolves flutter from local.properties", () => {
    const dir = mkdtempSync(join(tmpdir(), "forge-flutter-"));
    const sdk = join(dir, "fake-sdk");
    mkdirSync(join(sdk, "bin"), { recursive: true });
    writeFileSync(join(sdk, "bin", "flutter"), "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(join(sdk, "bin", "dart"), "#!/bin/sh\n", { mode: 0o755 });
    mkdirSync(join(dir, "android"), { recursive: true });
    writeFileSync(join(dir, "android", "local.properties"), `flutter.sdk=${sdk}\n`);
    const bins = resolveToolchainBins(dir, {});
    assert.equal(bins.flutterBin, join(sdk, "bin", "flutter"));
    assert.equal(bins.dartBin, join(sdk, "bin", "dart"));
  });
});

describe("classifyWorkerFailure / gitlab", () => {
  it("maps iOS signing errors", () => {
    const r = classifyWorkerFailure("iOS", new Error("No valid code signing certificates"));
    assert.equal(r.category, "IosCertificateMissing");
    const r2 = classifyWorkerFailure("iOS", new Error("Signing configuration is invalid"));
    assert.equal(r2.category, "IosSigningConfigurationMissing");
  });

  it("builds gitlab insteadOf URL when credentials present", () => {
    assert.equal(gitlabPackagesInsteadOfUrl(undefined, "t"), null);
    assert.equal(
      gitlabPackagesInsteadOfUrl("user", "token"),
      "http://user:token@10.10.20.51/",
    );
  });
});
