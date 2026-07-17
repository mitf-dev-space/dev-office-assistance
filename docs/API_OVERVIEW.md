# API overview

API base path is `/api` (except `/healthz`).

Most endpoints require a local JWT bearer token from `/api/auth/login`, unless explicitly part of auth/bootstrap flow.

## Health

- `GET /healthz`

## Auth and session

- `POST /api/auth/identify`
- `POST /api/auth/login`
- `POST /api/auth/login-otp`
- `POST /api/auth/login/verify-otp`
- `POST /api/auth/first-login/change-password`
- `POST /api/auth/first-login/mfa/prepare`
- `POST /api/auth/first-login/mfa/confirm`
- `GET /api/me`
- `PATCH /api/me`
- `POST /api/me/password`

## Users (sign-in accounts)

- `GET /api/users`
- `POST /api/users` (lead only, requires SMTP configured)
- `POST /api/users/:userId/reset-password` (lead only)

## Dashboard and global search

- `GET /api/dashboard-overview`
- `GET /api/search`

## Triage

- `GET /api/triage-items`
- `GET /api/triage-items/:id`
- `POST /api/triage-items`
- `PATCH /api/triage-items/:id`
- `GET /api/triage-items/summary`
- `GET /api/triage-items/priority-queue`
- `GET /api/triage-items/:id/activities`
- `GET /api/triage-items/:id/calendar.ics`
- `POST /api/triage-items/:id/outlook-calendar-event`

### Triage attachments

- `POST /api/triage-items/:triageId/attachments`
- `GET /api/triage-attachments/:id/file`
- `DELETE /api/triage-attachments/:id`

## Planning

- `GET /api/planning`
- `GET /api/planning/:id`
- `POST /api/planning`
- `PATCH /api/planning/:id`
- `DELETE /api/planning/:id`
- `POST /api/planning/:id/triage-links`
- `DELETE /api/planning/:id/triage-links/:triageId`

## Release milestones

- `GET /api/release-milestones`
- `POST /api/release-milestones`
- `PATCH /api/release-milestones/:id`
- `DELETE /api/release-milestones/:id`

## Standup

- `GET /api/standup`
- `PUT /api/standup`
- `GET /api/standup/helpers`
- `GET /api/standup/rollup`

## Decisions

- `GET /api/decisions`
- `GET /api/decisions/:id`
- `POST /api/decisions`
- `PATCH /api/decisions/:id`
- `DELETE /api/decisions/:id`

## Developer directory and team membership

- `GET /api/developers`
- `GET /api/developers/:id`
- `POST /api/developers`
- `PATCH /api/developers/:id`
- `DELETE /api/developers/:id`
- `GET /api/developers/suggest-for-triage`
- `GET /api/team-memberships`
- `POST /api/team-memberships`
- `PATCH /api/team-memberships/:id`
- `DELETE /api/team-memberships/:id`

## Expenses and exports

