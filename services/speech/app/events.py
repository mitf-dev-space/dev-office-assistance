from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class TranscriptPartial:
    session_id: str
    text: str
    sequence: int
    ts: float
    confidence: float | None = None
    type: str = "transcript.partial"


@dataclass
class TranscriptFinal:
    session_id: str
    text: str
    sequence: int
    ts: float
    confidence: float | None = None
    type: str = "transcript.final"


@dataclass
class SessionError:
    session_id: str
    code: str
    message: str
    ts: float
    type: str = "session.error"


@dataclass
class SessionClosed:
    session_id: str
    reason: str
    ts: float
    type: str = "session.closed"


def event_dict(event: object) -> dict[str, Any]:
    return asdict(event)  # type: ignore[arg-type]
