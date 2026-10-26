"""The talker's tools: a few fast ones, and the hand-off to background tasks.

start_task and continue_task are non-blocking Live tools whose answers arrive
when the conversation is idle (WHEN_IDLE): the voice keeps talking while the
worker runs, and speaks the result at the next pause. See tasks.py.
"""

from __future__ import annotations

from typing import Any

from google.adk.tools import FunctionTool, ToolContext
from google.genai import types

from . import learning, lens, taste
from .connection import for_talker, report


async def look_at_frontmost_app(tool_context: ToolContext) -> dict[str, Any]:
    """What the user has in front of them right now: the app, its window title,
    and the page address when it is a browser. Use it when they say "this",
    "here" or "what I'm looking at"."""
    conn = for_talker(tool_context)
    result = await conn.bridge.call("frontmost_app")
    await report(conn, None, "mac", "Looked at the front app", result.get("app") or result.get("error"))
    return result


async def quick_picks(kind: str, tool_context: ToolContext, also_like: str = "", near: str = "", genre: str = "") -> dict[str, Any]:
    """Instant picks from Qloo for the user's taste, for a quick "what should I watch / listen to /
    where should I eat". Say the first pick and why in one sentence; offer more. Never recommend
    anything that didn't come from here or from a task.

    Args:
        kind: artist, album, movie, tv_show, book, podcast, video_game, place or brand.
        also_like: Things to steer by, comma-separated ("Past Lives").
        near: For places: a neighbourhood or city.
        genre: For places: restaurant, bar, cocktail_bar, wine_bar, cafe, coffee, bakery,
            music_venue, museum, bookstore, record_store, hotel or park.
    """
    conn = for_talker(tool_context)
    result = await taste.picks(conn, None, kind, near, genre, also_like, "", 3)
    for pick in result.get("picks") or []:
        pick.pop("id", None)
        pick.pop("image", None)
    return result


async def start_task(goal: str, title: str, tool_context: ToolContext) -> dict[str, Any]:
    """Hand real work to a background task: anything with several steps, the user's accounts or
    data (calendar, reminders, notes, email, Slack, Notion, Drive, Docs, Sheets, Maps, contacts,
    messages), planning, gifting, trips, comparing tastes, writing something, or doing things on
    the screen. Before calling, say one
    short line ("On it"). The answer comes back later; until then, don't guess at the result.

    Args:
        goal: Everything the worker needs, in the user's words plus context from the conversation
            ("Plan dinner with Sam on Friday: find a place we'd both love near Williamsburg, and
            book it for 8pm if I say yes").
        title: Three to five words for the task's card ("Friday dinner with Sam").
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.start(goal, title)
    return await conn.tasks.until_stop(task)


async def continue_task(task_id: str, tool_context: ToolContext, reply: str = "", approved: bool | None = None) -> dict[str, Any]:
    """Pass the user's answer to a task that asked a question or wants a yes or no, or give a
    finished task a follow-up ("make it 9pm instead").

    Args:
        task_id: The task's id from start_task.
        reply: The user's answer or follow-up, in their words.
        approved: For a yes-or-no confirmation: true for yes, false for no.
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.find(task_id)
    if task is None:
        return {"error": f"No task {task_id}."}
    if not conn.tasks.answer(task, reply, approved):
        if task.status in ("done", "failed") and reply:
            conn.tasks.follow_up(task, reply)
        else:
            return task.for_talker()
    return await conn.tasks.until_stop(task)


async def cancel_task(task_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Stop a task the user no longer wants ("never mind", "stop that").

    Args:
        task_id: The task's id.
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.find(task_id)
    if task is None:
        return {"error": f"No task {task_id}."}
    conn.tasks.cancel(task)
    return {"task_id": task.id, "status": task.status}


def _background(fn: Any) -> FunctionTool:
    tool = FunctionTool(fn)
    tool.behavior = types.Behavior.NON_BLOCKING
    tool.response_scheduling = types.FunctionResponseScheduling.WHEN_IDLE
    return tool


TOOLS = [
    look_at_frontmost_app, quick_picks, _background(lens.taste_lens), lens.tap_lens_item, _background(lens.why_this),
    *learning.TALKER_TOOLS, _background(start_task), _background(continue_task), cancel_task,
]
