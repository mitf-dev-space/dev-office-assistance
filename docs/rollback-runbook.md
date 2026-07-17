# Rollback runbook — Helm

## Application rollback (preferred)

Restore previous image tag; **do not** delete volumes.

```bash
cd ~/compose-dev-office-assistance
# Option A: on-server
export IMAGE_TAG=<previous-git-sha>
./scripts/rollback.sh

# Option B: from Windows
python scripts/deploy-production.py --tag <previous-git-sha> --mode upgrade
```

What happens:

1. Previous `IMAGE_TAG` written to `.env.production` (after `.env` backup).
2. `docker compose pull api web`
3. Recreate api/web (postgres untouched).
4. Health + smoke checks.

## When automatic rollback is unsafe

If the failed deploy applied a **non-backward-compatible** Prisma migration:

1. Do not roll back the API image alone if the new schema breaks the old app.
2. Restore DB from pre-migration `./scripts/backup.sh` dump (see backup-and-recovery).
3. Then deploy the previous `IMAGE_TAG`.

## Distinctions

| Action | Touches DB schema? | Touches user data? |
|--------|--------------------|--------------------|
| App rollback (IMAGE_TAG) | No | No |
| DB restore | Replaces data | Yes |
| Full disaster recovery | Rebuilds stack | Restores from backups |

## OmniTest-style .env restore

```bash
cp .env.prod-backup-<timestamp> .env.production
docker compose --env-file .env.production -f compose.production.yml up -d --no-deps --force-recreate api web
```
