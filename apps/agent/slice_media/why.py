"""Why reports: why a poster, video, image or clip looks the way it does.

The console's Why modal opens on one thing from the canvas. The first time, this
module looks at it (the image, the poster as published, frames of a video) next
to its audience's Qloo profile and the designer's own notes (the concept, the
generation prompt), and writes down each choice: what it is, why it suits this
audience, and the Qloo signals it rests on. The model may only cite signals that
are in the profile; every one is checked by name here and carries Qloo's own
affinity, so nothing on the page is invented. The colours are measured from the
pixels, not guessed.

For an audience tied to a city, the report also maps where its taste is strongest
there (Qloo heatmaps, the idea from the taste map in PR #3). Raw heat follows how
busy an area is, so the map shows the lean against the campaign's other audiences
in that city, or against how busy each area is when there are none.

The report is stored in Convex (mediaInsights, kind "why") and read live by the
modal; the merchant can ask for a fresh one after edits.
"""

from __future__ import annotations

import asyncio
import bisect
import math
import re
import time
from typing import Any

from google.genai import types

from slice_agent import convex_client as convex
from slice_agent.trace import record
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import builder as B
from . import docs as D
from . import ff, render, store, taste
from .gen import fetch, fetch_image, http

MAX_CELLS = 1600
HOTSPOTS = 5

# --- the audience ---------------------------------------------------------------------------

TAG_GROUP = {
    "aesthetic_property": "Look",
    "emotional_tone": "Mood",
    "personal_style": "Style",
    "style": "Style",
    "lifestyle": "Lifestyle",
    "customer_identity": "Identity",
    "core_values": "Values",
    "keyword": "Theme",
    "audience": "Identity",
}

CULTURE_KIND = {"artists": "artist", "films": "film", "movies": "film", "tv": "tv", "tv_shows": "tv", "books": "book", "places": "place", "destinations": "place", "podcasts": "podcast", "games": "game", "videogames": "game"}

ENTITY_KIND = {"artist": "artist", "movie": "film", "tv_show": "tv", "book": "book", "place": "place", "destination": "place", "podcast": "podcast", "videogame": "game", "brand": "brand"}


def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _group(tag_type: str) -> str:
    part = str(tag_type or "").split(":")
    key = part[2] if len(part) > 2 else ""
    return TAG_GROUP.get(key, "Taste")


def _nice(name: str) -> str:
    name = str(name or "").strip()
    return name[:1].upper() + name[1:] if name else name


