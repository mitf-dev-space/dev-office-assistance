import type { RepositoryConnection } from "@prisma/client";
import type { SourceControlProvider } from "@office/types";
import { decryptToken } from "../lib/tokenCrypto.js";
import { createGitHubProvider } from "./githubProvider.js";
import { createGitLabProvider } from "./gitlabProvider.js";
import type { HttpClientOptions } from "./httpClient.js";

export type CatalogEnvSlice = {
  catalogRequestTimeoutMs: number;
  catalogTokenEncryptionKey?: string;
  githubAccessToken?: string;
  gitlabAccessToken?: string;
  githubConnectionSlug?: string;
  gitlabConnectionSlug?: string;
};

function envTokenFallback(connection: RepositoryConnection, env: CatalogEnvSlice): string | undefined {
  if (connection.providerKind === "github" && env.githubAccessToken) return env.githubAccessToken;
  if (connection.providerKind === "gitlab" && env.gitlabAccessToken) return env.gitlabAccessToken;
  return undefined;
}

export function buildProviderOptions(
  connection: RepositoryConnection,
  env: CatalogEnvSlice,
): HttpClientOptions {
  let token: string | undefined;
  if (connection.encryptedToken && env.catalogTokenEncryptionKey) {
    token = decryptToken(connection.encryptedToken, env.catalogTokenEncryptionKey);
  }
  if (!token) {
    token = envTokenFallback(connection, env);
  }
  return {
    apiUrl: connection.apiUrl,
    token,
    timeoutMs: env.catalogRequestTimeoutMs,
    tlsCaFile: connection.tlsCaFile ?? undefined,
  };
}

export function createProviderForConnection(
  connection: RepositoryConnection,
  env: CatalogEnvSlice,
): SourceControlProvider {
  const options = buildProviderOptions(connection, env);
  switch (connection.providerKind) {
    case "gitlab":
      return createGitLabProvider(options);
    case "github":
      return createGitHubProvider(options);
    default:
      throw new Error(`Provider ${connection.providerKind} is not implemented`);
  }
}
