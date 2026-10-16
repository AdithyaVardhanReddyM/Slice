"""Audience insights for the media studio, run as studio actions (no chat turn).

pretest: before money is spent, a panel of personas built from the creative's
audience (its Qloo tastes and Qloo's age and gender skew for those tastes)
looks at the creative as it will be published and says, one by one, whether
they would stop, tap or scroll past, and why. The panel's scores are averaged
into one resonance score, and the fixes name layers the agent can change.

taste_map: where in a region an audience's taste is strongest, from Qloo's
heatmap for the audience's top signals. The strongest areas that are apart
from each other become hotspots, named through OpenStreetMap.

Both are stored in Convex (mediaInsights), latest per creative or audience.
"""

from __future__ import annotations

import asyncio
import math
import time
from typing import Any

from google.genai import types

from slice_agent import convex_client as convex
from slice_agent.trace import record
from slice_pages import builder as PB
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import builder as B
from . import docs as D
from . import jobs as J
from . import render, store, taste
from .gen import http

PANEL = 5
MAX_CELLS = 1500
HOTSPOTS = 6


async def _q(path: str, params: dict[str, Any]) -> dict[str, Any]:
    """A Qloo call through the Convex cache; the proxy times out now and then, so one retry."""
    for attempt in range(2):
        try:
            body, _ = await convex.qloo(path, params)
            return body or {}
        except Exception:
            if attempt:
                raise
            await asyncio.sleep(0.5)
    return {}


# --- the audience's signals ---------------------------------------------------------------


def _signals(profile: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The audience's strongest entities (not places it lives in) and tags."""
    ents = [e for e in profile.get("entities") or [] if e.get("id") and e.get("source") != "location" and "locality" not in str(e.get("type"))]
    ents.sort(key=lambda e: -(e.get("count") or 1))
    tags = sorted([t for t in profile.get("tags") or [] if t.get("id")], key=lambda t: -(t.get("affinity") or 0))
    return ents[:5], tags[:3]


async def _demographics(profile: dict[str, Any], entity_ids: list[str]) -> dict[str, Any] | None:
    """Qloo's age and gender skew (-1..1) for the audience, averaged over its signals."""
    if profile.get("demographics"):
        return profile["demographics"]
    if not entity_ids:
        return None
    try:
        body = await _q("/v2/insights", {"filter.type": "urn:demographics", "signal.interests.entities": ",".join(entity_ids)})
    except Exception:
        return None
    rows = ((body.get("results") or {}).get("demographics")) or []
    if not rows:
        return None
    out: dict[str, dict[str, float]] = {"age": {}, "gender": {}}
    for row in rows:
        for k in ("age", "gender"):
            for bucket, val in ((row.get("query") or {}).get(k) or {}).items():
                out[k][bucket] = out[k].get(bucket, 0.0) + float(val or 0) / len(rows)
    return {k: {b: round(v, 2) for b, v in d.items()} for k, d in out.items()}


def _skew_text(demo: dict[str, Any] | None) -> str:
    if not demo:
        return "no age or gender data"
    age = sorted((demo.get("age") or {}).items(), key=lambda kv: -kv[1])
    gender = sorted((demo.get("gender") or {}).items(), key=lambda kv: -kv[1])
    fmt = lambda kv: f"{kv[0].replace('_', ' ')} ({kv[1]:+.2f})"  # noqa: E731
    return f"over-indexes with ages {', '.join(fmt(a) for a in age[:2])}, under-indexes with {fmt(age[-1]) if age else 'none'}; gender {', '.join(fmt(g) for g in gender)}"


async def _audience(state: dict[str, Any], audience_id: str) -> dict[str, Any] | None:
    return await taste.ensure_profile(B._cid(state), B._audiences(state), audience_id)


# --- pre-test ------------------------------------------------------------------------------

PRETEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string"},
        "personas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "city": {"type": "string"},
                    "bio": {"type": "string"},
                    "tastes": {"type": "array", "items": {"type": "string"}},
                    "firstGlance": {"type": "string"},
                    "reaction": {"type": "string"},
                    "score": {"type": "integer"},
                    "action": {"type": "string", "enum": ["scroll_past", "pause", "tap", "save_or_share"]},
                    "likes": {"type": "array", "items": {"type": "string"}},
                    "dislikes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "age", "city", "bio", "tastes", "firstGlance", "reaction", "score", "action", "likes", "dislikes"],
            },
        },
        "fixes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "what": {"type": "string"},
                    "why": {"type": "string"},
                    "layer": {"type": "string"},
                    "impact": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["what", "why", "layer", "impact"],
            },
        },
    },
    "required": ["verdict", "personas", "fixes"],
}


