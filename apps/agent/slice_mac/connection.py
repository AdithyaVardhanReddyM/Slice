"""One connected Mac: who it is, its taste profile, and its tasks.

The talker's tools find it through the talker's ADK session id; the worker's
tools through the worker session of the task they run in.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from google.adk.tools import ToolContext

from . import memory
from .bridge import MacBridge

if TYPE_CHECKING:
    from .tasks import Task, TaskManager


@dataclass
class Connection:
    bridge: MacBridge
    user_id: str = "anonymous"
    # The Mac keeps the profile (it's local-first) and sends it in `hello`; see taste.py.
    profile: dict[str, Any] = field(default_factory=dict)
    timezone: str | None = None
    tasks: "TaskManager | None" = None
    # Speaks to the user through the talker when no talker tool call is waiting.
    notify_talker: Callable[[str], None] | None = None
    # The taste lens's last ranking of the screen, for "open that one" (lens.py).
    lens: list[dict[str, Any]] = field(default_factory=list)
    lens_for: str = ""
    # The "very you" nudge: when it last went out, and what was already looked at.
    last_nudge: float = float("-inf")
    noticed: set[str] = field(default_factory=set)
    # Settings > General > "Use my taste" off: answers come from generic.py, not Qloo.
    taste_off: bool = False
    # When the user last spoke or typed (monotonic), so a yes to a task is theirs, not the talker's.
    last_input_at: float = 0.0
    # Learning (learning.py): names already looked up, the last "add to your taste?" pill,
    # and the pending re-read of the taste after the loves changed.
    seen: dict[str, dict[str, Any] | None] = field(default_factory=dict)
    last_learn_nudge: float = float("-inf")
    reread_job: "asyncio.Task[None] | None" = None

    @property
    def city(self) -> str | None:
        return self.profile.get("city") or None

    def seed_ids(self) -> list[str]:
        """The loves that steer Qloo (the strongest 20; memory.signal_seeds)."""
        return [s["id"] for s in memory.signal_seeds(self.profile)]


_by_talker_session: dict[str, Connection] = {}
_by_worker_session: dict[str, tuple[Connection, "Task"]] = {}


def register_talker(session_id: str, conn: Connection) -> None:
    _by_talker_session[session_id] = conn


def unregister_talker(session_id: str) -> None:
    _by_talker_session.pop(session_id, None)


def register_worker(session_id: str, conn: Connection, task: "Task") -> None:
    _by_worker_session[session_id] = (conn, task)


def unregister_worker(session_id: str) -> None:
    _by_worker_session.pop(session_id, None)


def for_talker(tool_context: ToolContext) -> Connection:
    conn = _by_talker_session.get(tool_context.session.id)
    if conn is None:
        raise RuntimeError("No Mac is connected to this session.")
    return conn


def for_worker(tool_context: ToolContext) -> tuple[Connection, "Task"]:
    found = _by_worker_session.get(tool_context.session.id)
    if found is None:
        raise RuntimeError("This tool only runs inside a task.")
    return found


async def report(conn: Connection, task: "Task | None", kind: str, label: str, detail: str | None = None) -> None:
    """One line for the island's activity list and, inside a task, its card."""
    await conn.bridge.activity(kind, label, detail, task.id if task else None)
    if task and conn.tasks:
        conn.tasks.step(task, f"{label} ({detail})" if detail else label)


async def save_profile(conn: Connection, profile: dict[str, Any]) -> None:
    """The Mac keeps the profile: hand it the new one."""
    conn.profile = profile
    await conn.bridge.send_json({"type": "profile", "profile": profile})
