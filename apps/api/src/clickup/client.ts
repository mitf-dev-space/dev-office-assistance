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

export class ClickUpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: ClickUpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token.trim();
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
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
        if (attempt < this.maxRetries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("ClickUp request failed");
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
