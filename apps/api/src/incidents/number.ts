/**
 * Pure helper for generating the next incident number from the current highest
 * number. Kept separate from the route so it can be unit-tested without a DB.
 */
export function nextIncidentNumberFrom(current: string | null | undefined): string {
  let seq = 1;
  if (current) {
    const m = /^INC-(\d+)$/.exec(current);
    if (m) seq = Number.parseInt(m[1], 10) + 1;
  }
  return `INC-${String(seq).padStart(4, "0")}`;
}
