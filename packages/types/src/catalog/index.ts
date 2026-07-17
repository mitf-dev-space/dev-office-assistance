export const REPOSITORY_PROVIDER_KINDS = ["gitlab", "github", "azure_devops", "other"] as const;
export type RepositoryProviderKind = (typeof REPOSITORY_PROVIDER_KINDS)[number];

export const REPOSITORY_LIFECYCLE_STATES = [
  "proposed",
  "preparing",
  "active",
  "maintenance",
  "deprecated",
  "archived",
  "unavailable",
] as const;
export type RepositoryLifecycleState = (typeof REPOSITORY_LIFECYCLE_STATES)[number];

export const REPOSITORY_CONNECTIVITY_STATES = [
  "unknown",
  "reachable",
  "authentication_failed",
  "permission_denied",
  "not_found",
  "network_error",
  "tls_error",
  "provider_error",
] as const;
export type RepositoryConnectivityState = (typeof REPOSITORY_CONNECTIVITY_STATES)[number];

export const REPOSITORY_FRESHNESS_STATES = [
  "current",
  "stale",
  "never_synchronized",
  "partially_synchronized",
  "synchronization_failed",
] as const;
export type RepositoryFreshnessState = (typeof REPOSITORY_FRESHNESS_STATES)[number];

export const SIGNAL_STATES = [
  "unknown",
  "not_applicable",
  "declared",
  "detected",
  "passing",
  "failing",
  "stale",
  "inherited",
  "manually_overridden",
  "missing",
  "configured",
] as const;
export type SignalState = (typeof SIGNAL_STATES)[number];

export const BRANCH_CLASSIFICATIONS = [
  "main",
  "development",
  "feature",
  "release",
  "hotfix",
  "bank_specific",
  "unknown",
] as const;
export type BranchClassification = (typeof BRANCH_CLASSIFICATIONS)[number];

