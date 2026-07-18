type DayBucket = {
  dayKey: string;
  count: number;
};

const buckets = new Map<string, DayBucket>();

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function nextUtcMidnight(d = new Date()): Date {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next;
}

export type UsageSnapshot = {
  usedToday: number;
  dailyCap: number;
  remaining: number;
  resetsAtUtc: string;
};

export function getUsageSnapshot(scopeKey: string, dailyCap: number): UsageSnapshot {
  const dayKey = utcDayKey();
  const bucket = buckets.get(scopeKey);
  const used = bucket && bucket.dayKey === dayKey ? bucket.count : 0;
  return {
    usedToday: used,
    dailyCap,
    remaining: Math.max(0, dailyCap - used),
    resetsAtUtc: nextUtcMidnight().toISOString(),
  };
}

export class DailyCapExceededError extends Error {
  readonly usage: UsageSnapshot;
  constructor(usage: UsageSnapshot) {
    super("daily_cap_exceeded");
    this.name = "DailyCapExceededError";
    this.usage = usage;
  }
}

/** Consume one call; throws DailyCapExceededError if over cap. */
export function consumeUsage(scopeKey: string, dailyCap: number): UsageSnapshot {
  const dayKey = utcDayKey();
  let bucket = buckets.get(scopeKey);
  if (!bucket || bucket.dayKey !== dayKey) {
    bucket = { dayKey, count: 0 };
    buckets.set(scopeKey, bucket);
  }
  if (bucket.count >= dailyCap) {
    throw new DailyCapExceededError(getUsageSnapshot(scopeKey, dailyCap));
  }
  bucket.count += 1;
  return getUsageSnapshot(scopeKey, dailyCap);
}

export function resetUsageForTests(): void {
  buckets.clear();
}
