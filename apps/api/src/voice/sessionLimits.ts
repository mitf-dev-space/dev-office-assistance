type Bucket = { windowStart: number; count: number; active: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function assertCanCreateVoiceSession(
  userId: string,
  opts: { maxPerMinute: number; maxConcurrent: number },
): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  let b = buckets.get(userId);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { windowStart: now, count: 0, active: b?.active ?? 0 };
    buckets.set(userId, b);
  }
  if (b.active >= opts.maxConcurrent) {
    return { ok: false, error: "concurrent_session_limit" };
  }
  if (b.count >= opts.maxPerMinute) {
    return { ok: false, error: "rate_limit" };
  }
  b.count += 1;
  b.active += 1;
  return { ok: true };
}

export function releaseVoiceSessionSlot(userId: string): void {
  const b = buckets.get(userId);
  if (!b) return;
  b.active = Math.max(0, b.active - 1);
}

/** Align in-memory concurrent count with DB (orphans after failed WS / crashed clients). */
export function syncVoiceSessionActiveCount(userId: string, activeFromDb: number): void {
  const now = Date.now();
  let b = buckets.get(userId);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { windowStart: now, count: 0, active: 0 };
    buckets.set(userId, b);
  }
  b.active = Math.max(0, activeFromDb);
}

export function resetVoiceSessionLimitsForTests(): void {
  buckets.clear();
}