export const PIPELINE_STATUSES = [
  "created",
  "waiting",
  "preparing",
  "pending",
  "running",
  "success",
  "failed",
  "canceled",
  "skipped",
  "manual",
  "scheduled",
  "blocked",
  "unknown",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const JOB_CLASSIFICATIONS = [
  "build",
  "unit_test",
  "integration_test",
  "end_to_end_test",
  "static_analysis",
  "lint",
  "security_scan",
  "dependency_scan",
  "secret_scan",
  "package",
  "deploy",
  "release",
  "unknown",
] as const;
export type JobClassification = (typeof JOB_CLASSIFICATIONS)[number];

export type ConnectionResult = {
  ok: boolean;
  state: RepositoryConnectivityState;
  message?: string;
  providerVersion?: string;
  accountLogin?: string;
};

export type RepositoryReference = {
  url?: string;
  projectPath?: string;
};

export type RepositoryIdentity = {
  providerProjectId: string;
  normalizedProjectPath: string;
  canonicalUrl: string;
  webUrl: string;
  defaultBranch?: string;
};

export type ProjectMetadata = RepositoryIdentity & {
  name: string;
  description?: string;
  visibility?: string;
  archived?: boolean;
  createdAt?: string;
  lastActivityAt?: string;
  topics?: string[];
};

export type BranchInfo = {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
  latestCommitSha?: string;
  latestCommitTitle?: string;
  latestCommitAuthor?: string;
  latestCommitAt?: string;
};

export type CommitInfo = {
  sha: string;
  title: string;
  authorName?: string;
  authorEmail?: string;
  committedAt: string;
  branchName?: string;
  webUrl?: string;
};

export type MergeRequestInfo = {
  id: string;
  title: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  authorName?: string;
  isDraft: boolean;
  webUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueInfo = {
  id: string;
  number: number;
  title: string;
  state: string;
  authorName?: string;
  labels: string[];
  webUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineInfo = {
  id: string;
  status: PipelineStatus;
  ref?: string;
  sha?: string;
  webUrl?: string;
  source?: string;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
};

export type PipelineJobInfo = {
  id: string;
  name: string;
  stage?: string;
  status: PipelineStatus;
  durationSeconds?: number;
  coveragePercent?: number;
  webUrl?: string;
  allowFailure?: boolean;
};

export type RepositoryTreeItem = {
  path: string;
  type: "blob" | "tree";
};

export type RepositoryFile = {
  path: string;
  content: string;
  encoding: "base64" | "text";
};

export type ProtectedBranchInfo = {
  name: string;
  pushAccessLevel?: string;
  mergeAccessLevel?: string;
};

export type TagInfo = { name: string; commitSha: string };
export type ReleaseInfo = { tagName: string; name: string; releasedAt?: string };

export type CommitQuery = { ref?: string; since?: string; limit?: number };
export type MergeRequestQuery = { state?: "opened" | "closed" | "merged" | "all"; limit?: number };
export type IssueQuery = { state?: "open" | "closed" | "all"; limit?: number };
export type PipelineQuery = { ref?: string; limit?: number };

export type PipelineDetails = PipelineInfo & { jobs?: PipelineJobInfo[] };

export interface SourceControlProvider {
  verifyConnection(): Promise<ConnectionResult>;
  resolveRepository(input: RepositoryReference): Promise<RepositoryIdentity>;
  getProjectMetadata(repository: RepositoryIdentity): Promise<ProjectMetadata>;
  listBranches(repository: RepositoryIdentity): Promise<BranchInfo[]>;
  listRecentCommits(repository: RepositoryIdentity, options?: CommitQuery): Promise<CommitInfo[]>;
  listMergeRequests(repository: RepositoryIdentity, options?: MergeRequestQuery): Promise<MergeRequestInfo[]>;
  listIssues(repository: RepositoryIdentity, options?: IssueQuery): Promise<IssueInfo[]>;
  listPipelines(repository: RepositoryIdentity, options?: PipelineQuery): Promise<PipelineInfo[]>;
  getPipeline(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineDetails>;
  listPipelineJobs(repository: RepositoryIdentity, pipelineId: string): Promise<PipelineJobInfo[]>;
  getRepositoryTree(repository: RepositoryIdentity, ref?: string): Promise<RepositoryTreeItem[]>;
  getFile(repository: RepositoryIdentity, path: string, ref?: string): Promise<RepositoryFile | null>;
  getProtectedBranches(repository: RepositoryIdentity): Promise<ProtectedBranchInfo[]>;
  getTags(repository: RepositoryIdentity): Promise<TagInfo[]>;
  getReleases(repository: RepositoryIdentity): Promise<ReleaseInfo[]>;
}

export type CatalogTeamDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  devTeamSlug: string | null;
  isActive: boolean;
};

export type RepositorySummaryDto = {
  id: string;
  name: string;
  canonicalUrl: string;
  connectionSlug: string;
  providerKind: RepositoryProviderKind;
  teamName: string | null;
  lifecycleState: RepositoryLifecycleState;
  connectivityState: RepositoryConnectivityState;
  freshnessState: RepositoryFreshnessState;
  defaultBranch: string | null;
  latestCommitAt: string | null;
  latestPipelineStatus: PipelineStatus | null;
  reportedPipelineState: string | null;
  reportedUnitTestState: string | null;
  reportedMainBranch: string | null;
  reportedDevelopmentBranch: string | null;
  notes: string | null;
  branchCount: number;
  openMergeRequestCount: number;
};

export type UpdateRepositoryInput = {
  name?: string;
  notes?: string | null;
  teamId?: string | null;
  lifecycleState?: RepositoryLifecycleState;
  reportedMainBranch?: string | null;
  reportedDevelopmentBranch?: string | null;
  criticality?: string | null;
};

export type CatalogOverviewConnectionDto = {
  id: string;
  name: string;
  slug: string;
  providerKind: RepositoryProviderKind | string;
  baseUrl: string;
  hasToken: boolean;
  lastVerifiedAt: string | null;
  repositoryCount: number;
};

export type CatalogOverviewDto = {
  totalRepositories: number;
  reachableRepositories: number;
  unreachableRepositories: number;
  withPipelines: number;
  withoutPipelines: number;
  unknownStateCount: number;
  openGaps: number;
  activeAlerts: number;
  neverSyncedCount: number;
  staleCount: number;
  freshCount: number;
  systemsCount: number;
  applicationsCount: number;
  teamsCount: number;
  forgeLinkedCount: number;
  openMergeRequestCount: number;
  branchCount: number;
  connections: CatalogOverviewConnectionDto[];
  byLifecycle: Array<{ lifecycleState: string; count: number }>;
  byTeam: Array<{ teamId: string | null; teamName: string; count: number }>;
  byConnection: Array<{
    connectionId: string;
    connectionSlug: string;
    connectionName: string;
    providerKind: string;
    count: number;
  }>;
  recentSyncs: Array<{
    id: string;
    kind: string;
    status: string;
    startedAt: string;
    repositoryId: string | null;
    repositoryName: string | null;
  }>;
  recentGaps: Array<{
    id: string;
    title: string;
    priority: string;
    repositoryId: string;
    repositoryName: string;
  }>;
};

export function canAccessCatalog(role: string): boolean {
  return role === "lead" || role === "assistant" || role === "member" || role === "forge_admin" || role === "forge_pm";
}

export function canAdminCatalog(role: string): boolean {
  return role === "lead";
}

export function canWriteCatalog(role: string): boolean {
  return role === "lead";
}
