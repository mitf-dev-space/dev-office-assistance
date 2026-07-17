# Production verification — Helm

## Deployment smoke (safe)

```bash
# On server
./scripts/verify.sh

# From any host that can reach the LAN
HELM_WEB_BASE=http://10.100.235.21:46810 \
HELM_API_BASE=http://10.100.235.21:46811 \
bash tests/smoke/production-smoke.sh
```

Machine-readable JSON lines + final `{"result":"pass"}`.

Optional login (inject credentials; never commit):

```bash
HELM_SMOKE_EMAIL=... HELM_SMOKE_PASSWORD=... bash tests/smoke/production-smoke.sh
```

## Checks covered

| Check | Expect |
|-------|--------|
| Web live | 200 |
| API live | 200 |
| API ready (DB) | 200 |
| Unauth `/api/me` | 401 |
| Optional login | token / first-login challenge |

## Never run in production

- Prisma `migrate reset`
- `docker compose down -v`
- Destructive seed overwrites
- Load tests that create unbounded triage/expense rows

## Full E2E

Browser login + triage read on `http://10.100.235.21:46810` — manual or Playwright against LAN (separate from deploy smoke).
