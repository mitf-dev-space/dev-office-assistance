# Helm production deploy kit

Everything needed to run Helm on the Masarat LAN server **except secrets**.

| File | Purpose |
|------|---------|
| `compose.production.yml` | LAN stack: postgres + migrate + api + web |
| `.env.production.example` | Template → copy to `.env.production` on server |
| `scripts/` | On-server bash helpers |
| `proxy/` | Future TLS stubs (not required for LAN v1) |
| `server-bootstrap.sh` | Idempotent directory bootstrap |

## Shared server

- Host: `10.100.235.21` (same as OmniTest)
- SSH: `masarat-admin@10.100.235.21`
- Compose dir: `~/compose-dev-office-assistance`
- Ports: web **46810**, API **46811** (OmniTest uses 46300/46400)

## Quick start (on server)

```bash
cd ~/compose-dev-office-assistance
cp .env.production.example .env.production   # first time only; edit secrets
export IMAGE_TAG=<git-sha>
./scripts/preflight.sh
./scripts/deploy.sh
./scripts/verify.sh
```

## From Windows (Paramiko)

See [docs/deployment/production-lan-deploy-runbook.md](../docs/deployment/production-lan-deploy-runbook.md).

```powershell
$env:HELM_SSH_PASSWORD_FILE = "docs\deployment\.env.lan-deploy.local"
python scripts/deploy-production.py --mode probe
python scripts/deploy-production.py --tag <git-sha> --mode upgrade
```

## Images

- `anstwechy/dev-office-assistance-api:<tag>`
- `anstwechy/dev-office-assistance-web:<tag>` (build with `VITE_API_BASE_URL=http://10.100.235.21:46811`)
