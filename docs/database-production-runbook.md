# Database production runbook — Helm

## Overview

- Engine: PostgreSQL 16 (Compose service `postgres`)
- Schema: Prisma migrations in `apps/api/prisma/migrations`
- Apply: **one-shot** `migrate` service (never from multiple API replicas simultaneously)
- Data volume: Docker named volume `helm_pg_data`
- Host: LAN `10.100.235.21`, compose dir `~/compose-dev-office-assistance`

## Initial database creation

1. Ensure `.env.production` has strong `POSTGRES_*` and matching `DATABASE_URL`.
2. `docker compose --env-file .env.production -f compose.production.yml up -d postgres`
3. Wait until postgres is healthy.
4. Run migrate (below).
5. **Do not** auto-seed. Create the first admin user via a controlled one-off seed only if ops explicitly requests it (prefer invite flow once SMTP is configured, or a manual SQL/seed with unique passwords).

## Migration procedure

```bash
cd ~/compose-dev-office-assistance
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
```

Or as part of stack start (`api` waits for `migrate` completed successfully):

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
```

### Failure response

1. Read migrate container logs: `docker compose logs migrate`
2. Do **not** run destructive `prisma migrate reset` in production.
3. Fix forward with a new migration or repair per Prisma docs.
4. Restore from backup only if the database is corrupted (see backup-and-recovery).

## Backup before risky migrations

```bash
./scripts/backup.sh
```

Keep the timestamped dump until the migration is verified.

## Rollback limitations

- Application rollback (previous `IMAGE_TAG`) is safe if the new migration is **backward compatible**.
- Destructive schema changes are **not** automatically reversible — restore from `pg_dump` backup into a new volume or repaired DB.
- Document expand/contract migrations for future multi-version deploys.

## Connection pooling

Single API replica is the LAN default. Prisma uses its pool; no PgBouncer in v1.

## Credentials

- Stored only in server `.env.production` (mode `600`, owned by deploy user).
- Never commit; never bake into images.