def _loves(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """What the audience was built from: the picked interests (or a list's customers' loves)."""
    ents = [e for e in profile.get("entities") or [] if e.get("name") and e.get("source") not in ("location", "demographic") and "locality" not in str(e.get("type"))]
    picked = [e for e in ents if e.get("source") in ("interest", "csv") or e.get("seed")]
    return (picked or ents)[:6]


class Lookup:
    """Every signal of a profile by name, so a model's citation resolves to the real thing."""

    def __init__(self, profile: dict[str, Any]):
        self.items: dict[str, dict[str, Any]] = {}
        for e in _loves(profile):
            kind = ENTITY_KIND.get(str(e.get("type") or "").split(":")[-1], "love")
            self._add({"name": e["name"], "kind": "love", "image": e.get("image"), "as": kind})
        best: dict[str, dict[str, Any]] = {}
        for t in profile.get("tags") or []:
            if not t.get("name"):
                continue
            k = _norm(t["name"])
            if k not in best or float(t.get("affinity") or 0) > best[k]["affinity"]:
                best[k] = {"name": _nice(t["name"]), "kind": "trait", "affinity": round(float(t.get("affinity") or 0), 3), "group": _group(t.get("type") or t.get("id") or "")}
        self.traits = sorted(best.values(), key=lambda t: -t["affinity"])
        for t in self.traits:
            self._add(t)
        self.brands = [{"name": b["name"], "kind": "brand", **({"affinity": round(float(b["affinity"]), 3)} if b.get("affinity") is not None else {}), **({"image": b["image"]} if b.get("image") else {})} for b in profile.get("brands") or [] if b.get("name")]
        for b in self.brands:
            self._add(b)
        self.culture: list[dict[str, Any]] = []
        for key, rows in (profile.get("culture") or {}).items():
            kind = CULTURE_KIND.get(key, key.rstrip("s"))
            for e in rows or []:
                if e.get("name"):
                    item = {"name": e["name"], "kind": kind, **({"image": e["image"]} if e.get("image") else {})}
                    self.culture.append(item)
                    self._add(item)

    def _add(self, item: dict[str, Any]) -> None:
        self.items.setdefault(_norm(item["name"]), item)

    def find(self, text: str) -> dict[str, Any] | None:
        k = _norm(text)
        if not k:
            return None
        if k in self.items:
            return self.items[k]
        # "Metallica fans", "the Erewhon crowd": a known name inside the citation, as whole words.
        hits = [v for n, v in self.items.items() if len(n) >= 4 and re.search(rf"\b{re.escape(n)}\b", k)]
        return max(hits, key=lambda v: len(v["name"])) if hits else None

    def signal(self, item: dict[str, Any]) -> dict[str, Any]:
        out = {"name": item["name"], "kind": item["kind"]}
        if item.get("affinity") is not None:
            out["affinity"] = item["affinity"]
        if item.get("image"):
            out["image"] = item["image"]
        return out


def _profile_block(aud: dict[str, Any], look: Lookup) -> str:
    lines = [f'Audience "{aud.get("name")}"']
    brief = aud.get("brief") if isinstance(aud.get("brief"), dict) else {}
    if brief.get("summary"):
        lines.append(f"Who they are (from their Qloo profile): {brief['summary']}")
    loves = [i["name"] for i in look.items.values() if i["kind"] == "love"]
    if loves:
        lines.append(f"LOVES (what the audience was built from): {', '.join(loves)}")
    if look.traits:
        lines.append("TRAITS (Qloo tags, strongest first): " + ", ".join(t["name"] for t in look.traits[:30]))
    if look.brands:
        lines.append("BRANDS they over-index on: " + ", ".join(b["name"] for b in look.brands[:14]))
    by_kind: dict[str, list[str]] = {}
    for c in look.culture:
        by_kind.setdefault(c["kind"], []).append(c["name"])
    for kind, names in by_kind.items():
        lines.append(f"{kind.upper()}S they over-index on: {', '.join(names[:10])}")
    if brief.get("imagery"):
        lines.append(f"Imagery that suits them: {brief['imagery']}")
    if brief.get("avoid"):
        lines.append(f"Avoid for them: {'; '.join(str(a) for a in brief['avoid'][:5])}")
    demo = (aud.get("profile") or {}).get("demographics")
    if demo:
        age = sorted((demo.get("age") or {}).items(), key=lambda kv: -kv[1])
        g = sorted((demo.get("gender") or {}).items(), key=lambda kv: -kv[1])
        if age and g:
            lines.append(f"Qloo demographics: leans {age[0][0].replace('_', ' ')}, {g[0][0]}")
    return "\n".join(lines)


async def _demographics(profile: dict[str, Any]) -> dict[str, Any] | None:
    """Qloo's age and gender skew (-1..1), from the profile or, for a seed audience, averaged over its loves."""
    if profile.get("demographics"):
        return profile["demographics"]
    ids = [e["id"] for e in _loves(profile) if e.get("id")]
    if not ids:
        return None
    try:
        body, _ = await convex.qloo("/v2/insights", {"filter.type": "urn:demographics", "signal.interests.entities": ",".join(ids)})
    except Exception:
        return None
    rows = ((body or {}).get("results") or {}).get("demographics") or []
    if not rows:
        return None
    out: dict[str, dict[str, float]] = {"age": {}, "gender": {}}
    for row in rows:
        for k in ("age", "gender"):
            for bucket, val in ((row.get("query") or {}).get(k) or {}).items():
                out[k][bucket] = out[k].get(bucket, 0.0) + float(val or 0) / len(rows)
    return {k: {b: round(v, 3) for b, v in d.items()} for k, d in out.items()}


# --- which audience ----------------------------------------------------------------------------

_WORDS = re.compile(r"[a-z]{3,}")
_STOP = {"the", "and", "with", "from", "for", "into", "its", "their", "this", "that", "shot", "light", "soft", "image", "close", "warm"}


def _words(*texts: Any) -> set[str]:
    return {w for t in texts for w in _WORDS.findall(str(t or "").lower())} - _STOP


def _guess_audience(prompt: str, concepts: list[dict[str, Any]], audiences: list[dict[str, Any]]) -> str:
    """An image made before images remembered their audience: the concept it reads like."""
    ids = {a["id"] for a in audiences}
    mine = _words(prompt)
    best, score = "all", 0.0
    for c in concepts:
        if c.get("audienceKey") not in ids or c.get("audienceKey") == "all":
            continue
        theirs = _words(c.get("visual"), c.get("hook"), c.get("title"))
        s = len(mine & theirs) / max(1, len(theirs))
        if s > score:
            best, score = c["audienceKey"], s
    return best if score >= 0.25 else "all"


# --- colours -----------------------------------------------------------------------------------


async def _pixels(data: bytes, size: int = 56) -> list[tuple[int, int, int]]:
    proc = await asyncio.create_subprocess_exec(ff.EXE, "-hide_banner", "-nostdin", "-i", "pipe:0", "-vf", f"scale={size}:{size}", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    out, _ = await asyncio.wait_for(proc.communicate(data), 30)
    return [(out[i], out[i + 1], out[i + 2]) for i in range(0, len(out) - 2, 3)]


def _hex(c: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(x))):02x}" for x in c)


