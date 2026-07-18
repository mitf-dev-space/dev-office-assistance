import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const b64 = Buffer.from(trimmed, "base64");
  if (b64.length === 32) return b64;
  // Fall back: derive a stable 32-byte key from any non-empty secret string (dev).
  if (trimmed.length >= 16) {
    const buf = Buffer.alloc(32);
    Buffer.from(trimmed, "utf8").copy(buf);
    return buf;
  }
  return null;
}

let cachedKey: Buffer | null | undefined;

export function resolveLlmEncryptionKey(env: {
  HELM_SECRET_ENCRYPTION_KEY?: string;
  CATALOG_TOKEN_ENCRYPTION_KEY?: string;
  NODE_ENV?: string;
  HELM_LLM_MOCK?: string;
}): Buffer {
  if (cachedKey !== undefined && cachedKey !== null) return cachedKey;

  const fromEnv =
    parseEncryptionKey(env.HELM_SECRET_ENCRYPTION_KEY) ??
    parseEncryptionKey(env.CATALOG_TOKEN_ENCRYPTION_KEY);

  if (fromEnv) {
    cachedKey = fromEnv;
    return fromEnv;
  }

  if (env.NODE_ENV === "production" && env.HELM_LLM_MOCK !== "1" && env.HELM_LLM_MOCK !== "true") {
    throw new Error(
      "HELM_SECRET_ENCRYPTION_KEY is required in production (32-byte base64 or 64-char hex)",
    );
  }

  cachedKey = Buffer.alloc(32, "helm-dev-cipher-key-not-for-prod!!");
  return cachedKey;
}

/** Reset cache between tests. */
export function resetLlmEncryptionKeyCache(): void {
  cachedKey = undefined;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function apiKeyHint(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
