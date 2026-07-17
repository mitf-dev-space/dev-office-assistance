import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    config({ path: p });
    break;
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
  FORGE_RUNNER_TOKEN_PEPPER: z.string().min(32).optional(),
  FORGE_ALLOW_IOS_SIMULATION: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
