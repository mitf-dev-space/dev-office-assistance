# Workspace AI (assist + insights)

Helm uses a **single workspace LLM key** (not personal BYOK) for:

1. **In-feature assist** — ✦ buttons on triage, standup, planning, decisions, catalog, Forge, priority
2. **Background insights** — scheduled jobs (weekly ops, catalog health, Forge builds, morning brief, blocker radar)
3. **Ask Helm** — read-only NLQ chat with a small tool loop over workspace data
4. **Review queue** — staged write proposals that a lead must approve before apply

Pattern mirrors OmniTest Studio’s OpenAI-compatible client, heuristic-first merge, mock preset, daily cap, and redaction — adapted for a shared workspace key.

## Surfaces

| Surface | Path | Who | Purpose |
|---------|------|-----|---------|
| Workspace AI settings | `/apps/ai` (alias `/settings/ai`) | Lead writes; others read | Enable AI, OpenRouter / LM Studio / Ollama / mock, encrypted key, test connection |
| Ask Helm | `/apps/ai/chat` | Authenticated | NLQ over triage / brief / radar / planning / decisions / gaps / standup |
| AI review queue | `/apps/ai/review` | Lead approves | Staged writes (planning create, decision create, cancel duplicate, …) |
| Assist status | `GET /api/assist/status` | Authenticated | Badge: enabled, provider, daily remaining |
| Dashboard | `/` | Authenticated | Morning brief card |
| Priority | `/priority` | Authenticated | Blocker radar + reorder rationale |
| Triage detail | `/triage/:id` | Lead / assistant | Summarize · next action · find duplicates |
| Standup | `/standup` | Lead / assistant | Draft weekly digest |
| Planning | `/planning` | Authenticated | Draft initiative → queue create |
| Decisions | `/decisions` | Authenticated | Draft decision → queue create |
| Catalog gaps | `/catalog/gaps` | Authenticated | Top 3 gaps |
| Catalog repo | `/catalog/repositories/:id` | Authenticated | Explain scorecard / health |
| Forge build | `/forge/builds/:id` | Forge roles + lead | Explain failure |
| Insights | `/insights` | Authenticated; Run now = lead | KPI snapshots + narrative history |

## Providers

| Preset | Typical use | API key |
|--------|-------------|---------|
| **LM Studio** | Local `http://localhost:1234/v1` (e.g. `google/gemma-4-e4b`) | Optional |
| **OpenRouter** | Cloud `https://openrouter.ai/api/v1` (e.g. `openai/gpt-4o-mini`) | Required |
| **Ollama** | Local `http://localhost:11434/v1` | Optional |
| **openai_compatible** | Custom `/v1/chat/completions` | Optional |
| **mock** | CI / deterministic tests | N/A |

LM Studio / Ollama must be reachable from the **API host**. If the API runs in Docker on Windows/macOS, use `http://host.docker.internal:1234/v1`.

## Environment

| Variable | Notes |
|----------|-------|
| `HELM_SECRET_ENCRYPTION_KEY` | Encrypts workspace API key at rest (32-byte base64 or 64-char hex). Falls back to `CATALOG_TOKEN_ENCRYPTION_KEY`, then a dev-only default. |
| `HELM_LLM_MOCK` | Set `1` to force mock provider (CI). |
| `HELM_LLM_DAILY_CAP` | Default soft cap seed (runtime uses DB `dailyCap`). |
| `INSIGHTS_SCHEDULER_ENABLED` | Default `true` — enqueues insight jobs including morning brief / blocker radar. |
| `INSIGHTS_SCHEDULER_INTERVAL_HOURS` | Default `24`. |
| `APP_PUBLIC_URL` | Used as OpenRouter `HTTP-Referer`. |

Never commit real OpenRouter keys. Paste them in the UI (Apps → Workspace AI) or set via a local-only seed script.

## Heuristic-first behavior

Assist endpoints always compute a heuristic answer. When workspace AI is enabled and under the daily cap, the API calls the LLM and merges results (`source: heuristic+llm`). If the LLM fails, heuristics are returned. Daily cap exceeded returns HTTP **429** `{ error: "daily_cap_exceeded", usage }`.

Background jobs always persist **metrics** JSON. Narratives are optional and never invent numbers.

Ask Helm bootstraps read-only tools from the question, then optionally loops (max 3) for one more tool or a final answer. It never writes.

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/settings/llm` |
| POST | `/api/settings/llm/test` |
| GET | `/api/assist/status` |
| POST | `/api/assist/triage-summarize` |
| POST | `/api/assist/triage-next-action` |
| POST | `/api/assist/triage-duplicates` |
| POST | `/api/assist/standup-digest` |
| POST | `/api/assist/catalog-explain` |
| POST | `/api/assist/catalog-gaps-top` |
| POST | `/api/assist/forge-explain-failure` |
| POST | `/api/assist/planning-draft` |
| POST | `/api/assist/decision-draft` |
| POST | `/api/assist/priority-reorder` |
| POST | `/api/assist/chat` |
| GET/POST | `/api/assist/proposals` |
| POST | `/api/assist/proposals/:id/approve` |
| POST | `/api/assist/proposals/:id/reject` |
| GET | `/api/insights` |
| GET | `/api/insights/latest/:kind` |
| GET | `/api/insights/:id` |
| POST | `/api/insights/run` |

Insight run kinds include `insights.morning_brief`, `insights.blocker_radar`, `insights.weekly_ops`, `insights.catalog_health`, `insights.forge_builds`.

## Local setup (LM Studio)

1. Start LM Studio OpenAI-compatible server on port 1234.
2. Load `google/gemma-4-e4b` (or your preferred model id).
3. Sign in as lead → **Apps → Workspace AI** → preset **LM Studio**, model id matching LM Studio, enable, Save, Test connection.
4. Try ✦ Summarize on a triage item, or open **Ask Helm**.

## Local setup (OpenRouter)

1. Apps → Workspace AI → preset **OpenRouter**.
2. Model e.g. `openai/gpt-4o-mini`.
3. Paste API key, enable, Save, Test connection.

Vite proxies `/api` with a **120s** timeout for slow local models.
