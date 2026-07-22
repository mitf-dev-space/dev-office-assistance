# Compose + Workspace AI — deployment pitfalls (learned 2026-07-19)

Use this checklist when deploying Helm via Docker Compose (local `localhost:8080` or LAN). These failures already burned a local bring-up; do not repeat them.

## Hard requirements before `docker compose up`

Compose sets `NODE_ENV=production` on the `api` service. That enables production-only secret checks.

| Variable | Required when | Format | Notes |
|----------|---------------|--------|-------|
| `AUTH_JWT_SECRET` | Always | ≥32 random chars | Already wired in `docker-compose.yml` |
| `HELM_SECRET_ENCRYPTION_KEY` | `NODE_ENV=production` (compose default) | 32-byte base64 **or** 64-char hex | Encrypts workspace OpenRouter/LLM API key at rest. **Must be passed into the `api` container** (compose `environment:` + root `.env`). |
| `CATALOG_TOKEN_ENCRYPTION_KEY` | Optional fallback | same as above / ≥16 chars | App falls back to this if `HELM_SECRET_ENCRYPTION_KEY` is empty — still must be in the container env |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Failure signature

```json
{"error":"HELM_SECRET_ENCRYPTION_KEY is required in production (32-byte base64 or 64-char hex)"}
```

**Cause:** Root `.env` may define the key, but Compose only injects variables listed under `api.environment`. Setting a var in `.env` alone is not enough.

**Fix:** Put `HELM_SECRET_ENCRYPTION_KEY=...` in root `.env`, ensure `docker-compose.yml` has:

```yaml
HELM_SECRET_ENCRYPTION_KEY: ${HELM_SECRET_ENCRYPTION_KEY}
```

Then recreate (not just restart):

```bash
docker compose up -d --force-recreate api
```

### Key rotation warning

If you change `HELM_SECRET_ENCRYPTION_KEY` after LLM keys were saved, existing `apiKeyCipher` values will not decrypt. Lead must re-paste the OpenRouter key on `/apps/ai` and Save.

---

## Seed / sign-in (local compose only)

| Account | Default password | Override env |
|---------|------------------|--------------|
| `lead@local.dev` | `lead` | `SEED_LEAD_PASSWORD` |
| `assistant@local.dev` | `ChangeMe!Asst1` | `SEED_ASSISTANT_PASSWORD` |
| `forge-mobile-lead@local.dev` | `ForgeMobileLead1!` | `SEED_FORGE_MOBILE_LEAD_PASSWORD` |

**Production / LAN:** do **not** rely on these seed passwords. Create real users and unique secrets.

---

## OpenRouter / Workspace AI (`/apps/ai`)

### Correct key shape

- OpenRouter keys look like: `sk-or-v1-…`
- Keys starting with `pk_…` (or other shapes) are **wrong** for chat completions and will fail auth
- Paste from https://openrouter.ai/keys only
- Never commit real keys; optional local seed via `OPENROUTER_API_KEY` in gitignored `.env`

### Failure signatures and real causes

| UI / API message | Real cause | What to do |
|------------------|------------|------------|
| `HELM_SECRET_ENCRYPTION_KEY is required…` | Missing encryption key in **container** | See above |
| `Model did not return valid JSON` (older builds) | Often **HTTP 401** or empty body masked as JSON failure | Upgrade API; surface real OpenRouter error; verify `sk-or-` key |
| `OpenRouter API keys usually start with sk-or-…` | Wrong key type saved | Re-save a real `sk-or-v1-…` key |
| `fetch failed` / `Could not reach the LLM provider…` | API container cannot reach `https://openrouter.ai` (Docker Desktop DNS/TLS blip, egress block, API still starting) | Retry; ensure host/container egress; recreate API after env changes; connection test now retries transient network errors |
| Test fails after pasting key but before Save | Test used **previously saved** workspace key | Click **Test connection** (saves form first) or Save then Test |

### Verify after deploy

```powershell
# Login as lead, then:
# PUT /api/settings/llm  { enabled, providerPreset: "openrouter", apiKey: "sk-or-v1-…", model, baseUrl }
# POST /api/settings/llm/test  → expect { "ok": true, "latencyMs": <number> }
```

Browser: `/apps/ai` → enable AI → OpenRouter → paste `sk-or-…` → **Test connection** → expect “Connection OK”.

