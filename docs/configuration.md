# Configuration reference — Helm

Canonical env documentation. Example files: [`.env.example`](../.env.example), [`.env.production.example`](../.env.production.example), [`deploy/.env.production.example`](../deploy/.env.production.example).

Legacy summary: [`ENVIRONMENT.md`](./ENVIRONMENT.md) (kept; prefer this file for new work).

## Loading

| Consumer | Source |
|----------|--------|
| API | Root `.env` via `apps/api/src/env.ts` (Zod). Fails fast on invalid/missing required values. |
| Web (dev) | `apps/web/.env` (`VITE_*`) |
| Web (prod image) | Build-arg `VITE_API_BASE_URL` baked into SPA |
| Compose | `env_file` / `environment` in compose YAML |

**Production rule:** `NODE_ENV=production` rejects weak JWT placeholders, localhost-only CORS (unless `ALLOW_LOCALHOST_CORS_IN_PRODUCTION=true` for local compose), and Forge iOS simulation. Catalog/ClickUp tokens require encryption keys.

---

## Application

| Variable | Required | Default | Secret | Service | Format / example |
|----------|----------|---------|--------|---------|------------------|
| `NODE_ENV` | Yes (prod) | `development` | No | api | `development` \| `production` \| `test` |
| `PORT` | No | `4000` | No | api | integer |
| `APP_PUBLIC_URL` | No | empty | No | api | `http://10.100.235.21:46810` |
| `RATE_LIMIT_MAX` | No | `200` | No | api | requests/minute |

## Networking

| Variable | Required | Default | Secret | Service | Format / example |
|----------|----------|---------|--------|---------|------------------|
| `CORS_ORIGIN` | Yes (prod) | localhost Vite | No | api | comma-separated origins |
| `ALLOW_LOCALHOST_CORS_IN_PRODUCTION` | No | `false` | No | api | `true` only for local prod-like compose |
| `VITE_API_BASE_URL` | Yes (LAN web image) | empty | No | web build | `http://10.100.235.21:46811` |
| `HELM_WEB_PORT` | No | `46810` | No | compose | host port |
| `HELM_API_PORT` | No | `46811` | No | compose | host port |

## Database

| Variable | Required | Default | Secret | Service | Format / example |
|----------|----------|---------|--------|---------|------------------|
| `DATABASE_URL` | Yes | — | **Yes** | api, migrate | `postgresql://user:pass@postgres:5432/office_assistance` |
| `POSTGRES_USER` | Yes (compose) | — | No | postgres | `helm` |
| `POSTGRES_PASSWORD` | Yes (compose) | — | **Yes** | postgres | strong random |
| `POSTGRES_DB` | Yes (compose) | — | No | postgres | `office_assistance` |

## Authentication

| Variable | Required | Default | Secret | Service | Notes |
|----------|----------|---------|--------|---------|-------|
| `AUTH_JWT_SECRET` | Yes | — | **Yes** | api | ≥32 chars; no `change-me` placeholders in prod |
| `SEED_*_PASSWORD` | No | see seed | **Yes** | seed only | never auto-run seed in production |
| `CRON_SECRET` | No | empty | **Yes** | api (future cron) | reserved |

## External Services

| Variable | Required | Default | Secret | Service |
|----------|----------|---------|--------|---------|
| `M365_TENANT_ID` / `M365_CLIENT_ID` | No | empty | No | api |
| `GITLAB_*` / `GITHUB_*` | No | see env | tokens **Yes** | api catalog |
| `CATALOG_TOKEN_ENCRYPTION_KEY` | If tokens set | empty | **Yes** | api |
| `CLICKUP_*` | No | see env | token/key **Yes** | api |
| `CATALOG_SYNC_*` / `CLICKUP_SYNC_*` / `MICROSOFT_TODO_SYNC_*` | No | enabled | No | api |

## Object Storage / files

| Variable | Required | Default | Secret | Service |
|----------|----------|---------|--------|---------|
| `UPLOAD_DIR` | No | `data/uploads` | No | api |
| `MAX_UPLOAD_BYTES` | No | 25MB | No | api |
| `FORGE_ARTIFACTS_ROOT` | No | `data/forge-artifacts` | No | api |
| `FORGE_WORKSPACES_ROOT` | No | `data/forge-workspaces` | No | api / host worker |
| `FORGE_MAX_ARTIFACT_BYTES` | No | 200MB | No | api |
| `FORGE_RUNNER_TOKEN_PEPPER` | No | — | **Yes** | api |
| `FORGE_ALLOW_IOS_SIMULATION` | No | `false` | No | api — **must be false in prod** |

## Email

| Variable | Required | Default | Secret | Service |
|----------|----------|---------|--------|---------|
| `SMTP_HOST` / `SMTP_FROM` | Pair for email | empty | No | api |
| `SMTP_USER` / `SMTP_PASSWORD` | No | empty | **Yes** | api |
| `SMTP_PORT` / `SMTP_SECURE` | No | 587 / false | No | api |

## Observability

Structured JSON logs (Fastify). Correlation: `x-request-id` request/response header. Docker log rotation in production compose.

## Docker Registry / Deployment

| Variable | Required | Default | Secret | Service |
|----------|----------|---------|--------|---------|
| `REGISTRY_NAMESPACE` | Yes (deploy) | `ghcr.io/mitf-dev-space` | No | compose |
| `IMAGE_TAG` | Yes (deploy) | — | No | compose — prefer git SHA |
| `PULL_POLICY` | No | `always` | No | compose |
| `GITHUB_TOKEN` | CI push to GHCR | — | **Yes** (workflow) | GitHub Actions — `packages: write`; login via `github.actor` |
| `HELM_SSH_*` | LAN deploy | — | password **Yes** | Paramiko script |

LAN deploy credential template: [`docs/deployment/.env.lan-deploy.example`](./deployment/.env.lan-deploy.example).

## Startup validation (production)

Missing/invalid required values → process exits with a clear `Invalid environment: ...` message (no secret values printed).
