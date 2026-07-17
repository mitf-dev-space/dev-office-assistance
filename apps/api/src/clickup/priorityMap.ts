import type { TriageCategory } from "@prisma/client";

export type PriorityMapResult = {
  category: TriageCategory | null;
  escalated: boolean;
};

export function mapClickUpPriority(
  priority: string | null | undefined,
  mappings: Array<{
    clickUpPriority: string;
    triageCategory: TriageCategory | null;
    escalated: boolean;
  }>,
): PriorityMapResult {
  if (!priority) return { category: null, escalated: false };
  const exact = mappings.find(
    (m) => m.clickUpPriority.toLowerCase() === priority.toLowerCase(),
  );
  if (exact) {
    return { category: exact.triageCategory, escalated: exact.escalated };
  }
  const p = priority.toLowerCase();
  if (p === "urgent" || p === "1") return { category: "blocker", escalated: true };
  if (p === "high" || p === "2") return { category: "risk", escalated: false };
  return { category: null, escalated: false };
}
