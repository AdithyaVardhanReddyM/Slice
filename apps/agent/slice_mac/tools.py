"""The talker's tools: a few fast ones, and the hand-off to background tasks.

start_task and continue_task are non-blocking Live tools whose answers arrive
when the conversation is idle (WHEN_IDLE): the voice keeps talking while the
worker runs, and speaks the result at the next pause. See tasks.py.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from google.adk.tools import FunctionTool, ToolContext
from google.genai import types

from . import learning, lens, qloo, taste
from .connection import Connection, for_talker, report


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
    where should I eat". The picks show as a card in the island (picture, why, play or directions),
    so say only the first pick and why in one sentence, and offer more. Never recommend anything
    that didn't come from here or from a task.

    Args:
        kind: artist, album, movie, tv_show, book, podcast, video_game, place or brand.
        also_like: Things to steer by, comma-separated ("Past Lives").
        near: For places: a neighbourhood or city.
        genre: For places: restaurant, bar, cocktail_bar, wine_bar, cafe, coffee, bakery,
            music_venue, museum, bookstore, record_store, hotel or park.
    """
    conn = for_talker(tool_context)
    result = await taste.picks(conn, None, kind, near, genre, also_like, "", 3)
    if result.get("picks"):
        await show_picks(conn, kind, result, near or conn.city or "", genre, also_like)
    for pick in result.get("picks") or []:
        pick.pop("id", None)
        pick.pop("image", None)
    if result.get("picks"):
        result["note"] = "The card with all three is in the island."
    return result


# What a card is called, by kind (places by genre).
_CARD_TITLES = {
    "movie": "Films for you", "tv_show": "Shows for you", "artist": "Artists for you", "album": "Albums for you",
    "book": "Books for you", "podcast": "Podcasts for you", "video_game": "Games for you", "brand": "Brands for you",
}
_PLACE_TITLES = {
    "restaurant": "Dinner", "bar": "Drinks", "cocktail_bar": "Cocktails", "wine_bar": "Wine", "cafe": "Coffee",
    "coffee": "Coffee", "bakery": "Bakeries", "music_venue": "Live music", "museum": "Museums",
    "bookstore": "Bookshops", "record_store": "Record shops", "hotel": "Hotels", "park": "Parks",
}


async def show_picks(conn: Connection, kind: str, result: dict[str, Any], near: str, genre: str, also_like: str) -> None:
    """The quick picks as a card in the island, under the talker's answer: the first one large, the
    other two below. Why each one fits (the loves that drive it most, from Qloo's explainability)
    follows a moment later in the same card, so the answer isn't kept waiting for it."""
    picks = result["picks"]
    area = near.split(",")[0].strip()
    if kind == "place":
        title = f"{_PLACE_TITLES.get(genre, 'Places')} near {area}" if area else _PLACE_TITLES.get(genre, "Places for you")
    else:
        title = _CARD_TITLES.get(kind, "Picks for you")
    card: dict[str, Any] = {
        "id": uuid.uuid4().hex[:10], "kind": kind, "genre": genre or None, "title": title,
        "taste": "popular" if result.get("for") == "anyone" else "yours",
        "items": [_card_item(p, kind) for p in picks],
    }
    await conn.bridge.send_json({"type": "picks", "picks": card})
    if card["taste"] == "yours" and any(p.get("id") for p in picks):
        asyncio.create_task(_explain_picks(conn, card, kind, [p.get("id") for p in picks], also_like))


def _card_item(pick: dict[str, Any], kind: str) -> dict[str, Any]:
    loc = pick.get("location") or {}
    item = {k: pick.get(k) for k in ("name", "image", "year", "description", "neighborhood", "address", "price_level", "url")}
    item["kind"] = pick.get("kind") or kind
    item["lat"], item["lon"] = loc.get("lat"), loc.get("lon")
    return {k: v for k, v in item.items() if v not in (None, "")}


async def _explain_picks(conn: Connection, card: dict[str, Any], kind: str, ids: list[str | None], also_like: str) -> None:
    try:
        sig = await taste.signals_for(conn, also_like)
        scores = await qloo.with_timeout(qloo.score(kind, sig.ids, [i for i in ids if i], age=sig.age), 20)
        drivers = taste.standouts(scores) if scores else {}
        for item, pid in zip(card["items"], ids):
            names = [sig.names[s] for s in drivers.get(pid or "", []) if s in sig.names][:2]
            if names:
                item["because"] = names
        if any(item.get("because") for item in card["items"]):
            await conn.bridge.send_json({"type": "picks", "picks": card})
    except Exception as err:  # the card already shows; the reasons are a bonus
        print(f"mac: reasons for quick picks failed: {err}", flush=True)


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
