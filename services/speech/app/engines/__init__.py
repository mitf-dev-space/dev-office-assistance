from __future__ import annotations

from .base import SpeechEngine


async def build_engine() -> SpeechEngine:
    from ..config import settings
    from .fake import FakeSpeechEngine

    engine_name = settings.speech_engine.strip().lower()
    if engine_name == "parakeet":
        from .parakeet import ParakeetSpeechEngine

        engine: SpeechEngine = ParakeetSpeechEngine(settings.parakeet_model)
        await engine.load()
        return engine
    engine = FakeSpeechEngine()
    await engine.load()
    return engine
