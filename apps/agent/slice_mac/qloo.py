"""Qloo for the Mac agent: find entities, recommend from a taste, compare two
tastes, map where a taste lives in a city, and read a taste as tags.

Everything goes through the Convex cache (`convex.qloo`). Picks always come
from here, ranked by Qloo, never from a model's own memory.

Verified on the hackathon key (2026-10-20): /v2/insights/compare returns the
tags two sets of entities share; filter.type=urn:heatmap returns geohash cells
with affinity (not used: see taste.taste_map); places ranked near a point (filter.location=POINT(lon lat) plus
filter.location.radius) are distinct and walkable, while a neighbourhood name
in filter.location.query drifts to famous places elsewhere; /v2/trending needs
dates and came back empty for artists, so it isn't used.

Checked 2026-10-21 for the demos (docs/mac-plan.md): filter.results.entities
plus feature.explainability scores any list for a taste and says which loved
things drove each score (Holdovers .92, Fast X .73 for an indie taste);
signal.demographics.age reshapes picks only beside interest signals (Sinatra
fans at 55+ get Out of Africa and Fresh Air); operator.filter.tags=intersection
makes "restaurant AND wheelchair-accessible entrance" a real AND (the default
is OR); album insights reject film signals (400); take is capped at 50.
"""

from __future__ import annotations

import asyncio
import math
import re
from typing import Any

from slice_agent import convex_client as convex

KINDS = {
    "artist": "urn:entity:artist",
    "album": "urn:entity:album",
    "movie": "urn:entity:movie",
    "tv_show": "urn:entity:tv_show",
    "book": "urn:entity:book",
    "author": "urn:entity:author",
    "podcast": "urn:entity:podcast",
    "video_game": "urn:entity:videogame",
    "place": "urn:entity:place",
    "destination": "urn:entity:destination",
    "brand": "urn:entity:brand",
    "person": "urn:entity:person",
}

# What a place recommendation can be narrowed to (ids from /v2/tags, checked 2026-10-20).
PLACE_GENRES = {
    "restaurant": "urn:tag:genre:place:restaurant",
    "bar": "urn:tag:genre:place:restaurant:bar",
    "cocktail_bar": "urn:tag:genre:place:restaurant:cocktail_bar",
    "wine_bar": "urn:tag:genre:place:restaurant:wine_bar",
    "cafe": "urn:tag:genre:place:restaurant:cafe",
    "coffee": "urn:tag:genre:place:restaurant:coffee_shop",
    "bakery": "urn:tag:genre:place:restaurant:bakery",
    "music_venue": "urn:tag:genre:place:live_music_venue",
    "museum": "urn:tag:genre:place:museum",
    "bookstore": "urn:tag:genre:place:book_store",
    "record_store": "urn:tag:genre:place:record_store",
    "hotel": "urn:tag:genre:place:hotel",
    "park": "urn:tag:genre:place:park",
}

# Tag families that describe a person's cultural taste (see qloo-api-notes).
TASTE_TAG_TYPES = "urn:tag:style:qloo,urn:tag:audience:qloo,urn:tag:keyword:media"
TIMEOUT_NOTE = "Qloo is slow right now; try again in a moment."

# A step-free way in; Qloo also has accessible restroom, seating and parking tags.
ACCESSIBLE = "urn:tag:accessibility:place:wheelchair_accessible_entrance"

# Qloo's age bands (the keys of urn:demographics results).
AGE_BANDS = [(24, "24_and_younger"), (29, "25_to_29"), (34, "30_to_34"), (44, "35_to_44"), (54, "45_to_54"), (200, "55_and_older")]

