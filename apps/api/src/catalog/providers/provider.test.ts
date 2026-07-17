import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createGitLabProvider } from "./gitlabProvider.js";
import { ProviderHttpError } from "./httpClient.js";

describe("gitlabProvider", () => {
  it("verifyConnection returns reachable on success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: "16.0.0" }),
    })) as unknown as typeof fetch;

    try {
      const provider = createGitLabProvider({
        apiUrl: "http://gitlab.example/api/v4",
        token: "test",
        timeoutMs: 5000,
      });
      const result = await provider.verifyConnection();
      assert.equal(result.ok, true);
      assert.equal(result.state, "reachable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps 401 to authentication_failed", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    try {
      const provider = createGitLabProvider({
        apiUrl: "http://gitlab.example/api/v4",
        timeoutMs: 5000,
      });
      await assert.rejects(
        () => provider.resolveRepository({ projectPath: "group/project" }),
        (err: unknown) => err instanceof ProviderHttpError && err.connectivityState === "authentication_failed",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