def _rgb(h: str) -> tuple[int, int, int] | None:
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", str(h or "").strip())
    return tuple(int(m.group(1)[i : i + 2], 16) for i in (0, 2, 4)) if m else None  # type: ignore[return-value]


def _dist(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    # Weighted RGB distance ("redmean"), close enough to how different two colours look.
    r = (a[0] + b[0]) / 2
    return math.sqrt((2 + r / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - r) / 256) * (a[2] - b[2]) ** 2)


def _palette(px: list[tuple[int, int, int]], kit: dict[str, Any], k: int = 6) -> list[dict[str, Any]]:
    """The main colours of a frame (k-means on a thumbnail), biggest share first, matched to the kit."""
    if not px:
        return []
    step = max(1, len(px) // k)
    centres: list[tuple[float, float, float]] = [tuple(map(float, px[i])) for i in range(0, len(px), step)][:k]  # type: ignore[misc]
    groups: list[list[tuple[int, int, int]]] = []
    for _ in range(10):
        groups = [[] for _ in centres]
        for p in px:
            groups[min(range(len(centres)), key=lambda i: _dist(p, centres[i]))].append(p)
        centres = [tuple(sum(c[j] for c in g) / len(g) for j in range(3)) if g else centres[i] for i, g in enumerate(groups)]  # type: ignore[misc]
    # Merge colours that look the same.
    merged: list[list[Any]] = []
    for c, g in sorted(zip(centres, groups), key=lambda cg: -len(cg[1])):
        if not g:
            continue
        twin = next((m for m in merged if _dist(m[0], c) < 38), None)
        if twin:
            n = twin[1] + len(g)
            twin[0] = tuple((twin[0][j] * twin[1] + c[j] * len(g)) / n for j in range(3))
            twin[1] = n
        else:
            merged.append([c, len(g)])
    kit_colours = {k2: _rgb(v) for k2, v in (kit.get("colors") or {}).items() if _rgb(v)}
    out = []
    for c, n in sorted(merged, key=lambda m: -m[1])[:5]:
        share = n / len(px)
        if share < 0.03:
            continue
        near = min(kit_colours.items(), key=lambda kv: _dist(c, kv[1]), default=None)  # type: ignore[arg-type]
        out.append({"hex": _hex(c), "share": round(share, 3), **({"kit": near[0]} if near and _dist(c, near[1]) < 60 else {})})  # type: ignore[arg-type]
    return out


# --- the map -----------------------------------------------------------------------------------


def _city(aud: dict[str, Any]) -> str:
    geo = [g for g in ((aud.get("profile") or {}).get("geo") or []) if g.get("name")]
    return str(geo[0]["name"]) if geo else str((aud.get("seed") or {}).get("city") or "")


async def _heat(profile: dict[str, Any], region: str) -> list[dict[str, Any]]:
    ids = [e["id"] for e in _loves(profile) if e.get("id")][:6]
    if not ids:
        return []
    body, _ = await convex.qloo("/v2/insights", {"filter.type": "urn:heatmap", "filter.location.query": region, "signal.interests.entities": ",".join(ids)})
    return ((body or {}).get("results") or {}).get("heatmap") or []


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
    14: ("neighbourhood", "suburb", "quarter", "city_district", "town", "city"),
}


