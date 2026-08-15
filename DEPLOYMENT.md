# DEPLOYMENT — Helm (dev-office-assistance)

Engineer runbook for the shared Masarat LAN server. Deep dives live under `docs/deployment/`.

## 1. Architecture overview

- **Web** (nginx SPA) `:46810` → image `ghcr.io/mitf-dev-space/dev-office-assistance-web`
- **API** (Fastify + Prisma) `:46811` → `ghcr.io/mitf-dev-space/dev-office-assistance-api`
- **Postgres 16** internal only
- **Migrate** one-shot container before API starts
- Same host as OmniTest (`10.100.235.21`); do not use ports 46300/46400

## 2. Deployment prerequisites

- Docker Engine + Compose on server
- GHCR pull access for `ghcr.io/mitf-dev-space/dev-office-assistance-*`
- SSH as `masarat-admin`
- `~/compose-dev-office-assistance` bootstrapped
- Strong secrets in `.env.production`

## 3. Required CI/CD secrets

| Name | Where | Purpose |
|------|-------|---------|
| `GITHUB_TOKEN` | GitHub Actions (built-in) | Push images to GHCR (`packages: write`) |
| `DOCKER_VITE_API_BASE_URL` | Variable | `http://10.100.235.21:46811` |
| `HELM_ENABLE_CD` | Variable | Must be `true` to enable gated CD workflow |
| `PRODUCTION_*` | Environment `production` | Only if CD enabled |

## 4. Required production variables

See `deploy/.env.production.example` and `docs/configuration.md`. Minimum:

`AUTH_JWT_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `CORS_ORIGIN=http://10.100.235.21:46810`, `IMAGE_TAG`, `REGISTRY_NAMESPACE`

## 5. Registry configuration

```text
ghcr.io/mitf-dev-space/dev-office-assistance-api:<git-sha>
ghcr.io/mitf-dev-space/dev-office-assistance-web:<git-sha>
```

Tags: full SHA, short SHA, semver (on `v*`), `latest` on `main`.

## 6. First server setup

```bash
# copy deploy/ to server, then:
bash server-bootstrap.sh /path/to/deploy
cd ~/compose-dev-office-assistance
nano .env.production
```

Details: [docs/server-setup.md](docs/server-setup.md)

## 7. First deployment

```powershell
# From Windows
$env:HELM_SSH_PASSWORD_FILE = "docs\deployment\.env.lan-deploy.local"
python scripts/deploy-production.py --mode probe
python scripts/deploy-production.py --tag <git-sha> --mode full
```

## 8. Normal deployment

```powershell
python scripts/deploy-production.py --tag <git-sha> --mode upgrade
```

On server:

```bash
cd ~/compose-dev-office-assistance
export IMAGE_TAG=<git-sha>
./scripts/preflight.sh
./scripts/deploy.sh
./scripts/verify.sh
```

## 9. Database migration

```bash
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
```

## 10. Verification

```bash
./scripts/verify.sh
# or
HELM_API_BASE=http://10.100.235.21:46811 HELM_WEB_BASE=http://10.100.235.21:46810 \
  bash tests/smoke/production-smoke.sh
```

## 11. Viewing status

```bash
./scripts/status.sh
```

## 12. Viewing logs

```bash
./scripts/logs.sh api 200
```

## 13. Restarting a service

```bash
docker compose --env-file .env.production -f compose.production.yml restart api
```

## 14. Rolling back

```bash
IMAGE_TAG=<previous-sha> ./scripts/rollback.sh
# or
python scripts/deploy-production.py --tag <previous-sha> --mode upgrade
```

## 15. Backup and restore

```bash
./scripts/backup.sh
./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump
```

## 16. Common failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| API never healthy | Bad `DATABASE_URL` / migrate failed | `compose logs migrate api` |
| CORS errors in browser | `CORS_ORIGIN` missing LAN web URL | Patch env, recreate api |
| Blank API calls from UI | Web image built with wrong `VITE_API_BASE_URL` | Rebuild web with `:46811` |
| Port in use | Collision | Confirm OmniTest vs Helm ports |
| Pull failed | Hub/network | Retry or load image tarball |

## 17. Ownership

| Role | Contact |
|------|---------|
| Application owner | Head of Development / Masarat |
| Server / LAN | Same ops channel as OmniTest (`masarat-admin` on `10.100.235.21`) |

## Manual fallback

```bash
cd ~/compose-dev-office-assistance
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans
```
