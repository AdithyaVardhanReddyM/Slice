"""The user's taste profile, and the worker's taste tools.

The profile is local-first: the Mac stores it and sends it in `hello`; the
brain builds and updates it and hands it back (`save_profile`). Shape:

    {"city": "Brooklyn, New York",
     "seeds":  [{"id", "name", "kind"}],      things the user loves (Qloo entities)
     "tags":   [{"name", "type"}],            what those say about them (Qloo)
     "summary": "Two sentences in plain words",
     "people": {"Sam": [{"id", "name", "kind"}]},  other people's loved things
     "updated": "2026-10-20T…"}

Every recommendation is Qloo's ranking for the profile's seeds (plus anything
the task adds), so picks never come from a model's memory.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from google import genai
from google.adk.tools import ToolContext

from . import qloo
from .connection import Connection, for_worker, report, save_profile

SUMMARY_MODEL = "gemini-3.8-flash"
_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def build_profile(seed_names: list[str], city: str = "", base: dict[str, Any] | None = None) -> dict[str, Any]:
    """Seeds (names or entities) to a full profile: entities, Qloo tags, a short summary."""
    profile = dict(base or {})
    seeds = list(profile.get("seeds") or [])
    known = {s["name"].lower() for s in seeds if s.get("name")}
    for hit in await qloo.resolve([n for n in seed_names if n.lower() not in known]):
        seeds.append({"id": hit["id"], "name": hit["name"], "kind": hit.get("kind")})
    profile["seeds"] = seeds[-30:]
    if city:
        profile["city"] = city
    tags = await qloo.taste_tags([s["id"] for s in profile["seeds"]], take=14)
    profile["tags"] = [{"name": t["name"], "type": t["type"]} for t in tags if t.get("name")]
    profile["summary"] = await _summarise(profile)
    profile["updated"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    profile.setdefault("people", {})
    return profile


async def _summarise(profile: dict[str, Any]) -> str:
    loves = ", ".join(f"{s['name']} ({s.get('kind') or 'thing'})" for s in profile.get("seeds") or [])
    tags = ", ".join(t["name"] for t in profile.get("tags") or [])
    if not loves:
        return ""
    prompt = (
        "In two short sentences, describe this person's taste for a friend who's about to plan their evening. "
        "Plain words, no lists, no names of data sources.\n"
        f"They love: {loves}\nQloo reads their taste as: {tags}\nThey live in: {profile.get('city') or 'unknown'}"
    )
    try:
        res = await _client().aio.models.generate_content(model=SUMMARY_MODEL, contents=prompt)
        return (res.text or "").strip()[:400]
    except Exception as err:
        print(f"mac: taste summary failed: {err}", flush=True)
        return ""


def _key(text: str) -> str:
    return text.lower().strip()


def summary_for_talker(profile: dict[str, Any]) -> str:
    if not profile.get("seeds"):
        return "No taste profile yet. If it comes up, suggest they add a few things they love in Settings > Taste."
    loves = ", ".join(s["name"] for s in profile["seeds"][:8])
    return f"{profile.get('summary') or ''} They love {loves}. City: {profile.get('city') or 'unknown'}.".strip()


async def _signals(conn: Connection, also_like: str, for_person: str) -> tuple[list[str], list[str]]:
    """Signal ids for a recommendation, and the names behind them (for the reasons)."""
    ids: list[str] = []
    names: list[str] = []
    who = [w.strip() for w in for_person.replace("&", ",").replace(" and ", ",").split(",") if w.strip()]
    people = conn.profile.get("people") or {}
    for name in who:
        for p in people.get(name.title(), []):
            ids.append(p["id"])
            names.append(p["name"])
    if not who or any(w.lower() in ("me", "us", "i", "myself") for w in who):
        ids += conn.seed_ids()
        names += [s["name"] for s in conn.profile.get("seeds") or []]
    if also_like:
        for hit in await qloo.resolve([n for n in also_like.split(",")]):
            ids.append(hit["id"])
            names.append(hit["name"])
    return list(dict.fromkeys(ids)), names


async def picks(conn: Connection, task: Any, kind: str, near: str = "", genre: str = "", also_like: str = "", for_person: str = "", count: int = 5) -> dict[str, Any]:
    """Shared by the worker's recommend and the talker's quick_picks."""
    ids, names = await _signals(conn, also_like, for_person)
    if not ids:
        return {"error": "No taste to go on: no profile yet and nothing in also_like."}
    point = None
    if kind == "place":
        where = near or conn.city or ""
        point = await qloo.locate(where) if where else None
        if point is None and not where:
            return {"error": "Where? Give a neighbourhood or city in `near`."}
    results = await qloo.with_timeout(
        qloo.recommend(kind, ids, near=point, city=None if point else (near or conn.city), genre=genre or None, take=count)
    )
    where = f" near {near or conn.city}" if kind == "place" else ""
    await report(conn, task, "qloo", f"{kind.replace('_', ' ').title()} picks for your taste{where}", f"{len(results)} from Qloo")
    return {"based_on": names[:10], "picks": results}


# --- worker tools ------------------------------------------------------------------


async def recommend(kind: str, tool_context: ToolContext, near: str = "", genre: str = "", also_like: str = "", for_person: str = "", count: int = 5) -> dict[str, Any]:
    """Qloo's picks for the user's taste. The ONLY source of recommendations:
    never suggest a film, artist, place or anything else that didn't come from here.

    Args:
        kind: artist, album, movie, tv_show, book, podcast, video_game, place, destination or brand.
        near: For places: a neighbourhood or city ("Williamsburg, Brooklyn"). Defaults to the user's city.
        genre: For places: restaurant, bar, cocktail_bar, wine_bar, cafe, coffee, bakery, music_venue,
            museum, bookstore, record_store, hotel or park.
        also_like: Extra things to steer by, comma-separated names ("Past Lives, Frank Ocean").
        for_person: Recommend for someone else whose taste you saved with remember_person ("Sam"),
            or "Sam and me" to blend both tastes.
        count: How many (1-10).
    """
    conn, task = for_worker(tool_context)
    return await picks(conn, task, kind, near, genre, also_like, for_person, max(1, min(count, 10)))


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


async def remember_person(person: str, likes: str, tool_context: ToolContext) -> dict[str, Any]:
    """Save what someone else loves, so you can plan or pick gifts for them later.

    Args:
        person: Their first name ("Sam").
        likes: Things they love, comma-separated ("Frank Ocean, Lady Bird, natural wine bars").
    """
    conn, task = for_worker(tool_context)
    items = [x.strip() for x in likes.split(",") if x.strip()]
    found = await qloo.resolve(items)
    matched = {_key(h["name"]) for h in found}
    # Descriptions ("natural wine bars") aren't entities; keep them as words for the worker.
    notes = [x for x in items if not any(_key(x) in m or m in _key(x) for m in matched)]
    profile = dict(conn.profile)
    people = dict(profile.get("people") or {})
    name = person.strip().title()
    existing = {p["id"]: p for p in people.get(name, [])}
    for hit in found:
        existing[hit["id"]] = {"id": hit["id"], "name": hit["name"], "kind": hit.get("kind")}
    people[name] = list(existing.values())
    profile["people"] = people
    if notes:
        profile.setdefault("people_notes", {})[name] = sorted(set(profile.get("people_notes", {}).get(name, []) + notes))
    await save_profile(conn, profile)
    await report(conn, task, "qloo", f"Saved what {name} loves", ", ".join(h["name"] for h in found) or "nothing matched")
    return {"saved": [h["name"] for h in found], "kept_as_notes": notes}


async def remember_my_taste(likes: str, tool_context: ToolContext) -> dict[str, Any]:
    """Add things the user says they love to their taste profile.

    Args:
        likes: Comma-separated names ("Mitski, Decision to Leave").
    """
    conn, task = for_worker(tool_context)
    profile = await build_profile(likes.split(","), base=conn.profile)
    await save_profile(conn, profile)
    await report(conn, task, "qloo", "Updated your taste profile", f"{len(profile['seeds'])} things you love")
    return {"seeds": [s["name"] for s in profile["seeds"]], "summary": profile.get("summary")}


async def compare_tastes(person: str, tool_context: ToolContext) -> dict[str, Any]:
    """What the user and someone else (saved with remember_person) have in common, as Qloo tags.
    Use it to find common ground before picking for both.

    Args:
        person: Their first name.
    """
    conn, task = for_worker(tool_context)
    theirs = [p["id"] for p in (conn.profile.get("people") or {}).get(person.strip().title(), [])]
    if not theirs:
        return {"error": f"I don't know what {person} loves yet. Ask, then call remember_person."}
    shared = await qloo.compare(conn.seed_ids(), theirs)
    await report(conn, task, "qloo", f"Compared your taste with {person.title()}'s", f"{len(shared)} shared threads")
    return {"shared": shared}


async def taste_map(near: str, tool_context: ToolContext) -> dict[str, Any]:
    """Where in an area the user's taste concentrates (Qloo heatmap), with neighbourhood names.
    Good for trips and "where should we meet".

    Args:
        near: A city or area ("Lisbon", "Brooklyn, New York").
    """
    conn, task = for_worker(tool_context)
    point = await qloo.locate(near)
    if point is None:
        return {"error": f"Couldn't place {near}."}
    cells = await qloo.heatmap(conn.seed_ids(), point)
    named = await conn.bridge.call("maps_reverse_geocode", {"points": [{"lat": c["lat"], "lon": c["lon"]} for c in cells]})
    for cell, place in zip(cells, named.get("places") or []):
        cell["area"] = place
    await report(conn, task, "qloo", f"Mapped your taste around {near}", f"{len(cells)} hot spots")
    return {"hot_spots": cells}


TOOLS = [recommend, find_in_taste_graph, remember_person, remember_my_taste, compare_tastes, taste_map]
