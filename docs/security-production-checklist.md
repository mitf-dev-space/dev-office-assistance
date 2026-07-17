# Security production checklist — Helm

## Authentication / authorization

- [x] JWT HS256 with ≥32-char secret; weak placeholders rejected in production
- [x] Passwords hashed with bcrypt; MFA (TOTP) on first login
- [x] Rate limiting (`RATE_LIMIT_MAX`)
- [x] Helmet security headers on API
- [ ] Rotate seed/default passwords if any seed was ever run on the server
- [ ] Disable or rotate any shared LAN demo accounts

## Network

- [x] Postgres not published on host in production compose
- [x] Only web 46810 + API 46811 published
- [x] CORS requires non-localhost origin in production
- [ ] Firewall restricts 46810/46811 to LAN/VPN
- [ ] TLS when public exposure is required (deferred)

## Secrets

- [x] No production secrets in git (`.env.production` gitignored)
- [x] Example files use placeholders only
- [ ] Server `.env.production` mode 600
- [ ] Docker Hub / SSH credentials only in CI secrets or local `.env.lan-deploy.local`

## Containers

- [x] API runs as non-root (`helm` uid 10001)
- [x] No source bind mounts in production compose
- [x] Migrate separated from API CMD
- [x] Log rotation enabled
- [ ] Periodic image CVE scans (`docker scout` / Hub scanning)

## Application

- [x] Upload MIME allow-list + size limits; forge path traversal checks
- [x] Request id correlation without logging Authorization
- [ ] `npm audit` reviewed each release (CI step)
- [ ] Catalog/ClickUp tokens encrypted at rest when keys set

## SSH / deploy

- [x] Deploy uses existing `masarat-admin` (same as OmniTest)
- [ ] Prefer SSH keys over password long-term
- [ ] Dedicated least-privilege deploy user (backlog)

## Justified exceptions

| Item | Mitigation |
|------|------------|
| Web nginx runs as root to bind :80 | Stock nginx Alpine model; only serves static files; LAN-only |
| Paramiko `AutoAddPolicy` | Same as OmniTest LAN script; prefer known_hosts file later |
| HTTP without TLS on LAN | Internal network; TLS deferred |
