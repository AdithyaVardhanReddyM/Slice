"""The user's taste profile, and the worker's taste tools.

The profile is local-first: the Mac stores it and sends it in `hello`; the
brain builds and updates it and hands it back (`save_profile`). Shape:

    {"city": "Brooklyn, New York",
     "name": "Alex",                          what to call them (onboarding)
     "seeds":  [{"id", "name", "kind", "image", "source", "at", "weight"}],  things the user loves
     "tags":   [{"name", "type"}],            what those say about them (Qloo)
     "summary": "Two sentences in plain words",
     "dislikes", "facts", "evidence", "suggested", "declined", "journal", "prefs", "onboarding":
              what Slice remembers and learns over time (memory.py),
     "people": {"Sam": [{"id", "name", "kind"}]},  other people's loved things
     "people_notes": {"Sam": ["natural wine bars"]},  loves that aren't Qloo entities
     "people_info": {"Ray": {"age": 74, "home": "Lincoln Park, Chicago", "needs": "uses a walker",
                             "step_free": true, "birthday": "10-29", "relation": "dad", "reads_as": [...]}},
     "routines": [{"id", "title", "goal", "weekday", "time"}],   weekly jobs the Mac starts (plans.py)
     "updated": "2026-10-20T…"}

Every recommendation is Qloo's ranking for the profile's seeds (plus anything
the task adds), so picks never come from a model's memory. Someone else's
picks use their saved loves, their age band and, for places, their home and
whether they need a step-free way in.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from typing import Any

from google import genai
from google.adk.tools import ToolContext

from . import generic, graph, memory, qloo
from .connection import Connection, for_worker, report, save_profile

SUMMARY_MODEL = "gemini-3.8-flash"
_genai: genai.Client | None = None

# A thing the user loves scores about .9+; below this it's a stretch for them.
STRONG_FIT = 0.9
# Brands a person can be given (Qloo's brand `industries`); banks, airlines and teams can't.
GIFT_INDUSTRIES = {
    "Fashion & Apparel", "Accessories", "Footwear", "Beauty & Personal Care", "Fragrance", "Consumer Electronics",
    "Photography", "Home Goods", "Home & Living", "Outdoor Gear", "Outdoor Equipment", "Jewelry", "Stationery",
    "Books", "Music", "Toys & Games", "Food & Beverage", "Eyewear", "Luggage", "Watches", "Art",
}


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def build_profile(seed_names: list[str], city: str = "", base: dict[str, Any] | None = None,
                        entities: list[dict[str, Any]] | None = None, source: str = "settings",
                        facts: list[str] | None = None, prefs: dict[str, Any] | None = None,
                        name: str = "", onboarding: bool = False) -> dict[str, Any]:
    """Loves (names, or entities already found) to a full profile: entities, Qloo tags, a short
    summary. Onboarding also brings what to call them, plain facts and preferences."""
    profile = dict(base or {})
    added = await memory.add_loves(profile, [*(entities or []), *seed_names], source, quiet=True)
    if city:
        profile["city"] = city
    if name.strip():
        profile["name"] = name.strip()
    for text in facts or []:
        memory.add_fact(profile, text, source=source, quiet=True)
    if prefs:
        profile["prefs"] = {**(profile.get("prefs") or {}), **prefs}
    if onboarding:
        profile["onboarding"] = {"done": True, "at": memory.now_iso()}
    if added:
        memory.journal(profile, "started" if onboarding else "added",
                       (f"Started your taste with {memory.names_of(added)}" if onboarding else f"Added {memory.names_of(added)}"),
                       ref=[{k: a[k] for k in ("id", "name", "kind", "image") if a.get(k)} for a in added])
    await reread(profile, note=False)
    profile.setdefault("people", {})
    return profile


async def reread(profile: dict[str, Any], note: bool = True) -> dict[str, Any] | None:
    """What Qloo reads from the loves, again (tags and the summary), after they changed. Notes in
    the journal how the taste moved ("now reads more folk and melancholic").

    The tags are the words the loves themselves share in Qloo (graph.reads_as: "Intimate",
    "Introspective", "Melancholic"); checked 2026-10-26, tag insights for the same loves gave
    "lesbian", "female protagonist" and "friend", which say little about a person."""
    old = [t["name"] for t in profile.get("tags") or []]
    ids = [s["id"] for s in memory.signal_seeds(profile)]
    tags = await graph.reads_as(profile) if ids else []
    if ids and len(tags) < 4:
        tags += [t for t in await qloo.taste_tags(ids, take=10) if t.get("name") and t["name"] not in {x["name"] for x in tags}]
    profile["tags"] = [{"name": t["name"], "type": t["type"]} for t in tags[:14] if t.get("name")]
    profile["summary"] = await _summarise(profile) if ids else ""
    profile["updated"] = memory.now_iso()
    if not note or not old:
        return None
    new = [t["name"] for t in profile["tags"]]
    gained = [t.lower() for t in new[:8] if t not in old[:8]][:2]
    lost = [t.lower() for t in old[:8] if t not in new[:8]][:2]
    if not gained and not lost:
        return None
    text = "Your taste now reads " + ", ".join(
        part for part in (f"more {' and '.join(gained)}" if gained else "", f"less {' and '.join(lost)}" if lost else "") if part)
    return memory.journal(profile, "reread", text, ref={"gained": gained, "lost": lost})


async def _summarise(profile: dict[str, Any]) -> str:
    loves = ", ".join(f"{s['name']} ({s.get('kind') or 'thing'})" for s in memory.signal_seeds(profile))
    tags = ", ".join(t["name"] for t in profile.get("tags") or [])
    if not loves:
        return ""
    facts = "; ".join(memory.facts_about(profile)[:8])
    prompt = (
        "In two short sentences, tell this person what their taste is like, speaking to them (\"You love…\"), "
        "the way a friend who's about to plan their evening would. Plain words, no lists, no names of data sources.\n"
        f"They love: {loves}\nQloo reads their taste as: {tags}\nThey live in: {profile.get('city') or 'unknown'}"
        + (f"\nAlso known about them: {facts}" if facts else "")
    )
    try:
        res = await _client().aio.models.generate_content(model=SUMMARY_MODEL, contents=prompt)
        return (res.text or "").strip()[:400]
    except Exception as err:
        print(f"mac: taste summary failed: {err}", flush=True)
        return ""


def _key(text: str) -> str:
    return text.lower().strip()


def summary_for_talker(profile: dict[str, Any], taste_off: bool = False) -> str:
    if taste_off:
        return ("Taste is OFF for this conversation (the user switched it off to compare): you know nothing about "
                "their taste; answers are the popular picks anyone would get, and you say so.")
    called = f"Call them {profile['name']}. " if profile.get("name") else ""
    if not profile.get("seeds"):
        return called + "No taste profile yet. If it comes up, suggest they add a few things they love in Settings > Taste."
    loves = ", ".join(s["name"] for s in memory.signal_seeds(profile)[:8])
    # The summary speaks to the user ("You love…"), since they read it in Settings.
    summary = f'Their taste, as Slice described it to them: "{profile["summary"]}" ' if profile.get("summary") else ""
    out = f"{called}{summary}They love {loves}. City: {profile.get('city') or 'unknown'}."
    facts = memory.facts_about(profile)
    if facts:
        out += f" Remember: {'; '.join(facts[:10])}."
    dislikes = [d["name"] for d in profile.get("dislikes") or []][-6:]
    if dislikes:
        out += f" Not for them: {', '.join(dislikes)}."
    return out.strip()


def people_line(profile: dict[str, Any]) -> str:
    """Saved people for the worker's instructions: who they are and what they love."""
    notes = profile.get("people_notes") or {}
    info = profile.get("people_info") or {}
    out = []
    for name, likes in (profile.get("people") or {}).items():
        about = info.get(name) or {}
        bits = [about.get("relation"), f"{about['age']}" if about.get("age") else None, about.get("home"), about.get("needs")]
        bits += memory.facts_about(profile, name)[:3]
        who = ", ".join(str(b) for b in bits if b)
        loves = ", ".join([p["name"] for p in likes[:4]] + notes.get(name, [])[:3])
        out.append(f"{name} ({who + '; ' if who else ''}loves {loves or 'unknown'})")
    return "; ".join(out)


