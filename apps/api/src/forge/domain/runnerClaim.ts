import type { ForgePlatform } from "@prisma/client";

/** Platforms a runner may claim given OS + advertised supported platforms. */
export function claimablePlatformsForRunner(
  operatingSystem: string,
  supportedPlatforms: readonly ForgePlatform[] | readonly string[],
): ForgePlatform[] {
  const platforms: ForgePlatform[] = [];
  for (const p of supportedPlatforms) {
    if (p === "Android" || p === "iOS") platforms.push(p);
  }
  if (operatingSystem === "macOS") {
    return platforms;
  }
  // Real iOS IPA requires macOS — Windows/Linux must never claim iOS jobs.
  return platforms.filter((p) => p !== "iOS");
}

export function runnerCanClaimPlatform(
  operatingSystem: string,
  supportedPlatforms: readonly ForgePlatform[] | readonly string[],
  platform: ForgePlatform | string,
): boolean {
  return claimablePlatformsForRunner(operatingSystem, supportedPlatforms).includes(
    platform as ForgePlatform,
  );
}
