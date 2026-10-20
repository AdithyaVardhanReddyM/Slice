"""Slice for Mac routes (/mac/*), mounted by server.py.

GET  /mac/health                 {"ok": true, "model": ...}
WS   /mac/live                   one connected Mac (the talker, its tasks, Mac tools)
GET  /mac/search?q=&kind=        Qloo entities, for the Taste settings
POST /mac/profile/build          {seeds: [names], city, base?} -> a taste profile
GET  /mac/accounts?user=         which cloud accounts are connected
POST /mac/accounts/connect       {user, app} -> {url} to sign in

The WebSocket carries JSON text frames both ways plus binary audio (PCM16 mono,
16 kHz up while the talk keys are held, 24 kHz down). Message types are listed
in docs/mac-plan.md.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, Session
from google.genai import types
from pydantic import BaseModel

from . import accounts, qloo, taste
from .agent import LIVE_LOCATION, LIVE_MODEL, build_agent, live_run_config
from .bridge import MacBridge
from .connection import Connection, register_talker, unregister_talker
from .tasks import TaskManager

APP_NAME = "slice_mac"
MIC_MIME = "audio/pcm;rate=16000"
HELLO_WAIT_S = 3.0

router = APIRouter(prefix="/mac")
_sessions = InMemorySessionService()
_runner = Runner(app_name=APP_NAME, agent=build_agent(), session_service=_sessions)


def _token_ok(header: str | None) -> bool:
    """When MAC_CLIENT_TOKEN is set (any hosted brain), the app must send it as a bearer token."""
    expected = os.environ.get("MAC_CLIENT_TOKEN")
    return not expected or header == f"Bearer {expected}"


def _require_token(request: Request) -> None:
    if not _token_ok(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="Bad or missing token")


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "model": LIVE_MODEL, "location": LIVE_LOCATION}


@router.get("/search", dependencies=[Depends(_require_token)])
async def search(q: str, kind: str = "") -> dict[str, Any]:
    return {"results": await qloo.search(q, kind)}


class BuildProfile(BaseModel):
    seeds: list[str]
    city: str = ""
    base: dict[str, Any] | None = None


@router.post("/profile/build", dependencies=[Depends(_require_token)])
async def build_profile(body: BuildProfile) -> dict[str, Any]:
    return {"profile": await taste.build_profile(body.seeds, body.city, body.base)}


@router.get("/accounts", dependencies=[Depends(_require_token)])
async def account_status(user: str) -> dict[str, Any]:
    try:
        return {"apps": accounts.APPS, "connected": await accounts.status(user)}
    except Exception as err:
        return {"apps": accounts.APPS, "connected": {}, "error": str(err)[:300]}


class Connect(BaseModel):
    user: str
    app: str


@router.post("/accounts/connect", dependencies=[Depends(_require_token)])
async def account_connect(body: Connect) -> dict[str, Any]:
    try:
        return {"url": await accounts.connect_link(body.user, body.app)}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err)[:300]) from err


def _now(timezone: str | None) -> str:
    try:
        now = dt.datetime.now(ZoneInfo(timezone)) if timezone else dt.datetime.now()
    except Exception:
        now = dt.datetime.now()
    return now.strftime("%A %d %B %Y, %H:%M")


class LiveConversation:
    """One Gemini Live conversation for a connected Mac.

    It opens on the first thing the user says or types (not on connect, so an idle
    app costs nothing) and reopens when Gemini ends it, which it does after about
    ten minutes of audio. Tasks outlive it: they belong to the connection.
    """

    def __init__(self, conn: Connection, session: Session) -> None:
        self.conn = conn
        self.session = session
        self.queue: LiveRequestQueue | None = None
        self.task: asyncio.Task[None] | None = None

    def ensure(self) -> LiveRequestQueue:
        if self.queue is None or self.task is None or self.task.done():
            self.queue = LiveRequestQueue()
            self.task = asyncio.create_task(self._pump(self.queue))
        return self.queue

    def say_note(self, text: str) -> None:
        """A background update for the talker to relay (see tasks.py)."""
        self.ensure().send_content(types.Content(role="user", parts=[types.Part(text=text)]))

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
            await self.conn.bridge.send_json({"type": "error", "message": f"{type(err).__name__}: {err}"[:300]})
        finally:
            queue.close()

    async def _forward(self, event: Event) -> None:
        bridge = self.conn.bridge
        for part in (event.content.parts if event.content and event.content.parts else []):
            blob = part.inline_data
            if blob and blob.data and (blob.mime_type or "").startswith("audio/"):
                await bridge.send_audio(blob.data)
        for role, tx in (("user", event.input_transcription), ("agent", event.output_transcription)):
            if tx and tx.text:
                await bridge.send_json({"type": "transcript", "role": role, "text": tx.text, "partial": bool(event.partial)})
        if event.interrupted:
            await bridge.send_json({"type": "interrupted"})
        if event.turn_complete:
            await bridge.send_json({"type": "turn_complete"})

    def close(self) -> None:
        if self.queue:
            self.queue.close()
        if self.task and not self.task.done():
            self.task.cancel()
        self.queue = self.task = None


async def _new_session(conn: Connection) -> Session:
    return await _sessions.create_session(
        app_name=APP_NAME,
        user_id=conn.user_id,
        state={"profile_summary": taste.summary_for_talker(conn.profile), "now": _now(conn.timezone)},
    )


async def _hello(ws: WebSocket, conn: Connection) -> list[dict[str, Any]]:
    """The app's first frame says who it is; anything else that arrives first is kept for later."""
    early: list[dict[str, Any]] = []
    try:
        frame = await asyncio.wait_for(ws.receive(), HELLO_WAIT_S)
    except TimeoutError:
        return early
    if frame["type"] == "websocket.disconnect":
        raise WebSocketDisconnect()
    msg = json.loads(frame.get("text") or "{}") if frame.get("text") else {}
    if msg.get("type") == "hello":
        conn.user_id = str(msg.get("user_id") or "anonymous")[:64]
        conn.profile = msg.get("profile") or {}
        conn.timezone = msg.get("timezone")
        if os.environ.get("MAC_DEBUG"):
            print(f"mac: hello from {conn.user_id} ({len(conn.profile.get('seeds') or [])} loves, {conn.timezone})", flush=True)
    elif msg:
        early.append(msg)
    return early


