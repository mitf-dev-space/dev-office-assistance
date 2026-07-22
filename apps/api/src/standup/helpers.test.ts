import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ageDaysFrom,
  buildStandupDraft,
  formatSuggestionBullets,
  isCheckInFilled,
  mergeFieldText,
  promoteBlockerDefaults,
  suggestionFromPeerBlocker,
  suggestionFromTriage,
  weekBounds,
} from "./helpers.js";

describe("weekBounds", () => {
  it("returns Monday start and next Monday exclusive end", () => {
    const start = new Date(2026, 6, 13); // Mon Jul 13 2026 local
    start.setHours(0, 0, 0, 0);
    const { start: s, end } = weekBounds(start);
    assert.equal(s.getTime(), start.getTime());
    assert.equal(end.getDate(), 20);
    assert.equal(end.getDay(), 1);
  });
});

describe("isCheckInFilled", () => {
  it("is false when all empty", () => {
    assert.equal(isCheckInFilled({ priorWork: "", nextWork: "  ", blockers: "" }), false);
  });
  it("is true when any field has text", () => {
    assert.equal(isCheckInFilled({ priorWork: "x", nextWork: "", blockers: "" }), true);
  });
});

describe("buildStandupDraft / formatSuggestionBullets", () => {
  it("joins top labels as bullets and caps length", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      suggestionFromTriage({ id: `t${i}`, title: `Item ${i}` }, "triage_done"),
    );
    const draft = buildStandupDraft({
      priorWork: many,
      nextWork: [],
      blockers: [],
    });
    const lines = draft.priorWork.split("\n");
    assert.equal(lines.length, 8);
    assert.equal(lines[0], "- Item 0");
    assert.equal(draft.nextWork, "");
    assert.equal(formatSuggestionBullets(many, 2), "- Item 0\n- Item 1");
  });
});

describe("mergeFieldText", () => {
  it("appends only missing bullets", () => {
    const merged = mergeFieldText("- Alpha\n- Beta", "- Beta\n- Gamma");
    assert.equal(merged, "- Alpha\n- Beta\n- Gamma");
  });
  it("returns addition when base empty", () => {
    assert.equal(mergeFieldText("  ", "- One"), "- One");
  });
});

describe("ageDaysFrom", () => {
  it("floors whole days", () => {
    const created = new Date("2026-07-10T12:00:00.000Z");
    const now = new Date("2026-07-12T11:00:00.000Z");
    assert.equal(ageDaysFrom(created, now), 1);
  });
});

describe("suggestionFromPeerBlocker", () => {
  it("splits peer blocker lines", () => {
    const s = suggestionFromPeerBlocker(
      "u1",
      "Ada",
      "ada@local.dev",
      "- Waiting on bank\n- Cert renew",
    );
    assert.equal(s.length, 2);
    assert.equal(s[0]?.label, "Ada: Waiting on bank");
    assert.equal(s[0]?.source, "peer_checkin");
  });
});

describe("promoteBlockerDefaults", () => {
  it("sets blocker + escalated inbox defaults", () => {
    const d = promoteBlockerDefaults({
      title: "  Bank cert stuck  ",
      notes: "Need renew",
      weekLabel: "Jul 13, 2026",
    });
    assert.equal(d.title, "Bank cert stuck");
    assert.equal(d.category, "blocker");
    assert.equal(d.status, "inbox");
    assert.equal(d.escalated, true);
    assert.equal(d.sourceType, "manual");
    assert.match(d.description, /Need renew/);
    assert.match(d.description, /Jul 13, 2026/);
  });
});
