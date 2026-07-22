from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from .base import SpeechEngine, TranscriptionStream, TranscriptUpdate

logger = logging.getLogger("helm.speech.parakeet")


class ParakeetTranscriptionStream(TranscriptionStream):
    """Buffered streaming wrapper around NeMo Parakeet when available."""

    def __init__(self, session_id: str, model: object) -> None:
        self.session_id = session_id
        self._model = model
        self._buffer = bytearray()
        self._closed = False
        self._finalized = False
        self._last_text = ""

    async def push_audio(self, pcm16: bytes, sample_rate: int) -> AsyncIterator[TranscriptUpdate]:
        if self._closed or self._finalized or not pcm16:
            if False:
                yield TranscriptUpdate(text="", is_final=False)
            return
        self._buffer.extend(pcm16)
        # Partial decode is expensive; emit progressive length-based partials from
        # offline decode every ~0.56s of audio (~17920 bytes at 16kHz mono 16-bit).
        chunk_bytes = int(sample_rate * 2 * 0.56)
        if len(self._buffer) < chunk_bytes:
            if False:
                yield TranscriptUpdate(text="", is_final=False)
            return
        text = await self._transcribe_buffer(sample_rate)
        if text and text != self._last_text:
            self._last_text = text
            yield TranscriptUpdate(text=text, is_final=False, confidence=None)

    async def finalize(self) -> TranscriptUpdate | None:
        if self._finalized or self._closed:
            return None
        self._finalized = True
        if not self._buffer:
            return None
        text = await self._transcribe_buffer(16000)
        if not text.strip():
            return None
        self._last_text = text
        return TranscriptUpdate(text=text, is_final=True, confidence=None)

    async def _transcribe_buffer(self, sample_rate: int) -> str:
        import asyncio
        import numpy as np

        audio = np.frombuffer(bytes(self._buffer), dtype=np.int16).astype(np.float32) / 32768.0

        def _run() -> str:
            # NeMo ASRModel.transcribe expects a list of numpy arrays or file paths
            model = self._model
            out = model.transcribe([audio])  # type: ignore[attr-defined]
            if not out:
                return ""
            first = out[0]
            return str(getattr(first, "text", first) or "").strip()

        return await asyncio.to_thread(_run)

    async def close(self) -> None:
        self._closed = True
        self._buffer.clear()


class ParakeetSpeechEngine(SpeechEngine):
    name = "parakeet"

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model: object | None = None
        self._ready = False
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    async def load(self) -> None:
        import asyncio

        def _load() -> object:
            import nemo.collections.asr as nemo_asr  # type: ignore

            return nemo_asr.models.ASRModel.from_pretrained(model_name=self.model_name)

        try:
            self._model = await asyncio.to_thread(_load)
            self._ready = True
            self._load_error = None
            logger.info("Parakeet model loaded: %s", self.model_name)
        except Exception as exc:  # noqa: BLE001 — surface readiness failure
            self._model = None
            self._ready = False
            self._load_error = str(exc)
            logger.exception("Failed to load Parakeet model")
            raise

    def ready(self) -> bool:
        return self._ready and self._model is not None

    async def create_stream(self, session_id: str) -> TranscriptionStream:
        if not self._model:
            raise RuntimeError("engine_not_ready")
        return ParakeetTranscriptionStream(session_id, self._model)

    async def unload(self) -> None:
        self._model = None
        self._ready = False
