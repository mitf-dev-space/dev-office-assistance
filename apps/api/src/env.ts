import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

/** Coalesce ASP.NET-style Smtp__* vars into SMTP_* (documented in ENVIRONMENT.md). */
function applyLegacySmtpAliases(): void {
  const pairs: Array<[target: string, source: string]> = [
    ["SMTP_HOST", "Smtp__Host"],
    ["SMTP_PORT", "Smtp__Port"],
    ["SMTP_USER", "Smtp__Username"],
    ["SMTP_PASSWORD", "Smtp__Password"],
    ["SMTP_FROM", "Smtp__FromEmail"],
  ];
  for (const [target, source] of pairs) {
    if (!process.env[target] && process.env[source]) {
      process.env[target] = process.env[source];
    }
  }
  if (!process.env.SMTP_SECURE && process.env.Smtp__EnableSsl) {
    process.env.SMTP_SECURE = process.env.Smtp__EnableSsl;
  }
}

applyLegacySmtpAliases();

const WEAK_JWT_PATTERNS = [
  "change-me-to-a-long-random-secret",
  "change-me",
  "change_me",
  "replace-with-a-random-secret",
  "replace-with",
  "ci-test-jwt-secret",
  "replace_with_random_secret_at_least_32_chars_long",
];

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin.trim());
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be at least 32 characters"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  /** Directory for uploaded triage / expense files (created if missing) */
  UPLOAD_DIR: z.string().default("data/uploads"),
  /** Per-file size limit in bytes (default 25 MB) */
  MAX_UPLOAD_BYTES: z.coerce.number().default(25 * 1024 * 1024),
  /** Fallback Microsoft 365 / Entra IDs when the database row is empty (superseded by values saved in the app UI). */
  M365_TENANT_ID: z.string().optional().default(""),
  M365_CLIENT_ID: z.string().optional().default(""),
  FORGE_ARTIFACTS_ROOT: z.string().default("data/forge-artifacts"),
  FORGE_WORKSPACES_ROOT: z.string().default("data/forge-workspaces"),
  FORGE_MAX_ARTIFACT_BYTES: z.coerce.number().default(200 * 1024 * 1024),
  FORGE_RUNNER_TOKEN_PEPPER: z.string().min(32).optional(),
  FORGE_ALLOW_IOS_SIMULATION: z.coerce.boolean().default(false),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  APP_PUBLIC_URL: z.string().optional().default(""),
  GITLAB_CONNECTION_NAME: z.string().optional().default("gitlab-internal"),
  GITLAB_BASE_URL: z.string().optional().default("http://10.10.20.51"),
  GITLAB_API_URL: z.string().optional().default(""),
  GITLAB_ACCESS_TOKEN: z.string().optional().default(""),
  GITLAB_WEBHOOK_SECRET: z.string().optional().default(""),
  GITLAB_TLS_CA_FILE: z.string().optional().default(""),
  GITHUB_CONNECTION_NAME: z.string().optional().default("github-cloud"),
  GITHUB_API_URL: z.string().optional().default("https://api.github.com"),
  GITHUB_BASE_URL: z.string().optional().default("https://github.com"),
  GITHUB_ACCESS_TOKEN: z.string().optional().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().optional().default(""),
  CATALOG_SYNC_ENABLED: z.coerce.boolean().default(true),
  CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().default(30),
  CATALOG_REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),
  CATALOG_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  CLICKUP_API_BASE_URL: z.string().optional().default("https://api.clickup.com/api/v2"),
  CLICKUP_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  CLICKUP_ACCESS_TOKEN: z.string().optional().default(""),
  CLICKUP_SYNC_ENABLED: z.coerce.boolean().default(true),
  CLICKUP_SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
  CLICKUP_MAX_PAGES_PER_SYNC: z.coerce.number().default(20),
  /** Fetch ClickUp comments during list sync (extra API call per task). */
  CLICKUP_SYNC_COMMENTS: z.coerce.boolean().default(true),
  CLICKUP_WEBHOOK_BASE_URL: z.string().optional().default(""),
  CLICKUP_TLS_INSECURE: z.coerce.boolean().default(false),
  MICROSOFT_TODO_SYNC_ENABLED: z.coerce.boolean().default(true),
  MICROSOFT_TODO_SYNC_INTERVAL_MINUTES: z.coerce.number().default(30),
  CRON_SECRET: z.string().optional().default(""),
  /** Local prod-like compose only — never set on the LAN server. */
  ALLOW_LOCALHOST_CORS_IN_PRODUCTION: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

function assertProductionSafe(data: Env): void {
  if (data.NODE_ENV !== "production") return;

  const jwtLower = data.AUTH_JWT_SECRET.toLowerCase();
  if (WEAK_JWT_PATTERNS.some((p) => jwtLower.includes(p))) {
    throw new Error(
      "Invalid environment: AUTH_JWT_SECRET looks like a development placeholder. Set a strong random secret (32+ chars) for production.",
    );
  }

  const origins = data.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error("Invalid environment: CORS_ORIGIN is required in production.");
  }
  const nonLocal = origins.filter((o) => !isLocalhostOrigin(o));
  if (nonLocal.length === 0 && !data.ALLOW_LOCALHOST_CORS_IN_PRODUCTION) {
    throw new Error(
      "Invalid environment: CORS_ORIGIN must include at least one non-localhost origin in production (e.g. http://10.100.235.21:46810). For local prod-like compose only, set ALLOW_LOCALHOST_CORS_IN_PRODUCTION=true.",
    );
  }

  if (data.FORGE_ALLOW_IOS_SIMULATION) {
    throw new Error(
      "Invalid environment: FORGE_ALLOW_IOS_SIMULATION must be false in production.",
    );
  }

  const hasCatalogToken = Boolean(data.GITLAB_ACCESS_TOKEN || data.GITHUB_ACCESS_TOKEN);
  if (hasCatalogToken && !data.CATALOG_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "Invalid environment: CATALOG_TOKEN_ENCRYPTION_KEY is required when GITLAB_ACCESS_TOKEN or GITHUB_ACCESS_TOKEN is set.",
    );
  }

  if (data.CLICKUP_ACCESS_TOKEN) {
    const enc = data.CLICKUP_TOKEN_ENCRYPTION_KEY || data.CATALOG_TOKEN_ENCRYPTION_KEY;
    if (!enc) {
      throw new Error(
        "Invalid environment: CLICKUP_TOKEN_ENCRYPTION_KEY or CATALOG_TOKEN_ENCRYPTION_KEY is required when CLICKUP_ACCESS_TOKEN is set.",
      );
    }
  }
}

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const data = parsed.data;
  if (!data.GITLAB_API_URL) {
    data.GITLAB_API_URL = `${data.GITLAB_BASE_URL.replace(/\/$/, "")}/api/v4`;
  }
  assertProductionSafe(data);
  return data;
}

export function catalogEnvFrom(env: Env) {
  return {
    catalogRequestTimeoutMs: env.CATALOG_REQUEST_TIMEOUT_MS,
    catalogTokenEncryptionKey: env.CATALOG_TOKEN_ENCRYPTION_KEY || undefined,
    githubAccessToken: env.GITHUB_ACCESS_TOKEN || undefined,
    gitlabAccessToken: env.GITLAB_ACCESS_TOKEN || undefined,
    githubConnectionSlug: env.GITHUB_CONNECTION_NAME,
    gitlabConnectionSlug: env.GITLAB_CONNECTION_NAME,
  };
}
