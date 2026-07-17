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

- `GET /api/todo/lists`
- `GET /api/todo/lists/:listId/tasks`
- `POST /api/todo/import`

### ClickUp settings and sync

- `GET /api/integrations/clickup`
- `PUT /api/integrations/clickup` (`apiToken` changes require lead)
- `GET /api/clickup/teams`
- `GET /api/clickup/spaces`
- `GET /api/clickup/flattened-lists`
- `GET /api/clickup/lists/:listId/tasks`
- `POST /api/clickup/import`

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

- `GET|POST|PUT /api/forge/banks`
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

