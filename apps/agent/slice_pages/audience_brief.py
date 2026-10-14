"""The audience brief (how to speak to one audience, with Qloo evidence) and cluster naming."""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from slice_agent import convex_client as convex
from slice_agent.trace import record
from .timing import timer

from .llm import generate_json

BRIEF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "summary": {"type": "string"},
        "speakTo": {"type": "string"},
        "imagery": {"type": "string"},
        "leadWith": {"type": "string"},
        "avoid": {"type": "array", "items": {"type": "string"}},
        "hooks": {
            "type": "array",
            "items": {"type": "object", "properties": {"text": {"type": "string"}, "evidence": {"type": "string"}}, "required": ["text", "evidence"]},
        },
        "items": {
            "type": "array",
            "items": {"type": "object", "properties": {"id": {"type": "string"}, "reason": {"type": "string"}}, "required": ["id", "reason"]},
        },
    },
    "required": ["summary", "speakTo", "imagery", "leadWith", "avoid", "hooks", "items"],
}

NAMES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "clusters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"index": {"type": "integer"}, "name": {"type": "string"}, "oneLiner": {"type": "string"}},
                "required": ["index", "name", "oneLiner"],
            },
        }
    },
    "required": ["clusters"],
}


def tag_kind(tag_type: str) -> str:
    parts = (tag_type or "").split(":")
    return parts[2] if len(parts) > 2 else "tag"


def profile_summary(profile: dict[str, Any] | None, *, tags_per_type: int = 10, brands: int = 12, culture: int = 8) -> dict[str, Any]:
    """An AudienceProfile as the model should read it: short, in words, with provenance."""
    if not profile:
        return {}
    tags: dict[str, list[str]] = {}
    for t in profile.get("tags") or []:
        kind = tag_kind(t.get("type", ""))
        tags.setdefault(kind, [])
        if len(tags[kind]) < tags_per_type and t.get("name") not in tags[kind]:
            tags[kind].append(t.get("name"))
    brand_lines = []
    for b in (profile.get("brands") or [])[:brands]:
        words = (b.get("personalStyle") or [])[:3] + (b.get("lifestyle") or [])[:2]
        brand_lines.append(b["name"] + (f" ({', '.join(words)})" if words else ""))
    cult = profile.get("culture") or {}
    culture_out = {k: [e.get("name") for e in (cult.get(k) or [])[:culture] if e.get("name")] for k in ("artists", "films", "places", "books")}
    demo = profile.get("demographics") or {}
    skew: dict[str, list[str]] = {}
    for group in ("age", "gender"):
        vals = demo.get(group) or {}
        top = sorted(vals.items(), key=lambda kv: -kv[1])[:2]
        skew[group] = [f"{k.replace('_', ' ')} {v:+.2f}" for k, v in top if v > 0.05]
    return {
        "signals": [f"{e.get('name')} ({str(e.get('type', '')).split(':')[-1].replace('_', ' ')}{', x' + str(e['count']) if e.get('count', 1) > 1 else ''})" for e in (profile.get("entities") or [])[:16]],
        "qloo_tags": tags,
        "brand_affinities": brand_lines,
        "culture": {k: v for k, v in culture_out.items() if v},
        "geo": [f"{g.get('name')}{' x' + str(g['count']) if g.get('count', 1) > 1 else ''}" for g in (profile.get("geo") or [])[:8]],
        "demographic_skew": {k: v for k, v in skew.items() if v},
    }


def _items_block(brand: dict[str, Any]) -> str:
    items = ((brand.get("brief") or {}).get("items") or [])[:24]
    return "\n".join(f"  - {it['id']}: {it['name']} ({it.get('kind', 'product')}{', ' + it['price'] if it.get('price') else ''}; tags: {', '.join(it.get('tags') or [])}) {it.get('description', '')[:120]}" for it in items) or "  (none)"


