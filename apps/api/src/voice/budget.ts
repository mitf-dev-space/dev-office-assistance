/** In-process daily USD spend tracker for voice reasoning (process-local). */

type DayBucket = { day: string; usd: number };

const byUser = new Map<string, DayBucket>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getVoiceSpendUsd(userId: string): number {
  const b = byUser.get(userId);
  if (!b || b.day !== todayKey()) return 0;
  return b.usd;
}

export function addVoiceSpendUsd(userId: string, usd: number): number {
  const day = todayKey();
  const prev = byUser.get(userId);
  const next = !prev || prev.day !== day ? 0 : prev.usd;
  const total = next + Math.max(0, usd);
  byUser.set(userId, { day, usd: total });
  return total;
}

export function resetVoiceSpendForTests(): void {
  byUser.clear();
}

export function estimateOpenRouterCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  /** USD per 1M tokens */
  inputPerMillion?: number;
  outputPerMillion?: number;
}): number {
  const inRate = input.inputPerMillion ?? 0.15;
  const outRate = input.outputPerMillion ?? 0.6;
  return (input.inputTokens / 1_000_000) * inRate + (input.outputTokens / 1_000_000) * outRate;
}
