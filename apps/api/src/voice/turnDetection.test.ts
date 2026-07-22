import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTurnDetectorState,
  observeAudioChunk,
  pcm16HasVoice,
  resetAfterFinalize,
} from "./turnDetection.js";

function tone(samples = 2000, amp = 5000): Buffer {
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(i % 2 === 0 ? amp : -amp, i * 2);
  }
  return buf;
}

describe("turnDetection", () => {
  it("detects voice energy", () => {
    assert.equal(pcm16HasVoice(Buffer.alloc(2000)), false);
    assert.equal(pcm16HasVoice(tone()), true);
  });

  it("finalizes after silence threshold", () => {
    const state = createTurnDetectorState();
    const cfg = { silenceFinalizeMs: 500, maxUtteranceMs: 60_000 };
    assert.equal(observeAudioChunk(state, tone(), 1000, cfg), "speech");
    assert.equal(observeAudioChunk(state, Buffer.alloc(2000), 1200, cfg), "none");
    assert.equal(observeAudioChunk(state, Buffer.alloc(2000), 1600, cfg), "finalize_silence");
    resetAfterFinalize(state);
    assert.equal(state.speaking, false);
  });

  it("finalizes on max utterance duration", () => {
    const state = createTurnDetectorState();
    const cfg = { silenceFinalizeMs: 5000, maxUtteranceMs: 1000 };
    assert.equal(observeAudioChunk(state, tone(), 0, cfg), "speech");
    assert.equal(observeAudioChunk(state, tone(), 1200, cfg), "finalize_max_duration");
  });

  it("ignores audio during post-finalize cooldown", () => {
    const state = createTurnDetectorState();
    const cfg = { silenceFinalizeMs: 500, maxUtteranceMs: 60_000 };
    assert.equal(observeAudioChunk(state, tone(), 1000, cfg), "speech");
    resetAfterFinalize(state, 2000);
    assert.equal(observeAudioChunk(state, tone(), Date.now(), cfg), "none");
  });
});
