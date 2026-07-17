import type { BranchClassification } from "@office/types";

const MAIN_PATTERNS = [/^(main|master)$/i];
const DEV_PATTERNS = [/^(develop|development|dev)$/i];
const RELEASE_PATTERNS = [/^release\//i, /^releases\//i];
const HOTFIX_PATTERNS = [/^hotfix\//i];
const FEATURE_PATTERNS = [/^feature\//i, /^feat\//i];
const BANK_PATTERNS = [/^bank\//i, /^banks\//i, /bank$/i];

export function classifyBranch(name: string, defaultBranch?: string | null): BranchClassification {
  const n = name.trim();
  if (defaultBranch && n.toLowerCase() === defaultBranch.toLowerCase()) {
    if (MAIN_PATTERNS.some((p) => p.test(n))) return "main";
  }
  if (MAIN_PATTERNS.some((p) => p.test(n))) return "main";
  if (DEV_PATTERNS.some((p) => p.test(n))) return "development";
  if (RELEASE_PATTERNS.some((p) => p.test(n))) return "release";
  if (HOTFIX_PATTERNS.some((p) => p.test(n))) return "hotfix";
  if (FEATURE_PATTERNS.some((p) => p.test(n))) return "feature";
  if (BANK_PATTERNS.some((p) => p.test(n))) return "bank_specific";
  return "unknown";
}

export const DEFAULT_BRANCH_PATTERNS = {
  main: ["main", "master"],
  development: ["develop", "development", "dev/*"],
  feature: ["feature/*", "feat/*"],
  release: ["release/*"],
  hotfix: ["hotfix/*"],
  bank: ["bank/*", "banks/*"],
};