@router.websocket("/live")
async def live(ws: WebSocket) -> None:
    if not _token_ok(ws.headers.get("authorization")):
        await ws.close(code=4401)
        return
    await ws.accept()
    conn = Connection(bridge=MacBridge(ws))
    conn.tasks = TaskManager(conn)
    convo: LiveConversation | None = None
    session: Session | None = None
    try:
        early = await _hello(ws, conn)
        session = await _new_session(conn)
        register_talker(session.id, conn)
        convo = LiveConversation(conn, session)
        conn.notify_talker = lambda text: convo.say_note(text) if convo else None
        await conn.bridge.send_json({"type": "ready", "model": LIVE_MODEL})

        async def handle(msg: dict[str, Any]) -> None:
            nonlocal convo, session
            assert convo and session and conn.tasks
            kind = msg.get("type")
            if os.environ.get("MAC_DEBUG") and kind not in ("tool_result",):
                print(f"mac: from the Mac: {kind}", flush=True)
            if kind == "text" and (msg.get("text") or "").strip():
                convo.ensure().send_content(types.Content(role="user", parts=[types.Part(text=msg["text"])]))
            elif kind == "talk_start":
                convo.ensure().send_activity_start()
            elif kind == "talk_end":
                if convo.queue:
                    convo.queue.send_activity_end()
            elif kind == "tool_result":
                conn.bridge.resolve(msg.get("id", ""), msg.get("result"), msg.get("error"))
            elif kind in ("task_reply", "task_confirm", "task_cancel"):
                task = conn.tasks.find(str(msg.get("id") or ""))
                if task is None:
                    return
                if kind == "task_cancel":
                    conn.tasks.cancel(task)
                elif kind == "task_confirm":
                    conn.tasks.answer(task, approved=bool(msg.get("approved")))
                else:
                    conn.tasks.answer(task, str(msg.get("text") or ""))
            elif kind == "profile":
                conn.profile = msg.get("profile") or {}
            elif kind == "reset":
                # A fresh conversation: new talker session, new Live session on next input.
                convo.close()
                unregister_talker(session.id)
                session = await _new_session(conn)
                register_talker(session.id, conn)
                convo = LiveConversation(conn, session)

        for msg in early:
            await handle(msg)
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if frame.get("bytes") is not None:
                convo.ensure().send_realtime(types.Blob(data=frame["bytes"], mime_type=MIC_MIME))
                continue
            await handle(json.loads(frame.get("text") or "{}"))
    except WebSocketDisconnect:
        pass
    finally:
        if convo:
            convo.close()
        if conn.tasks:
            conn.tasks.cancel_all()
        if session:
            unregister_talker(session.id)
        conn.bridge.cancel_all()
