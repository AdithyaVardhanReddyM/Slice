"""The taste lens: whatever is on screen, read and ranked for a taste.

One screenshot, one fast vision call that lists what's on it and where
(Gemini's box_2d, 0-1000), then Qloo: titles and artists are scored for the
taste with reasons (taste.rank), products rank by their brand, and listings
(Airbnb, hotels) by how much of the taste is within a 10-minute walk
(plans.score_places). The Mac draws badges over the items (`lens_show`), and
"play it" / "open that one" clicks one (`tap_lens_item`).

The same screen reading turns a profile page someone has open (Letterboxd,
Goodreads, Spotify) into a saved person's taste, and `noticed` turns what's
playing or open into an occasional "very you" nudge from the notch.

Measured 2026-10-21 on a Netflix-like page: gemini-3.5-flash-lite found all
11 titles with correct boxes and kinds in 3 s (3.8 Flash took 7 s).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
import uuid
from typing import Any
from urllib.parse import urlparse

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from . import learning
from .connection import Connection, for_talker, for_worker, report
from .plans import score_places
from .taste import explain, rank, save_person, whose

LENS_MODEL = os.environ.get("MAC_LENS_MODEL", "gemini-3.5-flash-lite")
LENS_FALLBACK = os.environ.get("MAC_LENS_FALLBACK", "gemini-3.8-flash")
# The proactive nudge: at most one an hour, and only for a strong fit.
NUDGE_EVERY_S = float(os.environ.get("MAC_NUDGE_EVERY_S", "3600"))
NUDGE_MIN_MATCH = int(os.environ.get("MAC_NUDGE_MIN_MATCH", "94"))
TOP_BADGES = 3

_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


_ITEM = types.Schema(type="OBJECT", properties={
    "name": types.Schema(type="STRING"),
    "kind": types.Schema(type="STRING"),
    "box_2d": types.Schema(type="ARRAY", items=types.Schema(type="INTEGER")),
    "location": types.Schema(type="STRING"),
    "brand": types.Schema(type="STRING"),
    "price": types.Schema(type="STRING"),
    "signal": types.Schema(type="STRING"),
}, required=["name", "kind", "box_2d"])
_SCHEMA = types.Schema(type="OBJECT", properties={
    "site": types.Schema(type="STRING"),
    "city": types.Schema(type="STRING"),
    "owner": types.Schema(type="STRING"),
    "items": types.Schema(type="ARRAY", items=_ITEM),
}, required=["site", "items"])

LIST_PROMPT = """\
This is the user's screen. List every distinct thing on it they could choose:
titles, shows, artists, albums, books, podcasts, products, places or rental
listings. For each give:
- name: exactly as shown (for a product, its short product name; for a listing, its title line),
- kind: movie, tv_show, artist, album, book, podcast, place, brand, product or listing,
- box_2d: [ymin, xmin, ymax, xmax] from 0 to 1000 around the item's tile or card,
- location: for listings and places, the area or address text shown ("Apartment in Santos"),
- brand: for products, the brand; price if shown.
Also give site (netflix, airbnb, amazon, spotify, letterboxd, …) and city if the page shows one.
Leave out menus, buttons, ads for the site itself and section headings. {extra}"""

PROFILE_PROMPT = """\
This is someone's profile or list page (Letterboxd, Goodreads, Spotify, Apple
Music, a wishlist, a chat about what they like). List what they love: their
favourites, highest-rated or most-played things. For each: name exactly as
shown, kind (movie, tv_show, artist, album, book, podcast, brand), box_2d
[ymin, xmin, ymax, xmax] 0-1000, and signal: why it counts (favourite,
5 stars, top artist, wishlist). Give owner (their display name) and site.
Most telling first, at most 12. Skip things they rated low. {extra}"""


async def read_screen(conn: Connection, prompt: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Screenshot plus a structured read of it: ({site, city, owner, items}, screenshot info)."""
    shot = await conn.bridge.call("screenshot", {}, timeout=15)
    if shot.get("error"):
        return {"error": shot["error"], "items": []}, shot
    image = base64.b64decode(shot["image"])
    config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=_SCHEMA)
    contents = [types.Content(role="user", parts=[types.Part(text=prompt),
                                                  types.Part.from_bytes(data=image, mime_type=shot.get("mime") or "image/jpeg")])]
    for model in (LENS_MODEL, LENS_FALLBACK):
        try:
            res = await asyncio.wait_for(_client().aio.models.generate_content(model=model, contents=contents, config=config), 25)
            data = json.loads(res.text or "{}")
            break
        except Exception as err:
            print(f"mac: lens read on {model} failed: {type(err).__name__}: {err}", flush=True)
            data = {"error": "Couldn't read the screen.", "items": []}
    items = []
    for item in data.get("items") or []:
        box = item.get("box_2d") or []
        if not item.get("name") or len(box) != 4:
            continue
        item["box_2d"] = [max(0, min(1000, int(v))) for v in box]
        items.append(item)
    data["items"] = items[:30]
    data["url"] = shot.get("url")
    return data, shot