# Shared tags that say where something is from, or what it's played on, not why it's loved.
_PLAIN_TAGS = ("region", "instrument", "location", "neighborhood", "nearby_attraction")
# Musical "characteristics" every pop song shares; compare scores them highest, so they'd crowd
# out the words that say something ("melancholic", "poetic").
_BLAND = {"moderate", "4/4 time", "straightforward", "simple chord progressions", "melodic", "catchy melodies",
          "harmonic", "varied", "diverse", "simple", "upbeat", "catchy", "vocals", "guitar", "united states",
          "emotional", "character driven", "drama", "mature", "adult audiences"}
# The tag families that say why someone loves a thing, most telling first.
_WHY_ORDER = ["artist", "music", "style", "theme", "subgenre", "audience", "character", "mood", "genre", "characteristic"]


# The hackathon key rate-limits bursts (429 on ~20 at once): a plan for four days fires dozens of
# calls together. A few at a time, and a 429 waits and tries again instead of failing the task.
_gate = asyncio.Semaphore(4)


async def _get(path: str, params: dict[str, Any]) -> tuple[Any, str]:
    for attempt in range(3):
        async with _gate:
            try:
                return await convex.qloo(path, params)
            except RuntimeError as err:
                if "429" not in str(err) or attempt == 2:
                    raise
        await asyncio.sleep(1.0 + 1.5 * attempt)
    raise RuntimeError("unreachable")


def age_band(age: int | None) -> str | None:
    if not age or age < 1:
        return None
    return next(band for top, band in AGE_BANDS if age <= top)


def _types(kind: str) -> str | None:
    """One kind or a comma list ("movie,tv_show") to Qloo entity types."""
    urns = [KINDS[k.strip()] for k in kind.split(",") if k.strip() in KINDS]
    return ",".join(urns) or None


# When one entity carries several types (an act is both artist and person), the one to call it.
_KIND_ORDER = ["artist", "movie", "tv_show", "book", "album", "podcast", "brand", "videogame", "place",
               "destination", "author", "locality", "person"]


def _kind_of(entity: dict[str, Any]) -> str | None:
    kinds = [u.rsplit(":", 1)[-1] for u in entity.get("types") or [] if isinstance(u, str)]
    if entity.get("subtype"):
        kinds.insert(0, str(entity["subtype"]).rsplit(":", 1)[-1])
    if not kinds:
        return None
    kind = min(kinds, key=lambda k: _KIND_ORDER.index(k) if k in _KIND_ORDER else len(_KIND_ORDER))
    return "video_game" if kind == "videogame" else kind


def _brief(entity: dict[str, Any]) -> dict[str, Any]:
    """The few fields an agent needs (and a card can show)."""
    props = entity.get("properties") or {}
    out: dict[str, Any] = {
        "name": entity.get("name"),
        "id": entity.get("entity_id"),
        "kind": _kind_of(entity),
    }
    description = props.get("short_description") or props.get("description")
    if description:
        out["description"] = str(description)[:240]
    if props.get("address"):
        out["address"] = props["address"]
    if props.get("neighborhood"):
        out["neighborhood"] = props["neighborhood"]
    if (props.get("image") or {}).get("url"):
        out["image"] = props["image"]["url"]
    if props.get("price_level"):
        out["price_level"] = props["price_level"]
    loc = entity.get("location") or {}
    if loc.get("lat") is not None:
        out["location"] = {"lat": loc.get("lat"), "lon": loc.get("lon")}
    tags = [t.get("name") for t in entity.get("tags") or [] if t.get("name")]
    if tags:
        out["tags"] = tags[:6]
    # Brands: where to buy, what they cost, what they sell (for gifts and shopping).
    if props.get("official_site"):
        out["url"] = props["official_site"]
    if props.get("price_range_usd_max"):
        out["price_usd"] = [props.get("price_range_usd_min"), props.get("price_range_usd_max")]
    for key in ("industries", "personal_style", "products_services"):
        if isinstance(props.get(key), list) and props[key]:
            out[key] = props[key][:4]
    if props.get("release_year"):
        out["year"] = props["release_year"]
    return out


