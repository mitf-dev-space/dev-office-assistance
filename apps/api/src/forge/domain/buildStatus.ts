/** Mirrors Prisma `ForgeBuildStatus` — keep in sync with schema. */
export const FORGE_BUILD_STATUSES = [
  "Draft",
  "Queued",
  "WaitingForCompatibleRunner",
  "Claimed",
  "PreparingWorkspace",
  "CloningRepository",
  "Building",
  "Signing",
  "CollectingArtifact",
  "UploadingArtifact",
  "Succeeded",
  "Failed",
  "Cancelled",
  "TimedOut",
  "PartiallySucceeded",
  "InProgress",
  "SimulationCompleted",
] as const;

export type ForgeBuildStatus = (typeof FORGE_BUILD_STATUSES)[number];

export const TERMINAL_BUILD_STATUSES: ReadonlySet<ForgeBuildStatus> = new Set([
  "Succeeded",
  "Failed",
  "Cancelled",
  "TimedOut",
  "SimulationCompleted",
]);

export const ACTIVE_BUILD_STATUSES: ReadonlySet<ForgeBuildStatus> = new Set([
  "Queued",
  "WaitingForCompatibleRunner",
  "Claimed",
  "PreparingWorkspace",
  "CloningRepository",
  "Building",
  "Signing",
  "CollectingArtifact",
  "UploadingArtifact",
  "InProgress",
]);

const ALLOWED_TRANSITIONS: Readonly<Record<ForgeBuildStatus, readonly ForgeBuildStatus[]>> = {
  Draft: ["Queued", "Cancelled"],
  Queued: ["WaitingForCompatibleRunner", "Claimed", "Cancelled"],
  WaitingForCompatibleRunner: ["Claimed", "Cancelled", "TimedOut"],
  Claimed: ["PreparingWorkspace", "Failed", "Cancelled", "TimedOut"],
  PreparingWorkspace: ["CloningRepository", "Failed", "Cancelled", "TimedOut"],
  CloningRepository: ["Building", "Failed", "Cancelled", "TimedOut"],
  Building: ["Signing", "CollectingArtifact", "Failed", "Cancelled", "TimedOut"],
  Signing: ["CollectingArtifact", "Failed", "Cancelled", "TimedOut"],
  CollectingArtifact: ["UploadingArtifact", "Failed", "Cancelled", "TimedOut"],
  UploadingArtifact: ["Succeeded", "SimulationCompleted", "Failed", "Cancelled", "TimedOut"],
  Succeeded: [],
  Failed: [],
  Cancelled: [],
  TimedOut: [],
  PartiallySucceeded: [],
  InProgress: [],
  SimulationCompleted: [],
};

export function isTerminalBuildStatus(status: ForgeBuildStatus): boolean {
  return TERMINAL_BUILD_STATUSES.has(status);
}

export function canTransitionBuildStatus(
  from: ForgeBuildStatus,
  to: ForgeBuildStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertBuildStatusTransition(
  from: ForgeBuildStatus,
  to: ForgeBuildStatus,
): void {
  if (!canTransitionBuildStatus(from, to)) {
    throw new Error(`Invalid build status transition: ${from} → ${to}`);
  }
}

export function isCancellableBuildStatus(status: ForgeBuildStatus): boolean {
  return (
    status === "Draft" ||
    status === "Queued" ||
    status === "WaitingForCompatibleRunner" ||
    status === "Claimed" ||
    status === "PreparingWorkspace" ||
    status === "CloningRepository" ||
    status === "Building" ||
    status === "Signing" ||
    status === "CollectingArtifact" ||
    status === "UploadingArtifact"
  );
}
