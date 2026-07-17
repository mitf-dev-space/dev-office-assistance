/** Typed failure categories from Forge CONTRACT §8. */
export const FORGE_FAILURE_CATEGORIES = [
  "RepositoryAccessFailed",
  "RepositoryNotApproved",
  "GitReferenceNotFound",
  "GitCheckoutFailed",
  "FlutterSdkUnavailable",
  "UnsupportedFlutterVersion",
  "FlutterDoctorFailed",
  "DependencyRestoreFailed",
  "ConfigurationInvalid",
  "AndroidSigningFailed",
  "AndroidBuildFailed",
  "IosRunnerUnavailable",
  "IosSigningConfigurationMissing",
  "IosCertificateMissing",
  "IosProvisioningProfileMissing",
  "IosBuildFailed",
  "ArtifactMissing",
  "ArtifactValidationFailed",
  "ArtifactUploadFailed",
  "NotificationFailed",
  "RunnerDisconnected",
  "BuildCancelled",
  "BuildTimedOut",
  "WorkspaceCleanupFailed",
  "UnknownFailure",
] as const;

export type ForgeFailureCategory = (typeof FORGE_FAILURE_CATEGORIES)[number];

/** Manual or automatic retry allowed (transient / infra). */
const RETRY_ELIGIBLE: ReadonlySet<ForgeFailureCategory> = new Set([
  "RepositoryAccessFailed",
  "ArtifactUploadFailed",
  "RunnerDisconnected",
  "BuildTimedOut",
  "WorkspaceCleanupFailed",
  "UnknownFailure",
]);

/** Never auto-retry — user may fix config and submit a new request. */
const NO_AUTO_RETRY: ReadonlySet<ForgeFailureCategory> = new Set([
  "RepositoryNotApproved",
  "GitReferenceNotFound",
  "GitCheckoutFailed",
  "FlutterSdkUnavailable",
  "UnsupportedFlutterVersion",
  "FlutterDoctorFailed",
  "DependencyRestoreFailed",
  "ConfigurationInvalid",
  "AndroidSigningFailed",
  "AndroidBuildFailed",
  "IosRunnerUnavailable",
  "IosSigningConfigurationMissing",
  "IosCertificateMissing",
  "IosProvisioningProfileMissing",
  "IosBuildFailed",
  "ArtifactMissing",
  "ArtifactValidationFailed",
  "BuildCancelled",
]);

export function isManualRetryEligible(
  category: ForgeFailureCategory | string | null | undefined,
): boolean {
  if (!category) return false;
  return RETRY_ELIGIBLE.has(category as ForgeFailureCategory);
}

export function isAutoRetryEligible(
  category: ForgeFailureCategory | string | null | undefined,
): boolean {
  if (!category) return false;
  if (NO_AUTO_RETRY.has(category as ForgeFailureCategory)) return false;
  return RETRY_ELIGIBLE.has(category as ForgeFailureCategory);
}
