"""Slice for Mac routes (/mac/*), mounted by server.py.

GET /mac/health  {"ok": true, "model": ...}
WS  /mac/live    one connected Mac. JSON text frames both ways, plus binary audio:
                 Mac -> brain is PCM16 mono 16 kHz while the talk keys are held,
                 brain -> Mac is PCM16 mono 24 kHz of the agent's voice.
The message types are listed in docs/mac-plan.md.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, Session
from google.genai import types

from . import bridge as B
from .agent import LIVE_LOCATION, LIVE_MODEL, build_agent, live_run_config

APP_NAME = "slice_mac"
MIC_MIME = "audio/pcm;rate=16000"

router = APIRouter(prefix="/mac")
_sessions = InMemorySessionService()
_runner = Runner(app_name=APP_NAME, agent=build_agent(), session_service=_sessions)


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "model": LIVE_MODEL, "location": LIVE_LOCATION}


class LiveConversation:
    """One Gemini Live conversation for a connected Mac.

    It opens on the first thing the user says or types (not on connect, so an idle
    app costs nothing) and reopens when Gemini ends it, which it does after about
    ten minutes of audio.
    """

    def __init__(self, bridge: B.MacBridge, session: Session) -> None:
        self.bridge = bridge
        self.session = session
        self.queue: LiveRequestQueue | None = None
        self.task: asyncio.Task[None] | None = None

    def ensure(self) -> LiveRequestQueue:
        if self.queue is None or self.task is None or self.task.done():
            self.queue = LiveRequestQueue()
            self.task = asyncio.create_task(self._pump(self.queue))
        return self.queue

    async def _pump(self, queue: LiveRequestQueue) -> None:
        try:
            async for event in _runner.run_live(
                user_id=self.session.user_id,
                session_id=self.session.id,
                live_request_queue=queue,
                run_config=live_run_config(),
            ):
                await self._forward(event)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # Gemini closed the stream or refused the request
            print(f"mac: live session ended: {type(err).__name__}: {err}", flush=True)
            await self.bridge.send_json({"type": "error", "message": f"{type(err).__name__}: {err}"[:300]})
        finally:
            queue.close()

    async def _forward(self, event: Event) -> None:
        for part in (event.content.parts if event.content and event.content.parts else []):
            blob = part.inline_data
            if blob and blob.data and (blob.mime_type or "").startswith("audio/"):
                await self.bridge.send_audio(blob.data)
        for role, tx in (("user", event.input_transcription), ("agent", event.output_transcription)):
            if tx and tx.text:
                await self.bridge.send_json(
                    {"type": "transcript", "role": role, "text": tx.text, "partial": bool(event.partial)}
                )
        if event.interrupted:
            await self.bridge.send_json({"type": "interrupted"})
        if event.turn_complete:
            await self.bridge.send_json({"type": "turn_complete"})

    def close(self) -> None:
        if self.queue:
            self.queue.close()
        if self.task and not self.task.done():
            self.task.cancel()
        self.queue = self.task = None


def _authorized(ws: WebSocket) -> bool:
    """When MAC_CLIENT_TOKEN is set (any hosted brain), the app must send it as a bearer token."""
    expected = os.environ.get("MAC_CLIENT_TOKEN")
    if not expected:
        return True
    return ws.headers.get("authorization") == f"Bearer {expected}"


@router.websocket("/live")
async def live(ws: WebSocket) -> None:
    if not _authorized(ws):
        await ws.close(code=4401)
        return
    await ws.accept()
    bridge = B.MacBridge(ws)
    session = await _sessions.create_session(app_name=APP_NAME, user_id="mac")
    B.register(session.id, bridge)
    convo = LiveConversation(bridge, session)
    await bridge.send_json({"type": "ready", "model": LIVE_MODEL})

    try:
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if frame.get("bytes") is not None:
                convo.ensure().send_realtime(types.Blob(data=frame["bytes"], mime_type=MIC_MIME))
                continue
            msg = json.loads(frame.get("text") or "{}")
            kind = msg.get("type")
            if kind == "text" and (msg.get("text") or "").strip():
                convo.ensure().send_content(types.Content(role="user", parts=[types.Part(text=msg["text"])]))
            elif kind == "talk_start":
                convo.ensure().send_activity_start()
            elif kind == "talk_end":
                if convo.queue:
                    convo.queue.send_activity_end()
            elif kind == "tool_result":
                bridge.resolve(msg.get("id", ""), msg.get("result"), msg.get("error"))
            elif kind == "reset":
                # A fresh conversation: new ADK session, new Live session on next input.
                convo.close()
                B.unregister(session.id)
                session = await _sessions.create_session(app_name=APP_NAME, user_id="mac")
                B.register(session.id, bridge)
                convo = LiveConversation(bridge, session)
    except WebSocketDisconnect:
        pass
    finally:
        convo.close()
        B.unregister(session.id)
