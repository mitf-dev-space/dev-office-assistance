## Agent skills (from agent-workspace)

When the Cursor workspace root is `D:\repos\mitf_repos`, skills are **not** auto-loaded from this repo.
Canonical files: `agent-workspace/40-skills/<skill-name>/SKILL.md`.

- Guide: `agent-workspace/docs/PORTFOLIO-SKILLS.md`
- Catalog: `agent-workspace/40-skills/CATALOG.md`

### Prefer for Helm / Dev Office Assistance

| Area | Skills |
|------|--------|
| Platform | `masarat-platform-context`, `mitf-integration-contracts` |
| UI | `frontend-design`, `design-taste-frontend`, `mitf-bilingual-rtl-ui` |
| Backend | `api-and-interface-design`, `dotnet-webapi` |
| Verify | `mitf-compose-verify`, `webapp-testing`, `browser-testing-with-devtools`, `run-tests` |

---

# Agent Instructions — Helm (Dev Office Assistance)

## Mission

Internal office assistant for mobile banking eng: triage, catalog, AI assist, **Forge** Flutter builds. npm workspaces (`apps/web`, `apps/api`). Local web **`http://localhost:5174`** (AA agent-tester uses `:5173`).

## Hard restrictions

1. Do not edit attached plan files; mark todos in order.
2. Production compose: `HELM_SECRET_ENCRYPTION_KEY` required in `.env` + `api.environment` — see [`docs/deployment/compose-ai-secrets-pitfalls.md`](docs/deployment/compose-ai-secrets-pitfalls.md).
3. Forge worker: **host OS .NET only** — never inside Fastify/Docker; never real iOS on Windows.
4. Icon-rail sidebar (collapsed) preferred over removing nav.
5. Never commit secrets / OpenRouter keys.

## Forge

Contract: [`docs/forge/CONTRACT.md`](docs/forge/CONTRACT.md). Verify: `npm run build`; `pwsh scripts/verify/forge-smoke.ps1`; UI as `forge-mobile-lead@local.dev` on `:5174`.

## Docs

AI: [`docs/ai-assist.md`](docs/ai-assist.md) · LAN: [`docs/deployment/lan-server-reference.md`](docs/deployment/lan-server-reference.md) · Former AGENTS depth: [`docs/agent-session-detail.md`](docs/agent-session-detail.md).
