import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldSkipAutoMapList,
  spaceIdFromSharedStatuses,
} from "./discoveryService.js";

describe("discoveryService helpers", () => {
  it("extracts space id from shared folder status_group", () => {
    assert.equal(
      spaceIdFromSharedStatuses([{ status_group: "proj_90127062091" }]),
      "90127062091",
    );
    assert.equal(spaceIdFromSharedStatuses([]), null);
  });

  it("skips CSV import list names", () => {
    assert.equal(shouldSkipAutoMapList("Imported from CSV"), true);
    assert.equal(shouldSkipAutoMapList("OnePay USD Transfer"), false);
  });
});
