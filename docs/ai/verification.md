# Dev Office Assistance (Helm) — Cloud Agent Verification

> Audit date: **2026-08-15** · Repo: `mitf-dev-space/dev-office-assistance` · Auditor environment: Windows, Node 22.22.1, Docker 29.6.2

## 1. Branches

| Role | Branch | Notes |
|------|--------|-------|
| **Default / release** | `main` | `origin/HEAD` → `origin/main` |
| **Integration** | `dev` | Exists on remote |
| **Other** | `fayroz-dev` | Developer branch on remote |
| **Release** | `main` | Production deploys from `main` per `DEPLOYMENT.md` |

CI triggers on `main`, `master`, `develop`, and `feature/**` (`.github/workflows/ci.yml`).

## 2. Runtimes and SDK versions

| Layer | Version | Source |
|-------|---------|--------|
| **Monorepo** | Node **≥20** (CI uses **20**) | Root `package.json` `engines` |
| **API** | Fastify **5**, Prisma **6.3**, TypeScript **5.7** | `apps/api/package.json` |
| **Web** | React **19**, Vite **6**, Mantine **7** | `apps/web/package.json` |
| **Shared types** | TypeScript **5.7** | `packages/types/package.json` |
| **Speech service** | Python **≥3.10,<3.13** | `services/speech/pyproject.toml` |
| **Database** | PostgreSQL **16** (compose) | `docker-compose.yml` |
| **global.json** | *Not present* | N/A |

## 3. Solution and manifest paths

### npm workspaces (root `package.json`)

| Path | Package |
|------|---------|
| `package.json` | `office-assistance` (workspace root) |
| `package-lock.json` | Lockfile |
| `apps/api/package.json` | `@office/api` |
| `apps/web/package.json` | `@office/web` |
| `packages/types/package.json` | `@office/types` |

### Prisma

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`

### Python speech service

- `services/speech/pyproject.toml`
- `services/speech/requirements.txt`

**No** `.sln` or `global.json`.

## 4. Docker and Compose

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production-like: postgres, api, web (+ optional `speech`, `mailpit` profiles) |
| `docker-compose.dev.yml` | Hot-reload dev stack |
| `docker-compose.server.yml` | Server deployment variant |
| `apps/api/Dockerfile` | API production image |
| `apps/web/Dockerfile` | Web (nginx) production image |
| `docker/Dockerfile.dev` | Dev image for compose.dev |
| `services/speech/Dockerfile` | Speech transcription service |
| `deploy/compose.production.yml` | LAN production compose (validated in CI) |

**Default compose ports:** Postgres `5432`, API `4000`, Web `8080`. Dev compose: API `4000`, Web `5173`.

## 5. Restore, build, test, lint, run

### From README (recommended host dev)

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
# Set AUTH_JWT_SECRET (≥32 chars) in .env

npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev          # API :4000 + Web :5173
```

### Build and quality (README)

```bash
npm run build
npm run lint
npm run test
```

### Docker workflows (README)

```bash
npm run docker:up    # docker compose up --build -d
npm run docker:dev   # docker compose -f docker-compose.dev.yml up --build
```

### From `.github/workflows/ci.yml`

```bash
npm ci --no-audit --no-fund
npm run build
npm run lint
npm run test
# env: DATABASE_URL, AUTH_JWT_SECRET, NODE_ENV=test
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
```

Optional on push: `docker build` for api and web images.

### Speech tests (root script)

```bash
npm run test:speech   # cd services/speech && python -m pytest -q
```

## 6. Verified commands (audit run)

Prerequisites: copied `.env.example` → `.env` and `apps/web/.env.example` → `apps/web/.env`.

| Command | Result |
|---------|--------|
| `npm ci --no-audit --no-fund` | **Verified** |
| `npm run build` | **Verified** — types, prisma generate, api + web build |
| `npm run lint` | **Verified** — `@office/api`, `@office/web`, `@office/types` tsc |
| `npm run test` | **Verified** — 99 tests passed (API unit tests via `node:test`) |
| `docker compose config --quiet` | **Verified** (warning: `HELM_SECRET_ENCRYPTION_KEY` unset — expected without production `.env`) |

**Not verified:** `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `docker compose up`, speech pytest, production deploy scripts.

## 7. Required services and mocks

| Service | Required for | Notes |
|---------|--------------|-------|
| **PostgreSQL** | API, Prisma migrations, seed | `docker compose up -d postgres` or compose stack |
| **AUTH_JWT_SECRET** | API startup | ≥32 characters in `.env` |
| **HELM_SECRET_ENCRYPTION_KEY** | Production API (`NODE_ENV=production`) | Required for encrypted AI keys |
| **SMTP** | Password-reset emails | Optional; dev returns `temporaryPassword` in API |
| **Microsoft Graph** | Outlook / To Do integrations | Optional; MSAL in web only |
| **ClickUp API** | ClickUp sync | Optional |
| **Speech service** | Voice assistant | Optional; `SPEECH_PROVIDER=fake` default; profile `voice` in compose |
| **Mailpit** | SMTP dev testing | Optional; profile `forge-dev` |
| **Forge runner** | Mobile builds | Separate `apps/forge-worker` process; shared folders |

Unit tests (`npm run test`) do **not** require Postgres — they use `node:test` with mocked env.

## 8. Safe vs unsafe commands

### Safe (CI-parity)

```powershell
npm ci --no-audit --no-fund
npm run build
npm run lint
npm run test
docker compose config
docker compose --env-file deploy/.env.production.example -f deploy/compose.production.yml config
```

### Safe with local infra

```powershell
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

### Unsafe / avoid without explicit approval

- `python scripts/deploy-production.py` — deploys to LAN production (`10.100.235.21`)
- `npm run db:seed` against **production** databases
- `docker compose down -v` — destroys Postgres and upload volumes
- `prisma migrate reset` on shared databases
- Auto-seeding production (`DEPLOYMENT.md` explicitly forbids)
- Committing `.env`, `deploy/.env.production`, or tokens (CI secret-scan checks tracked env files)
