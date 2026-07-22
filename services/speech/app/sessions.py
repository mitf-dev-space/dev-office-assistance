from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field

from .config import settings
from .engines.base import SpeechEngine, TranscriptionStream
from .events import (
    SessionClosed,
    SessionError,
    TranscriptFinal,
    TranscriptPartial,
    event_dict,
)


@dataclass
class SessionState:
    id: str
    created_at: float
    stream: TranscriptionStream
    sequence: int = 0
    audio_bytes: int = 0
    closed: bool = False
    last_event_seq_seen: set[int] = field(default_factory=set)
    outbound: asyncio.Queue[dict] = field(default_factory=asyncio.Queue)


class SessionManager:
    def __init__(self, engine: SpeechEngine) -> None:
        self.engine = engine
        self._sessions: dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

    @property
    def active_count(self) -> int:
        return sum(1 for s in self._sessions.values() if not s.closed)

    async def create(self) -> SessionState:
        async with self._lock:
            if self.active_count >= settings.max_concurrent_sessions:
                raise RuntimeError("concurrency_limit")
            if not self.engine.ready():
                raise RuntimeError("engine_not_ready")
            sid = str(uuid.uuid4())
            stream = await self.engine.create_stream(sid)
            state = SessionState(id=sid, created_at=time.time(), stream=stream)
            self._sessions[sid] = state
            return state

    def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    async def push_audio(self, session_id: str, pcm16: bytes, sample_rate: int) -> list[dict]:
        state = self._sessions.get(session_id)
        if not state or state.closed:
            raise KeyError("session_not_found")
        if time.time() - state.created_at > settings.max_session_seconds:
            await self.close(session_id, "session_timeout")
            raise TimeoutError("session_timeout")
        if state.audio_bytes + len(pcm16) > settings.max_audio_bytes:
            await self.emit_error(state, "audio_too_large", "Maximum audio size exceeded")
            raise ValueError("audio_too_large")
        if not pcm16:
            return []
        state.audio_bytes += len(pcm16)
        events: list[dict] = []
        async for update in state.stream.push_audio(pcm16, sample_rate):
            state.sequence += 1
            if update.is_final:
                ev = TranscriptFinal(
                    session_id=session_id,
                    text=update.text,
                    sequence=state.sequence,
                    ts=time.time(),
                    confidence=update.confidence,
                )
            else:
                ev = TranscriptPartial(
                    session_id=session_id,
                    text=update.text,
                    sequence=state.sequence,
                    ts=time.time(),
                    confidence=update.confidence,
                )
            payload = event_dict(ev)
            events.append(payload)
            await state.outbound.put(payload)
        return events

    async def finalize(self, session_id: str) -> dict | None:
        state = self._sessions.get(session_id)
        if not state or state.closed:
            raise KeyError("session_not_found")
        update = await state.stream.finalize()
        if not update:
            return None
        state.sequence += 1
        ev = TranscriptFinal(
            session_id=session_id,
            text=update.text,
            sequence=state.sequence,
            ts=time.time(),
            confidence=update.confidence,
        )
        payload = event_dict(ev)
        await state.outbound.put(payload)
        return payload

    async def emit_error(self, state: SessionState, code: str, message: str) -> None:
        payload = event_dict(
            SessionError(
                session_id=state.id,
                code=code,
                message=message,
                ts=time.time(),
            )
        )
        await state.outbound.put(payload)

    async def close(self, session_id: str, reason: str = "closed") -> None:
        state = self._sessions.get(session_id)
        if not state:
            return
        if not state.closed:
            state.closed = True
            await state.stream.close()
            payload = event_dict(
                SessionClosed(session_id=session_id, reason=reason, ts=time.time())
            )
            await state.outbound.put(payload)
        self._sessions.pop(session_id, None)
