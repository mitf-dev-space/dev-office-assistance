# Post-deploy verification checklist — Helm

## Automated

- [ ] `python scripts/deploy-production.py --mode probe` succeeds
- [ ] Smoke: web live 200, api live 200, api ready 200, `/api/me` 401
- [ ] `tests/smoke/production-smoke.sh` → `{"result":"pass"}`

## Secrets / Workspace AI (do not skip on compose deploys)

See [`compose-ai-secrets-pitfalls.md`](./compose-ai-secrets-pitfalls.md).

- [ ] `HELM_SECRET_ENCRYPTION_KEY` present in deploy env **and** injected into the API container
- [ ] After env change: recreate API (`--force-recreate`), not only restart
- [ ] If Workspace AI enabled: OpenRouter key is `sk-or-v1-…`; `/apps/ai` → Test connection → OK
- [ ] Encryption key was not rotated without re-entering the workspace LLM key

## Engineering Catalog (GitLab / GitHub / repos)

Migrate alone does **not** create catalog rows. API startup must seed connections + inventory fixtures.

- [ ] `/catalog/integrations` shows **GitLab (self-hosted)** and **GitHub (cloud)**
- [ ] `/catalog/repositories` shows Backend/Mobile/Web inventory (~60+ repos from fixtures)
- [ ] Optional: `GITHUB_ACCESS_TOKEN` / `GITLAB_ACCESS_TOKEN` + `CATALOG_TOKEN_ENCRYPTION_KEY` in server `.env.production` so tokens encrypt and sync works
- [ ] API image includes `apps/api/data/catalog-imports/*.fixture.json` (not excluded by `.dockerignore`)

Why local had integrations but LAN did not: local `npm run db:seed` creates `RepositoryConnection` rows; LAN deploy only ran `prisma migrate deploy`. Startup now runs `seedCatalog` + inventory (idempotent) when the API boots.

## Browser

1. Open http://10.100.235.21:46810  
2. Sign in with a **non-default** production user  
3. Dashboard loads without console CORS errors  
4. One triage list read succeeds  
5. Forge: mobile-lead can open banks/apps; shared delivery path editable  
6. Optional: `POST /api/forge/admin/test-email` with `{ "samples": true }` if SMTP configured  
7. Optional: `/apps/ai` connection test OK if cloud LLM is in scope for this deploy  
8. Catalog: integrations + repository inventory as above

## Coexistence

- [ ] OmniTest still on :46300 / :46400  
- [ ] `ss` / `docker ps` shows no port conflicts  

## Rollback drill (staging or after backup)

- [ ] Redeploy previous SHA; health still green  
