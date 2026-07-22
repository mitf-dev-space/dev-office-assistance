# Helm (office-assistance)

Helm is an internal office assistant for a small delivery team building mobile banking products.  
It combines leadership triage, planning, developer/team management, standups, decisions, and optional external app sync in one workspace.

## Documentation map

- Core setup and workflows: this README
- Environment variable reference: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)
- API route overview by domain: [`docs/API_OVERVIEW.md`](docs/API_OVERVIEW.md)
- **Forge module:** [`docs/forge/README.md`](docs/forge/README.md) — Flutter build portal (role `forge_mobile_lead`; shared-folder PM delivery)

## Current scope

- Local sign-in is the core auth path (no Microsoft account required).
- Seeded users include lead and assistant accounts.
- Developer roster and team assignments are separate from sign-in users.
- Outlook, Microsoft To Do, and ClickUp integrations are optional and live under Apps.
- SMTP is optional and enables lead-driven invite/reset emails with temporary passwords.

## Tech stack

- Web: React 19, Vite, Mantine, TanStack Query, React Router, MSAL (only for optional Microsoft app pages)
- API: Fastify, Prisma, PostgreSQL, Zod, `jose` JWT, `bcryptjs`, `otplib`, Nodemailer
- Monorepo: npm workspaces (`apps/web`, `apps/api`, `packages/types`)
- Runtime: Node 20+

## Repository layout

| Path | Purpose |
|------|---------|
| [`apps/web`](apps/web) | React SPA (Helm UI) |
| [`apps/api`](apps/api) | Fastify API, Prisma schema/migrations, seed scripts |
| [`packages/types`](packages/types) | Shared TypeScript types |
| [`docker-compose.yml`](docker-compose.yml) | Production-like local stack |
| [`docker-compose.dev.yml`](docker-compose.dev.yml) | Hot-reload Docker dev stack |

## Local development (recommended)

1. Create env files:

   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   ```

2. In root `.env`, set at minimum:

   ```env
   AUTH_JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
   ```

3. Install and prepare DB:

   ```bash
   npm install
   docker compose up -d postgres
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open Web at http://localhost:5173 and API health at http://localhost:4000/healthz.

Notes:
- In dev, Vite proxies `/api` to `http://127.0.0.1:4000` when `VITE_API_BASE_URL` is empty.
- `docker-compose.dev.yml` is available, but host `npm run dev` is typically faster for frontend iteration.

### Quick start (PowerShell)

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env
npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Sign-in and password behavior

After `npm run db:seed`, these users exist:

| Email | Default password |
|------|-------------------|
| `lead@local.dev` | `lead` |
| `assistant@local.dev` | `ChangeMe!Asst1` |
| `forge-mobile-lead@local.dev` | `ForgeMobileLead1!` (Forge mobile lead — builds + settings) |

- Override defaults during seed with `SEED_LEAD_PASSWORD`, `SEED_ASSISTANT_PASSWORD`, and `SEED_FORGE_MOBILE_LEAD_PASSWORD` (legacy `SEED_FORGE_ADMIN_PASSWORD` still accepted).
- App sessions use local JWT auth backed by PostgreSQL user records.
- **Self-serve:** any signed-in user can change their password under **Profile** (`POST /api/me/password`).
- **Lead reset:** leads use **Sign-in users** (`/settings/users`) or `POST /api/users/:userId/reset-password`. That sets a temporary password and `mustChangePassword`. On next login the user gets a restricted session and must complete **Set a new password** (`POST /api/auth/complete-password-change`), then sign in again.
- Local/dev reset responses include `temporaryPassword` so QA does not require SMTP. Optional Mailpit: `docker compose --profile forge-dev up -d mailpit`.
- API regression: `node scripts/force-password-e2e.mjs` (API on `:4000`).

## Optional integrations

### Microsoft 365 (Outlook + To Do)

- Core auth remains local; MSAL is used only in app pages that call Microsoft Graph.
- API reads app registration IDs from DB (`/api/integrations/m365`) and falls back to server env (`M365_TENANT_ID`, `M365_CLIENT_ID`).
- A lead can manage these IDs in the UI (`Apps -> App registration`).
- Typical delegated scopes: `User.Read`, `Mail.Read`, `Tasks.ReadWrite`.
- Outlook import stores message metadata (subject/from/link preview) in triage, not full mail bodies.

### ClickUp

