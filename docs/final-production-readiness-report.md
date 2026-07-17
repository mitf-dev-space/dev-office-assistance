# Final production readiness report — Helm

**Date:** 2026-07-18  
**Classification:** **READY WITH DOCUMENTED CONDITIONS**

## Final readiness status

LAN production on `10.100.235.21` is prepared in-repo: hardened API, registry compose, migrate one-shot, Paramiko + bash deploy, smoke tests, and runbooks aligned with OmniTest.

Not fully proven in this session against the live server (SSH credentials / image push are ops-owned).

## Implemented changes

- Assessment: `docs/production-readiness-assessment.md`
- Health `/health/live` + `/health/ready`, graceful shutdown, helmet, correlation ID, production env fail-fast
- Config templates + `docs/configuration.md`
- Multi-stage Dockerfiles; expanded `.dockerignore`
- `deploy/compose.production.yml` (46810/46811, no PG publish, no seed)
- Migrate service; backup/rollback/database runbooks
- `scripts/deploy-production.py` (OmniTest-style Paramiko)
- On-server `deploy/scripts/*`, `server-bootstrap.sh`
- Smoke: `tests/smoke/production-smoke.sh`
- CI + Docker Hub SHA tags + gated CD workflow (disabled unless `HELM_ENABLE_CD=true`)
- `DEPLOYMENT.md` + LAN deployment docs

## Test evidence (local)

| Check | Result |
|-------|--------|
| `npm run lint -w @office/api` | Pass |
| `npm run test -w @office/api` | Pass (53 tests) |
| `npm run build -w @office/api` | Pass (tsc) |
| Production env fail-fast (weak/missing JWT) | Pass |
| `docker compose … config` | Pass |
| API image non-root (`uid=10001`) | Pass |
| API `/health/live` → 200 | Pass |
| API `/health/ready` → 503 without DB | Pass (expected) |
| Web image build | Pass |
| Live SSH probe / image push | **Manual — ops** |

## Docker image names and tags

| Service | Image | Tag strategy |
|---------|-------|--------------|
| api | `anstwechy/dev-office-assistance-api` | full SHA, short SHA, semver, `latest` |
| web | `anstwechy/dev-office-assistance-web` | same; bake `VITE_API_BASE_URL=http://10.100.235.21:46811` |

Digests: recorded in GitHub Actions job summary on push to `main`.

## Pipeline

- PR/push: build, lint, unit tests, env fail-fast, compose config, docker build (no push), audit report, secret scan
- `main`: Docker Hub push
- Deploy workflow: manual, environment-gated, off by default

## Deployment procedure

See `DEPLOYMENT.md` and `docs/deployment/production-lan-deploy-runbook.md`.

## Rollback procedure

Redeploy previous `IMAGE_TAG`; DB untouched. Non-compatible migrations require restore — `docs/rollback-runbook.md`.

## Known limitations / remaining risks

- TLS not enabled (LAN HTTP)
- `masarat-admin` shared with OmniTest (not dedicated deploy user)
- Forge host worker not packaged
- In-process cron not HA-safe for multi-replica
- Paramiko host-key auto-add (same as OmniTest)
- First production user provisioning is manual (no auto-seed)

## Deferred improvements

See assessment backlog: TLS proxy, `/opt` layout, separate compose repo, OTel, object storage, Forge worker CI.

## Exact manual actions still required

1. Set GitHub `DOCKERHUB_TOKEN` / `DOCKER_VITE_API_BASE_URL` if not already.
2. Merge to `main` and confirm image push.
3. Bootstrap `~/compose-dev-office-assistance` on `10.100.235.21`.
4. Create `.env.production` with real secrets.
5. Run Paramiko `probe` then `upgrade`/`full`.
6. Create first real users (no demo seed).
7. Optional: enable gated CD with SSH key secrets.