def _names(items: list[dict[str, Any]] | None, n: int) -> list[str]:
    return [str(i["name"]) for i in (items or [])[:n] if isinstance(i, dict) and i.get("name")]


def _taste_block(aud: dict[str, Any], demo: dict[str, Any] | None) -> str:
    p = aud.get("profile") or {}
    culture = p.get("culture") or {}
    seed = aud.get("seed") or {}
    lines = [f"Audience \"{aud.get('name')}\"" + (f": {aud['summary']}" if aud.get("summary") else "")]
    if seed.get("interests"):
        lines.append(f"Described as into: {', '.join(seed['interests'])}" + (f"; age {seed['age']}" if seed.get("age") else ""))
    for label, vals in (
        ("Signals they share", _names(p.get("entities"), 8)),
        ("Tastes and styles (Qloo tags, strongest first)", _names(p.get("tags"), 14)),
        ("Brands they over-index on", _names(p.get("brands"), 10)),
        ("Artists", _names(culture.get("artists"), 6)),
        ("Films", _names(culture.get("films"), 5)),
        ("Places", _names(culture.get("places"), 5)),
        ("Where they are", _names(p.get("geo"), 5) or ([seed["city"]] if seed.get("city") else [])),
    ):
        if vals:
            lines.append(f"{label}: {', '.join(vals)}")
    lines.append(f"Qloo demographics: {_skew_text(demo)}")
    return "\n".join(lines)


async def pretest(tool_context: Any, creative_id: str, audience_id: str = "") -> dict:
    """Score a creative with a synthetic focus group drawn from its audience's Qloo taste."""
    state = tool_context.state
    cre = (state.get(B.CREATIVES) or {}).get(creative_id)
    if not cre:
        return {"ok": False, "error": f"no creative {creative_id!r}"}
    if cre["doc"].get("kind") == "video" and any(c.get("status") == "pending" for c in cre["doc"].get("video") or []):
        return {"ok": False, "error": "shots are still generating; pre-test once they land"}
    camp = state.get(B.CAMPAIGN) or {}
    kit = camp.get("kit") or {}
    aud = await _audience(state, audience_id or cre.get("audienceKey") or "all") or {"id": "all", "name": "Everyone", "kind": "everyone"}
    profile = aud.get("profile") or {}
    ents, _ = _signals(profile)

    with timer() as t:
        frames_task = asyncio.create_task(render.review_frames(cre, kit))
        demo = await _demographics(profile, [e["id"] for e in ents])
        try:
            frames = await frames_task
        except Exception as err:
            record("slice", "Render the creative", f"failed: {str(err)[:140]}", ms=t.ms, started=t.started)
            return {"ok": False, "error": f"could not render it ({str(err)[:160]}); is the web app running at {PB.web_url()}?"}
    record("slice", "Render the creative", f"{len(frames)} frame{'s' if len(frames) != 1 else ''}", ms=t.ms, started=t.started)

    products = "; ".join(f"{p.get('name')}" + (f" ({p['price']})" if p.get("price") else "") for p in (camp.get("products") or [])[:6])
    labels = ", ".join(f"image {i + 1} = {f[2]}" for i, f in enumerate(frames))
    grounded = bool(profile)
    prompt = (
        f"Run a pre-test of a {cre['doc'].get('kind')} ad by {kit.get('name') or 'the brand'} for {D.FORMATS[cre['format']]['label']}, before any money is spent on it. "
        f"The images are renders of it as it will be published ({labels}).\n"
        f"Its layers:\n{D.outline(cre['doc'])}\n"
        + (f"Products: {products}\n" if products else "")
        + (f"\n{_taste_block(aud, demo)}\n\n" if grounded else "\nThe audience is everyone who might buy from the brand; there is no taste data.\n\n")
        + f"Assemble a panel of {PANEL} people from this audience, as different from each other as the audience allows. "
        + (
            "Their ages and genders follow the Qloo demographics (most from the over-indexed ages). Each person's tastes are 2 to 4 items taken word for word from the lists above, and they live in one of the places listed (or a city where this taste is common). "
            if grounded
            else "Spread them over the ages and places that plausibly buy this brand. "
        )
        + "Include one sceptic who is in the audience but hard to win. The bio is one short line (job, life).\n"
        "Each person then scrolls their feed and meets the ad. firstGlance: what they notice in the first second. reaction: what they think, in the first person, as they would say it, in one or two sentences, reacting to what is actually in the images (the picture, the words, the colours) through their own taste. "
        "score 1 to 10: how much it speaks to them. action: scroll_past, pause, tap or save_or_share. likes and dislikes: specific, at most 2 each.\n"
        "Be honest, like a real focus group, not polite: a generic, off-taste or hard-to-read ad scores low and gets scrolled past. Do not let every person agree.\n"
        "fixes: at most 4 changes that would win over the people who scrolled past without losing the others, most impactful first, each naming the layer id it changes (or \"frame\" or \"new\"), what to change concretely, and why in terms of the panel's tastes.\n"
        "verdict: two sentences on how this audience will receive it. No markdown, no em dashes."
    )
    try:
        res = await generate_json(
            [prompt, *[types.Part.from_bytes(data=f[0], mime_type=f[1]) for f in frames]],
            PRETEST_SCHEMA,
            name="Audience pre-test",
            temperature=0.7,
            thinking=True,
            result=lambda r: f"{len(r.get('personas') or [])} personas, {len(r.get('fixes') or [])} fixes",
        )
    except Exception as err:
        return {"ok": False, "error": f"the panel failed ({type(err).__name__}: {str(err)[:120]})"}

    personas = []
    for p in (res.get("personas") or [])[:PANEL]:
        if not isinstance(p, dict) or not p.get("reaction"):
            continue
        p["score"] = max(1, min(10, int(p.get("score") or 1)))
        p["tastes"] = [str(x) for x in p.get("tastes") or []][:4]
        p["likes"] = [str(x) for x in p.get("likes") or []][:2]
        p["dislikes"] = [str(x) for x in p.get("dislikes") or []][:2]
        personas.append(p)
    if not personas:
        return {"ok": False, "error": "the panel returned no reactions; try again"}
    score = round(sum(p["score"] for p in personas) / len(personas) * 10)
    stop = round(sum(1 for p in personas if p.get("action") != "scroll_past") / len(personas) * 100)
    shot = None
    try:
        shot = await J.storage_url(frames[0][0], frames[0][1])
    except Exception:
        pass
    data = {
        "creativeId": creative_id,
        "version": int(cre.get("version") or 0),
        "audienceKey": aud.get("id"),
        "audienceName": aud.get("name"),
        "score": score,
        "stopRate": stop,
        "verdict": str(res.get("verdict") or ""),
        "personas": personas,
        "fixes": [f for f in res.get("fixes") or [] if isinstance(f, dict) and f.get("what")][:4],
        "demographics": demo,
        **({"screenshot": shot} if shot else {}),
        "at": int(time.time() * 1000),
    }
    await store.post("/media/insight", {"campaignId": B._cid(state), "kind": "pretest", "key": creative_id, "data": data})
    return {"ok": True, **data}