# Qloo tag words that say what a thing is rather than what it feels like; the lens shows feel.
_FLAT_TAGS = {"tv show", "tv series", "movie", "film", "series", "drama", "comedy", "english", "usa", "united states",
              "television", "streaming", "netflix", "original"}


def _words(row: dict[str, Any], take: int = 2) -> list[str]:
    """Two short words Qloo uses for the thing ("Political thriller", "Witty"), for a top badge."""
    out: list[str] = []
    for tag in (row.get("entity") or {}).get("tags") or []:
        name = str(tag).strip()
        if not name or name.lower() in _FLAT_TAGS or len(name) > 18 or name.lower() in {o.lower() for o in out}:
            continue
        out.append(name[:1].upper() + name[1:])
        if len(out) == take:
            break
    return out


def _badge(row: dict[str, Any], top: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"box": row["box_2d"], "label": row["label"], "detail": row.get("detail") if top else None,
                           "top": top, "name": row["name"], "own": bool(row.get("own")) and not row.get("disliked"),
                           "disliked": bool(row.get("disliked"))}
    if isinstance(row.get("match"), int):
        out["match"] = row["match"]
    if top:
        out["tags"] = _words(row)
    return out


async def _mac(conn: Connection, tool: str, args: dict[str, Any] | None = None, timeout: float = 4) -> dict[str, Any]:
    """A call the lens can live without (an older Mac build may not know it)."""
    try:
        return await conn.bridge.call(tool, args or {}, timeout=timeout)
    except Exception as err:
        return {"error": str(err)}