def _person(conn: Connection, name: str) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    """A saved person by name, forgiving case: (their name, loves, info)."""
    people = conn.profile.get("people") or {}
    info = conn.profile.get("people_info") or {}
    for saved in list(people) + list(info):
        if saved.lower() == name.strip().lower():
            return saved, people.get(saved, []), info.get(saved, {})
    return name.strip().title(), [], {}


@dataclass
class Signals:
    """Who a recommendation is for: Qloo signal ids, the names behind them, and for one other
    person, their age band, home and access needs."""

    ids: list[str] = field(default_factory=list)
    names: dict[str, str] = field(default_factory=dict)
    age: str | None = None
    home: str | None = None
    step_free: bool = False
    who: str = "you"


async def signals_for(conn: Connection, also_like: str = "", for_person: str = "") -> Signals:
    sig = Signals()
    who = [w.strip() for w in for_person.replace("&", ",").replace(" and ", ",").split(",") if w.strip()]
    others = [w for w in who if w.lower() not in ("me", "us", "i", "myself", "you")]
    for name in others:
        saved, loves, info = _person(conn, name)
        for p in loves:
            sig.ids.append(p["id"])
            sig.names[p["id"]] = p["name"]
        if len(who) == 1:
            sig.age = qloo.age_band(info.get("age"))
            sig.home = info.get("home")
            sig.step_free = bool(info.get("step_free"))
            sig.who = saved
    if not others or len(others) < len(who):
        for s in memory.signal_seeds(conn.profile):
            sig.ids.append(s["id"])
            sig.names[s["id"]] = s["name"]
        if others:
            sig.who = " and ".join(others + ["you"])
    if also_like:
        for hit in await qloo.resolve([n for n in also_like.split(",")]):
            sig.ids.append(hit["id"])
            sig.names[hit["id"]] = hit["name"]
    sig.ids = list(dict.fromkeys(sig.ids))
    return sig


