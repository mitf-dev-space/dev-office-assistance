import type {
  BranchInfo,
  CommitInfo,
  CommitQuery,
  ConnectionResult,
  IssueInfo,
  IssueQuery,
  MergeRequestInfo,
  MergeRequestQuery,
  PipelineDetails,
  PipelineInfo,
  PipelineJobInfo,
  PipelineQuery,
  ProjectMetadata,
  ProtectedBranchInfo,
  ReleaseInfo,
  RepositoryFile,
  RepositoryIdentity,
  RepositoryReference,
  RepositoryTreeItem,
  SourceControlProvider,
  TagInfo,
} from "@office/types";
import { normalizeProjectPath, parseRepositoryUrl } from "../domain/urlNormalize.js";
import { fetchAllPages, mapGitLabPipelineStatus, providerFetch, type HttpClientOptions } from "./httpClient.js";

export function createGitLabProvider(options: HttpClientOptions): SourceControlProvider {
  const enc = (path: string) => encodeURIComponent(path);

  async function projectPath(input: RepositoryReference): Promise<string> {
    if (input.projectPath) return normalizeProjectPath(input.projectPath);
    if (input.url) return parseRepositoryUrl(input.url, "gitlab").normalizedProjectPath;
    throw new Error("projectPath or url required");
  }

  return {
    async verifyConnection(): Promise<ConnectionResult> {
      try {
        const res = await providerFetch(options, "/version");
        const data = (await res.json()) as { version?: string };
        return { ok: true, state: "reachable", providerVersion: data.version };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        const state =
          err && typeof err === "object" && "connectivityState" in err
            ? (err as { connectivityState: ConnectionResult["state"] }).connectivityState
            : "provider_error";
        return { ok: false, state, message };
      }
    },

    async resolveRepository(input: RepositoryReference): Promise<RepositoryIdentity> {
      const path = await projectPath(input);
      const res = await providerFetch(options, `/projects/${enc(path)}`);
      const p = (await res.json()) as {
        id: number;
        path_with_namespace: string;
        web_url: string;
        default_branch?: string;
      };
      const base = options.apiUrl.replace(/\/api\/v4\/?$/, "");
      return {
        providerProjectId: String(p.id),
        normalizedProjectPath: normalizeProjectPath(p.path_with_namespace),
        canonicalUrl: `${base}/${p.path_with_namespace}`,
        webUrl: p.web_url,
        defaultBranch: p.default_branch,
      };
    },

    async getProjectMetadata(repository: RepositoryIdentity): Promise<ProjectMetadata> {
      const res = await providerFetch(options, `/projects/${enc(repository.normalizedProjectPath)}`);
      const p = (await res.json()) as Record<string, unknown>;
      return {
        ...repository,
        name: String(p.name ?? repository.normalizedProjectPath),
        description: p.description ? String(p.description) : undefined,
        visibility: p.visibility ? String(p.visibility) : undefined,
        archived: Boolean(p.archived),
        createdAt: p.created_at ? String(p.created_at) : undefined,
        lastActivityAt: p.last_activity_at ? String(p.last_activity_at) : undefined,
        topics: Array.isArray(p.topics) ? (p.topics as string[]) : [],
      };
    },

    async listBranches(repository: RepositoryIdentity): Promise<BranchInfo[]> {
      const items = await fetchAllPages(async (page) => {
        const res = await providerFetch(
          options,
          `/projects/${enc(repository.normalizedProjectPath)}/repository/branches?per_page=100&page=${page}`,
        );
        const rows = (await res.json()) as Array<{
          name: string;
          default?: boolean;
          protected?: boolean;
          commit?: { id?: string; title?: string; author_name?: string; committed_date?: string };
        }>;
        return { items: rows, hasMore: rows.length === 100 };
      });
      return items.map((b) => ({
        name: b.name,
        isDefault: Boolean(b.default),
        isProtected: Boolean(b.protected),
        latestCommitSha: b.commit?.id,
        latestCommitTitle: b.commit?.title,
        latestCommitAuthor: b.commit?.author_name,
        latestCommitAt: b.commit?.committed_date,
      }));
    },

    async listRecentCommits(repository: RepositoryIdentity, query?: CommitQuery): Promise<CommitInfo[]> {
      const ref = query?.ref ? `&ref_name=${encodeURIComponent(query.ref)}` : "";
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/repository/commits?per_page=${query?.limit ?? 30}${ref}`,
      );
      const rows = (await res.json()) as Array<{
        id: string;
        title: string;
        author_name?: string;
        author_email?: string;
        committed_date: string;
        web_url?: string;
      }>;
      return rows.map((c) => ({
        sha: c.id,
        title: c.title,
        authorName: c.author_name,
        authorEmail: c.author_email,
        committedAt: c.committed_date,
        branchName: query?.ref,
        webUrl: c.web_url,
      }));
    },

    async listMergeRequests(repository: RepositoryIdentity, query?: MergeRequestQuery): Promise<MergeRequestInfo[]> {
      const state = query?.state && query.state !== "all" ? `&state=${query.state}` : "";
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/merge_requests?per_page=${query?.limit ?? 20}${state}`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((mr) => ({
        id: String(mr.iid ?? mr.id),
        title: String(mr.title ?? ""),
        state: String(mr.state ?? ""),
        sourceBranch: String(mr.source_branch ?? ""),
        targetBranch: String(mr.target_branch ?? ""),
        authorName: mr.author ? String((mr.author as { name?: string }).name ?? "") : undefined,
        isDraft: Boolean(mr.draft ?? mr.work_in_progress),
        webUrl: mr.web_url ? String(mr.web_url) : undefined,
        createdAt: String(mr.created_at ?? ""),
        updatedAt: String(mr.updated_at ?? ""),
      }));
    },

    async listIssues(repository: RepositoryIdentity, query?: IssueQuery): Promise<IssueInfo[]> {
      const state = query?.state && query.state !== "all" ? `&state=${query.state}` : "";
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/issues?per_page=${query?.limit ?? 20}${state}`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((issue) => ({
        id: String(issue.iid ?? issue.id),
        number: Number(issue.iid ?? issue.id ?? 0),
        title: String(issue.title ?? ""),
        state: String(issue.state ?? ""),
        authorName: issue.author ? String((issue.author as { name?: string }).name ?? "") : undefined,
        labels: Array.isArray(issue.labels) ? (issue.labels as string[]).map(String) : [],
        webUrl: issue.web_url ? String(issue.web_url) : undefined,
        createdAt: String(issue.created_at ?? ""),
        updatedAt: String(issue.updated_at ?? ""),
      }));
    },

    async listPipelines(repository: RepositoryIdentity, query?: PipelineQuery): Promise<PipelineInfo[]> {
      const ref = query?.ref ? `&ref=${encodeURIComponent(query.ref)}` : "";
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/pipelines?per_page=${query?.limit ?? 20}${ref}`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((p) => ({
        id: String(p.id),
        status: mapGitLabPipelineStatus(String(p.status ?? "unknown")),
        ref: p.ref ? String(p.ref) : undefined,
        sha: p.sha ? String(p.sha) : undefined,
        webUrl: p.web_url ? String(p.web_url) : undefined,
        source: p.source ? String(p.source) : undefined,
        startedAt: p.started_at ? String(p.started_at) : undefined,
        finishedAt: p.finished_at ? String(p.finished_at) : undefined,
      }));
    },

    async getPipeline(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineDetails> {
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/pipelines/${pipelineId}`,
      );
      const p = (await res.json()) as Record<string, unknown>;
      const jobs = await this.listPipelineJobs(repository, pipelineId);
      return {
        id: String(p.id),
        status: mapGitLabPipelineStatus(String(p.status ?? "unknown")),
        ref: p.ref ? String(p.ref) : undefined,
        sha: p.sha ? String(p.sha) : undefined,
        webUrl: p.web_url ? String(p.web_url) : undefined,
        jobs,
      };
    },

    async listPipelineJobs(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineJobInfo[]> {
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/pipelines/${pipelineId}/jobs`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((j) => ({
        id: String(j.id),
        name: String(j.name ?? ""),
        stage: j.stage ? String(j.stage) : undefined,
        status: mapGitLabPipelineStatus(String(j.status ?? "unknown")),
        durationSeconds: typeof j.duration === "number" ? j.duration : undefined,
        coveragePercent: typeof j.coverage === "string" ? parseFloat(j.coverage) : undefined,
        webUrl: j.web_url ? String(j.web_url) : undefined,
        allowFailure: Boolean(j.allow_failure),
      }));
    },

    async getRepositoryTree(repository: RepositoryIdentity, ref?: string): Promise<RepositoryTreeItem[]> {
      const refQ = ref ? `&ref=${encodeURIComponent(ref)}` : "";
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/repository/tree?per_page=100${refQ}`,
      );
      const rows = (await res.json()) as Array<{ path: string; type: string }>;
      return rows.map((r) => ({ path: r.path, type: r.type === "tree" ? "tree" : "blob" }));
    },

    async getFile(repository: RepositoryIdentity, path: string, ref?: string): Promise<RepositoryFile | null> {
      const refQ = ref ? `&ref=${encodeURIComponent(ref)}` : "";
      try {
        const res = await providerFetch(
          options,
          `/projects/${enc(repository.normalizedProjectPath)}/repository/files/${encodeURIComponent(path)}/raw${refQ ? `?${refQ.slice(1)}` : ""}`,
        );
        const content = await res.text();
        return { path, content, encoding: "text" };
      } catch {
        return null;
      }
    },

    async getProtectedBranches(repository: RepositoryIdentity): Promise<ProtectedBranchInfo[]> {
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/protected_branches`,
      );
      const rows = (await res.json()) as Array<{ name: string }>;
      return rows.map((b) => ({ name: b.name }));
    },

    async getTags(repository: RepositoryIdentity): Promise<TagInfo[]> {
      const res = await providerFetch(
        options,
        `/projects/${enc(repository.normalizedProjectPath)}/repository/tags?per_page=20`,
      );
      const rows = (await res.json()) as Array<{ name: string; commit?: { id?: string } }>;
      return rows.map((t) => ({ name: t.name, commitSha: t.commit?.id ?? "" }));
    },

    async getReleases(repository: RepositoryIdentity): Promise<ReleaseInfo[]> {
      try {
        const res = await providerFetch(
          options,
          `/projects/${enc(repository.normalizedProjectPath)}/releases?per_page=20`,
        );
        const rows = (await res.json()) as Array<{ tag_name: string; name: string; released_at?: string }>;
        return rows.map((r) => ({
          tagName: r.tag_name,
          name: r.name,
          releasedAt: r.released_at,
        }));
      } catch {
        return [];
      }
    },
  };
}
