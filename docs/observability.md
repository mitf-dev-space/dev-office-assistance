# Observability — Helm

## Structured logging

Fastify JSON logs include:

- Timestamp
- Level (`info` in production)
- Request method/URL
- `x-request-id` (accepted or generated; echoed on responses)
- Errors with message (no Authorization headers, passwords, or connection strings in serializers)

Service name: use container name / compose project `helm`.

## Docker log rotation

Production compose sets `json-file` driver with `max-size: 10m`, `max-file: 5`.

## Health

| Endpoint | Meaning |
|----------|---------|
| `/health/live` | Process up |
| `/health/ready` | DB `SELECT 1` |
| `/healthz` | Alias of live |

Web: `/health/live`, `/healthz`.

## Future (backlog)

- OpenTelemetry → OTLP (align with wallet/OmniTest Grafana stack)
- Centralized Loki/Tempo
- Uptime checks on `http://10.100.235.21:46811/health/ready`
- Disk / container-restart alerts on the shared host

## Controlled error verification

1. Stop postgres briefly → `/health/ready` returns 503; `/health/live` stays 200.
2. Logs show a single readiness failure path without secrets.
3. Restart postgres → ready recovers.
