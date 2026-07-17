# LAN server reference — Helm

Quick reference for deploying Helm on the shared Masarat LAN server (same host as OmniTest).

| Item | Value |
|------|-------|
| **Host** | `10.100.235.21` |
| **SSH** | `masarat-admin@10.100.235.21` |
| **Compose dir** | `~/compose-dev-office-assistance` |
| **Registry** | `docker.io/anstwechy/dev-office-assistance-{api,web}:<git-sha>` |

## Ports (46xxx — do not collide with OmniTest)

| Service | Port |
|---------|------|
| Helm Web | **46810** |
| Helm API | **46811** |
| OmniTest Web | 46300 |
| OmniTest API | 46400 |
| OmniTest Postgres (host) | 46432 |
| OmniTest Redis | 46380 |
| Helm Postgres | **not published** |

## URLs

| Purpose | URL |
|---------|-----|
| Web UI | http://10.100.235.21:46810 |
| API health | http://10.100.235.21:46811/health/ready |

## Credentials

SSH password is **not** stored in git. Copy [`.env.lan-deploy.example`](./.env.lan-deploy.example) to `.env.lan-deploy.local` (gitignored).

```powershell
$env:HELM_SSH_PASSWORD_FILE = "D:\repos\mitf_repos\dev-office-assistance\docs\deployment\.env.lan-deploy.local"
```

## Deploy commands (summary)

```powershell
cd D:\repos\mitf_repos\dev-office-assistance
pip install -r scripts/requirements-deploy.txt
python scripts/deploy-production.py --mode probe
$sha = git rev-parse --short HEAD
# Ensure images pushed (GitHub Actions on main, or local docker push)
python scripts/deploy-production.py --tag $sha --mode upgrade
```

## Related

- [production-lan-deploy-runbook.md](./production-lan-deploy-runbook.md)
- [verification-checklist.md](./verification-checklist.md)
- OmniTest twin: `omnitest-studio/docs/deployment/lan-server-reference.md`
