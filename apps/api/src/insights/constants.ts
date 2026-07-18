export const INSIGHT_JOB_KINDS = {
  weeklyOps: "insights.weekly_ops",
  catalogHealth: "insights.catalog_health",
  forgeBuilds: "insights.forge_builds",
  morningBrief: "insights.morning_brief",
  blockerRadar: "insights.blocker_radar",
} as const;

export type InsightJobKind = (typeof INSIGHT_JOB_KINDS)[keyof typeof INSIGHT_JOB_KINDS];

export function isInsightJobKind(kind: string): kind is InsightJobKind {
  return Object.values(INSIGHT_JOB_KINDS).includes(kind as InsightJobKind);
}

export type InsightSnapshotKindName =
  | "weekly_ops"
  | "catalog_health"
  | "forge_builds"
  | "morning_brief"
  | "blocker_radar";

export function insightJobKindToSnapshotKind(kind: InsightJobKind): InsightSnapshotKindName {
  switch (kind) {
    case INSIGHT_JOB_KINDS.weeklyOps:
      return "weekly_ops";
    case INSIGHT_JOB_KINDS.catalogHealth:
      return "catalog_health";
    case INSIGHT_JOB_KINDS.forgeBuilds:
      return "forge_builds";
    case INSIGHT_JOB_KINDS.morningBrief:
      return "morning_brief";
    case INSIGHT_JOB_KINDS.blockerRadar:
      return "blocker_radar";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
