"""Turns a merchant's description of an audience ("under 25s in Lisbon who love Nike and
listen to Tyler, the Creator") into the audience builder's conditions, every name resolved
to a real Qloo entity, segment or genre, so the console can show and edit them."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from slice_agent import convex_client as convex
from slice_agent.trace import record
from .llm import generate_json

AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]

# Builder condition → the Qloo entity types its names are searched in.
ENTITY_FIELDS: dict[str, list[str]] = {
    "brands": ["brand"],
    "music": ["artist", "podcast"],
    "screen": ["tv_show", "movie"],
    "books": ["book"],
    "places": ["place", "destination"],
    "games": ["videogame"],
}

GENRE_TYPES = "urn:tag:genre:music,urn:tag:genre:media"

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "city": {"type": "string"},
        "country": {"type": "string"},
        "ages": {"type": "array", "items": {"type": "string", "enum": AGES}},
        "gender": {"type": "string", "enum": ["male", "female"]},
        **{k: {"type": "array", "items": {"type": "string"}} for k in ENTITY_FIELDS},
        "lifestyle": {"type": "array", "items": {"type": "string"}},
        "genres": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["name"],
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _clean_tag(name: str) -> str:
    """'"indie"' → "Indie", "Indie - Rock" → "Indie rock" (as the console's genre search shows them)."""
    words = re.sub(r"\s+", " ", re.sub(r"\s*-\s*", " ", re.sub(r"[\"“”]", "", name))).strip().split(" ")
    return " ".join(w[:1].upper() + w[1:] if i == 0 else (w.lower() if re.match(r"^[A-Z][a-z]", w) else w) for i, w in enumerate(words))


async def _entity(name: str, types: list[str]) -> dict[str, Any] | None:
    body, cache = await convex.qloo("/search", {"query": name, "types": ",".join(f"urn:entity:{t}" for t in types), "take": 6})
    results = [r for r in (body or {}).get("results") or [] if isinstance(r, dict)]
    exact = [r for r in results if _norm(str(r.get("name"))) == _norm(name)]
    hit = (exact or results or [None])[0]
    record("qloo", f'Find "{name}"', f"{hit.get('name')} ({(hit.get('types') or ['?'])[0]})" if hit else "no match", ms=0, path="/search", cache=cache)
    if not hit:
        return None
    img = ((hit.get("properties") or {}).get("image") or {}).get("url")
    return {"id": str(hit.get("entity_id") or hit.get("id")), "name": hit.get("name"), "type": (hit.get("types") or ["urn:entity"])[0], **({"image": img} if img else {})}


async def _genre(name: str) -> dict[str, Any] | None:
    body, cache = await convex.qloo("/v2/tags", {"filter.query": name, "filter.tag.types": GENRE_TYPES, "take": 12})
    tags = [t for t in ((body or {}).get("results") or {}).get("tags") or [] if isinstance(t, dict)]
    # Music first, then an exact spelling match.
    tags.sort(key=lambda t: (not str(t.get("type", "")).startswith("urn:tag:genre:music"), _norm(_clean_tag(str(t.get("name")))) != _norm(name)))
    hit = tags[0] if tags else None
    record("qloo", f'Find the genre "{name}"', str(hit.get("id")) if hit else "no match", ms=0, path="/v2/tags", cache=cache)
    if not hit:
        return None
    return {"id": str(hit.get("id") or hit.get("tag_id")), "name": _clean_tag(str(hit.get("name"))), "type": str(hit.get("type") or "")}


async def parse_audience(brand_id: str, text: str) -> dict[str, Any]:
    brand = await convex.query("pagesBrands:get", {"id": brand_id}) or {}
    try:
        segments = await convex.query("pagesAudiences:segments", {}) or []
    except Exception:
        segments = []
    by_slug = {s["id"].split(":")[-1]: s for s in segments}
    segment_list = "; ".join(f"{slug} ({s['name']})" for slug, s in by_slug.items()) or "(none)"
    prompt = f"""You turn a marketer's description of who a landing page is for into audience conditions for {brand.get('name', 'a brand')}. Qloo reads the conditions together as one group.

DESCRIPTION: {text.strip()}

Fill in only what the description says; leave out anything it does not mention and never invent conditions.
- city and country: where they live, when a place is named.
- ages: age bands from the list. "under 25", "teens", "students", "Gen Z" → 24_and_younger; "18 to 30" → 24_and_younger, 25_to_29; "millennials" → 30_to_34, 35_to_44; "over 55", "retirees" → 55_and_older.
- gender: only when stated ("women", "men").
- brands, music (artists and podcasts), screen (films and TV shows), books, places (restaurants, venues, destinations), games: names exactly as written, one per item.
- lifestyle: slugs from this list only, when the description names a matching hobby, habit, life stage or cause: {segment_list}.
- genres: music, film or book genres when named ("indie rock", "hip hop", "film noir").
- name: a short audience name in sentence case, 2 to 6 words ("Lisbon under 25s into Nike")."""
    raw = await generate_json(
        prompt,
        SCHEMA,
        name="Read the audience description",
        temperature=0.2,
        result=lambda r: ", ".join(f"{k}: {v}" for k, v in r.items() if v and k != "name")[:200],
    )

    sem = asyncio.Semaphore(2)  # the hackathon key rate-limits bursts

    async def guarded(coro):
        async with sem:
            try:
                return await coro
            except Exception:
                return None

    jobs: list[tuple[str, str, Any]] = []
    for field, types in ENTITY_FIELDS.items():
        for name in [n.strip() for n in raw.get(field) or [] if isinstance(n, str) and n.strip()][:6]:
            jobs.append(("entity", name, guarded(_entity(name, types))))
    for name in [n.strip() for n in raw.get("genres") or [] if isinstance(n, str) and n.strip()][:4]:
        jobs.append(("genre", name, guarded(_genre(name))))
    found = await asyncio.gather(*(j[2] for j in jobs))

    entities: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []
    unresolved: list[str] = []
    for (kind, name, _), hit in zip(jobs, found):
        if not hit:
            unresolved.append(name)
        elif kind == "entity" and all(e["id"] != hit["id"] for e in entities):
            entities.append(hit)
        elif kind == "genre" and all(g["id"] != hit["id"] for g in tags):
            tags.append(hit)
    picked_segments = []
    for slug in raw.get("lifestyle") or []:
        seg = by_slug.get(str(slug).strip().lower().replace(" ", "_"))
        if seg and all(s["id"] != seg["id"] for s in picked_segments):
            picked_segments.append({"id": seg["id"], "name": seg["name"]})
    definition = {
        "name": str(raw.get("name") or "").strip(),
        "city": str(raw.get("city") or "").strip(),
        "country": str(raw.get("country") or "").strip(),
        "ages": [a for a in AGES if a in (raw.get("ages") or [])],
        "gender": raw.get("gender") if raw.get("gender") in ("male", "female") else "",
        "entities": entities,
        "segments": picked_segments[:4],
        "tags": tags,
    }
    return {"ok": True, "definition": definition, "unresolved": unresolved}


def to_sources(d: dict[str, Any], unresolved: list[str] | None = None) -> dict[str, Any]:
    """A parsed definition as an audience's `sources` (what pagesAudiences.create takes)."""
    src: dict[str, Any] = {}
    if d.get("city"):
        src["location"] = {"city": d["city"], **({"country": d["country"]} if d.get("country") else {})}
    ages, gender = d.get("ages") or [], d.get("gender")
    if ages or gender:
        src["demographics"] = {**({"age": ages[0]} if len(ages) == 1 else {"ages": ages} if ages else {}), **({"gender": gender} if gender else {})}
    entities = d.get("entities") or []
    # Names Qloo did not find stay as typed names; the compiler searches them again.
    names = [e["name"] for e in entities] + list(unresolved or [])
    if entities:
        src["interestEntities"] = entities
    if names:
        src["interests"] = names
    if d.get("segments"):
        src["segments"] = d["segments"]
    if d.get("tags"):
        src["tags"] = d["tags"]
    return src