- Configured from **Apps → ClickUp** via personal API token (encrypted at rest; never returned by the API).
- Discovers workspace → space → folder → list, maps lists, preview/import into Triage.
- To Do and ClickUp tasks share the `ExternalWorkItem` table; each provider has its own sync cron.
- See [docs/integrations/clickup-architecture.md](docs/integrations/clickup-architecture.md).

### SMTP (reset emails)

- If `SMTP_HOST` and `SMTP_FROM` are configured, lead password resets also email the temporary password.
- Reset users must complete the forced change-password flow on next login (no MFA in the current build).

## Feature map

| Area | What it does | Routes/pages |
|------|---------------|--------------|
| Authentication | Local JWT, lead reset + forced change, Profile self-change | `/api/auth/*`, `/api/me*`, `/api/users*`, Login, Change password, Sign-in users |
| Triage | Create/manage triage items, priority queue, activity timeline, attachments, calendar export | `/api/triage-items*`, `/api/triage-attachments/*` |
| Planning | Planning initiatives and triage linking | `/api/planning*` |
| Team management | Developer directory and team memberships | `/api/developers*`, `/api/team-memberships*` |
| Coordination | Standups, decisions, dashboard overview, search | `/api/standup*`, `/api/decisions*`, `/api/dashboard-overview`, `/api/search` |
| Expenses | Expense CRUD, receipt upload/download, summary | `/api/expenses*`, `/api/exports/expenses.csv` |
| Integrations | M365 app registration, Outlook import, Microsoft To Do + ClickUp (`ExternalWorkItem`) | `/api/integrations/*`, `/api/outlook/*`, `/api/todo/*`, `/api/integrations/clickup/*` |
| **Forge** | Flutter demo/mock build portal (PM self-service + admin catalog) | `/api/forge/*`, `/forge/*` UI |
| **Engineering Catalog** | Repository intelligence (GitLab self-hosted + GitHub cloud), imports, sync, gaps, Forge linkage | `/api/catalog/*`, `/catalog/*` UI — see [docs/catalog/README.md](docs/catalog/README.md) |
| Reporting/ops | CSV export, release milestones, weekly digest endpoint | `/api/exports/triage.csv`, `/api/release-milestones*`, `/api/cron/weekly-digest` |

## Demo data

- `npm run db:seed` always seeds sign-in users and the developer roster (when `Developer` table is empty).
- Set `SEED_DEMO_DATA=true` to also seed demo triage, planning, standup, and decision records.

## Docker workflows

### Production-like compose

```bash
npm run docker:up
```

- Web (nginx static build): http://localhost:8080
- API: http://localhost:4000
- Postgres: localhost:5432

Important:
- The API container does not auto-run migrations/seed in `docker-compose.yml`.
- Run `npm run db:migrate` and `npm run db:seed` against the same database before first use.

### Hot-reload compose

```bash
npm run docker:dev
```

- Uses watch mode for API and web.
- API service command includes migrate + generate + seed before start.

## Build and quality commands

```bash
npm run build
npm run lint
npm run db:generate
npm run db:migrate
npm run db:seed
```

`npm run build` compiles shared types, generates Prisma client for the API workspace, then builds API and web.

## Deployment (LAN production)

Canonical runbook: **[DEPLOYMENT.md](DEPLOYMENT.md)**  
LAN server (shared with OmniTest): `10.100.235.21` — web `:46810`, API `:46811`  
Compose kit: [`deploy/`](deploy/) · Paramiko: `python scripts/deploy-production.py`  
Config: [`docs/configuration.md`](docs/configuration.md) · Assessment: [`docs/production-readiness-assessment.md`](docs/production-readiness-assessment.md)

Do **not** auto-seed production. Set `AUTH_JWT_SECRET`, strong Postgres credentials, `CORS_ORIGIN=http://10.100.235.21:46810`, and bake web with `VITE_API_BASE_URL=http://10.100.235.21:46811`.

## Troubleshooting (`SELF_SIGNED_CERT_IN_CHAIN`)

If `npm install` fails due to corporate TLS inspection:

- Configure Node/npm to trust your org CA (`NODE_EXTRA_CA_CERTS` or npm `cafile`).
- For Docker runtime outbound HTTPS issues, mount/provide a CA PEM and set `NODE_EXTRA_CA_CERTS` in container env.

Other frequent issues:
- `AUTH_JWT_SECRET must be at least 32 characters`: update root `.env`.
- Web loads but sign-in fails after deployment: verify API reachability, `VITE_API_BASE_URL`, and API CORS.
- Microsoft pages fail with Graph permission errors: confirm delegated scopes and sign in again in Apps.
