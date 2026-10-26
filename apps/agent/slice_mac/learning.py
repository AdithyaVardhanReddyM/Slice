"""The learning loop for a connected Mac: Slice gets to know the user's taste as they go.

- What they say: "I loved Aftersun", "not for me", "I'm vegetarian" (the talker's
  taste_feedback and remember_about_me, the worker's note_feedback and remember_fact).
- What they do: a track playing or a film page open (`noticed` from the Mac's
  watchers), a taste-lens badge tapped, "why do I love this?", a thumbs up or down
  on a card (`feedback` frames).
- Quiet signals add up in memory.observe; when one clears the bar, an "Add it to
  your taste?" pill drops from the notch (at most one every 20 minutes; the rest
  wait in Settings > You). The answer comes back as `learn_answer`.
- After the loves change, the taste is re-read a few seconds later (taste.reread)
  and the Mac gets the new profile; the journal says what changed and why.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import time
from typing import Any
from zoneinfo import ZoneInfo

from google.adk.tools import ToolContext

from . import memory, qloo, taste
from .connection import Connection, for_talker, for_worker, report, save_profile

LEARN_NUDGE_EVERY_S = float(os.environ.get("MAC_LEARN_NUDGE_EVERY_S", "1200"))
REREAD_AFTER_S = 5.0

# A card's tag ("Watch", "Vinyl", "Dinner") to the Qloo kinds its title could be.
_TAG_KINDS = {
    "watch": "movie,tv_show", "film": "movie", "movie": "movie", "show": "tv_show", "series": "tv_show",
    "listen": "artist,album,podcast", "vinyl": "artist,album", "album": "album", "artist": "artist", "music": "artist",
    "podcast": "podcast", "read": "book", "book": "book", "brand": "brand", "gift": "brand",
    "coffee": "place", "lunch": "place", "dinner": "place", "drinks": "place", "bar": "place", "breakfast": "place",
    "brunch": "place", "place": "place", "stay": "place", "gig": "artist",
}


def today(conn: Connection) -> str:
    try:
        now = dt.datetime.now(ZoneInfo(conn.timezone)) if conn.timezone else dt.datetime.now()
    except Exception:
        now = dt.datetime.now()
    return now.date().isoformat()


def schedule_reread(conn: Connection) -> None:
    """Re-read the taste a moment after the loves change (several changes, one re-read)."""
    if conn.reread_job and not conn.reread_job.done():
        conn.reread_job.cancel()

    async def later() -> None:
        await asyncio.sleep(REREAD_AFTER_S)
        try:
            entry = await taste.reread(conn.profile)
        except Exception as err:
            print(f"mac: re-reading the taste failed: {err}", flush=True)
            return
        await save_profile(conn, conn.profile)
        if entry:
            await conn.bridge.activity("qloo", entry["text"])

    conn.reread_job = asyncio.create_task(later())


async def resolve(conn: Connection, name: str, kind: str = "") -> dict[str, Any] | None:
    """A name to a Qloo entity, once per connection."""
    key = f"{kind}:{name.strip().lower()}"
    if key not in conn.seen:
        hits = await qloo.resolve([name], kind) or (await qloo.resolve([name]) if kind else [])
        conn.seen[key] = hits[0] if hits else None
    return conn.seen[key]


async def observe(conn: Connection, entity: dict[str, Any] | None, event: str) -> None:
    """One quiet signal; may end in an "add it to your taste?" pill."""
    if not entity or conn.taste_off:
        return
    suggestion = memory.observe(conn.profile, entity, event, today(conn))
    await save_profile(conn, conn.profile)
    if suggestion:
        await offer(conn, suggestion)


async def offer(conn: Connection, suggestion: dict[str, Any]) -> None:
    now = time.monotonic()
    if now - conn.last_learn_nudge < LEARN_NUDGE_EVERY_S:
        return  # It waits in Settings > You.
    conn.last_learn_nudge = now
    await conn.bridge.send_json({"type": "nudge", "nudge": {
        "id": f"learn-{suggestion['id']}", "kind": "learn", "title": f"Add {suggestion['name']} to your taste?",
        "line": f"{suggestion['why']}.", "action": "Add to my taste",
        "learn": {k: suggestion.get(k) for k in ("id", "name", "kind", "image")},
    }})


async def answer(conn: Connection, entity_id: str, accept: bool) -> None:
    """The pill's (or Settings') answer to a suggestion."""
    found = await memory.answer_suggestion(conn.profile, entity_id, accept)
    await save_profile(conn, conn.profile)
    if found and accept:
        await conn.bridge.activity("qloo", f"Added {found['name']} to your taste")
        schedule_reread(conn)


async def love(conn: Connection, thing: str, source: str, why: str = "", kind: str = "",
               entity: dict[str, Any] | None = None) -> dict[str, Any]:
    entity = entity or await resolve(conn, thing, kind)
    if entity is None:
        return {"error": f"Qloo doesn't know {thing!r}; try its exact title or the artist's name."}
    added = await memory.add_loves(conn.profile, [entity], source, why=why)
    await save_profile(conn, conn.profile)
    if added:
        schedule_reread(conn)
    return {"saved": entity["name"], "kind": entity.get("kind"), "new": bool(added),
            "note": "Added to their taste." if added else "Already one of their loves; it now counts for more."}


async def dislike(conn: Connection, thing: str, why: str = "", kind: str = "",
                  entity: dict[str, Any] | None = None) -> dict[str, Any]:
    entity = entity or await resolve(conn, thing, kind)
    was_love = bool(entity and any(s.get("id") == entity["id"] for s in conn.profile.get("seeds") or []))
    row = await memory.add_dislike(conn.profile, entity or thing, why=why)
    await save_profile(conn, conn.profile)
    if was_love:
        schedule_reread(conn)
    if row is None:
        return {"saved": thing, "note": "Kept as a note: they don't like it."}
    return {"saved": row["name"], "note": "It won't be picked for them again."}


async def card_feedback(conn: Connection, title: str, verdict: str, tag: str = "") -> None:
    """A thumbs up or down on a card in the island."""
    kind = _TAG_KINDS.get(tag.strip().lower(), "")
    if verdict == "up":
        out = await love(conn, title, "liked", why="you gave it a thumbs up", kind=kind)
    else:
        out = await dislike(conn, title, why="you gave it a thumbs down", kind=kind)
    ok = not out.get("error")
    await conn.bridge.send_json({"type": "feedback_ack", "title": title, "verdict": verdict, "ok": ok,
                                 "name": out.get("saved"), "message": out.get("error")})
    if ok:
        await conn.bridge.activity("qloo", ("Added " if verdict == "up" else "Noted ") + str(out.get("saved"))
                                   + (" to your taste" if verdict == "up" else " isn't for you"))


# --- tools ------------------------------------------------------------------------------

_VERDICTS = {"love": "love", "loved": "love", "like": "love", "liked": "love", "yes": "love",
             "dislike": "dislike", "disliked": "dislike", "hate": "dislike", "no": "dislike", "not": "dislike"}


async def _feedback(conn: Connection, thing: str, verdict: str, why: str) -> dict[str, Any]:
    v = _VERDICTS.get(verdict.strip().lower().split(" ")[0], "love")
    if v == "love":
        return await love(conn, thing, "said", why=why or "you said you love it")
    return await dislike(conn, thing, why=why or "you said it isn't for you")


async def taste_feedback(thing: str, verdict: str, tool_context: ToolContext, why: str = "") -> dict[str, Any]:
    """The user says they love something ("I loved Aftersun", "add Big Thief to my taste") or that
    it isn't for them ("not for me", "I can't stand horror films"): save it to their taste, so
    every pick from now on follows it. Say in a few words what you saved.

    Args:
        thing: The film, show, artist, book, place or brand, by name.
        verdict: "love" or "dislike".
        why: Their reason, in their words, if they gave one.
    """
    conn = for_talker(tool_context)
    out = await _feedback(conn, thing, verdict, why)
    await report(conn, None, "qloo", ("Saved " if not out.get("error") else "Couldn't save ") + thing, out.get("note") or out.get("error"))
    return out


async def remember_about_me(fact: str, tool_context: ToolContext, about: str = "") -> dict[str, Any]:
    """Remember something about the user (or a saved person) that isn't a thing they love: "I'm
    vegetarian", "I don't drink", "I hate loud bars", "Sam is allergic to nuts", "I'm an early riser".
    Plans and picks follow it from now on.

    Args:
        fact: The fact in plain words, as about them ("Doesn't eat meat").
        about: A saved person's first name, or empty for the user.
    """
    conn = for_talker(tool_context)
    saved = memory.add_fact(conn.profile, fact, about=about or "me", source="said")
    await save_profile(conn, conn.profile)
    await report(conn, None, "slice", "Remembered", fact)
    return {"saved": fact, "new": saved is not None}


async def note_feedback(thing: str, verdict: str, tool_context: ToolContext, why: str = "") -> dict[str, Any]:
    """The user picked one of your suggestions for themselves, said they loved something, or turned
    something down: save it to THEIR taste (not for gifts or other people; use remember_person).

    Args:
        thing: Its name.
        verdict: "love" (they picked it or loved it) or "dislike".
        why: Their reason, if any.
    """
    conn, task = for_worker(tool_context)
    out = await _feedback(conn, thing, verdict, why)
    await report(conn, task, "qloo", f"Saved how you feel about {thing}", out.get("note") or out.get("error"))
    return out


async def remember_fact(fact: str, tool_context: ToolContext, about: str = "") -> dict[str, Any]:
    """Remember a plain fact about the user or a saved person ("Doesn't eat pork", "Takes the
    subway", "Sam doesn't drink"), so later plans follow it.

    Args:
        fact: The fact in plain words.
        about: A saved person's first name, or empty for the user.
    """
    conn, task = for_worker(tool_context)
    saved = memory.add_fact(conn.profile, fact, about=about or "me", source="said")
    await save_profile(conn, conn.profile)
    await report(conn, task, "slice", "Remembered", fact)
    return {"saved": fact, "new": saved is not None}


TALKER_TOOLS = [taste_feedback, remember_about_me]
WORKER_TOOLS = [note_feedback, remember_fact]
