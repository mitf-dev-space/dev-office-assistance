import type { Env } from "../env.js";

/** Prefer ClickUp-specific key; fall back to catalog encryption key. */
export function clickUpTokenSecret(env: Env): string | undefined {
  const key = env.CLICKUP_TOKEN_ENCRYPTION_KEY || env.CATALOG_TOKEN_ENCRYPTION_KEY;
  return key || undefined;
}

export function tokenHintFromPlain(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
