"""Background tasks: work the talker hands to the worker.

A task runs the worker agent (worker.py) in the background while the talker
keeps talking. It stops for one of five reasons, and the talker learns of each:

- needs_input: the worker asked the user something (`ask`).
- needs_confirmation: a tool is about to send, book, buy or change something
  (`confirm_action`). The user answers by voice or with the island's buttons.
- done, failed, cancelled.

The talker's start_task / continue_task tools await the next stop (they are
non-blocking Live tools, so the voice carries on meanwhile) and get a short
payload to speak from. When a task stops with no talker call waiting (the user
pressed a button, or the call timed out), the update reaches the talker as a
text note instead (`Connection.notify_talker`). Every change also goes to the
Mac as a `task` frame for the island's card.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .connection import Connection

RUNNING = "running"
NEEDS_INPUT = "needs_input"
NEEDS_CONFIRMATION = "needs_confirmation"
DONE = "done"
FAILED = "failed"
CANCELLED = "cancelled"
PAUSED = {NEEDS_INPUT, NEEDS_CONFIRMATION}
ENDED = {DONE, FAILED, CANCELLED}

# How long a talker call waits before telling the user the task is still going.
TALKER_WAIT_S = 240.0
# A running task says what it's doing after this long in silence, then at this interval.
PROGRESS_FIRST_S = 22.0
PROGRESS_EVERY_S = 50.0
PROGRESS_MAX = 3


@dataclass
class Task:
    id: str
    title: str
    goal: str
    status: str = RUNNING
    steps: list[str] = field(default_factory=list)
    question: str | None = None
    confirm: dict[str, str] | None = None
    say: str | None = None
    cards: list[dict[str, Any]] = field(default_factory=list)
    # Richer cards for the island: a person, a day's timeline, a map, a note (see show_view).
    views: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    worker_session_id: str | None = None
    # Started by the Mac on a schedule (a weekly job): the island shows it, the voice stays quiet.
    quiet: bool = False
    # When the current question or yes-or-no was raised (monotonic): an answer the user gave
    # before it can't be theirs (tools.continue_task).
    asked_at: float = 0.0
    # The operator is on the screen (computer.py): the glow and the cursor show what's happening,
    # so the talker doesn't narrate every click.
    on_screen: bool = False
    _reply: asyncio.Future[Any] | None = None
    _progress: asyncio.Task[None] | None = None
    # The worker can call two asking tools at once (send it AND repeat weekly); they take turns.
    _asking: asyncio.Lock = field(default_factory=asyncio.Lock)
    _changed: asyncio.Event = field(default_factory=asyncio.Event)
    _run: asyncio.Task[None] | None = None
    _waiters: int = 0

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "steps": self.steps[-6:],
            "question": self.question,
            "confirm": self.confirm,
            "say": self.say,
            "cards": self.cards,
            "views": self.views,
            "error": self.error,
        }

    def for_talker(self) -> dict[str, Any]:
        """What the talker needs to speak about this stop, and nothing more."""
        out: dict[str, Any] = {"task_id": self.id, "status": self.status}
        if self.status == NEEDS_INPUT:
            out["question"] = self.question
        elif self.status == NEEDS_CONFIRMATION:
            out["confirm"] = (self.confirm or {}).get("title")
            out["note"] = "Read this to the user and ask yes or no; pass the answer with continue_task(approved=...)."
        elif self.status == DONE:
            out["say"] = self.say or "Done."
        elif self.status == FAILED:
            out["error"] = self.error
        elif self.status == RUNNING:
            out["note"] = "Still working; the result will come to you when it's ready."
        return out


class TaskManager:
    def __init__(self, conn: "Connection") -> None:
        self.conn = conn
        self.tasks: dict[str, Task] = {}

    # --- from the talker -------------------------------------------------

    def start(self, goal: str, title: str, quiet: bool = False) -> Task:
        # Gemini can repeat a tool call during a long wait; reuse a running task with the same goal.
        for task in self.tasks.values():
            if task.goal == goal and task.status not in ENDED:
                return task
        task = Task(id=uuid.uuid4().hex[:8], title=title.strip() or goal[:60], goal=goal, quiet=quiet)
        self.tasks[task.id] = task
        self._launch(task, goal)
        return task

    def follow_up(self, task: Task, message: str) -> None:
        """More work on a finished task, in the same worker session (it remembers what it did)."""
        task.say, task.error, task.question, task.confirm = None, None, None, None
        self._launch(task, message)

    async def until_stop(self, task: Task, timeout: float = TALKER_WAIT_S) -> dict[str, Any]:
        task._waiters += 1
        try:
            while task.status == RUNNING:
                task._changed.clear()
                try:
                    await asyncio.wait_for(task._changed.wait(), timeout)
                except TimeoutError:
                    break
            return task.for_talker()
        finally:
            task._waiters -= 1

    def answer(self, task: Task, reply: str = "", approved: bool | None = None) -> bool:
        """The user's answer to a paused task. False if it wasn't waiting for one."""
        if task.status not in PAUSED or task._reply is None or task._reply.done():
            return False
        if task.status == NEEDS_CONFIRMATION:
            if approved is None:
                approved = reply.strip().lower().startswith(("y", "ok", "sure", "go", "do it", "confirm", "book", "send"))
            task._reply.set_result(bool(approved))
        else:
            task._reply.set_result(reply)
        return True

    def cancel(self, task: Task) -> None:
        if task.status in ENDED:
            return
        if task._run and not task._run.done():
            task._run.cancel()
        self._set(task, CANCELLED)

    def cancel_all(self) -> None:
        """The Mac disconnected: stop every task and forget their worker sessions."""
        from .connection import unregister_worker

        for task in list(self.tasks.values()):
            if task._run and not task._run.done():
                task._run.cancel()
            if task.worker_session_id:
                unregister_worker(task.worker_session_id)

    def find(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id.strip())

    # --- from the worker's tools -------------------------------------------

    async def ask(self, task: Task, question: str) -> str:
        async with task._asking:
            task.question = question
            task._reply = asyncio.get_running_loop().create_future()
            task.asked_at = time.monotonic()
            self._set(task, NEEDS_INPUT)
            try:
                return str(await task._reply)
            finally:
                task.question, task._reply = None, None
                if task.status == NEEDS_INPUT:
                    self._set(task, RUNNING)

    async def confirm_action(self, task: Task, title: str, detail: str = "") -> bool:
        """Ask before acting. True only on a clear yes."""
        async with task._asking:
            task.confirm = {"title": title, "detail": detail}
            task._reply = asyncio.get_running_loop().create_future()
            task.asked_at = time.monotonic()
            self._set(task, NEEDS_CONFIRMATION)
            try:
                approved = bool(await task._reply)
            finally:
                task.confirm, task._reply = None, None
                if task.status == NEEDS_CONFIRMATION:
                    self._set(task, RUNNING)
        self.step(task, "You said go ahead" if approved else "You said no")
        return approved

    def step(self, task: Task, line: str) -> None:
        task.steps.append(line)
        self._emit(task)

    def show_cards(self, task: Task, cards: list[dict[str, Any]]) -> None:
        task.cards = cards[:6]
        self._emit(task)

    def show_view(self, task: Task, view: dict[str, Any]) -> None:
        """Add a rich card ({"type": "person" | "timeline" | "map" | "note", ...}); a newer one of
        the same type and key replaces the old one."""
        same = lambda v: v.get("type") == view.get("type") and v.get("key") == view.get("key")  # noqa: E731
        # Ten: a week-long trip is a map, up to eight day timelines and the written plan.
        task.views = [v for v in task.views if not same(v)][-9:] + [view]
        self._emit(task)

    # --- internals ----------------------------------------------------------

    def _launch(self, task: Task, message: str) -> None:
        from .worker import run_worker  # worker imports this module

        self._set(task, RUNNING)
        task._run = asyncio.create_task(self._run(task, run_worker, message))
        if not task.quiet:
            task._progress = asyncio.create_task(self._keep_posted(task))

    async def _run(self, task: Task, run_worker: Any, message: str) -> None:
        try:
            # Spoken and shown as plain text: no markdown emphasis.
            task.say = re.sub(r"[*_`#]+", "", await run_worker(self.conn, task, message))
            self._set(task, DONE)
        except asyncio.CancelledError:
            if task.status not in ENDED:
                self._set(task, CANCELLED)
        except Exception as err:  # the worker or a tool failed
            print(f"mac: task {task.id} failed: {type(err).__name__}: {err}", flush=True)
            task.error = f"{type(err).__name__}: {err}"[:300]
            self._set(task, FAILED)
        finally:
            if task._progress and not task._progress.done():
                task._progress.cancel()

    async def _keep_posted(self, task: Task) -> None:
        """A long task shouldn't leave the user in silence: after a while, and then now and then,
        the talker gets the latest step to say in a few words (the card shows it too)."""
        await asyncio.sleep(PROGRESS_FIRST_S)
        said = 0
        while task.status == RUNNING and said < PROGRESS_MAX:
            if self.conn.notify_talker and task.steps and not task.on_screen:
                said += 1
                self.conn.notify_talker(
                    f"[Background task \"{task.title}\" is still working; its latest step: {task.steps[-1]}. "
                    "Tell the user in one short sentence what it's doing right now, nothing more: don't guess the result, "
                    "and never say anything is confirmed, booked or done.]"
                )
            await asyncio.sleep(PROGRESS_EVERY_S)

    def _set(self, task: Task, status: str) -> None:
        was = task.status
        task.status = status
        task._changed.set()
        self._emit(task)
        # Nobody is waiting on this stop: tell the talker in words.
        stopped = status in PAUSED or (status in ENDED and was != status)
        if stopped and task._waiters == 0 and self.conn.notify_talker and status != CANCELLED and not task.quiet:
            self.conn.notify_talker(_note(task))

    def _emit(self, task: Task) -> None:
        asyncio.get_running_loop().create_task(self.conn.bridge.send_json({"type": "task", "task": task.snapshot()}))


def _note(task: Task) -> str:
    payload = task.for_talker()
    if task.status == DONE:
        body = f"finished: {payload['say']}"
    elif task.status == NEEDS_INPUT:
        body = f"needs an answer from the user: {task.question} (pass it with continue_task, task_id {task.id})"
    elif task.status == NEEDS_CONFIRMATION:
        body = f"needs a yes or no: {payload['confirm']} (continue_task, task_id {task.id}, approved=...)"
    else:
        return (f"[Background task \"{task.title}\" didn't work ({task.error}). Tell the user briefly that it "
                "didn't work and offer to try again; don't guess at a reason or ask them for details.]")
    return f"[Background task \"{task.title}\" {body}. Tell the user briefly, in your own words.]"
