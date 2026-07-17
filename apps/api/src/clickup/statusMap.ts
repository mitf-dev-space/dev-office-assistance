import type { TriageStatus } from "@prisma/client";
import { defaultClickUpStatusToTriage } from "./normalize.js";

export function mapClickUpStatus(
  clickUpStatus: string | null | undefined,
  mappings: Array<{ clickUpStatus: string; triageStatus: TriageStatus }>,
): TriageStatus {
  if (!clickUpStatus) return "inbox";
  const exact = mappings.find(
    (m) => m.clickUpStatus.toLowerCase() === clickUpStatus.toLowerCase(),
  );
  if (exact) return exact.triageStatus;
  return defaultClickUpStatusToTriage(clickUpStatus);
}

export function triageStatusToClickUpStatus(
  triage: TriageStatus,
  mappings: Array<{ clickUpStatus: string; triageStatus: TriageStatus }>,
): string | null {
  const hit = mappings.find((m) => m.triageStatus === triage);
  return hit?.clickUpStatus ?? null;
}
