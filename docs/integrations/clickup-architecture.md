# ClickUp + unified external work items

## Model

Microsoft To Do and ClickUp share **`ExternalWorkItem`**:

| Field | Role |
|--------|------|
| `provider` | `microsoft_todo` \| `clickup` |
| `connectionKey` | `"m365"` or `ClickUpConnection.id` |
| `externalId` | Graph task id or ClickUp task id |
| `triageItemId` | Optional link to Helm Triage |

Outlook remains on `TriageItem.graphMessageId` for this pass. To Do still dual-writes `graphTodoListId` / `graphTodoTaskId` for compatibility.

## Separate crons

```text
CLICKUP_SYNC_*          → enqueue clickup.sync_connection / sync_list / refresh_task
MICROSOFT_TODO_SYNC_*   → enqueue microsoft_todo.sync_lists
BackgroundJob worker    → shared dispatcher (catalog + external kinds)
```

ClickUp pulls unattended via encrypted PAT. To Do scheduled jobs run when `MicrosoftTodoSyncSettings.autoSyncEnabled` is true; list pull still requires a Graph access token (trigger from Apps → To Do while signed in).

## Field ownership (ClickUp)

| Owner | Fields |
|--------|--------|
| ClickUp | title (external), status, priority, assignees, dates, URL, raw metadata |
| Helm | category (unless mapped), escalation, planning/decision links, next action |

## Discovery

Owned spaces use `GET /team/{id}/space` + folders/lists. **Shared with me** does not appear there; Helm also calls `GET /team/{id}/shared` and merges both (and every workspace the PAT can access). CSV-named lists are skipped by “Map all discovered”.

## Routes

See [API_OVERVIEW.md](../API_OVERVIEW.md) — `/api/integrations/clickup/*`.

## Security

- PAT encrypted at rest (`CLICKUP_TOKEN_ENCRYPTION_KEY` or catalog key)
- API returns `hasToken` + `tokenHint` only
- Webhook HMAC when `webhookSecret` is set
