import { createHash, randomBytes } from "node:crypto";

/**
 * Cryptographically secure random invitation token. Never stored or logged in
 * raw form — only its SHA-256 hash is persisted.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex hash of a raw token. This is the only form stored in the DB. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Rounds a timestamp to the hour. Used for the anonymous response submission
 * time so it cannot be correlated with the precise invitation usage time.
 */
export function roundedSubmissionTime(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d;
}
