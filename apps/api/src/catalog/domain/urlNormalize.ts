import type { RepositoryProviderKind } from "@office/types";

export type ParsedRepositoryUrl = {
  providerKind: RepositoryProviderKind;
  host: string;
  normalizedProjectPath: string;
  canonicalUrl: string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const GITLAB_PATH_SUFFIX = /\.git$/i;

export function stripGitSuffix(path: string): string {
  return path.replace(GITLAB_PATH_SUFFIX, "").replace(/\/+$/, "");
}

export function normalizeProjectPath(path: string): string {
  return stripGitSuffix(path.trim()).replace(/^\/+/, "").toLowerCase();
}

export function parseRepositoryUrl(rawUrl: string, defaultProvider?: RepositoryProviderKind): ParsedRepositoryUrl {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    const path = normalizeProjectPath(trimmed);
    return {
      providerKind: defaultProvider ?? "gitlab",
      host: "",
      normalizedProjectPath: path,
      canonicalUrl: trimmed,
    };
  }

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);
  const projectPath = normalizeProjectPath(pathParts.join("/"));

  let providerKind: RepositoryProviderKind = defaultProvider ?? "other";
  if (GITHUB_HOSTS.has(host)) {
    providerKind = "github";
  } else if (host) {
    providerKind = "gitlab";
  }

  const canonicalUrl = `${url.protocol}//${url.host}/${projectPath}`;

  return { providerKind, host, normalizedProjectPath: projectPath, canonicalUrl };
}

export function detectConnectionSlug(
  parsed: ParsedRepositoryUrl,
  connections: { slug: string; providerKind: RepositoryProviderKind; baseUrl: string }[],
): string | null {
  for (const c of connections) {
    if (c.providerKind !== parsed.providerKind) continue;
    try {
      const base = new URL(c.baseUrl);
      if (parsed.host && base.hostname.toLowerCase() === parsed.host) return c.slug;
    } catch {
      /* ignore invalid base */
    }
  }
  const fallback = connections.find((c) => c.providerKind === parsed.providerKind);
  return fallback?.slug ?? null;
}