### Network notes (Docker)

- Outbound HTTPS from the **api** container must reach OpenRouter (not the browser).
- Transient `fetch failed` on Windows Docker Desktop is common right after recreate; retry once API is healthy (`/health/live`).
- LM Studio (local) from Docker API on Windows needs `http://host.docker.internal:1234/v1`, not `localhost`.

### LAN server egress (Masarat `10.100.235.21`) — hard requirement

Diagnosed 2026-07-19: the VM **resolves DNS** but **cannot open outbound TCP/443** to the public internet.

| Target | From deploy host |
|--------|------------------|
| `openrouter.ai:443` | timeout |
| `api.clickup.com:443` | timeout |
| `api.github.com:443` / `1.1.1.1:443` | timeout |
| Internal GitLab `http://10.10.20.51` | OK |

**Symptoms this causes**

- Workspace AI Test: `ECONNREFUSED` / `ETIMEDOUT` / “Could not reach the LLM provider…”
- ClickUp Save: UI spins (API waits on `GET /team` until timeout) then `clickup_unavailable`

**Not fixed by redeploying the app.** Fix the host network:

1. Allow outbound HTTPS from `10.100.235.21` to at least `openrouter.ai` and `api.clickup.com` (or allow all `:443`).
2. Or set a working corporate proxy in `~/compose-dev-office-assistance/.env.production`:
   ```env
   HTTPS_PROXY=http://user:pass@proxy-host:port
   HTTP_PROXY=http://user:pass@proxy-host:port
   NODE_USE_ENV_PROXY=1
   ```
   then `docker compose ... up -d --force-recreate api`.
3. Verify on the server (not your laptop):
   ```bash
   curl -4 -I --max-time 10 https://openrouter.ai
   curl -4 -I --max-time 10 https://api.clickup.com
   docker exec helm-api-1 wget -qO- --timeout=10 https://openrouter.ai/api/v1/models | head -c 80
   ```

---

## Deploy agent checklist (copy/paste)

1. [ ] Root `.env` has `AUTH_JWT_SECRET` (≥32 chars)
2. [ ] Root `.env` has `HELM_SECRET_ENCRYPTION_KEY` (32-byte base64 or 64-char hex)
3. [ ] `docker-compose.yml` (or server compose) **passes** both into `api.environment`
4. [ ] After env changes: `docker compose up -d --force-recreate api` (restart alone is not enough)
5. [ ] Do not rotate encryption key without planning to re-enter workspace LLM keys
6. [ ] OpenRouter key is `sk-or-v1-…` only; never commit it
7. [ ] Post-deploy: login → `/apps/ai` → Save + Test connection → `ok: true`
8. [ ] LAN/production: no default seed passwords; unique JWT + encryption secrets per environment
9. [ ] Confirm API egress to `openrouter.ai` if Workspace AI is enabled
10. [ ] If UI still shows old errors after a fix: rebuild **api** (and **web** if UI changed), hard-refresh browser

---

## Engineering Catalog empty on LAN (no GitLab/GitHub integrations)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/catalog/integrations` empty on LAN, but local shows GitLab + GitHub | LAN ran **migrate only**; connections come from `seedCatalog` (also local `db:seed`) | Redeploy API that runs `seedCatalog` on startup; or run seed once against the prod DB |
| Integrations exist but **0 repositories** | Inventory fixtures not found (`cwd`=/app looks at `/app/data/...` while image has `/app/apps/api/data/catalog-imports`) | Use `resolveCatalogImportsDir()`; ensure fixtures are in the API image |
| Connections show but “no token” | `GITHUB_ACCESS_TOKEN` / `GITLAB_ACCESS_TOKEN` not in server env (or missing encryption key) | Set tokens + `CATALOG_TOKEN_ENCRYPTION_KEY`, recreate API |

---

## Related docs

- [`docs/ENVIRONMENT.md`](../ENVIRONMENT.md) — env inventory
- [`docs/ai-assist.md`](../ai-assist.md) — Workspace AI behavior
- [`docs/catalog/README.md`](../catalog/README.md) — inventory fixtures
- [`docs/deployment/production-lan-deploy-runbook.md`](./production-lan-deploy-runbook.md) — LAN ports / process
- [`docs/deployment/verification-checklist.md`](./verification-checklist.md) — post-deploy checks