async def _place(lat: float, lon: float, zoom: int) -> tuple[str, str] | None:
    """(name, wider area) for a point from OpenStreetMap, at most one request a second as its policy asks."""
    global _osm_last
    key = (round(lat, 3), round(lon, 3), zoom)
    if key in _places:
        return _places[key]
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
            body = res.json() if res.status_code == 200 else {}
        except Exception:
            body = {}
        finally:
            _osm_last = time.monotonic()
    addr = body.get("address") or {}
    name = next((addr[k] for k in _PLACE_KEYS[zoom] if addr.get(k)), None)
    if name:
        name = re.sub(r"\s+Neighbou?rhood Council( District)?$", "", str(name)).strip()
    wider = [addr[k] for k in ("city", "county", "state") if addr.get(k) and addr[k] != name]
    _places[key] = (str(name), wider[0] if wider else "") if name else None
    return _places[key]


async def _spots(cells: list[tuple[float, float, float, float]], zoom: int, apart: float, n: int, sign: int, region: str) -> list[dict[str, Any]]:
    """The strongest leaning areas with some life in them, kept apart, with names (a name that is just the region says nothing)."""
    out: list[dict[str, Any]] = []
    tried = 0
    for lat, lon, lean, busy in sorted(cells, key=lambda c: -sign * c[2]):
        if len(out) >= n or tried >= n + 6 or sign * lean <= 0.02:
            break
        if busy < 0.35 or any(_km((lat, lon), (h["lat"], h["lon"])) < apart for h in out):
            continue
        tried += 1
        place = await _place(lat, lon, zoom)
        if not place or _norm(place[0]) == _norm(region) or any(h["name"] == place[0] for h in out):
            continue
        out.append({"name": place[0], "detail": place[1], "lat": round(lat, 4), "lon": round(lon, 4), "lean": round(lean, 3)})
    return out


def _smooth(cells: list[tuple[float, float, float, float]], dlon: float, dlat: float) -> list[tuple[float, float, float, float]]:
    """Each cell's lean averaged with its neighbours (about 3 km across), so areas read as areas, not speckle."""
    if not cells:
        return cells
    grid = {(round(c[0] / dlat), round(c[1] / dlon)): c for c in cells}
    # At least one cell either way, else about 1.5 km.
    rx = max(1, round(1.5 / (dlon * 111 * math.cos(math.radians(cells[0][0])))))
    ry = max(1, round(1.5 / (dlat * 111)))
    out = []
    for (i, j), (lat, lon, lean, busy) in grid.items():
        total, weight = 2 * lean, 2.0
        for di in range(-ry, ry + 1):
            for dj in range(-rx, rx + 1):
                n = grid.get((i + di, j + dj))
                if n and (di or dj):
                    total += n[2]
                    weight += 1
        out.append((lat, lon, total / weight, busy))
    return out


