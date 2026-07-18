export const USER_ROLES = [
  "lead",
  "assistant",
  "member",
  "forge_mobile_lead",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function canAccessForge(role: string): boolean {
  return role === "lead" || role === "forge_mobile_lead";
}

export function canAdminForge(role: string): boolean {
  return role === "lead" || role === "forge_mobile_lead";
}

/** Forge-only accounts do not use Helm triage/planning nav. */
export function isForgeOnlyUser(role: string): boolean {
  return role === "forge_mobile_lead";
}

export type ForgeDashboardDto = {
  queuedBuilds: number;
  runningBuilds: number;
  waitingForMacOs: number;
  successfulToday: number;
  failedToday: number;
  onlineRunners: number;
  offlineRunners: number;
  moduleStatus: "bootstrap" | "loop5" | "loop10";
};

export type ForgeBuildRequestSummaryDto = {
  id: string;
  applicationName: string;
  bankName: string;
  overallStatus: string;
  gitReference: string;
  createdAt: string;
};

export type ForgeBankDto = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sharedDeliveryPath: string | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
};
