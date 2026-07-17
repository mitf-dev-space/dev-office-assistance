import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseListQuery, totalPages, withPageMeta } from "./listQuery.js";

describe("parseListQuery", () => {
  it("defaults page 1 and limit 25", () => {
    const r = parseListQuery({});
    assert.equal(r.page, 1);
    assert.equal(r.limit, 25);
    assert.equal(r.skip, 0);
    assert.equal(r.q, "");
  });

  it("clamps limit to max 100", () => {
    const r = parseListQuery({ page: "2", limit: "500", q: "  hello  " });
    assert.equal(r.page, 2);
    assert.equal(r.limit, 100);
    assert.equal(r.skip, 100);
    assert.equal(r.q, "hello");
  });

  it("rejects invalid page numbers", () => {
    const r = parseListQuery({ page: "-1", limit: "0" });
    assert.equal(r.page, 1);
    assert.equal(r.limit, 1);
  });
});

describe("withPageMeta", () => {
  it("adds pagination fields", () => {
    const out = withPageMeta({ items: [1, 2] }, 2, 25, 60);
    assert.equal(out.page, 2);
    assert.equal(out.total, 60);
    assert.equal(out.totalPages, 3);
    assert.deepEqual(out.items, [1, 2]);
  });
});

describe("totalPages", () => {
  it("returns 1 for empty", () => {
    assert.equal(totalPages(0, 25), 1);
  });
});
