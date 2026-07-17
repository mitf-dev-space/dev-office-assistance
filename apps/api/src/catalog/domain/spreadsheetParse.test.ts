import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnpreparedProject,
  parseSpreadsheetBranch,
  parseSpreadsheetPipeline,
  parseSpreadsheetStaticAnalysis,
  parseSpreadsheetUnitTests,
} from "./spreadsheetParse.js";

describe("parseSpreadsheetBranch", () => {
  it("returns null for blank and dash placeholders", () => {
    assert.equal(parseSpreadsheetBranch(""), null);
    assert.equal(parseSpreadsheetBranch("-------"), null);
    assert.equal(parseSpreadsheetBranch("------"), null);
  });

  it("preserves real branch names", () => {
    assert.equal(parseSpreadsheetBranch("Main"), "Main");
    assert.equal(parseSpreadsheetBranch("develop( will be created and use as dev)"), "develop( will be created and use as dev)");
  });
});

describe("parseSpreadsheetPipeline", () => {
  it("maps blank to unknown", () => {
    assert.equal(parseSpreadsheetPipeline(""), "unknown");
    assert.equal(parseSpreadsheetPipeline(undefined), "unknown");
  });

  it("normalizes yes/no", () => {
    assert.equal(parseSpreadsheetPipeline("yes"), "yes");
    assert.equal(parseSpreadsheetPipeline("NO"), "no");
  });
});

describe("parseSpreadsheetUnitTests", () => {
  it("detects inherited mobile core", () => {
    const parsed = parseSpreadsheetUnitTests("included in core mobile banking");
    assert.equal(parsed.state, "inherited");
    assert.equal(parsed.sharedCoreName, "Core Mobile Banking");
  });

  it("detects partial coverage", () => {
    const parsed = parseSpreadsheetUnitTests("40%");
    assert.equal(parsed.state, "detected");
    assert.equal(parsed.coveragePercent, 40);
  });

  it("detects starting from scratch", () => {
    assert.equal(parseSpreadsheetUnitTests("Starting From scratch").state, "missing");
  });

  it("maps NO to declared absent", () => {
    assert.equal(parseSpreadsheetUnitTests("NO").state, "declared");
  });
});

describe("parseSpreadsheetStaticAnalysis", () => {
  it("maps spreadsheet yes/no", () => {
    assert.equal(parseSpreadsheetStaticAnalysis("yes"), "detected");
    assert.equal(parseSpreadsheetStaticAnalysis("NO"), "declared");
  });
});

describe("isUnpreparedProject", () => {
  it("flags Arabic not-ready notes", () => {
    assert.equal(isUnpreparedProject("لم يتم تجهيز المشروع بعد", null, null), true);
    assert.equal(isUnpreparedProject("لم يجهز المشروع بعد", null, null), true);
  });
});
