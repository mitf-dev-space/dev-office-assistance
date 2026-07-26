import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimablePlatformsForRunner, runnerCanClaimPlatform } from "./runnerClaim.js";

describe("claimablePlatformsForRunner", () => {
  it("allows Android and iOS on macOS", () => {
    assert.deepEqual(claimablePlatformsForRunner("macOS", ["Android", "iOS"]), [
      "Android",
      "iOS",
    ]);
  });

  it("strips iOS on Windows", () => {
    assert.deepEqual(claimablePlatformsForRunner("Windows", ["Android", "iOS"]), ["Android"]);
  });

  it("strips iOS on Linux", () => {
    assert.deepEqual(claimablePlatformsForRunner("Linux", ["iOS"]), []);
  });
});

describe("runnerCanClaimPlatform", () => {
  it("blocks Windows from claiming iOS", () => {
    assert.equal(runnerCanClaimPlatform("Windows", ["Android", "iOS"], "iOS"), false);
    assert.equal(runnerCanClaimPlatform("Windows", ["Android", "iOS"], "Android"), true);
  });

  it("allows macOS to claim iOS when advertised", () => {
    assert.equal(runnerCanClaimPlatform("macOS", ["iOS"], "iOS"), true);
  });
});
