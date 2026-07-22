from __future__ import annotations

import asyncio
import struct

import pytest

from app.engines.fake import FakeSpeechEngine, FakeTranscriptionStream
from app.sessions import SessionManager


def tone_pcm(samples: int = 8000, amplitude: int = 8000) -> bytes:
    return struct.pack("<" + "h" * samples, *([amplitude, -amplitude] * (samples // 2)))


def test_model_startup_and_ready():
    async def _run() -> None:
        engine = FakeSpeechEngine()
        assert not engine.ready()
        await engine.load()
        assert engine.ready()
        await engine.unload()
        assert not engine.ready()

    asyncio.run(_run())


def test_partial_and_final_ordering():
    async def _run() -> None:
        engine = FakeSpeechEngine()
        await engine.load()
        mgr = SessionManager(engine)
        state = await mgr.create()
        texts: list[str] = []
        for _ in range(6):
            events = await mgr.push_audio(state.id, tone_pcm(16000), 16000)
            for e in events:
                if e["type"] == "transcript.partial":
                    texts.append(e["text"])
        assert len(texts) >= 2
        final = await mgr.finalize(state.id)
        assert final is not None
        assert final["type"] == "transcript.final"
        assert "standups" in final["text"].lower()
        await mgr.close(state.id)

    asyncio.run(_run())


def test_empty_audio_no_crash():
    async def _run() -> None:
        engine = FakeSpeechEngine()
        await engine.load()
        mgr = SessionManager(engine)
        state = await mgr.create()
        events = await mgr.push_audio(state.id, b"", 16000)
        assert events == []
        await mgr.close(state.id)

    asyncio.run(_run())


def test_silence_does_not_advance_script():
    async def _run() -> None:
        engine = FakeSpeechEngine()
        await engine.load()
        stream = FakeTranscriptionStream("s1")
        silence = b"\x00\x00" * 16000
        updates = [u async for u in stream.push_audio(silence, 16000)]
        assert updates == []

    asyncio.run(_run())


def test_concurrency_limit(monkeypatch: pytest.MonkeyPatch):
    from app import config

    monkeypatch.setattr(config.settings, "max_concurrent_sessions", 1)

    async def _run() -> None:
        engine = FakeSpeechEngine()
        await engine.load()
        mgr = SessionManager(engine)
        await mgr.create()
        with pytest.raises(RuntimeError, match="concurrency_limit"):
            await mgr.create()

    asyncio.run(_run())


def test_audio_too_large(monkeypatch: pytest.MonkeyPatch):
    from app import config

    monkeypatch.setattr(config.settings, "max_audio_bytes", 100)

    async def _run() -> None:
        engine = FakeSpeechEngine()
        await engine.load()
        mgr = SessionManager(engine)
        state = await mgr.create()
        with pytest.raises(ValueError, match="audio_too_large"):
            await mgr.push_audio(state.id, tone_pcm(200), 16000)

    asyncio.run(_run())
