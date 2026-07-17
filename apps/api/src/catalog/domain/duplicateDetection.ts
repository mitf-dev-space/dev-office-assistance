import { parseRepositoryUrl } from "./urlNormalize.js";

export type DuplicateCandidate = {
  existingRepositoryId: string;
  reason: "same_connection_path" | "same_canonical_url";
};

export function findDuplicateReason(
  connectionId: string,
  normalizedProjectPath: string,
  canonicalUrl: string,
  existing: { id: string; connectionId: string; normalizedProjectPath: string; canonicalUrl: string }[],
  excludeId?: string,
): DuplicateCandidate | null {
  const parsedCanonical = parseRepositoryUrl(canonicalUrl).canonicalUrl.toLowerCase();

  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue;
    if (row.connectionId === connectionId && row.normalizedProjectPath === normalizedProjectPath) {
      return { existingRepositoryId: row.id, reason: "same_connection_path" };
    }
    if (row.canonicalUrl.toLowerCase() === parsedCanonical) {
      return { existingRepositoryId: row.id, reason: "same_canonical_url" };
    }
  }
  return null;
}
