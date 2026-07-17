import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateOverallBuildStatus } from "./overallStatus.js";

describe("calculateOverallBuildStatus", () => {
  it("returns Succeeded when both platforms succeed for real", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Succeeded", simulationOnly: false },
      { platform: "iOS", status: "Succeeded", simulationOnly: false },
    ]);
    assert.equal(status, "Succeeded");
  });

  it("returns PartiallySucceeded when one fails", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Succeeded", simulationOnly: false },
      { platform: "iOS", status: "Failed", simulationOnly: false },
    ]);
    assert.equal(status, "PartiallySucceeded");
  });

  it("returns InProgress when one succeeds and one waits", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Succeeded", simulationOnly: false },
      { platform: "iOS", status: "WaitingForCompatibleRunner", simulationOnly: false },
    ]);
    assert.equal(status, "InProgress");
  });

  it("returns SimulationCompleted when all simulation-only succeed", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Succeeded", simulationOnly: false },
      { platform: "iOS", status: "SimulationCompleted", simulationOnly: true },
    ]);
    assert.equal(status, "SimulationCompleted");
  });

  it("returns Failed when both fail", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Failed", simulationOnly: false },
      { platform: "iOS", status: "TimedOut", simulationOnly: false },
    ]);
    assert.equal(status, "Failed");
  });

  it("returns Cancelled when all cancelled", () => {
    const status = calculateOverallBuildStatus([
      { platform: "Android", status: "Cancelled", simulationOnly: false },
      { platform: "iOS", status: "Cancelled", simulationOnly: false },
    ]);
    assert.equal(status, "Cancelled");
  });
});
