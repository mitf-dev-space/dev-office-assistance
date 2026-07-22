export type ClickUpClientOptions = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export class ClickUpApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ClickUpApiError";
  }
}

type Json = Record<string, unknown>;

function isNonRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const msg = err.message.toLowerCase();
  if (msg.includes("abort") || msg.includes("timeout") || msg.includes("fetch failed")) return true;
  const cause = err.cause instanceof Error ? err.cause : null;
  const code =
    cause && "code" in cause && typeof (cause as { code?: unknown }).code === "string"
      ? (cause as { code: string }).code
      : "";
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNRESET"
  );
}

function formatClickUpNetworkError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error("ClickUp request failed");
  if (!isNonRetryableNetworkError(err) && !(err.name === "AbortError")) return err;
  const cause = err.cause instanceof Error ? err.cause : null;
  const code =
    cause && "code" in cause && typeof (cause as { code?: unknown }).code === "string"
      ? (cause as { code: string }).code
      : err.name === "AbortError"
        ? "TIMEOUT"
        : "NETWORK";
  return new Error(
    `Could not reach api.clickup.com (${code}). The Helm API host has no outbound HTTPS — ` +
      "allow egress to api.clickup.com:443 (or set HTTPS_PROXY) then recreate the API container.",
  );
}

export class ClickUpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: ClickUpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token.trim();
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    // One retry is enough for 429/transient blips; connection failures should not stack timeouts.
    this.maxRetries = opts.maxRetries ?? 1;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const text = await res.text();
        let parsed: unknown = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        if (res.status === 429 && attempt < this.maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after") ?? 1);
          await sleep(Math.max(retryAfter, 1) * 1000 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          throw new ClickUpApiError(
            `ClickUp API ${method} ${path} failed: ${res.status}`,
            res.status,
            parsed,
          );
        }
        return parsed as T;
      } catch (e) {
        lastErr = e;
        if (e instanceof ClickUpApiError) throw e;
        // Do not burn 4× timeouts when the host has no egress (common on LAN servers).
        if (isNonRetryableNetworkError(e) || attempt >= this.maxRetries) {
          break;
        }
        await sleep(500 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
    throw formatClickUpNetworkError(lastErr);
  }

  getTeams() {
    return this.request<{ teams?: Array<{ id?: string; name?: string }> }>("GET", "/team");
  }

  getSpaces(teamId: string) {
    return this.request<{ spaces?: Array<{ id?: string; name?: string }> }>(
      "GET",
      `/team/${teamId}/space`,
      undefined,
      { archived: false },
    );
  }

  /**
   * Lists/folders/tasks shared with the authenticated user (e.g. "Shared with me").
   * Owned-space discovery often returns empty for these; use this instead of GET /space/:id.
   */
  getSharedHierarchy(teamId: string) {
    return this.request<{
      shared?: {
        tasks?: unknown[];
        lists?: Array<{
          id?: string;
          name?: string;
          task_count?: number | string;
          folder?: { id?: string; name?: string };
          space?: { id?: string; name?: string };
        }>;
        folders?: Array<{
          id?: string;
          name?: string;
          task_count?: number | string;
          statuses?: Array<{ status_group?: string }>;
          lists?: Array<{
            id?: string;
            name?: string;
            task_count?: number | string;
          }>;
        }>;
      };
    }>("GET", `/team/${teamId}/shared`);
  }

  getFolders(spaceId: string) {
    return this.request<{ folders?: Array<{ id?: string; name?: string }> }>(
      "GET",
      `/space/${spaceId}/folder`,
      undefined,
      { archived: false },
    );
  }

  getFolderlessLists(spaceId: string) {
    return this.request<{ lists?: Array<{ id?: string; name?: string }> }>(
      "GET",
      `/space/${spaceId}/list`,
      undefined,
      { archived: false },
    );
  }

  getListsInFolder(folderId: string) {
    return this.request<{ lists?: Array<{ id?: string; name?: string }> }>(
      "GET",
      `/folder/${folderId}/list`,
      undefined,
      { archived: false },
    );
  }

  getList(listId: string) {
    return this.request<{
      id?: string;
      name?: string;
      statuses?: Array<{ status?: string; type?: string }>;
      folder?: { id?: string; name?: string };
      space?: { id?: string; name?: string };
    }>("GET", `/list/${listId}`);
  }

  async getTasksPage(
    listId: string,
    page: number,
  ): Promise<{ tasks: unknown[]; lastPage: boolean }> {
    const res = await this.request<{ tasks?: unknown[]; last_page?: boolean }>(
      "GET",
      `/list/${listId}/task`,
      undefined,
      {
        page,
        archived: false,
        include_closed: true,
        subtasks: true,
        include_markdown_description: true,
      },
    );
    return {
      tasks: res.tasks ?? [],
      lastPage: Boolean(res.last_page),
    };
  }

  getTask(taskId: string) {
    return this.request<Json>("GET", `/task/${taskId}`, undefined, {
      include_markdown_description: true,
      include_subtasks: true,
    });
  }

  createTask(listId: string, body: Json) {
    return this.request<Json>("POST", `/list/${listId}/task`, body);
  }

  updateTask(taskId: string, body: Json) {
    return this.request<Json>("PUT", `/task/${taskId}`, body);
  }

  getTaskComments(taskId: string) {
    return this.request<{ comments?: unknown[] }>("GET", `/task/${taskId}/comment`);
  }

  createComment(taskId: string, commentText: string) {
    return this.request<Json>("POST", `/task/${taskId}/comment`, {
      comment_text: commentText,
    });
  }

  createWebhook(teamId: string, body: Json) {
    return this.request<{ id?: string; webhook?: { id?: string; secret?: string } }>(
      "POST",
      `/team/${teamId}/webhook`,
      body,
    );
  }

  deleteWebhook(webhookId: string) {
    return this.request<Json>("DELETE", `/webhook/${webhookId}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