async def _map(aud: dict[str, Any], audiences: list[dict[str, Any]], campaign_id: str) -> dict[str, Any] | None:
    region = _city(aud)
    if not region or not _loves(aud.get("profile") or {}):
        return None
    others = []
    for a in audiences:
        if a.get("id") in (aud.get("id"), "all") or a.get("kind") == "everyone":
            continue
        full = await taste.ensure_profile(campaign_id, audiences, a["id"])
        if full and _norm(_city(full)) == _norm(region) and _loves(full.get("profile") or {}):
            others.append(full)
    with timer() as t:
        rows, *theirs = await asyncio.gather(_heat(aud["profile"], region), *[_heat(o["profile"], region) for o in others[:2]])
    if not rows:
        record("qloo", "Map where the taste is", "no map for this area", ms=t.ms, started=t.started)
        return None
    pops = sorted(float((r.get("query") or {}).get("popularity") or 0) for r in rows)

    def busy(r: dict[str, Any]) -> float:
        return bisect.bisect_left(pops, float((r.get("query") or {}).get("popularity") or 0)) / max(1, len(pops))

    def aff(r: dict[str, Any]) -> float:
        return float((r.get("query") or {}).get("affinity") or 0)

    other_aff: dict[str, list[float]] = {}
    for got in theirs:
        for r in got:
            g = (r.get("location") or {}).get("geohash")
            if g:
                other_aff.setdefault(g, []).append(aff(r))
    versus = " and ".join(str(o.get("name")) for o in others[:2]) if other_aff else "how busy each area is"
    cells: list[tuple[float, float, float, float]] = []
    for r in rows:
        loc = r.get("location") or {}
        if loc.get("latitude") is None or loc.get("longitude") is None:
            continue
        g = loc.get("geohash") or ""
        if other_aff:
            if g not in other_aff:
                continue
            lean = aff(r) - sum(other_aff[g]) / len(other_aff[g])
        else:
            lean = aff(r) - busy(r)
        cells.append((float(loc["latitude"]), float(loc["longitude"]), lean, busy(r)))
    geohash = next(((r.get("location") or {}).get("geohash") for r in rows if (r.get("location") or {}).get("geohash")), "") or "9q5c"
    dlon, dlat = _cell_size(geohash)
    cells = _smooth(cells, dlon, dlat)
    lats, lons = [c[0] for c in cells], [c[1] for c in cells]
    spread = _km((min(lats), min(lons)), (max(lats), max(lons))) if cells else 0
    apart = max(spread * 0.09, _km((0, 0), (dlat, dlon)) * 3)
    zoom = 10 if len(geohash) <= 4 else 12 if len(geohash) == 5 else 14
    hot = await _spots(cells, zoom, apart, HOTSPOTS, 1, region)
    cold = await _spots(cells, zoom, apart, 3, -1, region) if other_aff else []
    record("qloo", "Map where the taste is", f"{len(cells)} areas in {region}, against {versus}; strongest: {', '.join(h['name'] for h in hot) or 'none'}", ms=t.ms, started=t.started)
    keep = sorted(cells, key=lambda c: -abs(c[2]))[:MAX_CELLS]
    return {
        "region": region,
        "versus": versus,
        "cell": [dlon, dlat],
        "cells": [{"lat": round(c[0], 4), "lon": round(c[1], 4), "lean": round(c[2], 3)} for c in keep],
        "hotspots": hot,
        "elsewhere": cold,
    }


# --- looking at it -----------------------------------------------------------------------------

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "idea": {"type": "string"},
        "summary": {"type": "string"},
        "choices": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["subject", "product", "setting", "light", "colour", "words", "type", "layout", "music", "voice", "motion", "cta"]},
                    "title": {"type": "string"},
                    "why": {"type": "string"},
                    "from": {"type": "string", "enum": ["taste", "brand", "brief"]},
                    "signals": {"type": "array", "items": {"type": "string"}},
                    "box": {"type": "array", "items": {"type": "integer"}},
                    "time": {"type": "number"},
                },
                "required": ["kind", "title", "why", "from", "signals"],
            },
        },
        "avoided": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"what": {"type": "string"}, "why": {"type": "string"}, "signals": {"type": "array", "items": {"type": "string"}}},
                "required": ["what", "why", "signals"],
            },
        },
        "colourNames": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["idea", "summary", "choices", "avoided", "colourNames"],
}


