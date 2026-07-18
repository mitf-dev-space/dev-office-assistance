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

## Learned Workspace Facts

- The product context is an internal office assistant for a team building mobile banking applications (department management plus bank project coordination).
- Chosen application stack: React frontend and TypeScript backend; the web UI uses Mantine (e.g. AppShell) for layout and shared components.
- The repository is an npm workspaces monorepo named `office-assistance` with `apps/web`, `apps/api`, and `packages/types`, Node 20+, and Docker Compose for local services.
- Early v1 framing included dev triage plus Microsoft Entra and Outlook as integrations, with clarification that Outlook must not gate basic app operation.
- Only the two principal users sign in to the app. The developer roster (name, skills, and team placement) is separate from `User` accounts: roster members are not given app logins; they are used for triage assignees and team management.
- Optional Microsoft 365–style features are grouped under an Apps area (e.g. Outlook, Microsoft To Do), with room to add more integrations; configuring or registering these connections from the UI is a desired direction when practical.
- **Workspace AI:** single shared LLM key (not BYOK) at `/apps/ai`. OpenRouter + LM Studio presets; assist buttons + background `InsightSnapshot` jobs. Docs: [`docs/ai-assist.md`](docs/ai-assist.md). Optional local seed via `OPENROUTER_API_KEY` in `.env` (never commit).

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