async def point_of(conn: Connection, place: str) -> dict[str, float] | None:
    """A neighbourhood, city, venue or street address to a point: a locality Qloo knows by that
    exact name first (fast, cached), then Apple Maps on the Mac (venues, addresses), then any
    Qloo locality match."""
    if not place.strip():
        return None
    if not re.search(r"\d", place):
        found = await qloo.locate(place, strict=True)
        if found:
            return found
    res = await conn.bridge.call("maps_geocode", {"places": [place]}, timeout=15)
    first = (res.get("points") or [None])[0]
    if isinstance(first, dict) and first.get("lat") is not None:
        return {"lat": float(first["lat"]), "lon": float(first["lon"])}
    return await qloo.locate(place)


async def picks(conn: Connection, task: Any, kind: str, near: str = "", genre: str = "", also_like: str = "",
                for_person: str = "", count: int = 5, accessible: bool = False) -> dict[str, Any]:
    """Shared by the worker's recommend and the talker's quick_picks."""
    if conn.taste_off:
        out = await generic.picks(kind, near or conn.city or "", genre, count)
        await report(conn, task, "slice", f"Popular {kind.replace('_', ' ')} picks (taste off)", f"{len(out['picks'])} picks")
        return out
    sig = await signals_for(conn, also_like, for_person)
    if not sig.ids:
        who = f"{for_person} loves" if for_person and sig.who != "you" else "they love"
        return {"error": f"No taste to go on: I don't know what {who} yet."}
    point = None
    where = near or sig.home or conn.city or ""
    step_free = accessible or sig.step_free
    if kind == "place":
        if not where:
            return {"error": "Where? Give a neighbourhood or city in `near`."}
        point = await point_of(conn, where)
    # Films, music and books follow a place only when one is named ("big in Lisbon"); a home
    # city as a signal drags in whatever is locally popular.
    city = (None if point else where or None) if kind == "place" else (near or None)
    # What the user said isn't for them never comes back (memory.py).
    skip = sig.ids + memory.dislike_ids(conn.profile)
    results = await qloo.with_timeout(qloo.recommend(
        kind, sig.ids, near=point, radius_m=1500 if step_free else 2500, city=city,
        genre=genre or None, take=count + 2, age=sig.age, accessible=step_free and kind == "place", exclude=skip,
    ))
    # The film of a loved series (Downton Abbey) is still the same love.
    loved = {_key(n) for n in sig.names.values()}
    results = [r for r in results if _key(r.get("name") or "") not in loved][:count]
    for rank_, r in enumerate(results, start=1):
        r["rank"] = rank_
    label = f"{kind.replace('_', ' ').title()} picks for {whose(sig.who)} taste"
    if kind == "place":
        label += f" near {where}" + (", step-free" if step_free else "")
    if sig.age:
        label += f", age {sig.age.replace('_', ' ')}"
    await report(conn, task, "qloo", label, f"{len(results)} from Qloo")
    out: dict[str, Any] = {"for": sig.who, "based_on": list(sig.names.values())[:10], "picks": results}
    if step_free and kind == "place":
        out["note"] = "Every pick has a wheelchair-accessible entrance (Qloo place data)."
    return out


# --- scoring a list, and why something fits --------------------------------------------


def _pct(affinity: float) -> int:
    return round(affinity * 100)


