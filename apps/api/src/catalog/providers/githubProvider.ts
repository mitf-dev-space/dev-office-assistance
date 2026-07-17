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
import { mapGitHubConclusion, providerFetch, type HttpClientOptions } from "./httpClient.js";

export function createGitHubProvider(options: HttpClientOptions): SourceControlProvider {
  async function ownerRepo(input: RepositoryReference): Promise<{ owner: string; repo: string; path: string }> {
    const path = input.projectPath
      ? normalizeProjectPath(input.projectPath)
      : input.url
        ? parseRepositoryUrl(input.url, "github").normalizedProjectPath
        : "";
    const [owner, repo] = path.split("/");
    if (!owner || !repo) throw new Error("Invalid GitHub owner/repo path");
    return { owner, repo, path: `${owner}/${repo}` };
  }

  function repoBase(owner: string, repo: string): string {
    return `/repos/${owner}/${repo}`;
  }

  return {
    async verifyConnection(): Promise<ConnectionResult> {
      try {
        await providerFetch(options, "/rate_limit");
        const userRes = await providerFetch(options, "/user");
        const user = (await userRes.json()) as { login?: string };
        const login = user.login ? String(user.login) : undefined;
        return {
          ok: true,
          state: "reachable",
          accountLogin: login,
          message: login ? `Authenticated as ${login}` : "GitHub API reachable",
        };
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
      const { owner, repo, path } = await ownerRepo(input);
      const res = await providerFetch(options, repoBase(owner, repo));
      const p = (await res.json()) as {
        id: number;
        full_name: string;
        html_url: string;
        default_branch?: string;
      };
      const base = options.apiUrl.includes("api.github.com")
        ? "https://github.com"
        : options.apiUrl.replace(/\/api\/v3\/?$/, "");
      return {
        providerProjectId: String(p.id),
        normalizedProjectPath: normalizeProjectPath(p.full_name),
        canonicalUrl: `${base}/${p.full_name}`,
        webUrl: p.html_url,
        defaultBranch: p.default_branch,
      };
    },

    async getProjectMetadata(repository: RepositoryIdentity): Promise<ProjectMetadata> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(options, repoBase(owner, repo));
      const p = (await res.json()) as Record<string, unknown>;
      return {
        ...repository,
        name: String(p.name ?? repo),
        description: p.description ? String(p.description) : undefined,
        visibility: p.private ? "private" : "public",
        archived: Boolean(p.archived),
        createdAt: p.created_at ? String(p.created_at) : undefined,
        lastActivityAt: p.pushed_at ? String(p.pushed_at) : undefined,
        topics: Array.isArray(p.topics) ? (p.topics as string[]) : [],
      };
    },

    async listBranches(repository: RepositoryIdentity): Promise<BranchInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(options, `${repoBase(owner, repo)}/branches?per_page=100`);
      const rows = (await res.json()) as Array<{
        name: string;
        protected?: boolean;
        commit?: { sha?: string; commit?: { message?: string; author?: { name?: string }; committer?: { date?: string } } };
      }>;
      return rows.map((b) => ({
        name: b.name,
        isDefault: repository.defaultBranch === b.name,
        isProtected: Boolean(b.protected),
        latestCommitSha: b.commit?.sha,
        latestCommitTitle: b.commit?.commit?.message?.split("\n")[0],
        latestCommitAuthor: b.commit?.commit?.author?.name,
        latestCommitAt: b.commit?.commit?.committer?.date,
      }));
    },

    async listRecentCommits(repository: RepositoryIdentity, query?: CommitQuery): Promise<CommitInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const sha = query?.ref ? `&sha=${encodeURIComponent(query.ref)}` : "";
      const res = await providerFetch(
        options,
        `${repoBase(owner, repo)}/commits?per_page=${query?.limit ?? 30}${sha}`,
      );
      const rows = (await res.json()) as Array<{
        sha: string;
        commit: { message: string; author?: { name?: string; email?: string; date?: string } };
        html_url?: string;
      }>;
      return rows.map((c) => ({
        sha: c.sha,
        title: c.commit.message.split("\n")[0] ?? c.commit.message,
        authorName: c.commit.author?.name,
        authorEmail: c.commit.author?.email,
        committedAt: c.commit.author?.date ?? new Date().toISOString(),
        branchName: query?.ref,
        webUrl: c.html_url,
      }));
    },

    async listMergeRequests(repository: RepositoryIdentity, query?: MergeRequestQuery): Promise<MergeRequestInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const state = query?.state === "opened" ? "open" : query?.state === "merged" ? "closed" : query?.state ?? "open";
      const res = await providerFetch(
        options,
        `${repoBase(owner, repo)}/pulls?state=${state}&per_page=${query?.limit ?? 20}`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((pr) => ({
        id: String(pr.number),
        title: String(pr.title ?? ""),
        state: String(pr.state ?? ""),
        sourceBranch: pr.head ? String((pr.head as { ref?: string }).ref ?? "") : "",
        targetBranch: pr.base ? String((pr.base as { ref?: string }).ref ?? "") : "",
        authorName: pr.user ? String((pr.user as { login?: string }).login ?? "") : undefined,
        isDraft: Boolean(pr.draft),
        webUrl: pr.html_url ? String(pr.html_url) : undefined,
        createdAt: String(pr.created_at ?? ""),
        updatedAt: String(pr.updated_at ?? ""),
      }));
    },

    async listIssues(repository: RepositoryIdentity, query?: IssueQuery): Promise<IssueInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const state = query?.state && query.state !== "all" ? query.state : "all";
      const res = await providerFetch(
        options,
        `${repoBase(owner, repo)}/issues?state=${state}&per_page=${query?.limit ?? 20}`,
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((issue) => ({
        id: String(issue.id),
        number: Number(issue.number ?? 0),
        title: String(issue.title ?? ""),
        state: String(issue.state ?? ""),
        authorName: issue.user ? String((issue.user as { login?: string }).login ?? "") : undefined,
        labels: Array.isArray(issue.labels)
          ? (issue.labels as Array<{ name?: string }>).map((l) => String(l.name ?? "")).filter(Boolean)
          : [],
        webUrl: issue.html_url ? String(issue.html_url) : undefined,
        createdAt: String(issue.created_at ?? ""),
        updatedAt: String(issue.updated_at ?? ""),
      }));
    },

    async listPipelines(repository: RepositoryIdentity, query?: PipelineQuery): Promise<PipelineInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(
        options,
        `${repoBase(owner, repo)}/actions/runs?per_page=${query?.limit ?? 20}`,
      );
      const data = (await res.json()) as { workflow_runs?: Array<Record<string, unknown>> };
      return (data.workflow_runs ?? []).map((run) => ({
        id: String(run.id),
        status: mapGitHubConclusion(
          run.conclusion ? String(run.conclusion) : null,
          String(run.status ?? "unknown"),
        ),
        ref: run.head_branch ? String(run.head_branch) : undefined,
        sha: run.head_sha ? String(run.head_sha) : undefined,
        webUrl: run.html_url ? String(run.html_url) : undefined,
        startedAt: run.run_started_at ? String(run.run_started_at) : undefined,
        finishedAt: run.updated_at ? String(run.updated_at) : undefined,
      }));
    },

    async getPipeline(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineDetails> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(options, `${repoBase(owner, repo)}/actions/runs/${pipelineId}`);
      const run = (await res.json()) as Record<string, unknown>;
      const jobs = await this.listPipelineJobs(repository, pipelineId);
      return {
        id: String(run.id),
        status: mapGitHubConclusion(
          run.conclusion ? String(run.conclusion) : null,
          String(run.status ?? "unknown"),
        ),
        ref: run.head_branch ? String(run.head_branch) : undefined,
        sha: run.head_sha ? String(run.head_sha) : undefined,
        webUrl: run.html_url ? String(run.html_url) : undefined,
        jobs,
      };
    },

    async listPipelineJobs(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineJobInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(
        options,
        `${repoBase(owner, repo)}/actions/runs/${pipelineId}/jobs?per_page=100`,
      );
      const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
      return (data.jobs ?? []).map((j) => ({
        id: String(j.id),
        name: String(j.name ?? ""),
        stage: undefined,
        status: mapGitHubConclusion(
          j.conclusion ? String(j.conclusion) : null,
          String(j.status ?? "unknown"),
        ),
        durationSeconds:
          typeof j.started_at === "string" && typeof j.completed_at === "string"
            ? (new Date(String(j.completed_at)).getTime() - new Date(String(j.started_at)).getTime()) / 1000
            : undefined,
        webUrl: j.html_url ? String(j.html_url) : undefined,
      }));
    },

    async getRepositoryTree(repository: RepositoryIdentity, ref?: string): Promise<RepositoryTreeItem[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const branch = ref ?? repository.defaultBranch ?? "HEAD";
      const res = await providerFetch(options, `${repoBase(owner, repo)}/git/trees/${branch}?recursive=1`);
      const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
      return (data.tree ?? []).slice(0, 200).map((t) => ({
        path: t.path,
        type: t.type === "tree" ? "tree" : "blob",
      }));
    },

    async getFile(repository: RepositoryIdentity, path: string, ref?: string): Promise<RepositoryFile | null> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const branch = ref ?? repository.defaultBranch ?? "HEAD";
      try {
        const res = await providerFetch(
          options,
          `${repoBase(owner, repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
        );
        const data = (await res.json()) as { content?: string; encoding?: string };
        if (!data.content) return null;
        const content =
          data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content;
        return { path, content, encoding: data.encoding === "base64" ? "base64" : "text" };
      } catch {
        return null;
      }
    },

    async getProtectedBranches(repository: RepositoryIdentity): Promise<ProtectedBranchInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      try {
        const res = await providerFetch(options, `${repoBase(owner, repo)}/branches?protected=true&per_page=100`);
        const rows = (await res.json()) as Array<{ name: string }>;
        return rows.map((b) => ({ name: b.name }));
      } catch {
        return [];
      }
    },

    async getTags(repository: RepositoryIdentity): Promise<TagInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      const res = await providerFetch(options, `${repoBase(owner, repo)}/tags?per_page=20`);
      const rows = (await res.json()) as Array<{ name: string; commit?: { sha?: string } }>;
      return rows.map((t) => ({ name: t.name, commitSha: t.commit?.sha ?? "" }));
    },

    async getReleases(repository: RepositoryIdentity): Promise<ReleaseInfo[]> {
      const [owner, repo] = repository.normalizedProjectPath.split("/");
      try {
        const res = await providerFetch(options, `${repoBase(owner, repo)}/releases?per_page=20`);
        const rows = (await res.json()) as Array<{ tag_name: string; name: string; published_at?: string }>;
        return rows.map((r) => ({
          tagName: r.tag_name,
          name: r.name,
          releasedAt: r.published_at,
        }));
      } catch {
        return [];
      }
    },
  };
}