def _brief_prompt(audience: dict[str, Any], brand: dict[str, Any]) -> str:
    kit = brand.get("kit") or {}
    brief = brand.get("brief") or {}
    sources = audience.get("sources") or {}
    is_cluster = audience.get("kind") == "csv" and str(audience.get("name", "")).startswith("Cluster")
    return f"""You write the audience brief a landing-page builder reads before it writes a version of a page for one audience. The audience's taste comes from Qloo, the cultural taste graph.

BRAND: {brand.get('name')} ({brand.get('url')})
{brief.get('summary', '')}
Positioning: {brief.get('positioning', '')}. Voice: {(kit.get('voice') or {}).get('summary', '')}
Items the brand can feature (id: name):
{_items_block(brand)}

AUDIENCE: "{audience.get('name')}" (kind: {audience.get('kind')}, size: {audience.get('size')})
{"This audience is ONE customer from the brand's own customer list, not a group. Write every field about this one person, by first name or as they; never \"these people\" or \"this audience\"." if audience.get("kind") == "lead" else f"Defined by: {json.dumps(sources, ensure_ascii=False)}"}
Qloo taste profile:
{json.dumps(profile_summary(audience.get('profile')), ensure_ascii=False, indent=1)}

WRITE (sentence case, no em dashes, no exclamation marks, no jargon like "affinity vector"):
- summary: one sentence spoken to the merchant: who these people are, in taste terms.
- speakTo: how to talk to them: register, sentence length, words to use. Two or three sentences.
- imagery: art direction for photography on their version (light, palette, subjects, framing), consistent with the brand's own imagery but tuned to their personal_style and aesthetic tags.
- leadWith: what the hero should lead with (angle from emotional_tone / core_values tags; local angle for a city audience).
- avoid: 3 to 5 things that would feel wrong for this audience.
- hooks: 4 to 6 cultural hooks the page can use (an artist, film, place, brand or neighbourhood reference), each with evidence naming the Qloo tag, brand or entity behind it ("Qloo: Khruangbin and Bon Iver in the top artists; lifestyle tag 'slow living'").
- items: the 4 to 8 brand items that fit them best, by id from the list above, each with a one-clause reason tied to the profile. Only ids from the list.
{"- name: a 2 to 4 word name for this customer cluster, like a segment label a marketer would use (\"Pour-over purists\", \"Gift-season buyers\"). Sentence case, no colon, no quotes." if is_cluster else ""}
Never frame anything against bestsellers or trends; taste adds to what the brand already does. Never infer gender or age for individuals from the skew."""


async def write_audience_brief(audience_id: str) -> dict[str, Any]:
    with timer() as t:
        audience = await convex.query("pagesAudiences:get", {"id": audience_id})
    if not audience:
        return {"ok": False, "error": f"audience {audience_id} not found"}
    brand = await convex.query("pagesBrands:get", {"id": audience["brandId"]})
    if not brand:
        return {"ok": False, "error": f"brand {audience['brandId']} not found"}
    record("slice", "Load audience and brand", f"{audience.get('name')} / {brand.get('name')}", ms=t.ms, started=t.started)
    if not audience.get("profile"):
        return {"ok": False, "error": "audience has no profile yet (still compiling?)"}

    raw = await generate_json(
        _brief_prompt(audience, brand),
        BRIEF_SCHEMA,
        name=f"Write the brief for {audience.get('name')}",
        temperature=0.5,
        result=lambda r: f"{len(r.get('hooks') or [])} hooks, {len(r.get('items') or [])} items; {str(r.get('summary', ''))[:90]}",
    )
    valid_ids = {it["id"] for it in ((brand.get("brief") or {}).get("items") or [])}
    brief = {
        "summary": str(raw.get("summary") or "").strip(),
        "speakTo": str(raw.get("speakTo") or "").strip(),
        "imagery": str(raw.get("imagery") or "").strip(),
        "leadWith": str(raw.get("leadWith") or "").strip(),
        "avoid": [str(a).strip() for a in raw.get("avoid") or [] if str(a).strip()][:5],
        "hooks": [{"text": str(h.get("text", "")).strip(), "evidence": str(h.get("evidence", "")).strip()} for h in raw.get("hooks") or [] if isinstance(h, dict) and h.get("text")][:6],
        "items": [{"id": str(i.get("id")), "reason": str(i.get("reason", "")).strip()} for i in raw.get("items") or [] if isinstance(i, dict) and str(i.get("id")) in valid_ids][:8],
    }
    patch: dict[str, Any] = {"brief": brief}
    name = None
    if audience.get("kind") == "csv" and str(audience.get("name", "")).startswith("Cluster") and raw.get("name"):
        name = _clean_name(str(raw["name"]))
        if name:
            patch["name"] = name
    saved = True
    try:
        await convex.site("/pages/audience", {"audienceId": audience_id, "patch": patch})
    except Exception as err:
        saved = False
        record("slice", "Save audience brief", f"not saved: {err}", ms=0)
    return {"ok": True, "brief": brief, "name": name, "saved": saved}


