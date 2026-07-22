# Helm Speech Service

Standalone Python service for streaming English speech-to-text.

| Engine | Env | Notes |
|--------|-----|-------|
| `fake` (default) | `SPEECH_ENGINE=fake` | Deterministic partial/final transcripts for CI and local UI |
| `parakeet` | `SPEECH_ENGINE=parakeet` | Loads `nvidia/parakeet-unified-en-0.6b` via NeMo (GPU required) |

## Endpoints

- `GET /healthz` — liveness
- `GET /readyz` — model loaded
- `POST /sessions` — create session (Helm API only)
- `WS /sessions/:id/audio` — PCM16 mono audio in; transcript JSON out
- `DELETE /sessions/:id` — cleanup

## Local (fake)

```bash
cd services/speech
python -m venv .venv
.\.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest
```

## Docker

```bash
docker compose --profile voice up -d speech
```

Parakeet GPU image requires NVIDIA Container Toolkit and pinning NeMo separately (see `docs/ai/voice-assistant-runbook.md`).
