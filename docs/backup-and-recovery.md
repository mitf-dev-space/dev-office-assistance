# Backup and recovery — Helm

## What to back up

| Asset | Method | Location |
|-------|--------|----------|
| PostgreSQL | `pg_dump` (custom format) | `backups/db-*.dump` |
| Uploads volume | `tar` of `helm_uploads` | `backups/uploads-*.tar.gz` |
| Forge artifacts | `tar` of `helm_forge_artifacts` | `backups/forge-*.tar.gz` |
| Compose + `.env.production` | copy before deploy | `.env.prod-backup-<timestamp>` (OmniTest pattern) |

A backup is not valid until a restore has been tested in an isolated environment.

## Backup (on server)

```bash
cd ~/compose-dev-office-assistance
./scripts/backup.sh
```

Retention recommendation: keep ≥7 daily dumps on-server; copy weekly off-server (USB/NAS).

## Restore (isolated test)

```bash
./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump
```

Stops API briefly, restores into running postgres, restarts stack. **Confirm target** — this overwrites the database.

## Disaster recovery

1. Re-bootstrap compose directory (`server-bootstrap.sh` or copy from git).
2. Restore `.env.production` from secure offline copy.
3. `docker compose pull && up -d postgres`
4. Restore DB dump + upload tarballs.
5. Run migrate (should be no-op if dump is current).
6. Start api/web; run `./scripts/verify.sh`.

## Encryption

Encrypt off-server copies (`gpg -c` or company vault). Do not leave `.env.production` in shared folders.
