# Domain and TLS — Helm (deferred)

LAN v1 uses HTTP on `http://10.100.235.21:46810` (web) and `:46811` (api).

When ready for a domain:

| Placeholder | Purpose |
|-------------|---------|
| `[PRODUCTION_DOMAIN]` | Browser UI origin |
| `[API_DOMAIN]` | API origin (or same host path-routed) |

Place Caddy/nginx configs under `deploy/proxy/`. Requirements:

- HTTPS with renewing certificates
- HTTP → HTTPS redirect
- Security headers
- Upload size ≥ 25MB (expenses/triage)
- WebSocket not required for core Helm (Forge runners later)
- Do not expose Postgres

Until then, readiness classification does **not** require TLS.
