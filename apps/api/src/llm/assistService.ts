import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { buildSystemPrompt, buildUserPayload, type AssistOp } from "./assistPrompts.js";
import {
  heuristicCatalogExplain,
  heuristicCatalogGapsTop,
  heuristicDecisionDraft,
  heuristicForgeExplainFailure,
  heuristicPlanningDraft,
  heuristicPriorityReorder,
  heuristicStandupDigest,
  heuristicTriageDuplicates,
  heuristicTriageNextAction,
  heuristicTriageSummarize,
} from "./heuristics.js";
import { openAiCompatibleChatJson, redactForLlm } from "./openaiCompatible.js";
import type {
  CatalogExplainResult,
  CatalogGapsTopResult,
  DecisionDraftResult,
  ForgeExplainFailureResult,
  InsightNarrativeResult,
  PlanningDraftResult,
  PriorityReorderResult,
  StandupDigestResult,
  TriageDuplicatesResult,
  TriageNextActionResult,
  TriageSummarizeResult,
} from "./types.js";
import { consumeUsage, DailyCapExceededError } from "./usageGuard.js";
import { resolveWorkspaceLlmConfig, USAGE_SCOPE } from "./workspaceSettings.js";

async function withOptionalLlm<THeuristic extends { source: string }, TLlm extends object>(
  prisma: PrismaClient,
  env: Env,
  op: AssistOp,
  heuristic: THeuristic,
  userPayload: string,
  merge: (h: THeuristic, llm: TLlm | null) => THeuristic,
): Promise<THeuristic> {
  const config = await resolveWorkspaceLlmConfig(prisma, env);
  if (!config) return heuristic;

  try {
    consumeUsage(USAGE_SCOPE, config.dailyCap);
  } catch (err) {
    if (err instanceof DailyCapExceededError) throw err;
    throw err;
  }

  const system = buildSystemPrompt(op, config.assistLocale);
  const framed = buildUserPayload(op, JSON.parse(userPayload) as unknown, heuristic);
  const { data } = await openAiCompatibleChatJson<TLlm>(
    config,
    system,
    redactForLlm(framed),
  );
  return merge(heuristic, data);
}

