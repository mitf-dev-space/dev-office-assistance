import type { SignalState } from "@office/types";

export type ParsedUnitTestCell = {
  state: SignalState;
  coveragePercent?: number;
  sharedCoreName?: string;
};

/** Normalize branch cells: blank, dashes → null (unknown at import time). */
export function parseSpreadsheetBranch(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^-+$/.test(v.replace(/\s/g, ""))) return null;
  return v;
}

export function parseSpreadsheetPipeline(raw: string | null | undefined): string {
  const v = raw?.trim();
  if (!v) return "unknown";
  return v.toLowerCase();
}

export function parseSpreadsheetStaticAnalysis(raw: string | null | undefined): SignalState {
  const v = raw?.trim();
  if (!v) return "unknown";
  const lower = v.toLowerCase();
  if (lower === "no") return "declared";
  if (lower === "yes") return "detected";
  return "unknown";
}

export function parseSpreadsheetUnitTests(raw: string | null | undefined): ParsedUnitTestCell {
  const v = raw?.trim();
  if (!v) return { state: "unknown" };

  const lower = v.toLowerCase();
  if (lower === "no") return { state: "declared" };
  if (lower === "yes") return { state: "detected" };
  if (lower.includes("included in core mobile banking")) {
    return { state: "inherited", sharedCoreName: "Core Mobile Banking" };
  }
  if (lower.includes("included in payment core") || lower.includes("payment core")) {
    return { state: "inherited", sharedCoreName: "Payment core" };
  }
  if (lower.includes("starting from scratch")) return { state: "missing" };

  const pctMatch = v.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    return { state: "detected", coveragePercent: parseFloat(pctMatch[1]) };
  }

  return { state: "unknown" };
}

export function isUnpreparedProject(notes: string | null | undefined, mainBranch: string | null, devBranch: string | null): boolean {
  const n = (notes ?? "").trim();
  if (n.includes("لم يتم تجهيز") || n.includes("لم يجهز")) return true;
  if (!mainBranch && !devBranch && !n) return false;
  return false;
}