async def lens(conn: Connection, task: Any, question: str = "", for_person: str = "") -> dict[str, Any]:
    """Read the screen, rank what's on it for a taste, draw badges. Shared by the talker and the worker."""
    started = time.monotonic()
    await _mac(conn, "lens_scan")  # a light sweeps the screen while it's read
    data, _ = await read_screen(conn, LIST_PROMPT.format(extra=f"The user asked: {question}" if question else ""))
    if data.get("error") and not data["items"]:
        await _mac(conn, "lens_clear")
        return {"error": data["error"]}
    items = data["items"]
    if not items:
        await _mac(conn, "lens_clear")
        return {"error": "I couldn't find anything to rank on this screen."}
    listings = [i for i in items if i.get("kind") == "listing" or (i.get("kind") == "place" and i.get("location"))]
    rows: list[dict[str, Any]] = []
    if listings and len(listings) >= len(items) / 2:
        city = data.get("city") or conn.city or ""
        scored = await score_places(conn, [i.get("location") or i["name"] for i in listings], city, for_person)
        if scored.get("error"):
            await _mac(conn, "lens_clear")
            return scored
        for item, place in zip(listings, scored["places"]):
            n = place.get("loved_nearby")
            closest = ", ".join(c["name"] for c in (place.get("closest") or [])[:2])
            rows.append({**item, "match": n, "label": f"{n} place{'s' if n != 1 else ''} you'd love" if n else "Quiet for your taste",
                         "detail": f"Within 10 min: {closest}" if closest else None})
        rows.sort(key=lambda r: r["match"] if r["match"] is not None else -1, reverse=True)
        kind_of_list = "listings"
    else:
        ranked = await rank(conn, items, "", for_person)
        for r in ranked:
            if r.get("own"):
                rows.append({**r, "label": "One of your loves" if not for_person else f"One of {for_person}'s loves", "detail": None, "own": True})
            if r.get("disliked"):
                rows.append({**r, "label": "Not for you", "detail": None, "own": True})
            if r["match"] is None:
                continue
            if r.get("generic"):
                rows.append({**r, "label": f"{r['match']} overall", "detail": "Popular in general (taste off)"})
                continue
            by_brand = r.get("brand") and r.get("kind") == "product"
            who = "you" if not for_person else for_person
            detail = (f"{r['brand']} fits {who}" if by_brand else
                      (f"Because {'you love' if not for_person else for_person + ' loves'} {' and '.join(r.get('because') or [])}"
                       if r.get("because") else None))
            rows.append({**r, "label": f"{r['match']}%", "detail": detail})
        kind_of_list = "titles"
    if not rows:
        await _mac(conn, "lens_clear")
        return {"error": "Qloo doesn't know the things on this screen."}
    # The loves themselves badge last and never take a top spot.
    rows = [r for r in rows if not r.get("own")] + [r for r in rows if r.get("own")]
    conn.lens = rows
    conn.lens_for = for_person
    badges = [_badge(r, i < TOP_BADGES and not r.get("own")) for i, r in enumerate(rows)]
    plays = any(r.get("kind") in ("movie", "tv_show", "artist", "album", "podcast") for r in rows[:TOP_BADGES])
    summary = {"count": len(rows), "what": kind_of_list, "whose": whose(for_person or "you"),
               "hint": "Say \u201cplay the first one\u201d" if plays else "Say \u201copen the first one\u201d"}
    shown = await conn.bridge.call("lens_show", {"badges": badges, "summary": summary}, timeout=8)
    took = time.monotonic() - started
    await report(conn, task, "qloo", f"Ranked {len(rows)} {kind_of_list} on screen for {whose(for_person or 'you')} taste", f"{took:.1f} s")
    top = [{"rank": i + 1, "name": r["name"], "label": r["label"], "why": r.get("detail")}
           for i, r in enumerate(rows[:TOP_BADGES]) if not r.get("own")]
    return {"site": data.get("site"), "top": top, "ranked": len(rows), "badges_on_screen": not shown.get("error"),
            "note": "Say the first one and why in a sentence; offer to open it (tap_lens_item)."}


async def tap(conn: Connection, which: str) -> dict[str, Any]:
    rows = conn.lens
    if not rows:
        return {"error": "Nothing is ranked on screen right now; use taste_lens first."}
    pick = None
    if which.strip().isdigit():
        n = int(which.strip())
        pick = rows[n - 1] if 1 <= n <= len(rows) else None
    else:
        want = re.sub(r"[^a-z0-9]+", " ", which.lower()).strip()
        pick = next((r for r in rows if want and want in re.sub(r"[^a-z0-9]+", " ", r["name"].lower())), None)
    pick = pick or rows[0]
    if pick.get("entity") and not pick.get("own") and conn.lens_for == "":
        await learning.observe(conn, pick["entity"], "tapped")
    ymin, xmin, ymax, xmax = pick["box_2d"]
    await conn.bridge.call("lens_clear", {}, timeout=4)
    res = await conn.bridge.call("computer", {"action": "click", "x": round((xmin + xmax) / 2 * 0.999),
                                              "y": round((ymin + ymax) / 2 * 0.999), "intent": f"Open {pick['name']}"}, timeout=10)
    if res.get("error"):
        return res
    return {"opened": pick["name"]}


# --- what's playing or open: "why do I love this?" ---------------------------------------

# Page titles on media sites, to the thing's name and the kinds it can be.
_SITES = [
    ("letterboxd.com", r"^‎?(.+?)\s*\(\d{4}\)", "movie,tv_show"),
    ("imdb.com", r"^(.+?)\s*\((?:TV Series |TV Mini Series )?\d{4}", "movie,tv_show"),
    ("netflix.com", r"^(.+?)\s*(?:\||-)\s*Netflix", "movie,tv_show"),
    ("goodreads.com", r"^(.+?)\s+by\s+", "book"),
    ("open.spotify.com", r"(?:by|-)\s+(.+?)\s*\|\s*Spotify|^(.+?)\s*\|\s*Spotify", "artist"),
    ("music.apple.com", r"by\s+(.+?)\s+-\s+Apple Music|^‎?(.+?)\s+-\s+Apple Music", "artist"),
    ("youtube.com", r"^(?:\(\d+\)\s*)?(.+?)\s+-\s+.+?\s+-\s+YouTube", "artist"),
    ("wikipedia.org", r"^(.+?)\s*(?:\((?:film|band|TV series|novel|album)\))?\s+-\s+Wikipedia", ""),
]


