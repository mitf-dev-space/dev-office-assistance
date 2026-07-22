export type StandupSuggestionSource =
  | "triage_done"
  | "triage_open"
  | "priority_queue"
  | "peer_checkin";

export type StandupSuggestion = {
  id: string;
  label: string;
  triageItemId?: string;
  source: StandupSuggestionSource;
};

export type StandupDraft = {
  priorWork: string;
  nextWork: string;
  blockers: string;
};

const DRAFT_LIMIT = 8;

/** Inclusive Monday start → exclusive next Monday (local). */
export function weekBounds(weekStart: Date): { start: Date; end: Date } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export function isCheckInFilled(entry: {
  priorWork: string;
  nextWork: string;
  blockers: string;
}): boolean {
  return Boolean(
    entry.priorWork.trim() || entry.nextWork.trim() || entry.blockers.trim(),
  );
}

export function formatSuggestionBullets(
  suggestions: StandupSuggestion[],
  limit = DRAFT_LIMIT,
): string {
  return suggestions
    .slice(0, limit)
    .map((s) => `- ${s.label}`)
    .join("\n");
}

export function buildStandupDraft(input: {
  priorWork: StandupSuggestion[];
  nextWork: StandupSuggestion[];
  blockers: StandupSuggestion[];
}): StandupDraft {
  return {
    priorWork: formatSuggestionBullets(input.priorWork),
    nextWork: formatSuggestionBullets(input.nextWork),
    blockers: formatSuggestionBullets(input.blockers),
  };
}

/** Merge unique labels into existing field text (append missing bullets). */
export function mergeFieldText(existing: string, addition: string): string {
  const base = existing.trim();
  const add = addition.trim();
  if (!add) return existing;
  if (!base) return add;
  const existingLines = new Set(
    base
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s*/, "").trim().toLowerCase())
      .filter(Boolean),
  );
  const extra = add
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.replace(/^\s*[-*]\s*/, "").trim().toLowerCase();
      return key && !existingLines.has(key);
    });
  if (!extra.length) return existing;
  return `${base}\n${extra.join("\n")}`;
}

export function ageDaysFrom(createdAt: Date, now = new Date()): number {
  const ageMs = now.getTime() - createdAt.getTime();
  return Math.max(0, Math.floor(ageMs / 86_400_000));
}

export function suggestionFromTriage(
  item: { id: string; title: string },
  source: Extract<StandupSuggestionSource, "triage_done" | "triage_open" | "priority_queue">,
): StandupSuggestion {
  return {
    id: `${source}:${item.id}`,
    label: item.title.trim() || "(untitled)",
    triageItemId: item.id,
    source,
  };
}

export function suggestionFromPeerBlocker(
  userId: string,
  displayName: string | null,
  email: string,
  blockersText: string,
): StandupSuggestion[] {
  const name = displayName?.trim() || email;
  return blockersText
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, DRAFT_LIMIT)
    .map((line, i) => ({
      id: `peer_checkin:${userId}:${i}`,
      label: `${name}: ${line}`,
      source: "peer_checkin" as const,
    }));
}

/** Defaults applied when promoting a check-in blocker into triage. */
export function promoteBlockerDefaults(input: {
  title: string;
  notes?: string | null;
  weekLabel: string;
}): {
  title: string;
  description: string;
  category: "blocker";
  status: "inbox";
  escalated: true;
  sourceType: "manual";
} {
  const title = input.title.trim();
  const notes = input.notes?.trim() || null;
  const descriptionParts = [
    notes,
    `Promoted from leadership check-in (week of ${input.weekLabel}).`,
  ].filter(Boolean);
  return {
    title,
    description: descriptionParts.join("\n\n"),
    category: "blocker",
    status: "inbox",
    escalated: true,
    sourceType: "manual",
  };
}