export async function assistTriageSummarize(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicTriageSummarize>[0],
): Promise<TriageSummarizeResult> {
  const heuristic = heuristicTriageSummarize(input);
  return withOptionalLlm(
    prisma,
    env,
    "triage_summarize",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as { summary?: string; bullets?: string[] };
      if (!row.summary) return h;
      return {
        summary: row.summary,
        bullets: Array.isArray(row.bullets) ? row.bullets.map(String).slice(0, 6) : h.bullets,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistTriageNextAction(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicTriageNextAction>[0],
): Promise<TriageNextActionResult> {
  const heuristic = heuristicTriageNextAction(input);
  return withOptionalLlm(
    prisma,
    env,
    "triage_next_action",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as {
        nextAction?: string;
        suggestedPriority?: TriageNextActionResult["suggestedPriority"];
        rationale?: string;
      };
      if (!row.nextAction) return h;
      const pri = row.suggestedPriority;
      const okPri =
        pri === "low" || pri === "normal" || pri === "high" || pri === "urgent"
          ? pri
          : h.suggestedPriority;
      return {
        nextAction: row.nextAction,
        suggestedPriority: okPri,
        rationale: row.rationale?.trim() || h.rationale,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistStandupDigest(
  prisma: PrismaClient,
  env: Env,
  checkIns: Parameters<typeof heuristicStandupDigest>[0],
): Promise<StandupDigestResult> {
  const heuristic = heuristicStandupDigest(checkIns);
  return withOptionalLlm(
    prisma,
    env,
    "standup_digest",
    heuristic,
    JSON.stringify({ checkIns }),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as { digest?: string; themes?: string[]; blockers?: string[] };
      if (!row.digest) return h;
      return {
        digest: row.digest,
        themes: Array.isArray(row.themes) ? row.themes.map(String) : h.themes,
        blockers: Array.isArray(row.blockers) ? row.blockers.map(String) : h.blockers,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistCatalogExplain(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicCatalogExplain>[0],
): Promise<CatalogExplainResult> {
  const heuristic = heuristicCatalogExplain(input);
  return withOptionalLlm(
    prisma,
    env,
    "catalog_explain",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as { explanation?: string; recommendedActions?: string[] };
      if (!row.explanation) return h;
      return {
        explanation: row.explanation,
        recommendedActions: Array.isArray(row.recommendedActions)
          ? row.recommendedActions.map(String).slice(0, 6)
          : h.recommendedActions,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistForgeExplainFailure(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicForgeExplainFailure>[0],
): Promise<ForgeExplainFailureResult> {
  const heuristic = heuristicForgeExplainFailure(input);
  return withOptionalLlm(
    prisma,
    env,
    "forge_explain_failure",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as {
        summary?: string;
        likelyCause?: string;
        suggestedFix?: string;
      };
      if (!row.summary) return h;
      return {
        summary: row.summary,
        likelyCause: row.likelyCause?.trim() || h.likelyCause,
        suggestedFix: row.suggestedFix?.trim() || h.suggestedFix,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistTriageDuplicates(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicTriageDuplicates>[0],
): Promise<TriageDuplicatesResult> {
  const heuristic = heuristicTriageDuplicates(input);
  return withOptionalLlm(
    prisma,
    env,
    "triage_duplicates",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as {
        likelyDuplicates?: TriageDuplicatesResult["likelyDuplicates"];
        recommendation?: string;
      };
      const allowed = new Set(h.likelyDuplicates.map((d) => d.id));
      const merged = Array.isArray(row.likelyDuplicates)
        ? row.likelyDuplicates.filter((d) => d && allowed.has(d.id)).slice(0, 5)
        : h.likelyDuplicates;
      return {
        likelyDuplicates: merged.length ? merged : h.likelyDuplicates,
        recommendation: row.recommendation?.trim() || h.recommendation,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistPlanningDraft(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicPlanningDraft>[0],
): Promise<PlanningDraftResult> {
  const heuristic = heuristicPlanningDraft(input);
  return withOptionalLlm(
    prisma,
    env,
    "planning_draft",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as Partial<PlanningDraftResult>;
      if (!row.title?.trim()) return h;
      return {
        title: row.title.trim(),
        description: row.description?.trim() || h.description,
        department: row.department ?? h.department,
        program: row.program ?? h.program,
        rationale: row.rationale?.trim() || h.rationale,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistDecisionDraft(
  prisma: PrismaClient,
  env: Env,
  input: Parameters<typeof heuristicDecisionDraft>[0],
): Promise<DecisionDraftResult> {
  const heuristic = heuristicDecisionDraft(input);
  return withOptionalLlm(
    prisma,
    env,
    "decision_draft",
    heuristic,
    JSON.stringify(input),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as Partial<DecisionDraftResult>;
      if (!row.title?.trim() || !row.body?.trim()) return h;
      return {
        title: row.title.trim(),
        body: row.body.trim(),
        rationale: row.rationale?.trim() || h.rationale,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistCatalogGapsTop(
  prisma: PrismaClient,
  env: Env,
  gaps: Parameters<typeof heuristicCatalogGapsTop>[0],
): Promise<CatalogGapsTopResult> {
  const heuristic = heuristicCatalogGapsTop(gaps);
  return withOptionalLlm(
    prisma,
    env,
    "catalog_gaps_top",
    heuristic,
    JSON.stringify({ gaps }),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as Partial<CatalogGapsTopResult>;
      const allowed = new Set(h.topGaps.map((g) => g.id));
      const topGaps = Array.isArray(row.topGaps)
        ? row.topGaps.filter((g) => g && allowed.has(g.id)).slice(0, 3)
        : h.topGaps;
      return {
        topGaps: topGaps.length ? topGaps : h.topGaps,
        summary: row.summary?.trim() || h.summary,
        source: "heuristic+llm",
      };
    },
  );
}

export async function assistPriorityReorder(
  prisma: PrismaClient,
  env: Env,
  items: Parameters<typeof heuristicPriorityReorder>[0],
): Promise<PriorityReorderResult> {
  const heuristic = heuristicPriorityReorder(items);
  return withOptionalLlm(
    prisma,
    env,
    "priority_reorder",
    heuristic,
    JSON.stringify({ items }),
    (h, llm) => {
      if (!llm || typeof llm !== "object") return h;
      const row = llm as Partial<PriorityReorderResult>;
      const allowed = new Set(h.orderedIds);
      const orderedIds = Array.isArray(row.orderedIds)
        ? row.orderedIds.filter((id) => allowed.has(id))
        : [];
      // Must be a permutation — fall back if incomplete.
      if (orderedIds.length !== h.orderedIds.length) return h;
      return {
        orderedIds,
        rationale: row.rationale?.trim() || h.rationale,
        bullets: Array.isArray(row.bullets) ? row.bullets.map(String).slice(0, 8) : h.bullets,
        source: "heuristic+llm",
      };
    },
  );
}

export async function generateInsightNarrative(
  prisma: PrismaClient,
  env: Env,
  kind: string,
  metrics: unknown,
): Promise<{ narrative: InsightNarrativeResult | null; llmUsed: boolean }> {
  const config = await resolveWorkspaceLlmConfig(prisma, env);
  if (!config) return { narrative: null, llmUsed: false };

  try {
    consumeUsage(USAGE_SCOPE, config.dailyCap);
  } catch (err) {
    if (err instanceof DailyCapExceededError) return { narrative: null, llmUsed: false };
    throw err;
  }

  const system = buildSystemPrompt("insight_narrative", config.assistLocale);
  const framed = buildUserPayload(
    "insight_narrative",
    { kind, metrics },
    {
      headline: `${kind.replace(/_/g, " ")} needs attention`,
      bullets: ["Interpret the supplied metrics only."],
      risks: [],
    },
  );
  const { data } = await openAiCompatibleChatJson<InsightNarrativeResult>(
    config,
    system,
    redactForLlm(framed),
  );
  if (!data?.headline) return { narrative: null, llmUsed: false };
  return {
    narrative: {
      headline: data.headline,
      bullets: Array.isArray(data.bullets) ? data.bullets.map(String).slice(0, 8) : [],
      risks: Array.isArray(data.risks) ? data.risks.map(String).slice(0, 5) : [],
    },
    llmUsed: true,
  };
}

export { DailyCapExceededError };
