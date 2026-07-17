import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertBuildStatusTransition,
  canTransitionBuildStatus,
  isCancellableBuildStatus,
  isTerminalBuildStatus,
} from "./buildStatus.js";

describe("buildStatus transitions", () => {
  it("allows Queued → Claimed", () => {
    assert.equal(canTransitionBuildStatus("Queued", "Claimed"), true);
  });

  it("rejects Succeeded → Building", () => {
    assert.equal(canTransitionBuildStatus("Succeeded", "Building"), false);
  });

  it("allows Building → Failed", () => {
    assert.equal(canTransitionBuildStatus("Building", "Failed"), true);
  });

  it("assertBuildStatusTransition throws on invalid edge", () => {
    assert.throws(() => assertBuildStatusTransition("Failed", "Queued"));
  });

  it("terminal statuses are not cancellable", () => {
    assert.equal(isCancellableBuildStatus("Succeeded"), false);
    assert.equal(isCancellableBuildStatus("Building"), true);
  });

  it("Succeeded is terminal", () => {
    assert.equal(isTerminalBuildStatus("Succeeded"), true);
    assert.equal(isTerminalBuildStatus("Building"), false);
  });
});
