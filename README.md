# Helm (office-assistance)

Helm is an internal office assistant for a small delivery team building mobile banking products.  
It combines leadership triage, planning, developer/team management, standups, decisions, and optional external app sync in one workspace.

## Documentation map

- Core setup and workflows: this README
- Environment variable reference: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)
- API route overview by domain: [`docs/API_OVERVIEW.md`](docs/API_OVERVIEW.md)
- **Forge module:** [`docs/forge/README.md`](docs/forge/README.md) — Flutter build portal (roles `forge_admin`, `forge_pm`)

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

## Sign-in and first-login behavior

After `npm run db:seed`, these users exist:

| Email | Default password |
|------|-------------------|
| `lead@local.dev` | `lead` |
| `assistant@local.dev` | `ChangeMe!Asst1` |
| `forge-admin@local.dev` | `ForgeAdmin1!` (Forge catalog admin) |
| `pm@local.dev` | `ForgePm1!` (Forge PM — request builds) |

- Override defaults during seed with `SEED_LEAD_PASSWORD`, `SEED_ASSISTANT_PASSWORD`, `SEED_FORGE_ADMIN_PASSWORD`, and `SEED_FORGE_PM_PASSWORD`.
- Seeded/admin-created users must complete first login by changing password (`mustChangePassword`) and setting authenticator-based MFA (TOTP).
- App sessions use local JWT auth backed by PostgreSQL user records.

## Optional integrations

### Microsoft 365 (Outlook + To Do)

- Core auth remains local; MSAL is used only in app pages that call Microsoft Graph.
- API reads app registration IDs from DB (`/api/integrations/m365`) and falls back to server env (`M365_TENANT_ID`, `M365_CLIENT_ID`).
- A lead can manage these IDs in the UI (`Apps -> App registration`).
- Typical delegated scopes: `User.Read`, `Mail.Read`, `Tasks.ReadWrite`.
- Outlook import stores message metadata (subject/from/link preview) in triage, not full mail bodies.

### ClickUp

- Configured from `Apps -> App registration` via personal API token.
- Supports team/space/list discovery plus task import into triage.
- Supports saving default team/space/list and auto-sync toggle.

### SMTP (invite/reset emails)

- If `SMTP_HOST` and `SMTP_FROM` are configured, leads can invite users with temporary passwords and trigger password resets for other users.
- Invited/reset users then follow the same first-login + MFA flow.

## Feature map

| Area | What it does | Routes/pages |
|------|---------------|--------------|
| Authentication | Local JWT sessions, first-login password change, TOTP MFA | `/api/auth/*`, `/api/me*`, Login + First-time setup pages |
| Triage | Create/manage triage items, priority queue, activity timeline, attachments, calendar export | `/api/triage-items*`, `/api/triage-attachments/*` |
| Planning | Planning initiatives and triage linking | `/api/planning*` |
| Team management | Developer directory and team memberships | `/api/developers*`, `/api/team-memberships*` |
| Coordination | Standups, decisions, dashboard overview, search | `/api/standup*`, `/api/decisions*`, `/api/dashboard-overview`, `/api/search` |
| Expenses | Expense CRUD, receipt upload/download, summary | `/api/expenses*`, `/api/exports/expenses.csv` |
| Integrations | M365 app registration, Outlook import, Microsoft To Do import, ClickUp sync | `/api/integrations/*`, `/api/outlook/*`, `/api/todo/*`, `/api/clickup/*` |
| **Forge** | Flutter demo/mock build portal (PM self-service + admin catalog) | `/api/forge/*`, `/forge/*` UI |
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

## Deployment note

Deploying only the static web client is not sufficient for sign-in. You also need:

- A reachable API origin
- A web build configured with that API public origin (`VITE_API_BASE_URL` when needed)
- API CORS including the deployed web origin

Deployment checklist:
- Set `AUTH_JWT_SECRET` (32+ chars) and production `DATABASE_URL`
- Run Prisma migrate + seed strategy for target environment
- Set `CORS_ORIGIN` to deployed web origins
- Set `VITE_API_BASE_URL` for the built frontend if API is cross-origin
- Configure optional integrations (M365/ClickUp/SMTP) only if needed

## Troubleshooting (`SELF_SIGNED_CERT_IN_CHAIN`)

If `npm install` fails due to corporate TLS inspection:

- Configure Node/npm to trust your org CA (`NODE_EXTRA_CA_CERTS` or npm `cafile`).
- For Docker runtime outbound HTTPS issues, mount/provide a CA PEM and set `NODE_EXTRA_CA_CERTS` in container env.

Other frequent issues:
- `AUTH_JWT_SECRET must be at least 32 characters`: update root `.env`.
- Web loads but sign-in fails after deployment: verify API reachability, `VITE_API_BASE_URL`, and API CORS.
- Microsoft pages fail with Graph permission errors: confirm delegated scopes and sign in again in Apps.
