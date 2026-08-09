/** Pure helpers for the Surveys feature (kept testable without React). */

export function participationPercent(responseCount: number, eligibleCount: number): number {
  if (eligibleCount <= 0) return 0;
  return Math.round((responseCount / eligibleCount) * 100);
}

export function buildVotingUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/survey/respond/${token}`;
}

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "survey"
  );
}
