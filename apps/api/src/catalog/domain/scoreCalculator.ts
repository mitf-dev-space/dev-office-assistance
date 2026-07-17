export type ScoreDimension = {
  key: string;
  score: number;
  maxScore: number;
  explain: string[];
};

export type ScorecardResult = {
  dimensions: ScoreDimension[];
  overall: number;
  criticalGaps: string[];
};

type CheckInput = {
  slug: string;
  status: string;
  isRequired: boolean;
  weight: number;
  category: string;
};

const CATEGORY_KEYS = [
  "ownership",
  "documentation",
  "testing",
  "quality",
  "security",
  "cicd",
  "operations",
] as const;

function statusPoints(status: string, isRequired: boolean): number {
  if (status === "pass" || status === "passing" || status === "detected") return 1;
  if (status === "unknown" || status === "not_applicable" || status === "inherited") return isRequired ? 0.5 : 1;
  if (status === "missing" || status === "fail" || status === "failing") return 0;
  return 0.5;
}

export function calculateScorecard(checks: CheckInput[]): ScorecardResult {
  const dimensions: ScoreDimension[] = [];
  const criticalGaps: string[] = [];

  for (const category of CATEGORY_KEYS) {
    const catChecks = checks.filter((c) => c.category === category);
    if (catChecks.length === 0) continue;

    let earned = 0;
    let max = 0;
    const explain: string[] = [];

    for (const check of catChecks) {
      const w = check.weight || 1;
      max += w;
      const pts = statusPoints(check.status, check.isRequired);
      earned += pts * w;
      if (check.isRequired && pts === 0) {
        criticalGaps.push(check.slug);
        explain.push(`${check.slug}: required check failing or missing`);
      } else if (pts < 1) {
        explain.push(`${check.slug}: ${check.status}`);
      }
    }

    dimensions.push({
      key: category,
      score: max > 0 ? Math.round((earned / max) * 100) : 100,
      maxScore: 100,
      explain,
    });
  }

  const overall =
    dimensions.length > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
      : 0;

  return { dimensions, overall, criticalGaps };
}
