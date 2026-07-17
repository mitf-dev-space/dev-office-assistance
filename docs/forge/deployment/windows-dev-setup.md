# Forge — Windows development setup

## Helm (portal)

1. Root `.env` with `AUTH_JWT_SECRET` (32+ chars) and `DATABASE_URL`
2. `npm install`
3. `docker compose up -d postgres`
4. `npm run db:migrate && npm run db:seed`
5. `npm run dev` — web http://localhost:5173, API http://localhost:4000

Optional Mailpit: `docker compose --profile forge-dev up -d mailpit` — UI http://localhost:8025

## Prerequisites audit

```powershell
pwsh -File scripts/forge/check-prerequisites.ps1
```

Portal development does not require Flutter. Real APK builds require Flutter + Android SDK on a **registered host worker** (`apps/forge-worker`).

## Forge seed users

| Email | Role | Default password |
|-------|------|------------------|
| `forge-admin@local.dev` | `forge_admin` | `ForgeAdmin1!` |
| `pm@local.dev` | `forge_pm` | `ForgePm1!` |

Override via `SEED_FORGE_ADMIN_PASSWORD` and `SEED_FORGE_PM_PASSWORD`.
