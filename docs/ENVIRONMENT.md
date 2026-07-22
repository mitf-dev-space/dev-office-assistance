# Environment reference

> **Canonical docs:** [`configuration.md`](./configuration.md) and [`.env.example`](../.env.example) / [`.env.production.example`](../.env.production.example). This file remains as a short inventory.

This project reads environment variables from the repository root `.env` for API and compose flows, and from `apps/web/.env` for Vite/web build values.

## Core API variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string used by Prisma and API runtime |
| `AUTH_JWT_SECRET` | Yes | - | Must be at least 32 characters |
| `PORT` | No | `4000` | API listen port |
| `NODE_ENV` | No | `development` | `development`, `production`, `test` |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Comma-separated list of allowed browser origins |
| `RATE_LIMIT_MAX` | No | `200` | Requests/minute rate limit cap |
| `UPLOAD_DIR` | No | `data/uploads` | Relative/absolute directory for uploaded files |
| `MAX_UPLOAD_BYTES` | No | `26214400` | Per-file upload size limit (25 MB) |

## Seed behavior variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SEED_LEAD_PASSWORD` | No | `lead` | Seeded password for `lead@local.dev` |
| `SEED_ASSISTANT_PASSWORD` | No | `ChangeMe!Asst1` | Seeded password for `assistant@local.dev` |
| `SEED_FORGE_MOBILE_LEAD_PASSWORD` | No | `ForgeMobileLead1!` | Seeded password for `forge-mobile-lead@local.dev` |
| `SEED_FORGE_ADMIN_PASSWORD` | No | (alias) | Legacy alias for mobile-lead password |
| `SEED_DEMO_DATA` | No | false | If truthy, seed also upserts demo triage/planning/standup/decision data |

## Forge module variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `FORGE_ARTIFACTS_ROOT` | No | `data/forge-artifacts` | Local artifact storage root |
| `FORGE_WORKSPACES_ROOT` | No | `data/forge-workspaces` | Git clone workspaces for forge-worker |
| `FORGE_MAX_ARTIFACT_BYTES` | No | `209715200` (200 MB) | Multipart upload limit for APK/IPA artifacts |
| `FORGE_RUNNER_TOKEN_PEPPER` | No | — | Reserved for future HMAC pepper (bcrypt used today) |
| `FORGE_ALLOW_IOS_SIMULATION` | No | `false` | Dev/test only — never enable in production |

## Optional integration variables

### Microsoft 365

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `M365_TENANT_ID` | No | empty | Fallback tenant ID when DB settings are empty |
| `M365_CLIENT_ID` | No | empty | Fallback client ID when DB settings are empty |

### SMTP

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SMTP_HOST` | Optional | empty | Needed with `SMTP_FROM` to enable invite/reset email |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | `true` for implicit TLS, otherwise STARTTLS path |
| `SMTP_USER` | Optional | empty | SMTP username |
| `SMTP_PASSWORD` | Optional | empty | SMTP password/app password |
| `SMTP_FROM` | Optional | empty | Sender address/display, required with `SMTP_HOST` |
| `Smtp__Host` etc. | Optional | - | ASP.NET-style aliases are coalesced into `SMTP_*` |

### ClickUp / Microsoft To Do sync / cron links

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `APP_PUBLIC_URL` | No | empty | Used for deep links in notification emails |
| `CRON_SECRET` | No | empty | Protects `/api/cron/weekly-digest` endpoint |
| `CLICKUP_API_BASE_URL` | No | `https://api.clickup.com/api/v2` | ClickUp API root |
| `CLICKUP_TOKEN_ENCRYPTION_KEY` | Optional | empty | Falls back to `CATALOG_TOKEN_ENCRYPTION_KEY` |
| `CLICKUP_ACCESS_TOKEN` | Optional | empty | Local seed only; never committed; rotate after use |
| `CLICKUP_SYNC_ENABLED` | No | `true` | Separate ClickUp scheduler (enqueue `clickup.sync_*`) |
| `CLICKUP_SYNC_INTERVAL_MINUTES` | No | `15` | ClickUp cron interval |
| `CLICKUP_MAX_PAGES_PER_SYNC` | No | `20` | Max task pages per list sync |
| `CLICKUP_SYNC_COMMENTS` | No | `true` | Fetch task comments into `_helm` during list sync (extra API call per task) |
| `CLICKUP_WEBHOOK_BASE_URL` | Optional | empty | Public HTTPS base for webhook registration |
| `CLICKUP_TLS_INSECURE` | No | `false` | Reserved; prefer proper CA trust |
| `MICROSOFT_TODO_SYNC_ENABLED` | No | `true` | Separate To Do scheduler |
| `MICROSOFT_TODO_SYNC_INTERVAL_MINUTES` | No | `30` | To Do cron interval (pull needs Graph token from UI sync) |