def standouts(scores: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    """For each scored thing, the signal ids that drive it more than they drive the rest of the
    list. A few loves weigh on every score; without this, ten titles all say "because you love
    Past Lives"."""
    mean: dict[str, float] = {}
    for found in scores.values():
        for sid, weight in found["drivers"].items():
            mean[sid] = mean.get(sid, 0) + weight / len(scores)
    return {tid: sorted(found["drivers"], key=lambda sid: found["drivers"][sid] - mean.get(sid, 0), reverse=True)
            for tid, found in scores.items()}


def whose(who: str) -> str:
    """"you" -> "your", "Ray" -> "Ray's", "Sam and you" -> "Sam's and your"."""
    if who == "you":
        return "your"
    if who.endswith(" and you"):
        return f"{who[:-8]}'s and your"
    return f"{who}'s"


# A screen's idea of a kind, widened to the Qloo types it could be (a film page can be a series).
_SEARCH_KINDS = {"movie": "movie,tv_show", "tv_show": "tv_show,movie", "album": "album,artist", "artist": "artist",
                 "book": "book", "podcast": "podcast", "place": "place", "brand": "brand", "video_game": "video_game"}


def because_line(names: list[str]) -> str:
    if not names:
        return ""
    return "Because you love " + (names[0] if len(names) == 1 else f"{names[0]} and {names[1]}")


async def rank(conn: Connection, items: list[dict[str, Any]], kind: str = "", for_person: str = "") -> list[dict[str, Any]]:
    """Score things (read off a screen, or named by the user) for a taste. Each item is a dict with
    a "name" (and optional "kind", "brand"); products rank by their brand. Returns the items with
    `match` (0-100), `because` (loved things behind it) and the Qloo entity, best first; things Qloo
    can't place keep match None and sort last; things the user said aren't for them are flagged
    `disliked` and sort last too."""
    if conn.taste_off:
        return await generic.rank(items)
    sig = await signals_for(conn, "", for_person)
    if not sig.ids:
        return [dict(item, match=None) for item in items]
    lookups = []
    for item in items:
        if item.get("kind") == "product" and not item.get("brand"):
            # Product names lead with the brand ("Sony WH-1000XM5 …"); the screen read sometimes skips it.
            item["brand"] = (item.get("name") or "").split(" ")[0]
        if item.get("brand") and (item.get("kind") in ("product", "", None) or kind == "brand"):
            lookups.append((item["brand"], "brand"))
        else:
            k = item.get("kind") if item.get("kind") in qloo.KINDS else kind
            lookups.append((item.get("name") or "", _SEARCH_KINDS.get(k, k or "")))
    hits = await qloo.resolve_each(lookups)
    # Misses get one untyped try (a screen can call a series a film, or a book an album).
    misses = [i for i, hit in enumerate(hits) if hit is None and lookups[i][1]]
    for i, hit in zip(misses, await qloo.resolve_each([(lookups[i][0], "") for i in misses])):
        hits[i] = hit
    by_kind: dict[str, list[str]] = {}
    for hit in hits:
        if hit and hit.get("kind") in qloo.KINDS:
            by_kind.setdefault(hit["kind"], []).append(hit["id"])
    scores: dict[str, dict[str, Any]] = {}
    for k, ids in by_kind.items():
        try:
            scores.update(await qloo.score(k, sig.ids, ids, age=sig.age))
        except Exception as err:  # e.g. albums reject film signals
            print(f"mac: scoring {k} failed: {err}", flush=True)
    drivers = standouts(scores)
    disliked = set(memory.dislike_ids(conn.profile)) if sig.who == "you" else set()
    out = []
    for item, hit in zip(items, hits):
        row = dict(item)
        found = scores.get(hit["id"]) if hit else None
        if hit:
            row["entity"] = {k: v for k, v in hit.items() if k in ("name", "kind", "id", "image", "description")}
        if hit and hit["id"] in disliked:
            row["match"] = None
            row["disliked"] = True
        elif found:
            row["match"] = _pct(found["affinity"])
            row["because"] = [sig.names[i] for i in drivers[hit["id"]] if i in sig.names][:2]
        else:
            row["match"] = None
            # Qloo leaves a signal out of its own results; it's one of the loves themselves.
            row["own"] = bool(hit and hit["id"] in sig.ids)
        out.append(row)
    out.sort(key=lambda r: r["match"] if r["match"] is not None else -1, reverse=True)
    return out


async def explain(conn: Connection, thing: str, kind: str = "", for_person: str = "") -> dict[str, Any]:
    """Why a thing fits someone's taste, from the taste graph: how well (match), which loved things
    it shares Qloo tags with, and what its fans also love."""
    if conn.taste_off:
        return await generic.explain(thing)
    hits = await qloo.resolve([thing], kind) or (await qloo.resolve([thing]) if kind else [])
    if not hits:
        return {"error": f"Qloo doesn't know {thing!r}. Try its exact title or the artist's name."}
    hit = hits[0]
    sig = await signals_for(conn, "", for_person)
    if not sig.ids:
        return {"error": "No taste profile yet: add a few loves in Settings > Taste."}
    k = hit.get("kind") or kind
    own = hit["id"] in sig.ids

    async def match() -> dict[str, Any] | None:
        try:
            return (await qloo.score(k, sig.ids, [hit["id"]], age=sig.age)).get(hit["id"])
        except Exception:
            return None

    async def fans() -> list[dict[str, Any]]:
        try:
            return await qloo.recommend(k, [hit["id"]], take=3, exclude=[hit["id"], *sig.ids])
        except Exception:
            return []

    found, shared, also = await asyncio.gather(match(), qloo.shared_tags([hit["id"]], sig.ids, take=6), fans())
    affinity = found["affinity"] if found else None
    because = [sig.names[i] for i in (found or {}).get("because", []) if i in sig.names][:2]
    words = [t["name"].lower() for t in shared[:3]]
    carriers = list(dict.fromkeys(n for t in shared[:3] for n in t["with"]))[:2] or because
    if own:
        line = f"It's one of {whose(sig.who)} loves."
    elif words and carriers and k in ("artist", "album"):
        line = f"Same {', '.join(words[:2])} streak as {' and '.join(carriers)}."
    elif words and carriers:
        line = f"Shares the {' and '.join(words[:2])} of {' and '.join(carriers)}."
    elif because:
        line = because_line(because) + "."
    else:
        line = f"Qloo finds little in common with {whose(sig.who)} taste."
    if also:
        line += f" Fans of it also love {also[0]['name']}."
    return {
        "thing": {k2: v for k2, v in hit.items() if k2 in ("name", "kind", "image", "description")},
        "for": sig.who,
        "match": _pct(affinity) if affinity is not None else None,
        "strong": bool(own or (affinity or 0) >= STRONG_FIT),
        "because": because,
        "shared": [{"name": t["name"], "with": t["with"][:3]} for t in shared],
        "also": [{"name": a["name"], "kind": a.get("kind"), "image": a.get("image")} for a in also],
        "line": line,
    }


# --- worker tools ------------------------------------------------------------------


async def recommend(kind: str, tool_context: ToolContext, near: str = "", genre: str = "", also_like: str = "",
                    for_person: str = "", count: int = 5, accessible: bool = False) -> dict[str, Any]:
    """Qloo's picks for the user's taste. The ONLY source of recommendations:
    never suggest a film, artist, place or anything else that didn't come from here.

    Args:
        kind: artist, album, movie, tv_show, book, podcast, video_game, place, destination or brand.
        near: For places: a neighbourhood, address or city ("Williamsburg, Brooklyn"). Defaults to the
            person's saved home, else the user's city.
        genre: For places: restaurant, bar, cocktail_bar, wine_bar, cafe, coffee, bakery, music_venue,
            museum, bookstore, record_store, hotel or park.
        also_like: Extra things to steer by, comma-separated names ("Past Lives, Frank Ocean").
        for_person: Recommend for someone saved with remember_person ("Ray"): uses their loves, their
            age and their home, and step-free places if they need them. "Sam and me" blends two tastes.
        count: How many (1-10).
        accessible: Places with a wheelchair-accessible entrance only.
    """
    conn, task = for_worker(tool_context)
    return await picks(conn, task, kind, near, genre, also_like, for_person, max(1, min(count, 10)), accessible)


async def rank_items(names: str, tool_context: ToolContext, kind: str = "", for_person: str = "") -> dict[str, Any]:
    """Rank a list of things for the user's taste (or a saved person's), with a match score and
    which loved things explain it: shows on a page, a festival lineup, films someone suggested,
    gift options. Products rank by brand ("Sony WH-1000XM5" -> give "Sony").

    Args:
        names: The things, separated by semicolons ("The Holdovers; Fast X; Perfect Days").
        kind: What they are if all the same: movie, tv_show, artist, book, podcast, brand, place, …
        for_person: A saved person ("Maya"), or empty for the user.
    """
    conn, task = for_worker(tool_context)
    items = [{"name": n.strip(), "kind": kind} for n in names.split(";") if n.strip()]
    ranked = await rank(conn, items, kind, for_person)
    known = [r for r in ranked if r["match"] is not None]
    await report(conn, task, "qloo", f"Ranked {len(items)} for {whose(for_person or 'you')} taste", f"{len(known)} known to Qloo")
    return {"ranked": [{"name": r["name"], "match": r["match"], "because": r.get("because"),
                        "kind": (r.get("entity") or {}).get("kind")} for r in ranked]}


async def why_i_love(thing: str, tool_context: ToolContext, kind: str = "", for_person: str = "") -> dict[str, Any]:
    """Why something fits the user's taste (or a saved person's), from Qloo's taste graph: a match
    score, the loved things it shares tags with ("melancholic, like Phoebe Bridgers"), and what its
    fans also love. For "why do I love this", "would Sam like this", "why don't I like this".

    Args:
        thing: Its name: a film, show, artist, book, place or brand. For a song, give the artist.
        kind: Optional: movie, tv_show, artist, book, podcast, place, brand.
        for_person: A saved person, or empty for the user.
    """
    conn, task = for_worker(tool_context)
    out = await explain(conn, thing, kind, for_person)
    await report(conn, task, "qloo", f"Why {thing} fits", f"{out['match']}% match" if out.get("match") is not None else out.get("error"))
    if not out.get("error") and conn.tasks:
        conn.tasks.show_view(task, {"type": "why", **out})
    return out


async def find_in_taste_graph(query: str, tool_context: ToolContext, kind: str = "") -> dict[str, Any]:
    """Look a name up in Qloo (its kind, description, address for places).

    Args:
        query: The name, e.g. "Lilia" or "Aftersun".
        kind: Optional: artist, movie, tv_show, book, podcast, place, brand, …
    """
    conn, task = for_worker(tool_context)
    hits = await qloo.search(query, kind)
    await report(conn, task, "qloo", f'Search "{query}"', f"{len(hits)} results")
    return {"results": hits}


async def save_person(conn: Connection, task: Any, person: str, items: list[str], info: dict[str, Any]) -> dict[str, Any]:
    """Shared by remember_person and learn_taste_from_screen: resolve, save, show the person card."""
    found = await qloo.resolve(items) if items else []
    matched = {_key(h["name"]) for h in found}
    # Descriptions ("natural wine bars") aren't entities; keep them as words for the worker.
    notes = [x for x in items if not any(_key(x) in m or m in _key(x) for m in matched)]
    profile = dict(conn.profile)
    people = dict(profile.get("people") or {})
    name, _, old_info = _person(conn, person)
    existing = {p["id"]: p for p in people.get(name, [])}
    for hit in found:
        existing[hit["id"]] = {"id": hit["id"], "name": hit["name"], "kind": hit.get("kind")}
    people[name] = list(existing.values())
    profile["people"] = people
    if notes:
        profile.setdefault("people_notes", {})[name] = sorted(set(profile.get("people_notes", {}).get(name, []) + notes))
    about = {**old_info, **{k: v for k, v in info.items() if v not in (None, "", 0)}}
    if about.get("needs") and "step_free" not in info:
        needs = about["needs"].lower()
        about["step_free"] = any(w in needs for w in ("walker", "wheelchair", "stairs", "mobility", "cane", "step"))
    reads_as = await qloo.common_tags(list(existing), take=4) if existing else []
    if reads_as:
        about["reads_as"] = reads_as
    profile["people_info"] = {**(profile.get("people_info") or {}), name: about}
    await save_profile(conn, profile)
    await report(conn, task, "qloo", f"Saved what {name} loves", ", ".join(h["name"] for h in found) or "nothing matched")
    if conn.tasks and task:
        conn.tasks.show_view(task, {
            "type": "person", "key": name, "name": name, "age": about.get("age"), "relation": about.get("relation"),
            "home": about.get("home"), "needs": about.get("needs"), "step_free": about.get("step_free", False),
            "birthday": about.get("birthday"), "reads_as": about.get("reads_as") or [],
            "loves": [p["name"] for p in people[name]][:8] + notes[:3],
        })
    return {"saved": [h["name"] for h in found], "kept_as_notes": notes, "reads_as": about.get("reads_as"), "info": about}


async def remember_person(person: str, likes: str, tool_context: ToolContext, age: int = 0, home: str = "",
                          needs: str = "", birthday: str = "", relation: str = "") -> dict[str, Any]:
    """Save someone else: what they love, and whatever you know about them (age, home, needs,
    birthday), so you can plan for them or pick gifts later. Shows their card in the island.

    Args:
        person: Their first name ("Ray").
        likes: Things they love, comma-separated ("Frank Sinatra, Casablanca, Downton Abbey").
        age: Their age in years, if known (picks shift with age).
        home: Where they live ("Lincoln Park, Chicago"), for places near them.
        needs: Access or other needs in plain words ("uses a walker"); step-free places follow.
        birthday: "MM-DD" or a full date, if known.
        relation: Who they are to the user ("dad", "friend").
    """
    conn, task = for_worker(tool_context)
    items = [x.strip() for x in likes.split(",") if x.strip()]
    info = {"age": age or None, "home": home, "needs": needs, "birthday": birthday, "relation": relation}
    return await save_person(conn, task, person, items, info)


async def remember_my_taste(likes: str, tool_context: ToolContext) -> dict[str, Any]:
    """Add things the user says they love to their taste profile.

    Args:
        likes: Comma-separated names ("Mitski, Decision to Leave").
    """
    conn, task = for_worker(tool_context)
    profile = conn.profile
    added = await memory.add_loves(profile, likes.split(","), "said", why="you said so")
    if added:
        await reread(profile)
    await save_profile(conn, profile)
    await report(conn, task, "qloo", "Updated your taste profile", f"added {memory.names_of(added)}" if added else "nothing new")
    return {"added": [a["name"] for a in added], "seeds": [s["name"] for s in profile["seeds"]], "summary": profile.get("summary")}


async def compare_tastes(person: str, tool_context: ToolContext) -> dict[str, Any]:
    """What the user and someone else (saved with remember_person) have in common, as Qloo tags.
    Use it to find common ground before picking for both.

    Args:
        person: Their first name.
    """
    conn, task = for_worker(tool_context)
    name, loves, _ = _person(conn, person)
    theirs = [p["id"] for p in loves]
    if not theirs:
        return {"error": f"I don't know what {person} loves yet. Ask, then call remember_person."}
    shared = await qloo.shared_tags(conn.seed_ids(), theirs, take=8)
    await report(conn, task, "qloo", f"Compared your taste with {name}'s", f"{len(shared)} shared threads")
    return {"shared": [{"name": t["name"], "yours": t["with"]} for t in shared]}


async def gift_ideas(person: str, tool_context: ToolContext, budget_usd: int = 0, occasion: str = "") -> dict[str, Any]:
    """A gift shortlist for someone saved with remember_person (or learn_taste_from_screen), across
    categories, each with why they'll love it: brands that fit their taste (with the shop's site),
    a record by an artist they'd love but may not know, and a book. Shows the shortlist in the island.
    For a show near them, use shows_for_me(for_person=...) as well.

    Args:
        person: Their first name.
        budget_usd: Rough budget in dollars (0 = no limit); brands that start above it are left out.
        occasion: e.g. "birthday on the 29th", for the card's title.
    """
    conn, task = for_worker(tool_context)
    name, loves, info = _person(conn, person)
    if conn.taste_off:
        about = ", ".join(str(b) for b in (info.get("relation"), info.get("age")) if b)
        cards = await generic.gifts(name, about, budget_usd)
        if conn.tasks:
            conn.tasks.show_view(task, {"type": "gifts", "key": name, "title": f"Popular gifts for {name} (taste off)", "cards": cards})
        await report(conn, task, "slice", "Popular gift ideas (taste off)", f"{len(cards)} ideas")
        return {"for": name, "ideas": cards, "note": generic.NOTE}
    if not loves:
        return {"error": f"I don't know what {person} loves yet: remember_person, or learn_taste_from_screen if their profile is open."}
    their_ids = [p["id"] for p in loves]
    names = {p["id"]: p["name"] for p in loves}
    # Artists their loves point to. Brands ranked from film loves alone skew to luxury labels;
    # through the music those films imply, they come out giftable (Polaroid, Dr. Martens, Herschel).
    artists = await qloo.recommend("artist", their_ids, take=8, exclude=their_ids)
    bridge = [p["id"] for p in loves if p.get("kind") in ("artist", "brand")] + [a["id"] for a in artists[:5]]
    brands, books = await asyncio.gather(
        qloo.recommend("brand", bridge[:20], take=30),
        qloo.recommend("book", their_ids, take=6, exclude=their_ids),
    )
    loved_names = {_key(n) for n in names.values()}

    def giftable(b: dict[str, Any]) -> bool:
        industries = set(b.get("industries") or [])
        if not industries & GIFT_INDUSTRIES:
            return False
        if budget_usd and (b.get("price_usd") or [None])[0] and b["price_usd"][0] > budget_usd:
            return False
        return not (budget_usd and budget_usd < 400 and "Luxury Goods" in industries)

    brands = [b for b in brands if giftable(b)][:4]
    books = [b for b in books if not any(_key(b["name"]).startswith(n) or n.startswith(_key(b["name"])) for n in loved_names)][:2]
    records = [a for a in artists if _key(a["name"]) not in loved_names][:2]

    # Why each fits: the loved thing Qloo says drives it most.
    async def drivers(kind: str, picks_: list[dict[str, Any]], signal: list[str]) -> dict[str, list[str]]:
        if not picks_:
            return {}
        try:
            return standouts(await qloo.score(kind, signal, [p["id"] for p in picks_]))
        except Exception:
            return {}

    brand_why, book_why, record_why = await asyncio.gather(
        drivers("brand", brands, their_ids + [a["id"] for a in artists[:5]]),
        drivers("book", books, their_ids), drivers("artist", records, their_ids),
    )
    artist_names = {a["id"]: a["name"] for a in artists}

    def reason(pick: dict[str, Any], why: dict[str, list[str]], fallback: str) -> str:
        loved = [names[i] for i in why.get(pick["id"], []) if i in names]
        style = ", ".join(s.lower() for s in (pick.get("personal_style") or [])[:2])
        bridge_artist = next((artist_names[i] for i in why.get(pick["id"], []) if i in artist_names), None)
        if loved and style:
            return f"{style.capitalize()}, which suits {name}'s love of {loved[0]}"
        if loved:
            return f"Suits {name}'s love of {loved[0]}"
        if bridge_artist:
            return f"Same world as {bridge_artist}"
        return fallback

    def price(pick: dict[str, Any]) -> str | None:
        lo_hi = pick.get("price_usd") or []
        return f"${lo_hi[0]} to ${lo_hi[1]}" if len(lo_hi) == 2 and lo_hi[0] and lo_hi[1] else None

    cards = [
        *[{"title": b["name"], "tag": "Brand", "subtitle": price(b) or ", ".join((b.get("products_services") or [])[:2]),
           "image": b.get("image"), "url": b.get("url"), "reason": reason(b, brand_why, "A brand for their taste")} for b in brands],
        *[{"title": a["name"], "tag": "Vinyl", "subtitle": "An artist to discover", "image": a.get("image"),
           "reason": reason(a, record_why, f"New to {name}, and close to what they love")} for a in records],
        *[{"title": b["name"], "tag": "Book", "subtitle": b.get("description", "")[:60] or None, "image": b.get("image"),
           "reason": reason(b, book_why, "A book for their taste")} for b in books],
    ]
    cards = [{k: v for k, v in c.items() if v} for c in cards]
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "gifts", "key": name, "title": f"Gifts for {name}" + (f", {occasion}" if occasion else ""),
                                    "cards": cards})
    await report(conn, task, "qloo", f"Gift ideas for {name}'s taste", f"{len(cards)} picks across brands, records and books")
    return {"for": name, "budget_usd": budget_usd or None, "ideas": cards,
            "next": "Say which they like; shop_for can add it to the cart on the brand's own site."}


