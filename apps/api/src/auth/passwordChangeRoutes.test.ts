import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPasswordChangeAllowedRoute } from "../auth.js";

describe("isPasswordChangeAllowedRoute", () => {
  it("allows me and complete-password-change", () => {
    assert.equal(isPasswordChangeAllowedRoute("GET", "/api/me"), true);
    assert.equal(
      isPasswordChangeAllowedRoute("POST", "/api/auth/complete-password-change"),
      true,
    );
    assert.equal(
      isPasswordChangeAllowedRoute("GET", "/api/me?x=1"),
      true,
    );
  });

  it("denies other routes", () => {
    assert.equal(isPasswordChangeAllowedRoute("GET", "/api/users"), false);
    assert.equal(isPasswordChangeAllowedRoute("POST", "/api/me/password"), false);
    assert.equal(isPasswordChangeAllowedRoute("PATCH", "/api/me"), false);
  });
});