def _notes(item: dict[str, Any], concept: dict[str, Any] | None) -> str:
    lines = []
    if concept:
        lines.append(f"Concept: {concept.get('title')}. Hook: {concept.get('hook')}. Visual: {concept.get('visual')}")
        for w in concept.get("why") or []:
            lines.append(f"- {w.get('text')} (evidence: {w.get('evidence')})")
    for w in item.get("why") or []:
        lines.append(f"- {w.get('text')} (evidence: {w.get('evidence')})")
    if item.get("prompt"):
        lines.append(f"The generation prompt the designer wrote: {str(item['prompt'])[:1500]}")
    doc = item.get("doc")
    if doc:
        lines.append(f"Its layers and shots:\n{D.outline(doc)}")
        for au in doc.get("audio") or []:
            lines.append(f"Audio {au.get('kind')}: {str(au.get('text') or au.get('prompt') or '')[:400]}")
    return "\n".join(lines) or "(no notes)"


async def _frames(item: dict[str, Any], kit: dict[str, Any]) -> list[tuple[bytes, str, str]]:
    if item["itemKind"] == "creative":
        return await render.review_frames(item, kit)
    if item.get("kind") == "video":
        data, _ = await fetch(item["url"], limit=200_000_000)
        info = await ff.probe_bytes(data)
        times = [max(0.0, info.duration * f) for f in (0.1, 0.5, 0.9)]
        return [(await ff.frame_bytes(data, t, 640), "image/jpeg", f"t={t:.1f}s") for t in times]
    data, mime = await fetch_image(item["url"])
    return [(data, mime, "image")]


async def _explain(item: dict[str, Any], aud: dict[str, Any], look: Lookup, frames: list[tuple[bytes, str, str]], palette: list[dict[str, Any]], kit: dict[str, Any], concept: dict[str, Any] | None, everyone: bool) -> dict[str, Any]:
    what = {"creative": f"a {item.get('kind')} ad ({D.FORMATS.get(item.get('format'), {}).get('label', item.get('format'))})"}.get(item["itemKind"], "a video clip" if item.get("kind") == "video" else "an image")
    labels = ", ".join(f"picture {i + 1} = {f[2]}" for i, f in enumerate(frames))
    colours = ", ".join(f"{i + 1}. {c['hex']} ({round(c['share'] * 100)}% of the frame)" for i, c in enumerate(palette))
    video = item.get("kind") == "video"
    prompt = f"""You explain to a merchant, in plain words, why {what} by {kit.get('name') or 'their brand'} looks and sounds the way it does. The pictures show it as it was made ({labels}).

THE DESIGNER'S NOTES (what was intended)
{_notes(item, concept)}

THE BRAND
{B._kit_block(kit)}

{"THE AUDIENCE: everyone. No audience taste was used, so explain it from the brand's guidelines and the request alone." if everyone else "THE AUDIENCE AND ITS QLOO PROFILE" + chr(10) + _profile_block(aud, look)}

THE COLOURS MEASURED IN IT
{colours or "(none)"}

Write:
- idea: the idea in at most 8 words.
- summary: two short sentences: who it is for and how their taste shaped it. Name one or two of their loves or traits.
- choices: 3 to 6 of the decisions you can actually see or hear in it, each a different kind ({'music, voice, motion, ' if video else ''}subject, setting, light, colour, words, type, layout, cta), most telling first. For each:
  - title: what the choice is, at most 6 words ("Heavy dark stoneware cup").
  - why: one sentence of at most 22 plain words on why it suits this audience, naming the taste it answers.
  - from: "taste" when it rests on the audience's profile, "brand" when the brand's guidelines decided it, "brief" when the merchant's request did.
  - signals: 1 to 3 names copied EXACTLY from the LOVES, TRAITS, BRANDS and culture lists above that this choice answers. Only names from those lists; none when from is brand or brief.
  - {"box: where it is in the picture, as [ymin, xmin, ymax, xmax] scaled 0 to 1000 (for light, colour or layout: the area that shows it best)" if not video else "time: the second it shows up"}.
- avoided: 1 to 3 things it deliberately leaves out that a generic ad would show, each with why (at most 18 words) and the signals behind it (same rule).
- colourNames: a short everyday name for each measured colour, in order ("charcoal", "warm cream").
Speak like a creative director to a shop owner: concrete, warm, no jargon. Never write "affinity", "Qloo", scores, percentages, em dashes or middle dots."""
    return await generate_json(
        [prompt, *[types.Part.from_bytes(data=f[0], mime_type=f[1]) for f in frames]],
        SCHEMA,
        name="Explain the choices",
        temperature=0.4,
        thinking=True,
        result=lambda r: f"{len(r.get('choices') or [])} choices",
    )