# --- taste map -----------------------------------------------------------------------------


def _cell_size(geohash: str) -> tuple[float, float]:
    bits = 5 * len(geohash)
    return 360 / 2 ** math.ceil(bits / 2), 180 / 2 ** (bits // 2)


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


_places: dict[tuple[float, float, int], tuple[str, str] | None] = {}
_osm_lock = asyncio.Lock()
_osm_last = 0.0
_PLACE_KEYS = {
    10: ("city", "town", "village", "municipality", "county"),
    12: ("suburb", "city_district", "town", "city", "village", "county"),
    14: ("neighbourhood", "quarter", "suburb", "city_district", "town", "city"),
}


async def _place(lat: float, lon: float, zoom: int) -> tuple[str, str] | None:
    """(name, wider area) for a point from OpenStreetMap, at most one request a second as its
    policy asks. None when the point is at sea or names no town; a coordinate when OSM is down."""
    global _osm_last
    key = (round(lat, 3), round(lon, 3), zoom)
    if key in _places:
        return _places[key]
    fallback = (f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}", "")
    async with _osm_lock:
        wait = 1.05 - (time.monotonic() - _osm_last)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            res = await http().get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": zoom, "accept-language": "en"},
                headers={"User-Agent": "Slice/0.1 (taste maps for merchants)"},
                timeout=8.0,
            )
            if res.status_code != 200:
                return fallback
            body = res.json()
        except Exception:
            return fallback
        finally:
            _osm_last = time.monotonic()
    addr = body.get("address") or {}
    name = next((addr[k] for k in _PLACE_KEYS[zoom] if addr.get(k)), None)
    wider = [addr[k] for k in ("city", "state", "country") if addr.get(k) and addr[k] != name]
    _places[key] = (str(name), ", ".join(wider[-2:])) if name else None
    return _places[key]


