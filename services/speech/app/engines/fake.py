from __future__ import annotations

import struct
import time
from collections.abc import AsyncIterator

from .base import SpeechEngine, TranscriptionStream, TranscriptUpdate

# Deterministic progressive script for CI / E2E (matches product example)
DEFAULT_SCRIPT = [
    "Review today's standups",
    "Review today's standups and identify",
    "Review today's standups and identify blocked projects",
]


def pcm16_rms(pcm16: bytes) -> int:
    """RMS of little-endian int16 PCM (audioop-free for Python 3.13+)."""
    if len(pcm16) < 2:
        return 0
    n = len(pcm16) // 2
    samples = struct.unpack("<" + "h" * n, pcm16[: n * 2])
    if not samples:
        return 0
    acc = sum(s * s for s in samples)
    return int((acc / len(samples)) ** 0.5)


class FakeTranscriptionStream(TranscriptionStream):
    def __init__(self, session_id: str, script: list[str] | None = None) -> None:
        self.session_id = session_id
        self.script = script or DEFAULT_SCRIPT
        self._index = 0
        self._bytes = 0
        self._last_voice_ts = time.time()
        self._closed = False
        self._finalized = False
        self._last_text = ""

    async def push_audio(self, pcm16: bytes, sample_rate: int) -> AsyncIterator[TranscriptUpdate]:
        if self._closed or self._finalized or not pcm16:
            if False:  # keep AsyncIterator typing happy
                yield TranscriptUpdate(text="", is_final=False)
            return

        self._bytes += len(pcm16)
        rms = pcm16_rms(pcm16)

        if rms > 200:
            self._last_voice_ts = time.time()
            threshold = 12_800 * (self._index + 1)
            if self._bytes >= threshold and self._index < len(self.script):
                text = self.script[self._index]
                self._index += 1
                self._last_text = text
                yield TranscriptUpdate(text=text, is_final=False, confidence=0.7)

    async def finalize(self) -> TranscriptUpdate | None:
        if self._finalized or self._closed:
            return None
        self._finalized = True
        text = self._last_text or (self.script[-1] if self.script else "")
        if not text.strip():
            return None
        return TranscriptUpdate(text=text, is_final=True, confidence=0.9)

    async def close(self) -> None:
        self._closed = True


class FakeSpeechEngine(SpeechEngine):
    name = "fake"

    def __init__(self) -> None:
        self._ready = False

    async def load(self) -> None:
        self._ready = True

    def ready(self) -> bool:
        return self._ready

    async def create_stream(self, session_id: str) -> TranscriptionStream:
        if not self._ready:
            raise RuntimeError("engine_not_ready")
        return FakeTranscriptionStream(session_id)

    async def unload(self) -> None:
        self._ready = False
