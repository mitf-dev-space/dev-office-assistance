# Production LAN deploy — Helm

Deploy Helm to `10.100.235.21` using GHCR images and the Paramiko script (same pattern as OmniTest Studio).

**Quick reference:** [lan-server-reference.md](./lan-server-reference.md)  
**Ports:** web `46810`, API `46811`  
**Compose dir:** `~/compose-dev-office-assistance`

Credentials are never stored in this repo. Use `.env.lan-deploy.local` (gitignored).

---

## Prerequisites

1. LAN/VPN reachability (`ping 10.100.235.21`).
2. Python 3.10+ + `pip install -r scripts/requirements-deploy.txt`.
3. Images available: `ghcr.io/mitf-dev-space/dev-office-assistance-api:<tag>` and `-web:<tag>` with `VITE_API_BASE_URL=http://10.100.235.21:46811`.
4. Server compose directory bootstrapped (`deploy/server-bootstrap.sh`).

---

## Step 1 — Probe

```powershell
cd D:\repos\mitf_repos\dev-office-assistance
$env:HELM_SSH_PASSWORD_FILE = "docs\deployment\.env.lan-deploy.local"
python scripts/deploy-production.py --mode probe
```

---

## Step 2 — Publish images

Prefer GitHub Actions on `main` (workflow `ghcr.yml`). Set repo variable:

`DOCKER_VITE_API_BASE_URL=http://10.100.235.21:46811`

Or build/push locally:

```powershell
$sha = git rev-parse --short HEAD
docker build -f apps/api/Dockerfile -t ghcr.io/mitf-dev-space/dev-office-assistance-api:$sha .
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=http://10.100.235.21:46811 -t ghcr.io/mitf-dev-space/dev-office-assistance-web:$sha .
docker push ghcr.io/mitf-dev-space/dev-office-assistance-api:$sha
docker push ghcr.io/mitf-dev-space/dev-office-assistance-web:$sha
```

---

## Step 3 — Deploy

```powershell
python scripts/deploy-production.py --tag $sha --mode upgrade
```

Script actions:

1. Backup `.env.production` → `.env.prod-backup-<timestamp>`
2. Patch managed keys (`IMAGE_TAG`, `CORS_ORIGIN`, ports, …)
3. `docker compose pull`
4. `migrate` one-shot
5. Recreate api/web
6. Wait healthy + HTTP smoke

First install / postgres recreate: use `--mode full`.

---

## Step 4 — Verify

- Web http://10.100.235.21:46810/health/live → 200  
- API http://10.100.235.21:46811/health/ready → 200  
- Checklist: [verification-checklist.md](./verification-checklist.md)

### Post-upgrade notes (Forge / email)

After migrate completes on this release:

1. Confirm `prisma migrate deploy` applied `*_forge_mobile_lead_shared_delivery` (and any AI insight migrations).
2. Existing `forge_admin` / `forge_pm` roles are migrated to `forge_mobile_lead` by the migration/seed path — create a real production mobile-lead user (do not rely on seed passwords).
3. Set SMTP on the server `.env.production` (`SMTP_HOST` + `SMTP_FROM` minimum) so Forge success emails (leads + optional PM) and failure emails (mobile lead only) send with Helm branding.
4. Optional: set bank/app shared delivery paths in Forge admin UI after login.

---

## Rollback

```powershell
python scripts/deploy-production.py --tag <previous-sha> --mode upgrade
```

Or on server: `IMAGE_TAG=<previous-sha> ./scripts/rollback.sh`  
Postgres data is untouched when only api/web recreate. See [rollback-runbook.md](../rollback-runbook.md).
