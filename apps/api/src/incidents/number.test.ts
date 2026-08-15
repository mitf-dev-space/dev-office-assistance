import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextIncidentNumberFrom } from "./number.js";

describe("nextIncidentNumberFrom", () => {
  it("starts at INC-0001 when there is no previous number", () => {
    assert.equal(nextIncidentNumberFrom(null), "INC-0001");
    assert.equal(nextIncidentNumberFrom(undefined), "INC-0001");
  });

  it("increments a numeric suffix", () => {
    assert.equal(nextIncidentNumberFrom("INC-0001"), "INC-0002");
    assert.equal(nextIncidentNumberFrom("INC-0042"), "INC-0043");
    assert.equal(nextIncidentNumberFrom("INC-9999"), "INC-10000");
  });

  it("falls back to INC-0001 for an unrecognized format", () => {
    assert.equal(nextIncidentNumberFrom("foo"), "INC-0001");
    assert.equal(nextIncidentNumberFrom(""), "INC-0001");
  });
});
