import type { SignalState } from "@office/types";

export type SignalLayers = {
  reported?: SignalState | null;
  detected?: SignalState | null;
  override?: SignalState | null;
  overrideExpiresAt?: Date | null;
};

export function resolveEffectiveSignal(layers: SignalLayers, now = new Date()): SignalState {
  if (layers.override && (!layers.overrideExpiresAt || layers.overrideExpiresAt > now)) {
    return "manually_overridden";
  }
  if (layers.detected && layers.detected !== "unknown" && layers.detected !== "stale") {
    return layers.detected;
  }
  if (layers.reported && layers.reported !== "unknown") {
    return layers.reported;
  }
  return layers.detected ?? layers.reported ?? "unknown";
}

export function parseSpreadsheetSignal(raw: string | null | undefined): SignalState {
  const v = raw?.trim();
  if (!v) return "unknown";
  const lower = v.toLowerCase();
  if (lower === "no" || lower === "false") return "declared";
  if (lower === "yes" || lower === "true") return "detected";
  if (lower === "inherited") return "inherited";
  if (lower === "n/a" || lower === "na") return "not_applicable";
  return "unknown";
}

export function parseSpreadsheetPipeline(raw: string | null | undefined): string {
  const v = raw?.trim();
  if (!v) return "unknown";
  return v.toLowerCase();
}

export function isStaleEvidence(detectedAt: Date | null, staleAfter: Date | null, now = new Date()): boolean {
  if (!detectedAt) return false;
  if (staleAfter && now > staleAfter) return true;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return detectedAt < thirtyDaysAgo;
}
