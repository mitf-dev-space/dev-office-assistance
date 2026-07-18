import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSharedDeliveryPath,
  resolveApplicationSharedPath,
  sanitizeDeliveryFileToken,
} from "./sharedDeliveryPath.js";

describe("sharedDeliveryPath", () => {
  it("accepts UNC and drive paths", () => {
    assert.equal(normalizeSharedDeliveryPath("\\\\server\\share\\forge"), "\\\\server\\share\\forge");
    assert.ok(normalizeSharedDeliveryPath("D:\\forge\\out")?.startsWith("D:"));
  });

  it("rejects traversal and relative paths", () => {
    assert.throws(() => normalizeSharedDeliveryPath("..\\evil"), /traversal/);
    assert.throws(() => normalizeSharedDeliveryPath("relative\\path"), /absolute/);
  });

  it("resolves app override over bank", () => {
    assert.equal(
      resolveApplicationSharedPath({
        applicationPath: "D:\\app",
        bankPath: "D:\\bank",
      }),
      "D:\\app",
    );
    assert.equal(
      resolveApplicationSharedPath({
        applicationPath: null,
        bankPath: "D:\\bank",
      }),
      "D:\\bank",
    );
  });

  it("sanitizes file tokens", () => {
    assert.equal(sanitizeDeliveryFileToken("Jumhoria Wallet!!"), "Jumhoria_Wallet");
  });
});
