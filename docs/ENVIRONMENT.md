# Environment reference

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
| `SEED_FORGE_ADMIN_PASSWORD` | No | `ForgeAdmin1!` | Seeded password for `forge-admin@local.dev` |
| `SEED_FORGE_PM_PASSWORD` | No | `ForgePm1!` | Seeded password for `pm@local.dev` |
| `SEED_DEMO_DATA` | No | false | If truthy, seed also upserts demo triage/planning/standup/decision data |

## Forge module variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `FORGE_ARTIFACTS_ROOT` | No | `data/forge-artifacts` | Local artifact storage root |
| `FORGE_RUNNER_TOKEN_PEPPER` | No | — | Min 32 chars when runner registration is enabled |
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

### ClickUp / cron links

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `APP_PUBLIC_URL` | No | empty | Used for deep links in notification emails |
| `CRON_SECRET` | No | empty | Protects `/api/cron/weekly-digest` endpoint |
| `CLICKUP_TLS_INSECURE` | No | empty | Dev-only escape hatch for ClickUp TLS issues |

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