# --- the report --------------------------------------------------------------------------------


class NotFound(Exception):
    pass


async def subject(state: dict[str, Any], item_id: str, audience_id: str = "") -> tuple[dict[str, Any], dict[str, Any], bool]:
    """The creative, image or clip (as `item`, with itemKind) and the audience it was made for (or `audience_id`), with its profile.
    Raises NotFound with a message for the merchant."""
    cid = B._cid(state)
    camp = state.get(B.CAMPAIGN) or {}
    audiences = B._audiences(state)
    concepts = camp.get("concepts") or []
    cre = (state.get(B.CREATIVES) or {}).get(item_id)
    if cre:
        item = {**cre, "itemKind": "creative"}
        made_for = cre.get("audienceKey") or "all"
        if cre["doc"].get("kind") == "video" and any(c.get("status") == "pending" for c in cre["doc"].get("video") or []):
            raise NotFound("its shots are still generating; ask again when they land")
    else:
        rows = {store.row_id(a): a for a in (await store.load(cid)).get("assets") or []}
        a = rows.get(item_id)
        if not a or a.get("kind") not in ("image", "video"):
            raise NotFound(f"nothing on the canvas with id {item_id!r}")
        root = a
        for _ in range(50):
            if root.get("audienceKey") or not root.get("parentId") or root["parentId"] not in rows:
                break
            root = rows[root["parentId"]]
        item = {**a, "itemKind": "asset", "prompt": a.get("prompt") or root.get("prompt")}
        made_for = root.get("audienceKey") or _guess_audience(str(root.get("prompt") or ""), concepts, audiences)
    ids = {x["id"] for x in audiences}
    pick = audience_id if audience_id in ids else made_for if made_for in ids else "all"
    aud = await taste.ensure_profile(cid, audiences, pick) or {"id": "all", "name": "Everyone", "kind": "everyone"}
    everyone = aud.get("id") == "all" or aud.get("kind") == "everyone"
    if everyone and not aud.get("profile"):
        # "Everyone": the brand's own taste stands in (a Pages brand's Qloo read), else nothing to ground on.
        brand_q = (state.get(B.BRAND) or {}).get("qloo") or {}
        aud = {**aud, "profile": brand_q if isinstance(brand_q, dict) and brand_q.get("tags") else {}}
    return item, aud, everyone


