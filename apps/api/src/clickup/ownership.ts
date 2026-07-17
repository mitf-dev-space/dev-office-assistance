/**
 * Field ownership: ClickUp owns external preview fields; Helm owns category/escalation/planning
 * unless list mapping explicitly syncs status/due/assignee.
 */

export type SyncOwnershipFlags = {
  syncStatusToTriage: boolean;
  syncDueToTriage: boolean;
  syncAssigneeToTriage: boolean;
};

export const DEFAULT_SYNC_OWNERSHIP: SyncOwnershipFlags = {
  syncStatusToTriage: true,
  syncDueToTriage: true,
  syncAssigneeToTriage: true,
};

/** Fields never overwritten by inbound ClickUp sync. */
export const HELM_OWNED_TRIAGE_FIELDS = [
  "escalated",
  "program",
  "nextAction",
  "planningLinks",
  "teamDecisions",
] as const;