async def search(query: str, kind: str = "") -> list[dict[str, Any]]:
    params: dict[str, Any] = {"query": query}
    if _types(kind):
        params["types"] = _types(kind)
    body, _ = await _get("/search", params)
    return [_brief(hit) for hit in ((body or {}).get("results") or [])[:5]]


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _same(query: str, name: str) -> bool:
    """A real match, not a phrase that happens to hit something ("natural wine bars" isn't
    "DiWine Natural Wine Bar"): equal, or one starts with the other ("Lilia" / "Lilia Brooklyn")."""
    q, n = _norm(query), _norm(name)
    return bool(q and n) and (q == n or n.startswith(q + " ") or q.startswith(n + " "))


async def resolve(names: list[str], kind: str = "") -> list[dict[str, Any]]:
    """Names to entities (the best real match for each), skipping misses and descriptions.
    Sequential: the key rate-limits bursts."""
    found: list[dict[str, Any]] = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        hit = _best(name, await search(name, kind))
        if hit:
            found.append(hit)
    return found


# Untyped search ranks the national park above the TV show (Yellowstone) and the region above the
# brand (Patagonia); a loved "thing" is the cultural one unless only a place matches.
_PLACE_KINDS = {"locality", "destination", "person", "author"}


def _best(name: str, hits: list[dict[str, Any]]) -> dict[str, Any] | None:
    matches = [h for h in hits if h.get("id") and _same(name, h.get("name") or "")]
    return next((h for h in matches if h.get("kind") not in _PLACE_KINDS), matches[0] if matches else None)


async def resolve_each(queries: list[tuple[str, str]], concurrency: int = 3) -> list[dict[str, Any] | None]:
    """(name, kind) pairs to entities, one answer per pair (None for a miss), a few at a time.
    For lists read off a screen, where waiting on each search in turn would take too long."""
    gate = asyncio.Semaphore(concurrency)

    async def one(name: str, kind: str) -> dict[str, Any] | None:
        if not name.strip():
            return None
        async with gate:
            try:
                hits = await search(name.strip(), kind)
            except Exception:
                return None
        return _best(name, hits)

    return list(await asyncio.gather(*(one(n, k) for n, k in queries)))


async def locate(place: str, strict: bool = False) -> dict[str, float] | None:
    """A neighbourhood or city to a point, via Qloo's locality search ("Williamsburg, Brooklyn").
    strict: skip a locality whose name is only the start of the query, so a venue ("Brooklyn
    Steel") isn't taken for the borough it starts with."""
    body, _ = await _get("/search", {"query": place, "types": "urn:entity:locality"})
    want = _norm(place.split(",")[0])
    for hit in (body or {}).get("results") or []:
        name = _norm(hit.get("name") or "")
        if strict and name != want and want.startswith(name + " "):
            continue
        loc = hit.get("location") or {}
        props = hit.get("properties") or {}
        geo = props.get("geocode") or {}
        lat = loc.get("lat", geo.get("latitude"))
        lon = loc.get("lon", geo.get("longitude"))
        if lat is not None and lon is not None:
            return {"lat": float(lat), "lon": float(lon)}
    return None