### Engineering Catalog

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `GITLAB_CONNECTION_NAME` | No | `gitlab-internal` | Seed slug for self-hosted GitLab connection |
| `GITLAB_BASE_URL` | No | `http://10.10.20.51` | GitLab web base (not hardcoded in app logic) |
| `GITLAB_API_URL` | No | derived from `GITLAB_BASE_URL` | GitLab API v4 root |
| `GITLAB_ACCESS_TOKEN` | Optional | empty | Encrypted into DB when `CATALOG_TOKEN_ENCRYPTION_KEY` is set |
| `GITLAB_WEBHOOK_SECRET` | Optional | empty | GitLab webhook verification |
| `GITLAB_TLS_CA_FILE` | Optional | empty | Internal CA for GitLab TLS |
| `GITHUB_CONNECTION_NAME` | No | `github-cloud` | Seed slug for GitHub.com connection |
| `GITHUB_API_URL` | No | `https://api.github.com` | GitHub REST API |
| `GITHUB_BASE_URL` | No | `https://github.com` | GitHub web base |
| `GITHUB_ACCESS_TOKEN` | Optional | empty | PAT for private repos / rate limits |
| `GITHUB_WEBHOOK_SECRET` | Optional | empty | GitHub webhook HMAC secret |
| `CATALOG_SYNC_ENABLED` | No | `true` | Background sync worker |
| `CATALOG_SYNC_INTERVAL_MINUTES` | No | `30` | Worker poll interval cap |
| `CATALOG_REQUEST_TIMEOUT_MS` | No | `10000` | Provider HTTP timeout |
| `CATALOG_TOKEN_ENCRYPTION_KEY` | Optional | empty | Required to store connection tokens in DB |

Inventory fixtures: `apps/api/data/catalog-imports/*.fixture.json` (or upload `.xlsx` when added).

## Streaming voice assistant

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `VOICE_ASSISTANT_ENABLED` | No | `false` | Master kill switch |
| `SPEECH_PROVIDER` | No | `fake` | `fake` \| `parakeet` (API-side label) |
| `SPEECH_SERVICE_URL` | No | `http://localhost:8000` | Internal speech service base URL |
| `SPEECH_SERVICE_TOKEN` | No | empty | Optional shared Bearer for API→speech |
| `SPEECH_ENGINE` | No | `fake` | Speech container engine (`fake` \| `parakeet`) |
| `PARAKEET_MODEL` | No | `nvidia/parakeet-unified-en-0.6b` | HF model id when engine=parakeet |
| `AI_REASONING_PROVIDER` | No | `fake` | `fake` \| `openrouter` |
| `OPENROUTER_API_KEY` | For live reasoning | empty | Server-only |
| `OPENROUTER_DEFAULT_MODEL` | No | `openai/gpt-4o-mini` | Voice turns |
| `OPENROUTER_DEEP_MODEL` | No | `openai/gpt-4o` | Reserved for deep analysis |
| `AI_DAILY_BUDGET_USD` | No | `5` | Soft/hard daily spend gate |
| `VOICE_SILENCE_FINALIZE_MS` | No | `1200` | End-of-turn silence |
| `VOICE_MAX_UTTERANCE_MS` | No | `120000` | Max uninterrupted speech |

Compose: `docker compose --profile voice up -d speech`. See [`docs/ai/voice-assistant-runbook.md`](ai/voice-assistant-runbook.md).

## Web variables (`apps/web/.env`)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `VITE_API_BASE_URL` | No | empty | If empty in local dev, Vite proxy forwards `/api` to API |
| `VITE_BASE` | No | `/` | Base path for subpath deployments (e.g. GitHub Pages) |

## Docker-related variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NPM_STRICT_SSL` | No | `1` | Build arg for Docker npm install strict TLS |
| `NODE_EXTRA_CA_CERTS` | Optional | empty | Custom CA bundle path for TLS-inspected networks |
| `DOCKER_API_URL` | No | - | Used by web service in dev compose to target API container |

