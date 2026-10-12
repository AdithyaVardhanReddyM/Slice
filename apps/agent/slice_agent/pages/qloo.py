"""Traced Qloo calls for pages, through the Convex cache (convex_client.qloo).

Mirrors packages/backend/convex/qlooApi.ts: same endpoints, same tag groups,
same span shape, so page traces read like concierge traces in the console.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

from .. import convex_client as convex
from ..trace import record, timer

ENTITY = {
    "artist": "urn:entity:artist",
    "movie": "urn:entity:movie",
    "tv_show": "urn:entity:tv_show",
    "book": "urn:entity:book",
    "place": "urn:entity:place",
    "destination": "urn:entity:destination",
    "brand": "urn:entity:brand",
    "podcast": "urn:entity:podcast",
}

# Brand-domain tags, asked per group so each kind gets its own slots (see qlooApi.ts).
TAG_GROUPS: list[tuple[list[str], int, str]] = [
    (["urn:tag:personal_style:qloo", "urn:tag:aesthetic_property:qloo"], 16, "Style and aesthetic tags"),
    (["urn:tag:lifestyle:qloo", "urn:tag:emotional_tone:qloo"], 14, "Lifestyle and mood tags"),
    (["urn:tag:core_values:qloo", "urn:tag:customer_identity:qloo"], 8, "Values and identity tags"),
]

# The hackathon key rate-limits bursts; cache hits are free.
_limit = asyncio.Semaphore(3)


async def get(name: str, path: str, params: dict[str, Any], summarize) -> dict[str, Any]:
    async with _limit:
        error: Exception | None = None
        with timer() as t:
            try:
                body, cache = await convex.qloo(path, params)
            except Exception as err:
                body, cache = None, None
                error = err
        if not isinstance(body, dict):
            record("qloo", name, f"failed: {str(error)[:80]}", ms=t.ms, path=path, params=params, started=t.started)
            return {}
        record("qloo", name, summarize(body), ms=t.ms, path=path, params=params, cache=cache, started=t.started)
        if cache == "miss":
            await asyncio.sleep(0.15)
        return body


def _image(props: dict[str, Any]) -> str | None:
    img = props.get("image")
    url = img.get("url") if isinstance(img, dict) else None
    return url if isinstance(url, str) and url.startswith("https://") else None


def entity(e: dict[str, Any], source: str) -> dict[str, Any]:
    props = e.get("properties") or {}
    types = e.get("types") or []
    out: dict[str, Any] = {
        "id": str(e.get("entity_id") or e.get("id")),
        "name": str(e.get("name", "")).strip(),
        "type": e.get("subtype") or (types[0] if types else "urn:entity"),
        "source": source,
    }
    image = _image(props)
    if image:
        out["image"] = image
    sub = props.get("short_description") or props.get("disambiguation") or (
        str(props["release_year"]) if props.get("release_year") else None
    )
    if isinstance(sub, str) and sub and sub.lower() != out["name"].lower():
        out["subtitle"] = sub if len(sub) <= 90 else sub[:87] + "…"
    return out


def entity_tags(e: dict[str, Any], take: int = 8) -> list[str]:
    return [str(t.get("name")).strip() for t in (e.get("tags") or [])[:take] if t.get("name")]


async def search(query: str, kind: str | None = None, source: str = "brand_site") -> dict[str, Any] | None:
    params: dict[str, Any] = {"query": query, "take": 3}
    if kind:
        params["types"] = ENTITY[kind]

    def summarize(b: dict[str, Any]) -> str:
        first = (b.get("results") or [None])[0]
        return f"{first['name']} ({(first.get('types') or ['?'])[0]})" if first else "no match"

    body = await get(f'Resolve "{query}"', "/search", params, summarize)
    results = body.get("results") or []
    if not results:
        return None
    # Search is fuzzy; require the name to actually match for brand lookups.
    want = _norm(query)
    for r in results:
        if _norm(str(r.get("name", ""))) == want or (kind != "brand" and r is results[0]):
            return entity(r, source)
    return None


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


async def related(kind: str, signal_ids: list[str], take: int = 10, label: str | None = None) -> list[dict[str, Any]]:
    """Entities of `kind` Qloo associates with the signal entities, with their tags."""
    params = {
        "filter.type": ENTITY[kind],
        "signal.interests.entities": ",".join(signal_ids),
        "take": take,
    }
    body = await get(
        label or f"{kind.replace('_', ' ').title()}s this audience loves",
        "/v2/insights",
        params,
        lambda b: ", ".join(e.get("name", "") for e in ((b.get("results") or {}).get("entities") or [])[:4]) or "no results",
    )
    out = []
    for e in (body.get("results") or {}).get("entities") or []:
        ref = entity(e, "qloo")
        ref["tags"] = entity_tags(e)
        ref["affinity"] = float(((e.get("query") or {}).get("affinity")) or 0)
        out.append(ref)
    return out


async def tags(signal_ids: list[str], label_prefix: str = "") -> list[dict[str, Any]]:
    """Brand-domain Qloo tags for the signals, per group, deduplicated, strongest first."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for types, take, label in TAG_GROUPS:
        params = {
            "filter.type": "urn:tag",
            "filter.tag.types": ",".join(types),
            "signal.interests.entities": ",".join(signal_ids),
            "take": take,
        }
        body = await get(
            f"{label_prefix}{label}",
            "/v2/insights",
            params,
            lambda b: ", ".join(str(t.get("name", "")).strip() for t in ((b.get("results") or {}).get("tags") or [])[:6]) or "no tags",
        )
        rows = [t for t in (body.get("results") or {}).get("tags") or [] if not re.fullmatch(r"(?i)null|none", str(t.get("name", "")).strip())]
        n = len(rows)
        for rank, t in enumerate(rows):
            tid = str(t.get("tag_id") or t.get("id") or "")
            if not tid or tid in seen:
                continue
            seen.add(tid)
            weight = 1 - 0.6 * (rank / max(1, n - 1))
            out.append(
                {
                    "id": tid,
                    "name": str(t.get("name", "")).strip(),
                    "type": t.get("subtype") or "urn:tag",
                    "affinity": round(float(((t.get("query") or {}).get("affinity")) or 0) * weight, 3),
                }
            )
    out.sort(key=lambda t: -t["affinity"])
    return out


