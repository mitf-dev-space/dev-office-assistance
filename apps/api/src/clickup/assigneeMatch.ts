export type ClickUpAssigneeInfo = {
  id?: string | number;
  username?: string | null;
  email?: string | null;
};

export type DeveloperMatchRow = {
  id: string;
  displayName: string;
  workEmail: string | null;
};

/**
 * Resolve a Helm developer id from ClickUp assignees only:
 * 1) explicit ClickUpUserMapping
 * 2) email / username heuristics against Developer.workEmail
 * 3) list defaultAssigneeId when ClickUp has no assignees (optional)
 *
 * Never uses task creator — that falsely assigns every unassigned task to the importer.
 */
export function resolveAssigneeDeveloperId(opts: {
  clickUpAssigneeIds: string[];
  assignees?: ClickUpAssigneeInfo[];
  userMappings: Array<{ clickUpUserId: string; developerId: string }>;
  developers: DeveloperMatchRow[];
  defaultAssigneeId: string | null | undefined;
}): string | null {
  for (const cu of opts.clickUpAssigneeIds) {
    const m = opts.userMappings.find((u) => u.clickUpUserId === cu);
    if (m) return m.developerId;
  }

  const candidates = opts.assignees ?? [];
  let best: { developerId: string; score: number } | null = null;
  for (const person of candidates) {
    const hit = matchDeveloper(person, opts.developers);
    if (!hit) continue;
    if (!best || hit.score > best.score) best = hit;
  }
  if (best && best.score >= 40) return best.developerId;

  // Only apply list default when ClickUp itself has no assignees.
  if (candidates.length === 0) return opts.defaultAssigneeId ?? null;
  return null;
}

export function matchDeveloper(
  person: ClickUpAssigneeInfo,
  developers: DeveloperMatchRow[],
): { developerId: string; score: number } | null {
  const email = (person.email ?? "").trim().toLowerCase();
  const username = (person.username ?? "").trim().toLowerCase();
  const tokens = username.split(/[\s._-]+/).filter((t) => t.length >= 3);

  let best: { developerId: string; score: number } | null = null;
  for (const d of developers) {
    const work = (d.workEmail ?? "").trim().toLowerCase();
    if (!work && !d.displayName) continue;
    let score = 0;

    if (email && work && email === work) score = 100;
    else if (email && work) {
      const el = email.split("@")[0] ?? "";
      const wl = work.split("@")[0] ?? "";
      if (el && el === wl) score = 90;
      else if (el.length >= 4 && (wl.includes(el) || el.includes(wl))) score = 70;
    }

    if (score < 100) {
      const workLocal = work.split("@")[0] ?? "";
      const parts = workLocal.split(/[._-]/).filter(Boolean);
      for (const token of tokens) {
        if (token.length >= 4 && work.includes(token)) score = Math.max(score, 55);
        // e.sowan ↔ "essra sowan" / y.belkher ↔ "younes belkher"
        // Require meaningful email local segments (skip single-letter "a." prefixes).
        if (
          parts.some(
            (p) =>
              p.length >= 3 &&
              (p === token ||
                (token.length >= 3 && p.startsWith(token)) ||
                (p.length >= 4 && token.startsWith(p))),
          )
        ) {
          score = Math.max(score, 60);
        }
        // ClickUp typo variants: Almebahi ↔ almesbahi
        if (parts.some((p) => nearMatch(p, token))) {
          score = Math.max(score, 65);
        }
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { developerId: d.id, score };
    }
  }
  return best;
}

/** True when strings are equal or off by one edit (common ClickUp username typos). */
function nearMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 5 || b.length < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  edits += a.length - i + (b.length - j);
  return edits <= 1;
}
