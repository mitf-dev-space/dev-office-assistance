import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateInvitationToken,
  hashInvitationToken,
  roundedSubmissionTime,
} from "./tokens.js";

describe("generateInvitationToken", () => {
  it("produces unique, URL-safe tokens", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32);
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });
});

describe("hashInvitationToken", () => {
  it("is deterministic and 64 hex chars", () => {
    const t = generateInvitationToken();
    const h1 = hashInvitationToken(t);
    const h2 = hashInvitationToken(t);
    assert.equal(h1, h2);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  it("does not contain the raw token", () => {
    const t = "super-secret-token-value";
    const h = hashInvitationToken(t);
    assert.ok(!h.includes(t));
  });
});

describe("roundedSubmissionTime", () => {
  it("rounds to the hour (privacy-safe)", () => {
    const d = new Date("2026-08-06T14:37:22.123Z");
    const r = roundedSubmissionTime(d);
    assert.equal(r.getUTCMinutes(), 0);
    assert.equal(r.getUTCSeconds(), 0);
    assert.equal(r.getUTCMilliseconds(), 0);
    assert.equal(r.getUTCHours(), 14);
  });
});
