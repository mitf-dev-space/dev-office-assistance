# Server setup — Helm on shared LAN host

## Host

| Item | Value |
|------|-------|
| Host | `10.100.235.21` |
| SSH | `masarat-admin@10.100.235.21` |
| Compose dir | `~/compose-dev-office-assistance` |
| Coexists with | OmniTest (`~/compose-omnitest-studio`, ports 46300/46400) |

## Prerequisites

1. Docker Engine + Compose plugin (already present for OmniTest).
2. User in `docker` group (`masarat-admin`).
3. Docker Hub pull access for `anstwechy/dev-office-assistance-*`.
4. Free ports **46810** and **46811**.

## Bootstrap

From a machine with the repo (or copy `deploy/` over SSH):

```bash
ssh masarat-admin@10.100.235.21
# After uploading deploy/ to /tmp/helm-deploy:
bash /tmp/helm-deploy/server-bootstrap.sh /tmp/helm-deploy
cd ~/compose-dev-office-assistance
nano .env.production   # set AUTH_JWT_SECRET, POSTGRES_PASSWORD, DATABASE_URL, CORS_ORIGIN
```

`server-bootstrap.sh` never overwrites an existing `.env.production`.

## Firewall

Allow LAN/VPN access to `46810`/`46811` only. Do **not** publish Postgres.

## Registry auth (optional on server)

```bash
docker login
```

Prefer CI-built public/pullable images under `anstwechy/`.

## TLS

Deferred — see [domain-and-tls.md](./domain-and-tls.md).

## Least-privilege backlog

A dedicated `deploy` SSH user with restricted Docker rights is desirable later; v1 uses the same `masarat-admin` account as OmniTest.
