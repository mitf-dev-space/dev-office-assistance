from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    speech_engine: str = "fake"
    parakeet_model: str = "nvidia/parakeet-unified-en-0.6b"
    sample_rate: int = 16000
    max_session_seconds: int = 900
    max_audio_bytes: int = 25 * 1024 * 1024
    max_concurrent_sessions: int = 2
    silence_finalize_ms: int = 1200
    max_utterance_seconds: int = 120
    speech_service_token: str = ""


def load_settings() -> Settings:
    return Settings(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        speech_engine=os.environ.get("SPEECH_ENGINE", "fake").strip().lower() or "fake",
        parakeet_model=os.environ.get(
            "PARAKEET_MODEL", "nvidia/parakeet-unified-en-0.6b"
        ),
        sample_rate=int(os.environ.get("SAMPLE_RATE", "16000")),
        max_session_seconds=int(os.environ.get("MAX_SESSION_SECONDS", "900")),
        max_audio_bytes=int(os.environ.get("MAX_AUDIO_BYTES", str(25 * 1024 * 1024))),
        max_concurrent_sessions=int(os.environ.get("MAX_CONCURRENT_SESSIONS", "2")),
        silence_finalize_ms=int(os.environ.get("SILENCE_FINALIZE_MS", "1200")),
        max_utterance_seconds=int(os.environ.get("MAX_UTTERANCE_SECONDS", "120")),
        speech_service_token=os.environ.get("SPEECH_SERVICE_TOKEN", ""),
    )


settings = load_settings()
