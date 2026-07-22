from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect

from .config import settings
from .engines import build_engine
from .engines.base import SpeechEngine
from .sessions import SessionManager

logger = logging.getLogger("helm.speech")
logging.basicConfig(level=logging.INFO)

engine: SpeechEngine | None = None
sessions: SessionManager | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global engine, sessions
    engine = await build_engine()
    sessions = SessionManager(engine)
    logger.info("Speech engine ready: %s", engine.name)
    yield
    if engine:
        await engine.unload()
    engine = None
    sessions = None


app = FastAPI(title="Helm Speech Service", lifespan=lifespan)


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = settings.speech_service_token.strip()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    if authorization.removeprefix("Bearer ").strip() != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "helm-speech", "check": "live"}


@app.get("/readyz")
async def readyz() -> dict[str, Any]:
    if not engine or not engine.ready():
        raise HTTPException(
            status_code=503,
            detail={"status": "unavailable", "service": "helm-speech", "check": "ready"},
        )
    return {
        "status": "ok",
        "service": "helm-speech",
        "check": "ready",
        "engine": engine.name,
        "active_sessions": sessions.active_count if sessions else 0,
    }


@app.post("/sessions", dependencies=[Depends(require_token)])
async def create_session() -> dict[str, Any]:
    assert sessions is not None
    try:
        state = await sessions.create()
    except RuntimeError as exc:
        code = str(exc)
        if code == "concurrency_limit":
            raise HTTPException(status_code=429, detail=code) from exc
        raise HTTPException(status_code=503, detail=code) from exc
    return {
        "session_id": state.id,
        "sample_rate": settings.sample_rate,
        "engine": engine.name if engine else "unknown",
    }


@app.delete("/sessions/{session_id}", dependencies=[Depends(require_token)])
async def delete_session(session_id: str) -> dict[str, str]:
    assert sessions is not None
    await sessions.close(session_id, "deleted")
    return {"status": "closed", "session_id": session_id}


@app.websocket("/sessions/{session_id}/audio")
async def audio_ws(websocket: WebSocket, session_id: str) -> None:
    assert sessions is not None
    token = websocket.query_params.get("token") or ""
    expected = settings.speech_service_token.strip()
    if expected and token != expected:
        await websocket.close(code=4401)
        return

    state = sessions.get(session_id)
    if not state or state.closed:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    sample_rate = settings.sample_rate

    async def pump_outbound() -> None:
        while True:
            payload = await state.outbound.get()
            await websocket.send_json(payload)
            if payload.get("type") == "session.closed":
                break

    import asyncio

    pump = asyncio.create_task(pump_outbound())
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if "bytes" in message and message["bytes"] is not None:
                try:
                    await sessions.push_audio(session_id, message["bytes"], sample_rate)
                except KeyError:
                    await websocket.close(code=4404)
                    break
                except TimeoutError:
                    await websocket.close(code=4408)
                    break
                except ValueError as exc:
                    await websocket.send_json(
                        {"type": "session.error", "session_id": session_id, "code": str(exc)}
                    )
                    break
            elif "text" in message and message["text"] is not None:
                import json

                try:
                    ctrl = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                kind = ctrl.get("type")
                if kind == "control.finalize":
                    final = await sessions.finalize(session_id)
                    if final is None:
                        await websocket.send_json(
                            {
                                "type": "session.error",
                                "session_id": session_id,
                                "code": "empty_transcript",
                                "message": "No speech to finalize",
                            }
                        )
                elif kind == "control.cancel":
                    await sessions.close(session_id, "cancelled")
                    break
    except WebSocketDisconnect:
        pass
    finally:
        pump.cancel()
        await sessions.close(session_id, "client_disconnect")
