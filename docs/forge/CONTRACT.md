# Forge — Integration Contract

> **Single source of truth** for build workers, runner registration, capability routing, and artifact download inside Helm. If runtime behavior diverges from this document, **fix the code** — then update the changelog.

**Last updated:** 2026-07-17  
**Host product:** Helm (`dev-office-assistance`) — API `:4000`, web `:5173`

**Related docs:**

- [README.md](./README.md) — Forge doc index
- [../../AGENTS.md](../../AGENTS.md) — AI agent instructions
- [architecture/build-lifecycle.md](./architecture/build-lifecycle.md) — state machine

---

## 1. Decision log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Host product | **Helm monorepo module** | Reuse auth, Postgres, deployment; PM audience already in dev office |
| D2 | Worker execution | **Host OS worker, not Docker** | Flutter, Android SDK, Xcode require host access |
| D3 | User vs worker auth | **Separate mechanisms** | Portal: Helm JWT. Workers: `Authorization: Bearer <runner_token>` |
| D4 | iOS on Windows | **Simulation only in dev/test** | Never `.ipa` on Windows; never production success from simulation |
| D5 | Artifact download | **Authenticated API** | `GET /api/forge/artifacts/{id}/download` with JWT |
| D6 | Queue | **PostgreSQL** | Atomic claims via Prisma/`FOR UPDATE SKIP LOCKED` |
| D7 | API prefix | **`/api/forge/*`** | User routes JWT-protected; worker routes token-protected |

---

## 2. Trust boundaries

```text
Browser (forge_mobile_lead / lead)
  → Helm Web :5173 (JWT in storage)
  → Helm API :4000 (Fastify + Prisma)
  → PostgreSQL office_assistance
Host worker
  → Helm API /api/forge/runners/* (Bearer runner token only)
  → Git provider + local artifact paths
  NEVER: DATABASE_URL, user JWT
```

---

## 3. Runner token

| Property | Value |
|----------|-------|
| Format | 64 lowercase hex characters |
| Transport | `Authorization: Bearer <token>` on worker endpoints |
| Storage | bcrypt hash + 12-char `tokenHint` on `ForgeRunner` |
| Local file | `%USERPROFILE%\.forge\agent.env` or `~/.forge/agent.env` |

---

## 4. User API (JWT)

| Method | Route | Role |
|--------|-------|------|
| GET | `/api/forge/dashboard` | forge access |
| GET/POST | `/api/forge/build-requests` | forge access |
| GET | `/api/forge/build-requests/:id` | forge access |
| GET/POST/PUT | `/api/forge/banks` | forge admin |
| GET/POST/PUT | `/api/forge/applications` | forge admin |
| GET/POST/PUT | `/api/forge/build-profiles` | forge admin |
| GET | `/api/forge/runners` | forge admin |

Forge access = `lead`, `forge_mobile_lead`. Admin (banks/apps/profiles/runners + shared paths) = same.

---

## 5. Worker API (runner token)

| Method | Route |
|--------|-------|
| POST | `/api/forge/runners/register` |
| POST | `/api/forge/runners/:id/heartbeat` |
| POST | `/api/forge/runners/:id/claim` |
| POST | `/api/forge/platform-builds/:id/progress` |
| POST | `/api/forge/platform-builds/:id/complete` |
| POST | `/api/forge/platform-builds/:id/fail` |

Worker routes are **outside** the JWT `protectedApi` plugin.

---

## 6. Routing rules

| Platform | Runners |
|----------|---------|
| Android | Windows or macOS |
| iOS (real) | macOS only |
| iOS (simulation) | Dev/test only; `simulationOnly: true` |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-07-17 | Initial contract — Forge module bootstrap in Helm |
