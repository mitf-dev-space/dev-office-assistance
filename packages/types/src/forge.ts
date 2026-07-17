export const USER_ROLES = [
  "lead",
  "assistant",
  "member",
  "forge_admin",
  "forge_pm",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function canAccessForge(role: string): boolean {
  return role === "lead" || role === "forge_admin" || role === "forge_pm";
}

export function canAdminForge(role: string): boolean {
  return role === "lead" || role === "forge_admin";
}

/** Forge-only accounts do not use Helm triage/planning nav. */
export function isForgeOnlyUser(role: string): boolean {
  return role === "forge_admin" || role === "forge_pm";
}

export type ForgeDashboardDto = {
  queuedBuilds: number;
  runningBuilds: number;
  waitingForMacOs: number;
  successfulToday: number;
  failedToday: number;
  onlineRunners: number;
  offlineRunners: number;
  moduleStatus: "bootstrap";
};

export type ForgeBuildRequestSummaryDto = {
  id: string;
  applicationName: string;
  bankName: string;
  overallStatus: string;
  createdAt: string;
};
