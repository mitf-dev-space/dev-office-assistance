import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUseVoiceAssistant } from "./authz.js";

describe("canUseVoiceAssistant", () => {
  it("allows lead and assistant", () => {
    assert.equal(canUseVoiceAssistant("lead"), true);
    assert.equal(canUseVoiceAssistant("assistant"), true);
  });

  it("denies forge-only and unknown", () => {
    assert.equal(canUseVoiceAssistant("forge_mobile_lead"), false);
    assert.equal(canUseVoiceAssistant("member"), false);
    assert.equal(canUseVoiceAssistant(""), false);
  });
});
