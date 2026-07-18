import type { LlmProviderPreset } from "./providerPresets.js";

export type LlmAssistConfig = {
  enabled: boolean;
  apiKey: string | null;
  apiKeyRequired: boolean;
  model: string;
  baseUrl: string;
  providerPreset: LlmProviderPreset;
  supportsJsonMode?: boolean;
  assistLocale: string;
  dailyCap: number;
};

export type AssistSource = "heuristic" | "heuristic+llm" | "llm";

export type TriageSummarizeResult = {
  summary: string;
  bullets: string[];
  source: AssistSource;
};

export type TriageNextActionResult = {
  nextAction: string;
  suggestedPriority: "low" | "normal" | "high" | "urgent";
  rationale: string;
  source: AssistSource;
};

export type StandupDigestResult = {
  digest: string;
  themes: string[];
  blockers: string[];
  source: AssistSource;
};

export type CatalogExplainResult = {
  explanation: string;
  recommendedActions: string[];
  source: AssistSource;
};

export type ForgeExplainFailureResult = {
  summary: string;
  likelyCause: string;
  suggestedFix: string;
  source: AssistSource;
};

export type InsightNarrativeResult = {
  headline: string;
  bullets: string[];
  risks: string[];
};

export type TriageDuplicateCandidate = {
  id: string;
  title: string;
  status: string;
  category: string;
  score: number;
  href: string;
};

export type TriageDuplicatesResult = {
  likelyDuplicates: TriageDuplicateCandidate[];
  recommendation: string;
  source: AssistSource;
};

export type PlanningDraftResult = {
  title: string;
  description: string;
  department: string | null;
  program: string | null;
  rationale: string;
  source: AssistSource;
};

export type DecisionDraftResult = {
  title: string;
  body: string;
  rationale: string;
  source: AssistSource;
};

export type CatalogGapsTopResult = {
  topGaps: Array<{
    id: string;
    title: string;
    priority: string;
    repositoryName: string;
    repositoryId: string;
    why: string;
    href: string;
  }>;
  summary: string;
  source: AssistSource;
};

export type PriorityReorderResult = {
  orderedIds: string[];
  rationale: string;
  bullets: string[];
  source: AssistSource;
};
