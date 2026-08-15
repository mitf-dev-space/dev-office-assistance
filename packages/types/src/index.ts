export const TRIAGE_CATEGORIES = [
  "blocker",
  "risk",
  "quality",
  "process",
  "other",
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const TRIAGE_STATUSES = [
  "inbox",
  "in_progress",
  "snoozed",
  "done",
  "dropped",
] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const SOURCE_TYPES = ["outlook", "manual", "microsoft_todo", "clickup"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EXTERNAL_PROVIDERS = ["microsoft_todo", "clickup"] as const;
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number];

export const EXTERNAL_SYNC_STATES = ["idle", "syncing", "error", "stale"] as const;
export type ExternalSyncState = (typeof EXTERNAL_SYNC_STATES)[number];

export type ClickUpPersonSummaryDto = {
  id: string;
  username: string | null;
  email: string | null;
  profilePicture: string | null;
};

export type ClickUpCommentSummaryDto = {
  id: string;
  text: string;
  author: string | null;
  authorId: string | null;
  date: string | null;
};

export type ClickUpCustomFieldSummaryDto = {
  id: string;
  name: string;
  type: string | null;
  valueText: string | null;
};

/** Structured ClickUp payload exposed from ExternalWorkItem.rawMetadata._helm */
export type ClickUpEnrichmentDto = {
  assignees: ClickUpPersonSummaryDto[];
  watchers: ClickUpPersonSummaryDto[];
  creator: ClickUpPersonSummaryDto | null;
  tags: string[];
  customFields: ClickUpCustomFieldSummaryDto[];
  checklists: Array<{
    id: string;
    name: string;
    resolved: number;
    unresolved: number;
  }>;
  comments: ClickUpCommentSummaryDto[];
  timeEstimateMs: number | null;
  timeSpentMs: number | null;
  points: number | null;
  startDate: string | null;
  dateCreated: string | null;
  dateDone: string | null;
  dateClosed: string | null;
  attachmentCount: number;
  listName: string | null;
  folderName: string | null;
  spaceName: string | null;
  commentsFetchedAt: string | null;
};

export type ExternalWorkItemDto = {
  id: string;
  provider: ExternalProvider;
  connectionKey: string;
  workspaceId: string | null;
  spaceId: string | null;
  folderId: string | null;
  listId: string | null;
  externalId: string;
  externalParentId: string | null;
  externalUrl: string | null;
  title: string;
  externalStatus: string | null;
  externalPriority: string | null;
  externalUpdatedAt: string | null;
  lastSyncedAt: string | null;
  syncState: ExternalSyncState;
  triageItemId: string | null;
  clickUp?: ClickUpEnrichmentDto;
};

export type ClickUpConnectionDto = {
  id: string;
  name: string;
  workspaceId: string | null;
  workspaceName: string | null;
  hasToken: boolean;
  tokenHint: string | null;
  autoSyncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  webhookConfigured: boolean;
};

export type TriageAttachmentMeta = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type TriageItemDto = {
  id: string;
  title: string;
  description: string | null;
  category: TriageCategory;
  status: TriageStatus;
  nextAction: string | null;
  dueAt: string | null;
  snoozedUntil: string | null;
  assigneeDeveloperId: string;
  /** Set when the API joins the assignee (list/detail). */
  assigneeName?: string;
  /**
   * ClickUp task assignees (may be multiple). Helm primary owner remains
   * assigneeDeveloperId / assigneeName.
   */
  clickUpAssignees?: ClickUpPersonSummaryDto[];
  sourceType: SourceType;
  graphMessageId: string | null;
  graphWebLink: string | null;
  sourcePreview: string | null;
  /** Microsoft To Do list id (when source is microsoft_todo). */
  graphTodoListId: string | null;
  graphTodoTaskId: string | null;
  lastTodoSyncedAt: string | null;
  /** Optional bank or client program label. */
  program: string | null;
  /** Escalated items surface on the priority queue. */
  escalated: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Open age in full days (priority queue and detail when requested). */
  ageDays?: number;
  /** Present on list responses */
  attachmentCount?: number;
  /** Present on GET /api/triage-items/:id */
  attachments?: TriageAttachmentMeta[];
  /** Linked external work items (To Do / ClickUp) when included by API */
  externalWorkItems?: ExternalWorkItemDto[];
};

export type CreateTriageItemInput = {
  title: string;
  description?: string | null;
  category: TriageCategory;
  status?: TriageStatus;
  nextAction?: string | null;
  dueAt?: string | null;
  snoozedUntil?: string | null;
  assigneeDeveloperId: string;
  sourceType?: SourceType;
  graphMessageId?: string | null;
  graphWebLink?: string | null;
  sourcePreview?: string | null;
  program?: string | null;
  escalated?: boolean;
};

export type UpdateTriageItemInput = Partial<
  Omit<CreateTriageItemInput, "assigneeDeveloperId">
> & {
  assigneeDeveloperId?: string;
};

export type TriageListQuery = {
  status?: TriageStatus;
  category?: TriageCategory;
  assigneeDeveloperId?: string;
  dueBefore?: string;
  dueAfter?: string;
  thisWeek?: boolean;
  overdue?: boolean;
  /** Filter by program label (exact match, trimmed) */
  program?: string;
};

export type TriageSummaryDto = {
  byStatus: Record<TriageStatus, number>;
  byCategory: Record<TriageCategory, number>;
  overdueCount: number;
  dueThisWeekCount: number;
};

export const EXPENSE_CATEGORIES = [
  "travel",
  "software",
  "hardware",
  "events",
  "contractor",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseDto = {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  department: string;
  category: string;
  expenseDate: string;
  hasReceipt: boolean;
  receiptName: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export const PLANNING_STATUSES = ["draft", "active", "done", "cancelled"] as const;
export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

export type PlanningItemDto = {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  program: string | null;
  targetDate: string | null;
  status: PlanningStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** When present (detail or list with include), linked triage work. */
  linkedTriage?: { id: string; title: string; category: TriageCategory; status: TriageStatus }[];
};

export const DEV_TEAMS = [
  "backend",
  "qa",
  "frontend_web",
  "frontend_mobile",
] as const;
export type DevTeam = (typeof DEV_TEAMS)[number];

export const ROSTER_POSITIONS = [
  "member",
  "department_head",
  "department_assistant",
] as const;
export type RosterPosition = (typeof ROSTER_POSITIONS)[number];

export type UserSummaryDto = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
};

/** Roster entry for people you assign in triage and place on teams (no app login). */
export type DeveloperDto = {
  id: string;
  displayName: string;
  skills: string | null;
  workEmail: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  skillDetails: string | null;
  achievements: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  tenureLabel: string | null;
  rosterPosition: RosterPosition;
  createdAt: string;
  updatedAt: string;
};

export type DeveloperSummaryDto = {
  id: string;
  displayName: string;
  skills: string | null;
  workEmail: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  skillDetails: string | null;
  achievements: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  tenureLabel: string | null;
  rosterPosition: RosterPosition;
};

export type TeamMembershipDto = {
  id: string;
  team: DevTeam;
  developerId: string;
  isTeamLead: boolean;
  createdAt: string;
  developer: DeveloperSummaryDto;
};

/** GET /api/dashboard-overview — triage-adjacent org metrics */
export type DashboardOverviewDto = {
  periodLabel: string;
  monthRange: { from: string; to: string };
  expenses: {
    monthEntryCount: number;
    /** One entry per currency with spend in that month (never mixed into a single number). */
    byCurrency: { currency: string; total: string }[];
    withReceiptCount: number;
  };
  planning: {
    total: number;
    byStatus: Record<PlanningStatus, number>;
    active: number;
    draft: number;
  };
  teams: {
    totalMemberships: number;
    uniqueDevelopers: number;
    byTeam: Record<DevTeam, number>;
  };
  ops: {
    openBlockerRisk: number;
    escalatedOpen: number;
  };
  workload: {
    rows: {
      developerId: string;
      displayName: string;
      open: number;
      inProgress: number;
    }[];
  };
};

export type StandupCheckInDto = {
  id: string;
  userId: string;
  userDisplayName: string | null;
  userEmail: string;
  weekStart: string;
  priorWork: string;
  nextWork: string;
  blockers: string;
  updatedAt: string;
};

export type StandupWeekResponseDto = {
  weekStart: string;
  weekLabel: string;
  entries: StandupCheckInDto[];
};

export type StandupSuggestionSource =
  | "triage_done"
  | "triage_open"
  | "priority_queue"
  | "peer_checkin";

export type StandupSuggestionDto = {
  id: string;
  label: string;
  triageItemId?: string;
  source: StandupSuggestionSource;
};

export type StandupHelpersDto = {
  weekStart: string;
  suggestions: {
    priorWork: StandupSuggestionDto[];
    nextWork: StandupSuggestionDto[];
    blockers: StandupSuggestionDto[];
  };
  draft: {
    priorWork: string;
    nextWork: string;
    blockers: string;
  };
};

export type StandupRollupDto = {
  weekStart: string;
  weekLabel: string;
  checkIns: {
    totalUsers: number;
    filledCount: number;
    emptyCount: number;
    byUser: {
      userId: string;
      displayName: string | null;
      email: string;
      filled: boolean;
    }[];
  };
  priorityQueue: {
    count: number;
    oldestAgeDays: number | null;
    missingNextActionCount: number;
  };
  triageClosedThisWeek: number;
};

export type PromoteStandupBlockerResultDto = {
  triageItemId: string;
  title: string;
  category: string;
  escalated: boolean;
  status: string;
};

export type TeamDecisionDto = {
  id: string;
  title: string;
  body: string;
  decidedOn: string;
  createdById: string;
  createdByDisplay: string | null;
  relatedTriageItemId: string | null;
  relatedPlanningItemId: string | null;
  relatedTriageTitle?: string | null;
  relatedPlanningTitle?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTeamDecisionInput = {
  title: string;
  body: string;
  decidedOn: string;
  relatedTriageItemId?: string | null;
  relatedPlanningItemId?: string | null;
};

export type SearchResultGroup = {
  triage: { id: string; title: string; category: TriageCategory; status: TriageStatus }[];
  planning: { id: string; title: string; status: PlanningStatus }[];
  developers: { id: string; displayName: string; skills: string | null }[];
  decisions: { id: string; title: string; decidedOn: string }[];
};

export type SearchResponseDto = {
  q: string;
} & SearchResultGroup;

export type MeProfileDto = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  notifyEmailTriage: boolean;
  notifyEmailDigest: boolean;
};

// --- Incidents ---

export type IncidentAttachmentMeta = {
  id: string;
  incidentId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type IncidentInvolvedEmployeeDto = {
  id: string;
  displayName: string;
  workEmail: string | null;
  jobTitle: string | null;
};

export type IncidentDto = {
  id: string;
  incidentNumber: string;
  title: string;
  description: string;
  reporterDeveloperId: string;
  /** Set when the API joins the reporter (list/detail). */
  reporterName?: string;
  involved: IncidentInvolvedEmployeeDto[];
  incidentAt: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Present on list responses */
  attachmentCount?: number;
  /** Present on GET /api/incidents/:id */
  attachments?: IncidentAttachmentMeta[];
};

export type CreateIncidentInput = {
  title: string;
  description: string;
  reporterDeveloperId: string;
  involvedDeveloperIds: string[];
  incidentAt: string;
};

export type UpdateIncidentInput = Partial<CreateIncidentInput>;

export type IncidentListQuery = {
  q?: string;
  reporterDeveloperId?: string;
  involvedDeveloperId?: string;
  from?: string;
  to?: string;
};

// --- Surveys ---

export const SURVEY_STATUSES = [
  "draft",
  "published",
  "closed",
  "archived",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_MAX_QUESTIONS = 10;
export const SURVEY_MIN_QUESTIONS = 1;

/** Which employees are eligible to participate. */
export type SurveyEligibilityRule =
  | { kind: "all" }
  | { kind: "department"; team: DevTeam }
  | { kind: "specific"; developerIds: string[] };

export type SurveyQuestionDto = {
  id: string;
  position: number;
  text: string;
};

/** Invitation info returned to managers (never includes the raw token after publish). */
export type SurveyInvitationDto = {
  id: string;
  developerId: string;
  developerName: string;
  workEmail: string | null;
  used: boolean;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Present only in the publish response / regenerate response (single-use display). */
  token?: string;
};

export type SurveyDto = {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  closesAt: string | null;
  showResultsAfterClose: boolean;
  minResponsesToShow: number;
  publishedAt: string | null;
  closedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  questions: SurveyQuestionDto[];
  eligibleCount: number;
  invitationCount: number;
  usedInvitationCount: number;
  responseCount: number;
  participationPercent: number;
};

export type CreateSurveyInput = {
  title: string;
  description?: string | null;
  questions: { text: string }[];
  eligibility: SurveyEligibilityRule;
  closesAt?: string | null;
  showResultsAfterClose?: boolean;
  minResponsesToShow?: number;
};

export type UpdateSurveyInput = Partial<CreateSurveyInput>;

export type SurveyQuestionResult = {
  questionId: string;
  position: number;
  text: string;
  yes: number;
  no: number;
  total: number;
  yesPercent: number;
  noPercent: number;
};

export type SurveyResultsDto = {
  surveyId: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  publishedAt: string | null;
  closedAt: string | null;
  eligibleCount: number;
  responseCount: number;
  participationPercent: number;
  questionResults: SurveyQuestionResult[];
  /** Whether results are revealed (respects showResultsAfterClose + minResponsesToShow). */
  revealed: boolean;
};

/** Public survey info shown before voting (no results). */
export type PublicSurveyDto = {
  id: string;
  title: string;
  description: string | null;
  closesAt: string | null;
  questions: SurveyQuestionDto[];
};

export type SubmitSurveyInput = {
  answers: Record<string, "yes" | "no">;
};

export * from "./forge.js";
export * from "./pagination.js";
export * from "./catalog/index.js";