- `GET /api/expenses/summary`
- `GET /api/expenses`
- `GET /api/expenses/:id`
- `POST /api/expenses`
- `PATCH /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `POST /api/expenses/:id/receipt`
- `GET /api/expenses/:id/receipt`
- `GET /api/exports/expenses.csv`
- `GET /api/exports/triage.csv`

## Integrations and sync

### Microsoft 365 app settings

- `GET /api/integrations/m365`
- `PUT /api/integrations/m365` (lead only)

### Outlook sync

- `GET /api/outlook/folders`
- `POST /api/outlook/import`

### Microsoft To Do sync

Requires `X-Graph-Access-Token`. Imports dual-write `TriageItem` Graph columns and `ExternalWorkItem` (`provider=microsoft_todo`).

- `GET /api/todo/lists`
- `GET /api/todo/lists/:listId/tasks`
- `POST /api/todo/import`
- `GET /api/todo/sync-settings`
- `PUT /api/todo/sync-settings` (lead; `autoSyncEnabled`, `connectedListIds`)
- `POST /api/todo/sync` (pull connected lists with Graph token)

### ClickUp (Apps → ClickUp)

Token stored encrypted; API never returns the raw PAT. Tasks land in shared `ExternalWorkItem` (`provider=clickup`) linked to Triage. Separate cron from To Do (`clickup.sync_*` vs `microsoft_todo.sync_lists`).

- `GET /api/integrations/clickup`
- `PUT /api/integrations/clickup` (lead; `apiToken` / `autoSyncEnabled`)
- `POST /api/integrations/clickup/test` (lead)
- `GET /api/integrations/clickup/teams`
- `GET /api/integrations/clickup/spaces`
- `GET /api/integrations/clickup/flattened-lists` (owned spaces + Shared with me across workspaces)
- `GET|PUT /api/integrations/clickup/list-mappings`
- `POST /api/integrations/clickup/list-mappings/enable-all-discovered`
- `POST /api/integrations/clickup/clear-imported`
- `GET|PUT /api/integrations/clickup/status-mappings`
- `POST /api/integrations/clickup/import/preview`
- `POST /api/integrations/clickup/import`
- `POST /api/integrations/clickup/sync`
- `POST /api/integrations/clickup/webhooks/register` (lead; needs `CLICKUP_WEBHOOK_BASE_URL`)
- `POST /api/integrations/clickup/webhook` (public; signature verified when secret set)
- Triage helpers: `POST /api/triage-items/:id/clickup/{create,sync,push,comment}`, `DELETE .../clickup/link`

## Scheduled jobs

- `POST /api/cron/weekly-digest` (requires `CRON_SECRET` when configured)

## Forge module

Requires JWT. Roles: `forge_pm` and `forge_admin` (and `lead`) for access; admin routes require `forge_admin` or `lead`.

### PM / dashboard (forge access)

- `GET /api/forge/dashboard`
- `GET /api/forge/build-requests`
- `POST /api/forge/build-requests` (501 until Loop 7)
- `GET /api/forge/build-requests/:id`

### Administration (forge admin)

- `GET|POST|PUT /api/forge/banks` — **implemented** (Loop 5: Zod validation, demo seed)
- `GET|POST|PUT /api/forge/applications`
- `GET|POST|PUT /api/forge/build-profiles`
- `GET /api/forge/runners`

### Worker (runner token — no user JWT)

Registered outside the JWT plugin:

- `POST /api/forge/runners/register`
- `POST /api/forge/runners/:id/heartbeat`
- `POST /api/forge/runners/:id/claim`
- `POST /api/forge/platform-builds/:id/progress`
- `POST /api/forge/platform-builds/:id/complete`
- `POST /api/forge/platform-builds/:id/fail`

See [docs/forge/CONTRACT.md](./forge/CONTRACT.md).

## Engineering Catalog

Requires JWT. Read: `lead`, `assistant`, `member`, `forge_admin`, `forge_pm`. Write/admin: `lead` only.

### Overview & catalog entities

- `GET /api/catalog/overview`
- `GET /api/catalog/teams`
- `GET /api/catalog/systems`
- `GET /api/catalog/applications`
- `GET /api/catalog/repositories` (pagination, filters)
- `GET /api/catalog/repositories/:id`
- `POST /api/catalog/repositories/preview`
- `POST /api/catalog/repositories`
- `POST /api/catalog/repositories/:id/sync`

### Origin migration (lead)

- `POST /api/catalog/repositories/:id/origin/preview`
- `POST /api/catalog/repositories/:id/origin/migrate`
- `GET /api/catalog/repositories/:id/origin/history`

### Integrations & imports

- `GET /api/catalog/connections`
- `POST /api/catalog/connections/:id/verify`
- `PUT /api/catalog/connections/:id/token`
- `POST /api/catalog/imports/:dataset` (`backend` | `mobile` | `web`)
- `GET /api/catalog/imports/:jobId`
- `POST /api/catalog/imports/:jobId/commit`

### Gaps, scorecards, Forge bridge

- `GET|POST /api/catalog/gaps`
- `POST /api/catalog/gaps/:id/link-triage`
- `POST /api/catalog/gaps/:id/link-planning`
- `POST /api/catalog/repositories/:id/scorecard/refresh`
- `POST /api/catalog/forge/reconcile`
- `POST /api/catalog/forge/link`

### Sync & alerts

- `GET /api/catalog/sync-runs`
- `GET /api/catalog/alerts`

### Webhooks (no JWT)

- `POST /api/catalog/webhooks/gitlab/:connectionId`
- `POST /api/catalog/webhooks/github/:connectionId`

See [docs/catalog/README.md](./catalog/README.md).

