import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPartialTranscript, reduceVoiceState } from "./machine.js";

describe("voice state machine", () => {
  it("starts and connects", () => {
    let s = reduceVoiceState("idle", { type: "START" });
    assert.equal(s, "requesting-permission");
    s = reduceVoiceState(s, { type: "PERMISSION_GRANTED" });
    assert.equal(s, "connecting");
    s = reduceVoiceState(s, { type: "CONNECTED" });
    assert.equal(s, "listening");
  });

  it("replaces partials by sequence and ignores stale", () => {
    const a = applyPartialTranscript("", { text: "Review today's standups", sequence: 1 }, 0);
    assert.equal(a.partial, "Review today's standups");
    const b = applyPartialTranscript(
      a.partial,
      { text: "Review today's standups and identify", sequence: 2 },
      a.lastSequence,
    );
    assert.equal(b.partial, "Review today's standups and identify");
    const stale = applyPartialTranscript(
      b.partial,
      { text: "old", sequence: 1 },
      b.lastSequence,
    );
    assert.equal(stale.changed, false);
    assert.equal(stale.partial, b.partial);
  });
});
