import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateTemporaryPassword,
  validateNewPassword,
} from "./passwordUtil.js";

describe("generateTemporaryPassword", () => {
  it("returns requested length", () => {
    assert.equal(generateTemporaryPassword(12).length, 12);
    assert.equal(generateTemporaryPassword(16).length, 16);
  });

  it("uses the restricted charset", () => {
    const pw = generateTemporaryPassword(64);
    assert.match(pw, /^[A-Za-z0-9!@#$%&*?_-]+$/);
  });
});

describe("validateNewPassword", () => {
  it("rejects short passwords", () => {
    assert.equal(validateNewPassword(""), "Password must be at least 8 characters");
    assert.equal(validateNewPassword("short"), "Password must be at least 8 characters");
  });

  it("accepts passwords of length 8+", () => {
    assert.equal(validateNewPassword("12345678"), null);
    assert.equal(validateNewPassword("SecurePass99!"), null);
  });
});
