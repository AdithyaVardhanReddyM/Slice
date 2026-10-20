"""The link to one connected Mac: tool calls out, tool results back.

Tools that need the Mac (what's on screen, open a link, click) call
`bridge_for(tool_context).call(...)`, which sends a `tool_call` over the
WebSocket and waits for the app's `tool_result` with the same id.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import WebSocket
from google.adk.tools import ToolContext

# A tool the Mac doesn't answer in this long gets an error instead of hanging the turn.
CALL_TIMEOUT_S = 20.0


class MacBridge:
    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._send_lock = asyncio.Lock()

    async def send_json(self, msg: dict[str, Any]) -> None:
        async with self._send_lock:
            await self.ws.send_json(msg)

    async def send_audio(self, pcm: bytes) -> None:
        async with self._send_lock:
            await self.ws.send_bytes(pcm)

    async def call(self, name: str, args: dict[str, Any] | None = None, timeout: float = CALL_TIMEOUT_S) -> dict[str, Any]:
        """Run a tool on the Mac and return its result (or {"error": ...})."""
        call_id = uuid.uuid4().hex[:12]
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[call_id] = future
        try:
            await self.send_json({"type": "tool_call", "id": call_id, "name": name, "args": args or {}})
            return await asyncio.wait_for(future, timeout)
        except TimeoutError:
            return {"error": f"The Mac did not answer {name} within {int(timeout)} s."}
        finally:
            self._pending.pop(call_id, None)

    def resolve(self, call_id: str, result: dict[str, Any] | None, error: str | None) -> None:
        future = self._pending.get(call_id)
        if future and not future.done():
            future.set_result({"error": error} if error else (result or {}))

    async def activity(self, kind: str, label: str, detail: str | None = None) -> None:
        """A line for the island's activity list, e.g. kind="qloo", label='Search "Radiohead"'."""
        await self.send_json({"type": "activity", "kind": kind, "label": label, "detail": detail})

    def cancel_all(self) -> None:
        for future in self._pending.values():
            if not future.done():
                future.set_result({"error": "The Mac disconnected."})
        self._pending.clear()


# ADK session id -> the Mac that session belongs to.
_bridges: dict[str, MacBridge] = {}


def register(session_id: str, bridge: MacBridge) -> None:
    _bridges[session_id] = bridge


def unregister(session_id: str) -> None:
    bridge = _bridges.pop(session_id, None)
    if bridge:
        bridge.cancel_all()


def bridge_for(tool_context: ToolContext) -> MacBridge:
    bridge = _bridges.get(tool_context.session.id)
    if bridge is None:
        raise RuntimeError("No Mac is connected to this session.")
    return bridge