async def recommend(
    kind: str,
    signal_ids: list[str],
    *,
    near: dict[str, float] | None = None,
    radius_m: int = 2500,
    city: str | None = None,
    genre: str | None = None,
    take: int = 5,
    age: str | None = None,
    accessible: bool = False,
    exclude: list[str] | None = None,
    page: int = 1,
) -> list[dict[str, Any]]:
    """Qloo's ranking for a taste (the signal entities), optionally near a point or in a city,
    for an age band, step-free only (places), leaving out `exclude` (usually the seeds)."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    skip = set(exclude or [])
    params: dict[str, Any] = {"filter.type": KINDS[kind], "take": max(1, min(take + len(skip), 50))}
    if page > 1:
        params["page"] = page
    if signal_ids:
        params["signal.interests.entities"] = ",".join(signal_ids[:20])
    if age:
        params["signal.demographics.age"] = age
    if kind == "place":
        if near:
            params["filter.location"] = f"POINT({near['lon']} {near['lat']})"
            params["filter.location.radius"] = radius_m
        elif city:
            params["filter.location.query"] = city
        tags = [t for t in (PLACE_GENRES.get(genre or ""), ACCESSIBLE if accessible else None) if t]
        if tags:
            params["filter.tags"] = ",".join(tags)
            if len(tags) > 1:
                params["operator.filter.tags"] = "intersection"
    elif city and kind in ("artist", "movie", "tv_show", "book", "podcast"):
        params["signal.location.query"] = city
    body, _ = await _get("/v2/insights", params)
    entities = ((body or {}).get("results") or {}).get("entities") or []
    picks = [_brief(e) for e in entities if e.get("entity_id") not in skip][:take]
    for rank, pick in enumerate(picks, start=1):
        pick["rank"] = rank
    return picks


async def score(kind: str, signal_ids: list[str], candidate_ids: list[str], age: str | None = None) -> dict[str, dict[str, Any]]:
    """How well each candidate fits a taste: {id: {"affinity": 0-1, "because": [signal ids, strongest
    first]}}. Candidates Qloo has no read on for this taste are left out. Batches of 20 (30+ ids 400)."""
    out: dict[str, dict[str, Any]] = {}
    ids = list(dict.fromkeys(candidate_ids))
    for start in range(0, len(ids), 20):
        batch = ids[start:start + 20]
        params: dict[str, Any] = {
            "filter.type": KINDS[kind], "signal.interests.entities": ",".join(signal_ids[:20]),
            "filter.results.entities": ",".join(batch), "feature.explainability": "true", "take": len(batch),
        }
        if age:
            params["signal.demographics.age"] = age
        body, _ = await _get("/v2/insights", params)
        for e in ((body or {}).get("results") or {}).get("entities") or []:
            query = e.get("query") or {}
            drivers = (query.get("explainability") or {}).get("signal.interests.entities") or []
            drivers = sorted(drivers, key=lambda d: d.get("score") or 0, reverse=True)
            out[e["entity_id"]] = {
                "affinity": round(float(query.get("affinity") or 0), 3),
                "because": [d["entity_id"] for d in drivers if d.get("entity_id")],
                "drivers": {d["entity_id"]: float(d.get("score") or 0) for d in drivers if d.get("entity_id")},
                "entity": _brief(e),
            }
    return out


async def shared_tags(a_ids: list[str], b_ids: list[str], take: int = 8) -> list[dict[str, Any]]:
    """What two sets of things have in common, as Qloo tags, with which of the b things carry each
    one ("melancholic": Phoebe Bridgers, Aftersun). Places, regions and instruments are dropped."""
    body, _ = await _get(
        "/v2/insights/compare",
        {"a.signal.interests.entities": ",".join(a_ids[:20]), "b.signal.interests.entities": ",".join(b_ids[:20]), "take": 50},
    )
    seen: dict[str, dict[str, Any]] = {}
    for t in ((body or {}).get("results") or {}).get("tags") or []:
        subtype = t.get("subtype") or ""
        name = (t.get("name") or "").strip()
        if not name or name.lower() in _BLAND or any(p in subtype for p in _PLAIN_TAGS):
            continue
        query = t.get("query") or {}
        carriers = [e.get("name") for e in query.get("b.signal.interests.entities") or [] if e.get("name")]
        key = name.lower()
        if key in seen:
            seen[key]["with"] = list(dict.fromkeys(seen[key]["with"] + carriers))
            continue
        seen[key] = {"name": name, "type": subtype.rsplit(":", 2)[-2] if subtype.count(":") >= 3 else subtype,
                     "score": round(float(query.get("score") or 0), 3), "with": carriers}
    def order(tag: dict[str, Any]) -> tuple[int, float]:
        family = _WHY_ORDER.index(tag["type"]) if tag["type"] in _WHY_ORDER else len(_WHY_ORDER)
        return family, -tag["score"]

    return sorted(seen.values(), key=order)[:take]


# A taste's top places around a point, per process: the Airbnb lens and the taste map reuse them.
_top_places: dict[tuple[str, str, int], list[dict[str, Any]]] = {}


async def places_for_taste(signal_ids: list[str], near: dict[str, float], radius_m: int = 7000, pages: int = 2) -> list[dict[str, Any]]:
    """A taste's top places across an area (50 a page), for counting how many sit near an address
    or in a neighbourhood."""
    key = (",".join(sorted(signal_ids)), f"{near['lat']:.2f},{near['lon']:.2f}", radius_m)
    if key not in _top_places:
        found: list[dict[str, Any]] = []
        for page in range(1, pages + 1):
            found += await recommend("place", signal_ids, near=near, radius_m=radius_m, take=50, page=page)
        for rank, place in enumerate(found, start=1):
            place["rank"] = rank
        _top_places[key] = [p for p in found if p.get("location")]
    return _top_places[key]


# Tag families that say what a set of loved things feels like ("reflective, intimate, nostalgic").
_READS_FAMILIES = ["audience", "style", "mood", "music", "artist", "characteristic", "plot", "character", "theme", "subgenre"]


async def common_tags(entity_ids: list[str], take: int = 4) -> list[str]:
    """The words a person's loved things share, most shared first: how they read as a taste.
    (Tag insights for a set of loves came back noisy, "Intergalactic" for Sinatra fans; counting
    the tags the loves themselves carry gives Maya "reflective, intimate, nostalgic".)"""
    ids = entity_ids[:8]
    if not ids:
        return []
    body, _ = await _get("/entities", {"entity_ids": ",".join(ids)})
    carriers: dict[str, set[str]] = {}
    shown: dict[str, tuple[int, str]] = {}
    for e in (body or {}).get("results") or []:
        for t in e.get("tags") or []:
            family = (t.get("type") or "").split(":")[2] if (t.get("type") or "").count(":") >= 2 else ""
            name = (t.get("name") or "").strip()
            if family not in _READS_FAMILIES or not name or name.lower() in _BLAND:
                continue
            carriers.setdefault(name.lower(), set()).add(e.get("entity_id"))
            shown.setdefault(name.lower(), (_READS_FAMILIES.index(family), name))
    need = 2 if len(ids) > 1 else 1
    ranked = sorted((k for k in carriers if len(carriers[k]) >= need), key=lambda k: (-len(carriers[k]), shown[k][0]))
    return [shown[k][1] for k in ranked[:take]]


async def taste_tags(signal_ids: list[str], take: int = 12) -> list[dict[str, Any]]:
    """What a set of loved things says about someone, as Qloo tags."""
    if not signal_ids:
        return []
    body, _ = await _get(
        "/v2/insights",
        {"filter.type": "urn:tag", "signal.interests.entities": ",".join(signal_ids[:20]),
         "filter.tag.types": TASTE_TAG_TYPES, "take": take},
    )
    tags = ((body or {}).get("results") or {}).get("tags") or []
    return [{"name": t.get("name"), "id": t.get("tag_id"), "type": (t.get("subtype") or "").rsplit(":", 1)[-1]} for t in tags]


def km_between(a: dict[str, float], b: dict[str, float]) -> float:
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlat, dlon = lat2 - lat1, math.radians(b["lon"] - a["lon"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def walk_minutes(a: dict[str, float], b: dict[str, float]) -> int:
    """Straight-line distance at 4.8 km/h, plus a third for streets not being straight."""
    return max(1, round(km_between(a, b) * 1.33 / 4.8 * 60))


async def with_timeout(coro: Any, seconds: float = 60) -> Any:
    """Place queries with many signals can take tens of seconds (qloo-api-notes)."""
    return await asyncio.wait_for(coro, seconds)