def _clean_name(name: str) -> str | None:
    name = re.sub(r"[\"'“”:]+", "", name).strip()
    name = re.sub(r"\s+", " ", name)
    words = name.split(" ")
    if not 1 <= len(words) <= 5 or name.lower().startswith("cluster"):
        return None
    return name[0].upper() + name[1:]


async def _load_upload(upload_id: str) -> dict[str, Any] | None:
    try:
        doc = await convex.query("pagesUploads:get", {"id": upload_id})
        if doc:
            return doc
    except Exception:
        pass
    # No `get` on uploads: find it through a member's brandId and the brand's list.
    try:
        members = await convex.query("pagesUploads:members", {"uploadId": upload_id, "take": 1})
        if members:
            uploads = await convex.query("pagesUploads:list", {"brandId": members[0]["brandId"]})
            return next((u for u in uploads or [] if u.get("_id") == upload_id), None)
    except Exception:
        return None
    return None


async def name_clusters(upload_id: str) -> dict[str, Any]:
    with timer() as t:
        upload = await _load_upload(upload_id)
    if not upload:
        return {"ok": False, "error": f"upload {upload_id} not found (needs pagesUploads:get or members+list)"}
    clusters = upload.get("clusters") or []
    if not clusters:
        return {"ok": False, "error": "upload has no clusters yet"}
    brand = await convex.query("pagesBrands:get", {"id": upload["brandId"]})
    record("slice", "Load upload", f"{upload.get('filename')}: {len(clusters)} clusters, {upload.get('rowCount')} rows", ms=t.ms, started=t.started)

    stats: list[dict[str, Any]] = []
    for c in clusters:
        try:
            members = await convex.query("pagesUploads:members", {"uploadId": upload_id, "cluster": c["index"], "take": 80})
        except Exception:
            members = []
        cities = Counter(m.get("city") for m in members if m.get("city"))
        ages = Counter(m.get("age") for m in members if m.get("age"))
        genders = Counter(m.get("gender") for m in members if m.get("gender"))
        stats.append(
            {
                "index": c["index"],
                "size": c.get("size"),
                "topEntities": (c.get("topEntities") or [])[:8],
                "cities": [f"{k} x{v}" for k, v in cities.most_common(3)],
                "ages": [f"{k} x{v}" for k, v in ages.most_common(3)],
                "genders": [f"{k} x{v}" for k, v in genders.most_common(2)],
            }
        )
    prompt = f"""Name customer clusters for {(brand or {}).get('name', 'a brand')} ({((brand or {}).get('brief') or {}).get('summary', '')[:300]}).
Each cluster was found by k-means over the customers' Qloo taste entities (artists, films, brands, places they named) plus city and age. For each, give a 2 to 4 word name a marketer would use as a segment label (sentence case, no colon, no quotes, distinct from the others, no "Cluster") and a one-line description.

CLUSTERS:
{json.dumps(stats, ensure_ascii=False, indent=1)}"""
    raw = await generate_json(prompt, NAMES_SCHEMA, name="Name the clusters", temperature=0.6, result=lambda r: ", ".join(c.get("name", "") for c in r.get("clusters") or []))
    names: dict[int, str] = {}
    used: set[str] = set()
    for c in raw.get("clusters") or []:
        name = _clean_name(str(c.get("name") or ""))
        if name and name.lower() not in used:
            names[int(c.get("index", -1))] = name
            used.add(name.lower())
    updated = []
    for c in clusters:
        new = dict(c)
        if c["index"] in names:
            new["name"] = names[c["index"]]
        updated.append(new)
    results: dict[str, Any] = {"ok": True, "names": {str(k): v for k, v in names.items()}, "saved": True}
    try:
        await convex.site("/pages/upload", {"uploadId": upload_id, "patch": {"clusters": updated}})
        for c in updated:
            if c.get("audienceId") and c["index"] in names:
                await convex.site("/pages/audience", {"audienceId": c["audienceId"], "patch": {"name": names[c["index"]]}})
    except Exception as err:
        results["saved"] = False
        results["error"] = f"{type(err).__name__}: {str(err)[:200]}"
    return results
