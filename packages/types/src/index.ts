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

export const SOURCE_TYPES = ["outlook", "manual", "microsoft_todo"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

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

export * from "./forge.js";