async def taste_map(tool_context: Any, audience_id: str, region: str = "") -> dict:
    """Where in a region the audience's taste is strongest (Qloo heatmap), with named hotspots."""
    state = tool_context.state
    aud = await _audience(state, audience_id)
    if not aud:
        return {"ok": False, "error": f"no audience {audience_id!r}"}
    profile = aud.get("profile") or {}
    ents, tags = _signals(profile)
    if not ents and not tags:
        return {"ok": False, "error": f"\"{aud.get('name')}\" has no taste signals to map; pick an audience built from interests or a Pages audience"}
    region = region.strip()[:80] or next((g["name"] for g in profile.get("geo") or [] if g.get("name")), "") or (aud.get("seed") or {}).get("city") or "United States"

    params: dict[str, Any] = {"filter.type": "urn:heatmap", "filter.location.query": region}
    if ents:
        params["signal.interests.entities"] = ",".join(e["id"] for e in ents)
    if tags:
        params["signal.interests.tags"] = ",".join(t["id"] for t in tags)
    with timer() as t:
        body, demo = await asyncio.gather(_q("/v2/insights", params), _demographics(profile, [e["id"] for e in ents]))
    rows = ((body.get("results") or {}).get("heatmap")) or []
    loc = (((body.get("query") or {}).get("localities") or {}).get("filter") or [{}])[0]
    resolved = str(loc.get("disambiguation") or loc.get("name") or region)
    record("qloo", "Map where the taste is", f"{len(rows)} areas in {resolved}", ms=t.ms, started=t.started)
    if not rows:
        return {"ok": False, "error": f"Qloo has no map for {region!r}; try a country or a large city"}

    cells = []
    for r in rows:
        l, q = r.get("location") or {}, r.get("query") or {}
        if l.get("latitude") is None or l.get("longitude") is None:
            continue
        cells.append((float(l["latitude"]), float(l["longitude"]), float(q.get("affinity_rank") or q.get("affinity") or 0), float(q.get("popularity") or 0), str(l.get("geohash") or "")))
    lats, lons = [c[0] for c in cells], [c[1] for c in cells]
    geohash = next((c[4] for c in cells if c[4]), "") or "gcpv"
    dlon, dlat = _cell_size(geohash)
    bbox = [min(lons) - dlon / 2, min(lats) - dlat / 2, max(lons) + dlon / 2, max(lats) + dlat / 2]

    # Hotspots: strong taste where there are people, kept apart so they name different places.
    spread = _km((bbox[1], bbox[0]), (bbox[3], bbox[2]))
    apart = max(spread * 0.07, _km((0, 0), (dlat, dlon)) * 3)
    ranked = sorted(cells, key=lambda c: -(c[2] * (0.4 + 0.6 * c[3])))
    zoom = 10 if len(geohash) <= 4 else 12 if len(geohash) == 5 else 14
    hotspots: list[dict[str, Any]] = []
    tried = 0
    with timer() as t:
        for c in ranked:
            if len(hotspots) >= HOTSPOTS or tried >= HOTSPOTS + 6:
                break
            if any(_km((c[0], c[1]), (h["lat"], h["lon"])) < apart for h in hotspots):
                continue
            tried += 1
            place = await _place(c[0], c[1], zoom)
            if not place or any(h["name"] == place[0] for h in hotspots):
                continue
            hotspots.append({"name": place[0], "detail": place[1], "lat": round(c[0], 4), "lon": round(c[1], 4), "affinity": round(c[2], 3), "popularity": round(c[3], 3)})
    record("slice", "Name the hotspots", ", ".join(h["name"] for h in hotspots) or "none", ms=t.ms, started=t.started)

    keep = sorted(cells, key=lambda c: -c[2])[:MAX_CELLS]
    data = {
        "audienceKey": aud.get("id"),
        "audienceName": aud.get("name"),
        "region": region,
        "resolved": resolved,
        "signals": [e["name"] for e in ents if e.get("name")] + [t["name"] for t in tags if t.get("name")],
        "cell": [dlon, dlat],
        "cells": [[round(c[0], 4), round(c[1], 4), round(c[2], 3), round(c[3], 3)] for c in keep],
        "bbox": [round(x, 4) for x in bbox],
        "hotspots": hotspots,
        "demographics": demo,
        "at": int(time.time() * 1000),
    }
    await store.post("/media/insight", {"campaignId": B._cid(state), "kind": "map", "key": str(aud.get("id")), "data": data})
    return {"ok": True, "hotspots": hotspots, "resolved": resolved, "cells": len(cells)}
