from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class TranscriptUpdate:
    text: str
    is_final: bool
    confidence: float | None = None


class SpeechEngine(ABC):
    name: str

    @abstractmethod
    async def load(self) -> None: ...

    @abstractmethod
    def ready(self) -> bool: ...

    @abstractmethod
    async def create_stream(self, session_id: str) -> "TranscriptionStream": ...

    @abstractmethod
    async def unload(self) -> None: ...


class TranscriptionStream(ABC):
    @abstractmethod
    async def push_audio(self, pcm16: bytes, sample_rate: int) -> AsyncIterator[TranscriptUpdate]:
        """Yield zero or more transcript updates for this chunk."""
        ...

    @abstractmethod
    async def finalize(self) -> TranscriptUpdate | None: ...

    @abstractmethod
    async def close(self) -> None: ...
