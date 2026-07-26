## Agent skills (from agent-workspace)

When the Cursor workspace root is `D:\repos\mitf_repos` (typical), skills are **not** auto-loaded from this repo.
Canonical skill files live under `agent-workspace/40-skills/<skill-name>/SKILL.md`.
**Before** UI, backend, money, or debug work of that kind, open and follow the matching `SKILL.md`.

- Guide: `agent-workspace/docs/PORTFOLIO-SKILLS.md`
- Catalog: `agent-workspace/40-skills/CATALOG.md`
- Cross-system: `masarat-platform-context`

### Prefer for Helm / Dev Office Assistance

| Area | Skills (open SKILL.md) |
|------|----------------------------|
| Platform | `masarat-platform-context`, `mitf-integration-contracts` |
| UI / design | `frontend-design`, `design-taste-frontend`, `frontend-ui-engineering`, `mitf-bilingual-rtl-ui`, `flutter-build-responsive-layout`, `flutter-fix-layout-issues` |
| Backend | `dotnet-webapi`, `api-and-interface-design`, `optimizing-ef-core-queries` |
| Debug / verify | `debugging-and-error-recovery`, `mitf-compose-verify`, `webapp-testing`, `browser-testing-with-devtools`, `dart-fix-runtime-errors`, `run-tests` |

Invoke by asking the agent to use the skill by name, or by opening the path above.

---

## Learned User Preferences

- Prefer to discuss and brainstorm before committing to a detailed execution plan.
- When implementing from an attached plan, do not edit the plan file itself.
- Use the existing to-do list: mark items in progress in sequence and complete all of them.
- Design for a two-person team (user and principal assistant), not a large organization.
- Focus on developer-related issues and follow-ups rather than full project-management task tracking.
- Want optional integrations (e.g. Outlook, Microsoft To Do, Slack) to aggregate email, tasks, and messages; these must not be required for day-to-day work.
- When working on the frontend, prefer running the web app with the local npm dev server (e.g. Vite) so the UI hot-reloads, instead of relying only on the Dockerized web service.
- Core product must work without Outlook or external mail sync: v1 should use local sign-in (e.g. seeded users) with email or Outlook as an optional add-on.
- Prefer collapsed desktop navigation as a visible icon rail (icons with labels on hover) rather than removing the sidebar entirely; expanded shows icons and titles together.
- Mirror OmniTest Studio patterns when Helm needs the same capability (e.g. lead password reset with forced change on next login).
- Design Priority and Standup as one connected leadership ritual (blockers → weekly check-in), not isolated pages that require manual self-setup.

## Learned Workspace Facts

