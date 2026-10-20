"""Qloo for the Mac agent: find entities, recommend from a taste, compare two
tastes, map where a taste lives in a city, and read a taste as tags.

Everything goes through the Convex cache (`convex.qloo`). Picks always come
from here, ranked by Qloo, never from a model's own memory.

Verified on the hackathon key (2026-10-20): /v2/insights/compare returns the
tags two sets of entities share; filter.type=urn:heatmap returns geohash cells
with affinity; places ranked near a point (filter.location=POINT(lon lat) plus
filter.location.radius) are distinct and walkable, while a neighbourhood name
in filter.location.query drifts to famous places elsewhere; /v2/trending needs
dates and came back empty for artists, so it isn't used.
"""

from __future__ import annotations

import asyncio
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


def _kind_of(entity: dict[str, Any]) -> str | None:
    urn = entity.get("subtype") or next(iter(entity.get("types") or []), None)
    return urn.rsplit(":", 1)[-1] if isinstance(urn, str) else None


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
    return out


async def search(query: str, kind: str = "") -> list[dict[str, Any]]:
    params: dict[str, Any] = {"query": query}
    if kind in KINDS:
        params["types"] = KINDS[kind]
    body, _ = await convex.qloo("/search", params)
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
        hit = next((h for h in await search(name, kind) if h.get("id") and _same(name, h.get("name") or "")), None)
        if hit:
            found.append(hit)
    return found


async def locate(place: str) -> dict[str, float] | None:
    """A neighbourhood or city to a point, via Qloo's locality search ("Williamsburg, Brooklyn")."""
    body, _ = await convex.qloo("/search", {"query": place, "types": "urn:entity:locality"})
    for hit in (body or {}).get("results") or []:
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
) -> list[dict[str, Any]]:
    """Qloo's ranking for a taste (the signal entities), optionally near a point or in a city."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    params: dict[str, Any] = {"filter.type": KINDS[kind], "take": max(1, min(take, 20))}
    if signal_ids:
        params["signal.interests.entities"] = ",".join(signal_ids[:20])
    if kind == "place":
        if near:
            params["filter.location"] = f"POINT({near['lon']} {near['lat']})"
            params["filter.location.radius"] = radius_m
        elif city:
            params["filter.location.query"] = city
        if genre in PLACE_GENRES:
            params["filter.tags"] = PLACE_GENRES[genre]
    elif city and kind in ("artist", "movie", "tv_show", "book", "podcast"):
        params["signal.location.query"] = city
    body, _ = await convex.qloo("/v2/insights", params)
    entities = ((body or {}).get("results") or {}).get("entities") or []
    picks = [_brief(e) for e in entities]
    for rank, pick in enumerate(picks, start=1):
        pick["rank"] = rank
    return picks


async def taste_tags(signal_ids: list[str], take: int = 12) -> list[dict[str, Any]]:
    """What a set of loved things says about someone, as Qloo tags."""
    if not signal_ids:
        return []
    body, _ = await convex.qloo(
        "/v2/insights",
        {"filter.type": "urn:tag", "signal.interests.entities": ",".join(signal_ids[:20]),
         "filter.tag.types": TASTE_TAG_TYPES, "take": take},
    )
    tags = ((body or {}).get("results") or {}).get("tags") or []
    return [{"name": t.get("name"), "id": t.get("tag_id"), "type": (t.get("subtype") or "").rsplit(":", 1)[-1]} for t in tags]


async def compare(a_ids: list[str], b_ids: list[str], take: int = 10) -> list[dict[str, Any]]:
    """The tags two tastes share, strongest first."""
    body, _ = await convex.qloo(
        "/v2/insights/compare",
        {"a.signal.interests.entities": ",".join(a_ids[:20]), "b.signal.interests.entities": ",".join(b_ids[:20]), "take": take},
    )
    tags = ((body or {}).get("results") or {}).get("tags") or []
    # Region tags ("United States") say little about taste.
    shared = [t for t in tags if "region" not in (t.get("subtype") or "")]
    shared.sort(key=lambda t: (t.get("query") or {}).get("score") or 0, reverse=True)
    return [{"name": t.get("name"), "type": (t.get("subtype") or "").rsplit(":", 1)[-1],
             "score": round(float((t.get("query") or {}).get("score") or 0), 3)} for t in shared[:take]]


async def heatmap(signal_ids: list[str], near: dict[str, float], radius_m: int = 8000, take: int = 6) -> list[dict[str, Any]]:
    """Where in an area this taste concentrates: the strongest map cells."""
    body, _ = await convex.qloo(
        "/v2/insights",
        {"filter.type": "urn:heatmap", "filter.location": f"POINT({near['lon']} {near['lat']})",
         "filter.location.radius": radius_m, "signal.interests.entities": ",".join(signal_ids[:20])},
    )
    cells = ((body or {}).get("results") or {}).get("heatmap") or []
    cells.sort(key=lambda c: (c.get("query") or {}).get("affinity_rank") or 0, reverse=True)
    return [{"lat": (c.get("location") or {}).get("latitude"), "lon": (c.get("location") or {}).get("longitude"),
             "affinity": round(float((c.get("query") or {}).get("affinity_rank") or 0), 3)} for c in cells[:take]]


async def with_timeout(coro: Any, seconds: float = 60) -> Any:
    """Place queries with many signals can take tens of seconds (qloo-api-notes)."""
    return await asyncio.wait_for(coro, seconds)
