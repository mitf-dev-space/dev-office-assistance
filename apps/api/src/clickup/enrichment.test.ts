import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractClickUpEnrichment,
  normalizeClickUpComments,
} from "./enrichment.js";

describe("clickup enrichment", () => {
  it("extracts multi-assignees, tags, and custom fields", () => {
    const e = extractClickUpEnrichment({
      assignees: [
        { id: 1, username: "essra sowan", email: "a@x.com" },
        { id: 2, username: "Younes Belkher", email: "b@x.com" },
      ],
      watchers: [{ id: 3, username: "Watcher" }],
      tags: [{ name: "backend" }],
      custom_fields: [{ id: "cf1", name: "Bank", type: "drop_down", value: "SIB" }],
      checklists: [{ id: "c1", name: "QA", resolved: 1, unresolved: 2 }],
      time_estimate: 3_600_000,
      list: { name: "OnePay" },
      folder: { name: "SIB Bank" },
    });
    assert.equal(e.assignees.length, 2);
    assert.equal(e.tags[0], "backend");
    assert.equal(e.customFields[0]?.valueText, "SIB");
    assert.equal(e.checklists[0]?.unresolved, 2);
    assert.equal(e.listName, "OnePay");
  });

  it("normalizes comments payload", () => {
    const comments = normalizeClickUpComments({
      comments: [
        {
          id: "9",
          comment_text: "hello",
          user: { id: 1, username: "Younes" },
          date: "1600000000000",
        },
      ],
    });
    assert.equal(comments.length, 1);
    assert.equal(comments[0]?.author, "Younes");
    assert.equal(comments[0]?.text, "hello");
  });
});