def thing_from_page(title: str, url: str) -> tuple[str, str] | None:
    """(name, kind) from a media page's title, or None if it isn't one."""
    host = urlparse(url).netloc.lower() if url else ""
    for site, pattern, kind in _SITES:
        if site in host:
            m = re.search(pattern, title or "")
            name = next((g for g in (m.groups() if m else ()) if g), None)
            return (name.strip(), kind) if name else None
    return None


async def what_is_on(conn: Connection) -> tuple[str, str, str] | None:
    """What the user is listening to or looking at: (name, kind, how it was found)."""
    playing = await conn.bridge.call("music_now_playing", {}, timeout=6)
    if playing.get("artist"):
        return playing["artist"], "artist", f"{playing.get('track')} by {playing['artist']}"
    front = await conn.bridge.call("frontmost_app", {}, timeout=6)
    found = thing_from_page(front.get("windowTitle") or "", front.get("url") or "")
    if found:
        return found[0], found[1], found[0]
    return None


def _nudge(out: dict[str, Any], heading: str, show: bool) -> dict[str, Any]:
    return {"id": uuid.uuid4().hex[:8], "kind": "why", "title": heading, "line": out["line"], "show": show,
            "why": {k: out.get(k) for k in ("thing", "for", "match", "because", "shared", "also", "line")}}


async def why_now(conn: Connection, thing: str = "", kind: str = "", for_person: str = "") -> dict[str, Any]:
    if not thing:
        found = await what_is_on(conn)
        if found is None:
            return {"error": "Nothing is playing and the page in front isn't a film, show, book or artist I can read. Ask about it by name."}
        thing, kind, _ = found
    out = await explain(conn, thing, kind, for_person)
    if out.get("error"):
        return out
    if not for_person and not out.get("generic"):
        await learning.observe(conn, await learning.resolve(conn, thing, kind), "asked_why")
    await conn.bridge.send_json({"type": "nudge", "nudge": _nudge(out, out["thing"]["name"], show=True)})
    await report(conn, None, "qloo", f"Why {out['thing']['name']} fits", f"{out['match']}% match" if out.get("match") is not None else None)
    return {k: out.get(k) for k in ("match", "line", "because")} | {"thing": out["thing"]["name"],
                                                                     "note": "The card is in the island. Say the line in your own words."}


async def noticed(conn: Connection, msg: dict[str, Any]) -> None:
    """The Mac saw a new track or media page: it counts towards learning the user's taste
    (learning.observe), and now and then, when it's very much the user, a "very you" pill."""
    if not conn.seed_ids() or conn.taste_off:
        return
    if msg.get("artist"):
        thing, kind = str(msg["artist"]), "artist"
    else:
        found = thing_from_page(str(msg.get("title") or ""), str(msg.get("url") or ""))
        if not found:
            return
        thing, kind = found
    if msg.get("learn", True):
        try:
            await learning.observe(conn, await learning.resolve(conn, thing, kind), "played" if msg.get("artist") else "opened")
        except Exception as err:
            print(f"mac: learning from {thing} failed: {err}", flush=True)
    now = time.monotonic()
    if not msg.get("nudge", True) or now - conn.last_nudge < NUDGE_EVERY_S or thing.lower() in conn.noticed:
        return
    conn.noticed.add(thing.lower())
    try:
        out = await explain(conn, thing, kind)
    except Exception as err:
        print(f"mac: noticing {thing} failed: {err}", flush=True)
        return
    own = out.get("thing", {}).get("name", "").lower() in {s["name"].lower() for s in conn.profile.get("seeds") or []}
    if out.get("error") or own or (out.get("match") or 0) < NUDGE_MIN_MATCH:
        return
    conn.last_nudge = now
    words = [t["name"].lower() for t in (out.get("shared") or [])[:2]]
    carrier = next((n for t in (out.get("shared") or [])[:2] for n in t["with"]), None)
    line = f"Shares {' and '.join(repr(w) for w in words)} with {carrier}" if words and carrier else out["line"]
    nudge = _nudge(out, "Very you", show=False)
    nudge["line"] = line
    await conn.bridge.send_json({"type": "nudge", "nudge": nudge})


