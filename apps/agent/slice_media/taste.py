"""Taste profiles for media audiences.

A Pages audience brings its compiled Qloo profile. An audience given only as
taste seeds ("Lisbon, 25 to 34, into natural wine and Khruangbin") is compiled
here into the same AudienceProfile shape: the seeds are resolved to Qloo
entities, then Qloo insights give the tags, brands and culture people with
that taste have an affinity for. The result is stored back on the campaign so
it is compiled once.
"""

from __future__ import annotations

import asyncio
from typing import Any

from slice_agent import convex_client as convex
from slice_agent.trace import record
from slice_pages import builder as PB
from slice_pages.timing import timer

from . import store


async def _q(path: str, params: dict[str, Any]) -> dict[str, Any]:
    body, _ = await convex.qloo(path, params)
    return body or {}


def _entity(e: dict[str, Any]) -> dict[str, Any]:
    c = PB._compact_entity(e)
    return {k: v for k, v in {"id": c.get("id"), "name": c.get("name"), "type": f"urn:entity:{c.get('type')}", "image": c.get("image"), "subtitle": c.get("note")}.items() if v}


async def compile_seed(seed: dict[str, Any]) -> dict[str, Any]:
    """{entities, tags, brands, culture, geo} from {interests, city?, age?}."""
    interests = [str(i).strip() for i in seed.get("interests") or [] if str(i).strip()][:6]
    city = str(seed.get("city") or "").strip()
    age = str(seed.get("age") or "").strip()
    with timer() as t:
        found = await asyncio.gather(*[_q("/search", {"query": i, "take": 1}) for i in interests], return_exceptions=True)
        entities = []
        for term, res in zip(interests, found):
            if isinstance(res, dict) and res.get("results"):
                e = _entity(res["results"][0])
                e["count"] = 1
                e["seed"] = term
                entities.append(e)
        ids = [e["id"] for e in entities if e.get("id")]
        base: dict[str, Any] = {}
        if ids:
            base["signal.interests.entities"] = ",".join(ids)
        if city:
            base["signal.location.query"] = city
        if age in PB.AGE_BUCKETS:
            base["signal.demographics.age"] = age
        if not base:
            return {}
        calls = {
            "tags": _q("/v2/insights", {**base, "filter.type": "urn:tag", "filter.tag.types": "urn:tag:style:qloo,urn:tag:personal_style:qloo,urn:tag:keyword:media", "take": 24}),
            "brands": _q("/v2/insights", {**base, "filter.type": "urn:entity:brand", "take": 12}),
            "artists": _q("/v2/insights", {**base, "filter.type": "urn:entity:artist", "take": 6}),
            "films": _q("/v2/insights", {**base, "filter.type": "urn:entity:movie", "take": 6}),
        }
        if city:
            calls["places"] = _q("/v2/insights", {**{k: v for k, v in base.items() if k != "signal.location.query"}, "filter.type": "urn:entity:place", "filter.location.query": city, "filter.popularity.min": 0.8, "take": 6})
        keys = list(calls)
        results = dict(zip(keys, await asyncio.gather(*calls.values(), return_exceptions=True)))

    def ents(k: str) -> list[dict[str, Any]]:
        r = results.get(k)
        return [_entity(e) for e in ((r or {}).get("results") or {}).get("entities") or []] if isinstance(r, dict) else []

    tags_r = results.get("tags")
    tags = [
        {"id": tg.get("id") or tg.get("tag_id"), "name": tg.get("name"), "type": tg.get("type") or tg.get("subtype") or "", "affinity": round(float((tg.get("query") or {}).get("affinity") or 0), 3)}
        for tg in (((tags_r or {}).get("results") or {}).get("tags") or [] if isinstance(tags_r, dict) else [])
    ]
    profile = {
        "entities": entities,
        "tags": tags,
        "brands": [{"name": b["name"], "image": b.get("image"), "id": b.get("id")} for b in ents("brands") if b.get("name")],
        "culture": {k: v for k, v in {"artists": ents("artists"), "films": ents("films"), "places": ents("places")}.items() if v},
        "geo": [{"name": city, "count": 1}] if city else [],
    }
    record("qloo", "Compile the audience's taste", f"{len(entities)} signals, {len(tags)} tags, {len(profile['brands'])} brands", ms=t.ms, started=t.started)
    return profile


async def ensure_profile(campaign_id: str, audiences: list[dict[str, Any]], audience_id: str) -> dict[str, Any] | None:
    """The audience with a profile, compiling (and storing) a seed audience's on first use."""
    aud = next((a for a in audiences if a.get("id") == audience_id), None)
    if not aud:
        return None
    if aud.get("profile") or aud.get("kind") != "seed":
        return aud
    profile = await compile_seed(aud.get("seed") or {})
    aud["profile"] = profile
    try:
        # Pages audiences are read live, so only the seed audiences keep a profile on the campaign.
        stored = [a if a.get("kind") == "seed" else {k: v for k, v in a.items() if k not in ("profile", "brief", "sources", "status")} for a in audiences]
        await store.post("/media/campaign", {"campaignId": campaign_id, "patch": {"audiences": stored}})
    except Exception as e:  # the profile still serves this turn
        record("slice", "Save the audience profile", f"failed: {str(e)[:120]}", ms=0)
    return aud
