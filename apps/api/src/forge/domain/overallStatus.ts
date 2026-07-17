import type { ForgeBuildStatus } from "./buildStatus.js";

export type PlatformBuildSnapshot = {
  platform: "Android" | "iOS";
  status: ForgeBuildStatus;
  simulationOnly: boolean;
};

const WAITING_STATUSES: ReadonlySet<ForgeBuildStatus> = new Set([
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

const SUCCESS_STATUSES: ReadonlySet<ForgeBuildStatus> = new Set([
  "Succeeded",
  "SimulationCompleted",
]);

/**
 * Derives overall request status from independent platform builds (PRD §16 / CONTRACT D7).
 */
export function calculateOverallBuildStatus(
  platforms: PlatformBuildSnapshot[],
): ForgeBuildStatus {
  if (platforms.length === 0) {
    return "Draft";
  }

  const isPlatformSuccess = (p: PlatformBuildSnapshot) =>
    p.status === "Succeeded" ||
    (p.simulationOnly && p.status === "SimulationCompleted");

  if (platforms.every(isPlatformSuccess)) {
    if (platforms.every((p) => !p.simulationOnly)) {
      return "Succeeded";
    }
    return "SimulationCompleted";
  }

  const anyWaiting = platforms.some((p) => WAITING_STATUSES.has(p.status));
  const anySuccess = platforms.some((p) => SUCCESS_STATUSES.has(p.status));
  const anyFailed = platforms.some(
    (p) => p.status === "Failed" || p.status === "TimedOut",
  );
  const allCancelled = platforms.every((p) => p.status === "Cancelled");

  if (allCancelled) {
    return "Cancelled";
  }

  if (anySuccess && anyFailed) {
    return "PartiallySucceeded";
  }

  if (anySuccess && anyWaiting) {
    return "InProgress";
  }

  if (platforms.every((p) => p.status === "Failed" || p.status === "TimedOut")) {
    return "Failed";
  }

  if (anyWaiting) {
    return "InProgress";
  }

  if (platforms.some((p) => p.status === "Queued")) {
    return "Queued";
  }

  return "InProgress";
}
