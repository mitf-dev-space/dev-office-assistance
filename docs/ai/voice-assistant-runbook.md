# Voice Assistant — Production Runbook (Loop 10)

## Overview

Helm streaming voice: browser mic → authenticated Fastify WebSocket gateway → `services/speech` (Parakeet or fake) → OpenRouter reasoning → Helm tools / draft confirm.

**Default:** disabled (`VOICE_ASSISTANT_ENABLED=false`). Helm core remains available if speech or OpenRouter is down.

## Configuration

1. Set secrets in the deployment environment (never commit):
   - `OPENROUTER_API_KEY` (when `AI_REASONING_PROVIDER=openrouter`)
   - `SPEECH_SERVICE_TOKEN` (recommended in production)
   - `AUTH_JWT_SECRET` (existing)
2. Apply DB migration including `VoiceSession`.
3. Start speech: `docker compose --profile voice up -d speech`
4. Point API: `SPEECH_SERVICE_URL=http://speech:8000`
5. Enable for pilot: `VOICE_ASSISTANT_ENABLED=true` with `AI_REASONING_PROVIDER=fake` first, then `openrouter`.

## GPU / Parakeet

1. Host needs NVIDIA driver + Container Toolkit (`docker info` shows `nvidia` runtime).
2. Set `SPEECH_ENGINE=parakeet` and uncomment GPU reservation in `docker-compose.yml` speech service.
3. Pin a NeMo version that can load `nvidia/parakeet-unified-en-0.6b` (avoid broken 2.7.3 load path).
4. Confirm `GET http://speech:8000/readyz` returns 200.
5. Cap concurrency (`MAX_CONCURRENT_SESSIONS=1` on 8 GB GPUs).

If GPU is unavailable, keep `SPEECH_ENGINE=fake` for UI/integration testing only — not for production transcription quality.

## Rollout

```text
disabled → lead-only pilot → selected internal users → wider internal
```

Roles allowed: `lead`, `assistant`. Kill switch: set `VOICE_ASSISTANT_ENABLED=false` and restart API.

## Health

| Check | Expect |
|-------|--------|
| `GET /health/ready` (API) | database up |
| `GET /api/ai/voice/status` (JWT) | `enabled`, `speechReady` |
| `GET http://speech:8000/readyz` | engine ready |

## Rollback

1. `VOICE_ASSISTANT_ENABLED=false`
2. Stop speech profile: `docker compose --profile voice stop speech`
3. Optional: leave migration in place (tables unused)

## Language

English-only STT. Arabic / Libyan Arabic are **not** supported in this configuration.

## Nginx

Production web image must allow microphone (`Permissions-Policy: microphone=(self)`) and proxy WebSocket upgrades for `/api/ai/voice/*` when API is fronted by a reverse proxy.