# --- tools -----------------------------------------------------------------------


async def taste_lens(tool_context: ToolContext, question: str = "", for_person: str = "") -> dict[str, Any]:
    """Rank what's on the user's screen right now for their taste (or a saved person's) and put
    badges over the best ones: Netflix rows, Spotify, a festival poster, Amazon results (by brand),
    Airbnb or hotel listings (by how much of their taste is a short walk away). Takes a few seconds;
    say "Let me look" first. Then say the top pick and why.

    Args:
        question: The user's words ("which of these would I love", "which is in my kind of area").
        for_person: A saved person ("Maya") instead of the user.
    """
    conn = for_talker(tool_context)
    return await lens(conn, None, question, for_person)


async def tap_lens_item(tool_context: ToolContext, which: str = "1") -> dict[str, Any]:
    """Click one of the things the taste lens ranked, to open or play it ("play it", "open the
    second one", "open Perfect Days").

    Args:
        which: Its rank ("1") or name.
    """
    conn = for_talker(tool_context)
    return await tap(conn, which)


async def why_this(tool_context: ToolContext, thing: str = "", for_person: str = "") -> dict[str, Any]:
    """Why the user loves (or doesn't love) something, from Qloo's taste graph: what's playing,
    the film or book page in front of them, or a thing they name. Shows a card in the island.
    Also "would Sam like this?" (for_person).

    Args:
        thing: Its name; leave empty for what's playing or on screen.
        for_person: A saved person instead of the user.
    """
    conn = for_talker(tool_context)
    return await why_now(conn, thing, "", for_person)


async def rank_screen(tool_context: ToolContext, question: str = "", for_person: str = "") -> dict[str, Any]:
    """Rank what's on the user's screen for their taste (or a saved person's) and put badges over
    the best: titles, artists, products by brand, listings by what's a short walk away.

    Args:
        question: What to rank, in the user's words.
        for_person: A saved person instead of the user.
    """
    conn, task = for_worker(tool_context)
    return await lens(conn, task, question, for_person)


async def learn_taste_from_screen(person: str, tool_context: ToolContext, relation: str = "", birthday: str = "",
                                  age: int = 0, home: str = "") -> dict[str, Any]:
    """Read someone's taste off the page in front of the user (their Letterboxd, Goodreads or
    Spotify profile, a wishlist) and save it as that person's loves. Shows their card.

    Args:
        person: Their first name ("Maya").
        relation: Who they are to the user ("friend").
        birthday: "MM-DD" or a full date, if known.
        age: Their age, if known.
        home: Where they live, if known.
    """
    conn, task = for_worker(tool_context)
    data, shot = await read_screen(conn, PROFILE_PROMPT.format(extra=f"The profile is {person}'s."))
    if data.get("error") and not data["items"]:
        return {"error": data["error"]}
    names = [i["name"] for i in data["items"] if i.get("kind") != "product"][:12]
    if not names:
        return {"error": "I couldn't see anything they love on this page. Is their profile open?"}
    await report(conn, task, "mac", f"Read {person}'s {data.get('site') or 'page'}", f"{len(names)} favourites")
    await conn.bridge.call("lens_show", {"badges": [{"box": i["box_2d"], "label": "Saved", "top": False, "name": i["name"]}
                                                    for i in data["items"][:12]],
                                         "summary": {"line": f"{len(names)} of {person}'s favourites read off this page and saved.", "hint": None}},
                           timeout=6)
    info = {"relation": relation, "birthday": birthday, "age": age or None, "home": home}
    out = await save_person(conn, task, person, names, info)
    out["read_from"] = data.get("site") or shot.get("url")
    return out


TALKER_TOOLS = [taste_lens, tap_lens_item, why_this]
WORKER_TOOLS = [rank_screen, learn_taste_from_screen]
