import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAutoRetryEligible, isManualRetryEligible } from "./retryPolicy.js";

describe("retryPolicy", () => {
  it("allows manual retry for RunnerDisconnected", () => {
    assert.equal(isManualRetryEligible("RunnerDisconnected"), true);
  });

  it("disallows auto retry for AndroidBuildFailed", () => {
    assert.equal(isAutoRetryEligible("AndroidBuildFailed"), false);
  });

  it("allows auto retry for BuildTimedOut", () => {
    assert.equal(isAutoRetryEligible("BuildTimedOut"), true);
  });
});