async def report(tool_context: Any, item_id: str) -> dict:
    """The Why report of a creative, image or clip on the canvas, saved for the console."""
    state = tool_context.state
    cid = B._cid(state)
    camp = state.get(B.CAMPAIGN) or {}
    kit = camp.get("kit") or {}
    audiences = B._audiences(state)
    concepts = camp.get("concepts") or []
    try:
        item, aud, everyone = await subject(state, item_id)
    except NotFound as err:
        return {"ok": False, "error": str(err)}
    profile = aud.get("profile") or {}
    look = Lookup(profile)
    concept = next((c for c in concepts if c.get("audienceKey") == aud.get("id")), None)

    with timer() as t:
        try:
            frames = await _frames(item, kit)
        except Exception as err:
            record("slice", "Look at it", f"failed: {str(err)[:140]}", ms=t.ms, started=t.started)
            return {"ok": False, "error": f"could not look at it ({str(err)[:160]})"}
    record("slice", "Look at it", f"{len(frames)} frame{'s' if len(frames) != 1 else ''}", ms=t.ms, started=t.started)
    try:
        palette = _palette(await _pixels(frames[0][0]), kit)
    except Exception:
        palette = []

    map_task = asyncio.create_task(_map(aud, audiences, cid)) if not everyone else None
    demo_task = asyncio.create_task(_demographics(profile)) if profile else None
    try:
        res = await _explain(item, aud, look, frames, palette, kit, concept, everyone)
    except Exception as err:
        for task in (map_task, demo_task):
            if task:
                task.cancel()
        return {"ok": False, "error": f"the explanation failed ({type(err).__name__}: {str(err)[:120]})"}
    try:
        map_ = await map_task if map_task else None
    except Exception as err:
        record("qloo", "Map where the taste is", f"failed: {str(err)[:140]}", ms=0)
        map_ = None
    demo = await demo_task if demo_task else None

    def signals(names: Any) -> list[dict[str, Any]]:
        out, seen = [], set()
        for n in names or []:
            hit = look.find(str(n))
            if hit and hit["name"] not in seen:
                seen.add(hit["name"])
                out.append(look.signal(hit))
        return out[:3]

    is_video = item.get("kind") == "video"
    choices = []
    for i, c in enumerate(res.get("choices") or []):
        if not isinstance(c, dict) or not c.get("title"):
            continue
        sig = signals(c.get("signals")) if not everyone else []
        source = c.get("from") if c.get("from") in ("taste", "brand", "brief") else "brand"
        if source == "taste" and not sig:
            source = "brand"
        choice: dict[str, Any] = {"id": f"c{i + 1}", "kind": c.get("kind") or "subject", "title": str(c["title"])[:80], "why": str(c.get("why") or "")[:240], "from": source, "signals": sig}
        box = c.get("box")
        if not is_video and isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box):
            y0, x0, y1, x1 = (min(1.0, max(0.0, float(v) / 1000)) for v in box)
            if y1 > y0 and x1 > x0:
                choice["box"] = {"x": round(x0, 3), "y": round(y0, 3), "w": round(x1 - x0, 3), "h": round(y1 - y0, 3)}
                choice["at"] = {"x": round(min(0.95, max(0.05, (x0 + x1) / 2)), 3), "y": round(min(0.95, max(0.05, (y0 + y1) / 2)), 3)}
        if is_video and isinstance(c.get("time"), (int, float)):
            choice["time"] = round(max(0.0, float(c["time"])), 1)
        choices.append(choice)
    choices = choices[:6]
    cited = {s["name"] for c in choices for s in c["signals"]}

    names = [str(n) for n in res.get("colourNames") or []]
    for i, sw in enumerate(palette):
        sw["name"] = _nice(names[i]) if i < len(names) and names[i] else sw["hex"]

    traits = [t for t in look.traits[:12]] + [t for t in look.traits[12:] if t["name"] in cited]
    data = {
        "itemId": item_id,
        "itemKind": item["itemKind"],
        "version": int(item.get("version") or 0),
        "audienceKey": aud.get("id") or "all",
        "audienceName": aud.get("name") or "Everyone",
        "everyone": everyone,
        "idea": str(res.get("idea") or "")[:120],
        "summary": str(res.get("summary") or "")[:400],
        "choices": choices,
        "avoided": [{"what": str(x.get("what"))[:120], "why": str(x.get("why") or "")[:200], "signals": signals(x.get("signals"))} for x in res.get("avoided") or [] if isinstance(x, dict) and x.get("what")][:3],
        "palette": palette,
        "loves": [look.signal(i) for i in look.items.values() if i["kind"] == "love"],
        "traits": [{"name": t["name"], "group": t["group"], "affinity": t["affinity"], "choices": [c["id"] for c in choices if any(s["name"] == t["name"] for s in c["signals"])]} for t in traits],
        "brands": [{**look.signal(b), "used": b["name"] in cited} for b in (look.brands[:8] + [b for b in look.brands[8:] if b["name"] in cited])],
        # What they watch and listen to: what the choices cite, then the strongest films, shows and artists (books and places are noisier).
        "culture": [{**look.signal(c), "used": c["name"] in cited} for c in [c for c in look.culture if c["name"] in cited] + [c for c in look.culture if c["name"] not in cited and c["kind"] in ("film", "tv", "artist")]][:10],
        "demographics": demo,
        "map": map_,
        "at": int(time.time() * 1000),
    }
    await store.post("/media/insight", {"campaignId": cid, "kind": "why", "key": item_id, "data": data})
    record("slice", "Write the Why", f"{len(choices)} choices, {len(cited)} Qloo signals cited", ms=0)
    return {"ok": True, "choices": len(choices)}