- The product context is an internal office assistant for a team building mobile banking applications (department management plus bank project coordination).
- Chosen application stack: React frontend and TypeScript backend; the web UI uses Mantine (e.g. AppShell) for layout and shared components.
- The repository is an npm workspaces monorepo named `office-assistance` with `apps/web`, `apps/api`, and `packages/types`, Node 20+, and Docker Compose for local services.
- Only the two principal users sign in to the app. The developer roster (name, skills, and team placement) is separate from `User` accounts: roster members are not given app logins; they are used for triage assignees and team management.
- Optional Microsoft 365–style features are grouped under an Apps area (e.g. Outlook, Microsoft To Do), with room to add more integrations; configuring or registering these connections from the UI is a desired direction when practical.
- **Workspace AI:** single shared LLM key (not BYOK) at `/apps/ai`. OpenRouter + LM Studio presets; assist buttons + background `InsightSnapshot` jobs; voice assistant at `/apps/ai/voice` (Parakeet STT + OpenRouter reasoning, model configured on the same page, off by default via `VOICE_ASSISTANT_ENABLED`). Docs: [`docs/ai-assist.md`](docs/ai-assist.md), [`docs/ai/voice-assistant-runbook.md`](docs/ai/voice-assistant-runbook.md). Optional local seed via `OPENROUTER_API_KEY` in `.env` (never commit).
- **Compose AI/secrets pitfalls:** Docker Compose sets `NODE_ENV=production` on `api`, so `HELM_SECRET_ENCRYPTION_KEY` (32-byte base64 or 64-char hex) **must** be in root `.env` **and** passed into `api.environment` — otherwise login/AI save fails with that error. Rotating the encryption key invalidates saved LLM ciphertext (re-paste OpenRouter key). OpenRouter keys must be `sk-or-v1-…` (not `pk_…`). Transient `fetch failed` from the API container to OpenRouter is usually Docker egress/DNS — retry after healthy. Full checklist: [`docs/deployment/compose-ai-secrets-pitfalls.md`](docs/deployment/compose-ai-secrets-pitfalls.md).
- **Catalog on LAN:** migrate-only deploys leave `/catalog/integrations` empty — GitLab/GitHub connections + inventory fixtures are created by `seedCatalog` / `seedCatalogInventory` (API startup, idempotent). Fixtures live under `apps/api/data/catalog-imports/*.fixture.json`.
- **Password admin:** lead-only reset at `/settings/users` (OmniTest-style temporary password + forced change); API regression `node scripts/force-password-e2e.mjs`.
- **Morning ritual UX:** Dashboard morning brief, `/priority`, and `/standup` form a connected flow—walk blockers first, then fill the weekly check-in.
- **Production LAN:** deploys to `10.100.235.21` (web `:46810`, API `:46811`) on the same host as OmniTest; see [`docs/deployment/lan-server-reference.md`](docs/deployment/lan-server-reference.md). Host currently has **no outbound public HTTPS** (OpenRouter/ClickUp/GitHub time out; internal GitLab OK) — Workspace AI + ClickUp need firewall `:443` or `HTTPS_PROXY`; redeploy alone will not fix it. See [`docs/deployment/compose-ai-secrets-pitfalls.md`](docs/deployment/compose-ai-secrets-pitfalls.md).
- **Claude Desktop → OpenRouter proxy:** local Anthropic-compatible gateway at `scripts/claude-desktop-openrouter-proxy` (listens on `http://127.0.0.1:8787`) so Claude Desktop can use non-Claude OpenRouter models; Sonnet tier maps to `moonshotai/kimi-k3`. Autostart via Windows Scheduled Task `ClaudeDesktopOpenRouterProxy` (`install-autostart.ps1`); use a durable `pwsh` path (WindowsApps alias) so Store PowerShell updates do not break login start.

---

## Forge module (Flutter build portal)

**Mission:** Self-service demo/mock **Flutter mobile builds** for project managers — integrated into Helm, not a separate product.

**Authoritative contract:** [`docs/forge/CONTRACT.md`](docs/forge/CONTRACT.md)

**Roles:**

| Role | Helm core nav | Forge |
|------|---------------|-------|
| `lead` | Yes | Full |
| `forge_mobile_lead` | No | Request builds + Forge settings (incl. shared delivery paths) |
| `assistant` | Yes | No |

**Paths:** API `/api/forge/*`, UI `/forge/*`, Prisma `Forge*` models, worker placeholder `apps/forge-worker/`.

**Worker rule:** Host OS .NET worker only — never inside Fastify/Docker. Never real iOS on Windows.

**Seed users:** `forge-mobile-lead@local.dev` — see README. PM delivery is shared-folder + email (no `forge_pm` Helm login).

**Optional dev Mailpit:** `docker compose --profile forge-dev up -d mailpit` (8025/1025).

**PRD loops 0–18** documented in product PRD; bootstrap complete. **Loop 2** (domain state machine + unit tests) and **Loop 5** (banks CRUD API + admin UI + demo seed) are implemented — continue with Loop 6 (applications/Git).

**Verification:** `npm run build`; `npm run test -w @office/api` (Forge domain); `pwsh scripts/verify/forge-smoke.ps1` (API auth + banks); `pwsh scripts/forge/test-smtp.ps1` (SMTP test email); role-gated API returns 403 for `assistant` on `/api/forge/dashboard`; Forge nav hidden for non-Forge roles. E2E: sign in at `http://localhost:5174` (default Vite port; `:5173` is often Account Assistance on this machine) as `forge-mobile-lead@local.dev`.