async def demographics(signal_ids: list[str], label: str = "Who this audience is") -> dict[str, Any] | None:
    params = {"filter.type": "urn:demographics", "signal.interests.entities": ",".join(signal_ids)}
    body = await get(label, "/v2/insights", params, lambda b: _demo_summary(_aggregate(b)) or "no data")
    return _aggregate(body)


def _aggregate(body: dict[str, Any]) -> dict[str, Any] | None:
    rows = (body.get("results") or {}).get("demographics") or []
    if not rows:
        return None
    age: dict[str, float] = {}
    gender: dict[str, float] = {}
    for row in rows:
        q = row.get("query") or {}
        for k, v in (q.get("age") or {}).items():
            age[k] = age.get(k, 0) + float(v) / len(rows)
        for k, v in (q.get("gender") or {}).items():
            gender[k] = gender.get(k, 0) + float(v) / len(rows)
    return {"age": {k: round(v, 3) for k, v in age.items()}, "gender": {k: round(v, 3) for k, v in gender.items()}}


def _demo_summary(d: dict[str, Any] | None) -> str:
    if not d:
        return ""
    age = max(d["age"].items(), key=lambda x: x[1], default=None)
    return f"skews {age[0].replace('_', ' ')}" if age else ""


def age_skew(d: dict[str, Any] | None) -> str:
    """The over-indexed age bands, for the copywriter. Gender is never passed on."""
    if not d:
        return "unknown"
    bands = sorted(((k, v) for k, v in d.get("age", {}).items() if v > 0.05), key=lambda x: -x[1])
    return ", ".join(k.replace("_", " ") for k, _ in bands[:2]) or "broad"