async def taste_map(near: str, tool_context: ToolContext, for_person: str = "") -> dict[str, Any]:
    """Where in a city the user's taste lives: the neighbourhoods holding most of their top 100
    places there (Qloo), with a map card in the island. For trips ("your Lisbon"), where to stay,
    and "where should we meet".

    Args:
        near: A city or area ("Lisbon", "Brooklyn, New York").
        for_person: A saved person, or "Sam and me", instead of the user.
    """
    conn, task = for_worker(tool_context)
    point = await point_of(conn, near)
    if point is None:
        return {"error": f"Couldn't place {near}."}
    if conn.taste_off:
        city_name = near.split(",")[0]
        areas = []
        for area in await generic.areas(near):
            spot = await point_of(conn, f"{area['name']}, {city_name}")
            if spot:
                areas.append({**area, "lat": spot["lat"], "lon": spot["lon"], "weight": round(1 - 0.15 * len(areas), 2)})
        if conn.tasks and areas:
            conn.tasks.show_view(task, {"type": "map", "key": "taste", "title": f"Popular {city_name} (taste off)", "center": point,
                                        "areas": [{k: a[k] for k in ("name", "lat", "lon", "weight")} for a in areas]})
        await report(conn, task, "slice", f"Popular areas of {near} (taste off)", ", ".join(a["name"] for a in areas[:3]))
        return {"areas": areas, "note": generic.NOTE}
    sig = await signals_for(conn, "", for_person)
    if not sig.ids:
        return {"error": "No taste to go on yet."}
    # Checked 2026-10-21: Qloo's heatmap put an indie taste's hottest Lisbon cells in Monsanto
    # park and across the river; counting the taste's top places by their own neighbourhood
    # gives Chiado, Cais do Sodré, Príncipe Real, Alfama (Qloo places carry `neighborhood`).
    places = await qloo.places_for_taste(sig.ids, point, radius_m=7000, pages=2)
    groups: dict[str, list[dict[str, Any]]] = {}
    city = _key(near.split(",")[0])
    for place in places:
        # Some places only say the city ("Lisbon"); that isn't a neighbourhood.
        if place.get("neighborhood") and _key(place["neighborhood"]) not in (city, "lisboa"):
            groups.setdefault(place["neighborhood"], []).append(place)
    # Earlier ranks count more than later ones, so a few great places outweigh many fair ones.
    scored = sorted(groups.items(), key=lambda kv: sum(1.5 - p["rank"] / len(places) for p in kv[1]), reverse=True)[:5]
    best = sum(1.5 - p["rank"] / len(places) for p in scored[0][1]) if scored else 1
    areas = []
    for name, members in scored:
        lat = sum(p["location"]["lat"] for p in members) / len(members)
        lon = sum(p["location"]["lon"] for p in members) / len(members)
        weight = sum(1.5 - p["rank"] / len(places) for p in members) / best
        areas.append({"name": name, "lat": lat, "lon": lon, "weight": round(weight, 2), "places": len(members),
                      "examples": [p["name"] for p in members[:3]]})
    if conn.tasks and areas:
        conn.tasks.show_view(task, {"type": "map", "key": "taste", "title": f"Your {near.split(',')[0]}" if sig.who == "you" else f"{whose(sig.who).capitalize()} {near.split(',')[0]}",
                                    "center": point, "areas": [{k: a[k] for k in ("name", "lat", "lon", "weight")} for a in areas]})
    await report(conn, task, "qloo", f"Mapped {whose(sig.who)} taste around {near}", ", ".join(a["name"] for a in areas[:3]))
    return {"areas": areas, "of_top": len(places)}


TOOLS = [recommend, rank_items, why_i_love, find_in_taste_graph, remember_person, remember_my_taste,
         compare_tastes, gift_ideas, taste_map]
