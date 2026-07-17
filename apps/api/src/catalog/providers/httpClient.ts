import type { RepositoryConnectivityState } from "@office/types";

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly connectivityState: RepositoryConnectivityState,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export type HttpClientOptions = {
  apiUrl: string;
  token?: string;
  timeoutMs: number;
  tlsCaFile?: string;
};

export async function providerFetch(
  options: HttpClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${options.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    if (res.status === 401) {
      throw new ProviderHttpError("Authentication failed", 401, "authentication_failed");
    }
    if (res.status === 403) {
      throw new ProviderHttpError("Permission denied", 403, "permission_denied");
    }
    if (res.status === 404) {
      throw new ProviderHttpError("Not found", 404, "not_found");
    }
    if (!res.ok) {
      throw new ProviderHttpError(`Provider error ${res.status}`, res.status, "provider_error");
    }
    return res;
  } catch (err) {
    if (err instanceof ProviderHttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderHttpError("Request timeout", 408, "network_error");
    }
    throw new ProviderHttpError("Network error", 0, "network_error");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
  maxPages = 10,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { items, hasMore } = await fetchPage(page);
    all.push(...items);
    if (!hasMore) break;
  }
  return all;
}

export function mapGitLabPipelineStatus(status: string): import("@office/types").PipelineStatus {
  const map: Record<string, import("@office/types").PipelineStatus> = {
    created: "created",
    waiting_for_resource: "waiting",
    preparing: "preparing",
    pending: "pending",
    running: "running",
    success: "success",
    failed: "failed",
    canceled: "canceled",
    skipped: "skipped",
    manual: "manual",
    scheduled: "scheduled",
  };
  return map[status] ?? "unknown";
}

export function mapGitHubConclusion(conclusion: string | null, status: string): import("@office/types").PipelineStatus {
  if (status === "in_progress" || status === "queued" || status === "waiting") return "running";
  if (status === "completed") {
    if (conclusion === "success") return "success";
    if (conclusion === "failure") return "failed";
    if (conclusion === "cancelled") return "canceled";
    if (conclusion === "skipped") return "skipped";
  }
  return "unknown";
}
