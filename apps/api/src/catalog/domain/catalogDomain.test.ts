import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRepositoryUrl, normalizeProjectPath } from "./urlNormalize.js";
import { classifyBranch } from "./branchClassification.js";
import { parseSpreadsheetSignal, resolveEffectiveSignal } from "./effectiveState.js";
import { findDuplicateReason } from "./duplicateDetection.js";

describe("urlNormalize", () => {
  it("strips .git suffix and lowercases path", () => {
    assert.equal(normalizeProjectPath("/Org/Repo.git"), "org/repo");
  });

  it("parses GitHub cloud URL", () => {
    const p = parseRepositoryUrl("https://github.com/anstwechy/wallet-services.git");
    assert.equal(p.providerKind, "github");
    assert.equal(p.normalizedProjectPath, "anstwechy/wallet-services");
  });

  it("parses GitLab self-hosted URL", () => {
    const p = parseRepositoryUrl("http://10.10.20.51/back-end/core-services/mitt.systemcore");
    assert.equal(p.providerKind, "gitlab");
    assert.equal(p.normalizedProjectPath, "back-end/core-services/mitt.systemcore");
  });
});

describe("branchClassification", () => {
  it("classifies main vs master", () => {
    assert.equal(classifyBranch("main"), "main");
    assert.equal(classifyBranch("master"), "main");
    assert.equal(classifyBranch("develop"), "development");
    assert.equal(classifyBranch("development"), "development");
  });

  it("classifies bank branches", () => {
    assert.equal(classifyBranch("bank/jumhoria"), "bank_specific");
  });
});

describe("effectiveState", () => {
  it("blank spreadsheet → unknown", () => {
    assert.equal(parseSpreadsheetSignal(""), "unknown");
    assert.equal(parseSpreadsheetSignal(undefined), "unknown");
  });

  it("prefers detected over reported when reliable", () => {
    assert.equal(
      resolveEffectiveSignal({ reported: "declared", detected: "passing" }),
      "passing",
    );
  });

  it("honors manual override", () => {
    assert.equal(
      resolveEffectiveSignal({
        reported: "declared",
        detected: "missing",
        override: "passing",
        overrideExpiresAt: new Date(Date.now() + 86400000),
      }),
      "manually_overridden",
    );
  });

  it("inherited testing state preserved", () => {
    assert.equal(parseSpreadsheetSignal("inherited"), "inherited");
  });
});

describe("duplicateDetection", () => {
  it("blocks same connection path", () => {
    const dup = findDuplicateReason("c1", "org/repo", "https://github.com/org/repo", [
      { id: "r1", connectionId: "c1", normalizedProjectPath: "org/repo", canonicalUrl: "https://github.com/org/repo" },
    ]);
    assert.equal(dup?.reason, "same_connection_path");
  });
});
