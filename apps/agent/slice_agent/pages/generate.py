"""Write a landing page as one variant per Qloo taste segment of the brand's audience.

1. Qloo: from the brand's taste seeds, what else its audience is into across
   music, film, TV, brands, travel and podcasts (with each entity's tags).
2. Gemini groups those entities into N distinct taste segments, choosing
   anchor entities only from Qloo's list.
3. Qloo: each segment's anchors become signals for its own tags and age skew.
4. Optional: the linked Slice store's products ranked by each segment's tags.
5. Gemini writes each variant (plus a default for everyone) from the brand's
   voice, the brief and that segment's Qloo taste, in parallel.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from urllib.parse import urljoin

from google.genai import types

from .. import convex_client as convex
from ..brief import MODEL, client
from ..trace import Span, record, start_turn, timer
from . import qloo as Q

POOL_KINDS = ["artist", "movie", "tv_show", "brand", "destination", "podcast"]

GOAL_HINT = {
    "leads": "collect a lead (sign up for updates, a guide, a consultation)",
    "sales": "sell: send them to buy",
    "signup": "get them to create an account or join",
    "booking": "get them to book (a visit, a demo, a table, a stay)",
}

SEGMENTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "summary": {"type": "string"},
                    "anchorIds": {"type": "array", "items": {"type": "string"}},
                    "utmKeywords": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "summary", "anchorIds", "utmKeywords"],
            },
        }
    },
    "required": ["segments"],
}

_items = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
        "required": ["title", "body"],
    },
}

COPY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "seoTitle": {"type": "string"},
        "seoDescription": {"type": "string"},
        "why": {"type": "string"},
        "accent": {"type": "string"},
        "hero": {
            "type": "object",
            "properties": {
                "eyebrow": {"type": "string"},
                "heading": {"type": "string"},
                "subheading": {"type": "string"},
                "ctaLabel": {"type": "string"},
            },
            "required": ["eyebrow", "heading", "subheading", "ctaLabel"],
        },
        "benefits": {
            "type": "object",
            "properties": {"heading": {"type": "string"}, "items": _items},
            "required": ["heading", "items"],
        },
        "story": {
            "type": "object",
            "properties": {"eyebrow": {"type": "string"}, "heading": {"type": "string"}, "body": {"type": "string"}},
            "required": ["eyebrow", "heading", "body"],
        },
        "fit": {
            "type": "object",
            "properties": {"heading": {"type": "string"}, "items": _items},
            "required": ["heading", "items"],
        },
        "products": {
            "type": "object",
            "properties": {"heading": {"type": "string"}, "body": {"type": "string"}},
            "required": ["heading", "body"],
        },
        "faq": _items,
        "finalCta": {
            "type": "object",
            "properties": {"heading": {"type": "string"}, "body": {"type": "string"}, "ctaLabel": {"type": "string"}},
            "required": ["heading", "body", "ctaLabel"],
        },
    },
    "required": ["seoTitle", "seoDescription", "why", "accent", "hero", "benefits", "story", "fit", "products", "faq", "finalCta"],
}


async def _patch(page_id: str, **patch: Any) -> None:
    await convex.site("/agent/pages/page", {"pageId": page_id, "patch": patch})


async def generate_page(page_id: str) -> dict[str, Any]:
    spans: list[Span] = start_turn()
    try:
        data, _ = await convex.site("/agent/pages/load", {"pageId": page_id})
        if not data or not data.get("brand") or not data["brand"].get("kit"):
            return {"ok": False, "error": "unknown page or brand not ready"}
        segments = await _generate(page_id, data["page"], data["brand"])
        await _patch(
            page_id,
            status="ready",
            progress="Done",
            segments=segments,
            trace=sorted(spans, key=lambda s: s.get("started", 0)),
        )
        return {"ok": True, "segments": len(segments)}
    except Exception as err:
        message = f"{type(err).__name__}: {err}"
        try:
            await _patch(page_id, status="failed", error=message, trace=sorted(spans, key=lambda s: s.get("started", 0)))
        except Exception as save_err:
            print(f"[slice] could not save page failure: {save_err}")
        return {"ok": False, "error": message}


def _ref(e: dict[str, Any]) -> dict[str, Any]:
    """An entity in the shape Convex's entityRefValidator accepts."""
    return {k: e[k] for k in ("id", "name", "type", "image", "subtitle", "source") if e.get(k) is not None}


async def _generate(page_id: str, page: dict[str, Any], brand: dict[str, Any]) -> list[dict[str, Any]]:
    kit = brand["kit"]
    taste = brand.get("taste") or {}
    seeds = [e["id"] for e in taste.get("entities") or []][:8]
    n = max(2, min(4, int(page.get("segmentCount") or 3)))

    clusters: list[dict[str, Any]] = []
    if seeds:
        await _patch(page_id, progress="Mapping the audience across culture with Qloo")
        pools = await asyncio.gather(*(Q.related(k, seeds, take=8) for k in POOL_KINDS))
        pool: dict[str, dict[str, Any]] = {}
        seed_set = set(seeds)
        for kind_list in pools:
            for e in kind_list:
                if e["id"] not in seed_set and e["id"] not in pool and e.get("name"):
                    pool[e["id"]] = e
        if len(pool) >= n * 2:
            await _patch(page_id, progress="Finding taste segments")
            clusters = await _segment(kit, page, list(pool.values()), n)

    await _patch(page_id, progress="Reading each segment's taste")

    async def read_segment(c: dict[str, Any]) -> dict[str, Any]:
        ids = [a["id"] for a in c["anchors"]]
        tags, demo = await asyncio.gather(
            Q.tags(ids, label_prefix=f"{c['name']}: "),
            Q.demographics(ids, label=f"Who {c['name']} is"),
        )
        return {**c, "tags": tags[:30], "demographics": demo}

    segments = list(await asyncio.gather(*(read_segment(c) for c in clusters)))
    default = {
        "id": "default",
        "name": "Everyone",
        "summary": kit.get("audience") or "Anyone who lands on the page.",
        "anchors": [_ref(e) for e in (taste.get("entities") or [])[:5]],
        "tags": (taste.get("tags") or [])[:30],
        "demographics": taste.get("demographics"),
        "utmKeywords": [],
        "isDefault": True,
    }
    everyone = [default, *segments]

    products: dict[str, list[dict[str, Any]]] = {}
    currency = "USD"
    if page.get("storeKey"):
        await _patch(page_id, progress="Ranking products for each segment")
        store = await convex.query("catalog:store", {"key": page["storeKey"]})
        currency = (store or {}).get("currency") or "USD"
        site_url = (store or {}).get("siteUrl") or ""
        ranked = await asyncio.gather(*(_products(page["storeKey"], s) for s in everyone))
        products = {s["id"]: [_absolute(p, site_url) for p in r] for s, r in zip(everyone, ranked)}

    await _patch(page_id, progress=f"Writing {len(everyone)} variants")
    copies = await asyncio.gather(
        *(_write(kit, page, s, products.get(s["id"], []), currency) for s in everyone)
    )
    images = kit.get("images") or []
    out = []
    for i, (s, copy) in enumerate(zip(everyone, copies)):
        out.append(_assemble(page, kit, s, copy, products.get(s["id"], []), currency, images, i))
    return out


async def _segment(kit: dict[str, Any], page: dict[str, Any], pool: list[dict[str, Any]], n: int) -> list[dict[str, Any]]:
    lines = [
        f"{e['id']} | {e['type'].split(':')[-1]} | {e['name']} | {', '.join(e.get('tags') or [])}"
        for e in pool
    ]
    prompt = f"""Qloo (a cultural taste graph) says the audience of {kit['name']} ({kit.get('vertical', '')}: {kit.get('offer', '')}) is also into the entities below (id | type | name | Qloo tags).

{chr(10).join(lines)}

The page promotes: {page['brief']['offer']}
{('Target audience note: ' + page['brief']['audience']) if page['brief'].get('audience') else ''}

Split this audience into exactly {n} distinct taste segments, the way a sharp strategist would: each a recognisable cultural sensibility, not a demographic.
- anchorIds: 3 to 5 ids from the list above (exact ids, no others), spanning at least 2 types, that together define the segment. No id in two segments.
- name: 2 or 3 evocative words (e.g. "Quiet Outdoors", "Nostalgic Night Owls"). No brand or artist names.
- summary: one sentence on what these people are into and what they'd want from {kit['name']}.
- utmKeywords: 3 to 6 lowercase single words an ad campaign aimed at them might put in its utm_campaign (e.g. "trail", "vinyl", "minimal")."""
    with timer() as t:
        res = await client().aio.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SEGMENTS_SCHEMA,
                temperature=0.5,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    raw = (json.loads(res.text or "{}").get("segments") or [])[:n]
    by_id = {e["id"]: e for e in pool}
    used: set[str] = set()
    taken_ids: set[str] = set()
    out: list[dict[str, Any]] = []
    for s in raw:
        anchors = [by_id[a] for a in dict.fromkeys(s.get("anchorIds") or []) if a in by_id and a not in used][:5]
        if len(anchors) < 2:
            continue
        used.update(a["id"] for a in anchors)
        sid = _slug(str(s.get("name", "segment")), taken_ids)
        out.append(
            {
                "id": sid,
                "name": str(s.get("name", "Segment"))[:60],
                "summary": str(s.get("summary", "")),
                "anchors": [_ref(a) for a in anchors],
                "anchorTags": sorted({t for a in anchors for t in a.get("tags") or []})[:20],
                "utmKeywords": [re.sub(r"[^a-z0-9]", "", str(k).lower()) for k in s.get("utmKeywords") or []][:6],
                "isDefault": False,
            }
        )
    record(
        "llm",
        f"Split the audience into {n} taste segments",
        "; ".join(f"{s['name']} ({', '.join(a['name'] for a in s['anchors'][:3])})" for s in out) or "no usable segments",
        ms=t.ms,
        started=t.started,
    )
    return out


def _slug(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:24] or "segment"
    sid, i = base, 2
    while sid in taken or sid == "default":
        sid, i = f"{base}-{i}", i + 1
    taken.add(sid)
    return sid


async def _products(store_key: str, segment: dict[str, Any]) -> list[dict[str, Any]]:
    tags = [{"id": t["id"], "type": t["type"], "affinity": t["affinity"]} for t in segment.get("tags") or []]
    if not tags:
        return []
    with timer() as t:
        try:
            res = await convex.query(
                "catalog:recommend",
                {
                    "storeKey": store_key,
                    "taste": {"styles": [], "terms": [], "brands": [], "tags": tags},
                    "take": 6,
                    "perSubcategory": 2,
                },
            )
        except Exception as err:
            record("catalog", f"Rank products for {segment['name']}", f"failed: {err}", ms=0)
            return []
    picks = [c["product"] for c in (res or {}).get("candidates") or []]
    record(
        "catalog",
        f"Rank products for {segment['name']}",
        f"{len(picks)} of {(res or {}).get('catalogSize', '?')} by Qloo tag overlap: " + ", ".join(p["name"] for p in picks[:3]),
        ms=t.ms,
        started=t.started,
    )
    return picks


def _absolute(p: dict[str, Any], site_url: str) -> dict[str, Any]:
    """Demo catalogs store image paths and no product URL; make both absolute against the store's site."""
    base = site_url.rstrip("/") + "/" if site_url else ""
    images = [i if i.startswith("http") or not base else urljoin(base, i) for i in p.get("images") or []]
    url = p.get("url")
    if not (isinstance(url, str) and url.startswith("http")):
        url = f"{base}p/{p['slug']}" if base and p.get("slug") else None
    return {**p, "images": images, "url": url}


def _price(value: Any, currency: str) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return ""
    symbol = {"USD": "$", "EUR": "€", "GBP": "£", "CAD": "CA$", "AUD": "A$", "JPY": "¥"}.get(currency, "")
    return f"{symbol}{n:,.0f}" if symbol else f"{n:,.0f} {currency}"


async def _write(
    kit: dict[str, Any],
    page: dict[str, Any],
    segment: dict[str, Any],
    products: list[dict[str, Any]],
    currency: str,
) -> dict[str, Any]:
    brief = page["brief"]
    tags_by_type: dict[str, list[str]] = {}
    for t in segment.get("tags") or []:
        tags_by_type.setdefault(t["type"].split(":")[2] if t["type"].count(":") >= 2 else "tag", []).append(t["name"])
    taste = "\n".join(f"  {k.replace('_', ' ')}: {', '.join(v[:8])}" for k, v in tags_by_type.items()) or "  (none)"
    anchors = ", ".join(f"{a['name']} ({a['type'].split(':')[-1]})" for a in segment.get("anchors") or []) or "(none)"
    product_lines = "\n".join(f"  - {p['name']}: {(p.get('description') or '')[:120]}" for p in products[:6])
    palette = ", ".join(kit["colors"].get("palette") or [kit["colors"]["primary"]])
    prompt = f"""You write high-converting landing pages for {kit['name']}.

BRAND
  {kit.get('description', '')}
  Offer: {kit.get('offer', '')}
  What the site claims: {'; '.join(kit.get('valueProps') or [])}
  Voice: {', '.join(kit['voice'].get('tone') or [])}. {kit['voice'].get('summary', '')}

THIS PAGE
  Promotes: {brief['offer']}
  Goal: {GOAL_HINT.get(page['goal'], page['goal'])}
  Button: "{brief['ctaLabel']}"
  {('Notes from the merchant: ' + brief['notes']) if brief.get('notes') else ''}

WHO THIS VARIANT IS FOR: {segment['name']}. {segment['summary']}
  Qloo taste (what this audience over-indexes on):
{taste}
  They're into: {anchors}
  Age skew: {Q.age_skew(segment.get('demographics'))}
{('PRODUCTS RANKED FOR THEIR TASTE (the page will show these):' + chr(10) + product_lines) if product_lines else ''}

Write this variant so it feels made for this audience: let their taste set the imagery, rhythm, references and what you emphasise. Same offer and facts as every other variant.
Rules:
- Evoke their world through mood, aesthetics and lifestyle. Never name the artists, films, shows, podcasts or other brands above (no implied endorsement).
- Only facts from BRAND and THIS PAGE. No invented testimonials, ratings, numbers, prices, discounts, guarantees or awards.
- Never mention age, gender, Qloo, data, segments or personalisation in the page copy.
- hero.heading under 9 words; hero.subheading 1 to 2 sentences; hero.ctaLabel close to "{brief['ctaLabel']}" (2 to 4 words); eyebrow 2 to 4 words.
- benefits: 3 items, title 2 to 5 words, body one sentence.
- story: why {kit['name']} fits the way they live, 2 to 3 sentences.
- fit.heading like "Made for you if…"; 3 items describing them in their own terms.
- products.heading and one-line body introducing the picks (write it even if there are none).
- faq: 3 practical questions with answers grounded in the facts given; if a fact is unknown, answer by pointing to the button.
- finalCta: short heading, one sentence, ctaLabel.
- seoTitle under 60 chars, seoDescription under 155.
- accent: the hex from [{palette}] that best suits this audience.
- why: for the merchant, one or two sentences on which Qloo tags shaped the copy and how."""
    with timer() as t:
        res = await client().aio.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=COPY_SCHEMA,
                temperature=0.7,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    copy = json.loads(res.text or "{}")
    record(
        "llm",
        f"Write the {segment['name']} variant",
        f"“{(copy.get('hero') or {}).get('heading', '')}”",
        ms=t.ms,
        started=t.started,
    )
    return copy


def _assemble(
    page: dict[str, Any],
    kit: dict[str, Any],
    s: dict[str, Any],
    copy: dict[str, Any],
    products: list[dict[str, Any]],
    currency: str,
    images: list[str],
    index: int,
) -> dict[str, Any]:
    cta_url = page["brief"]["ctaUrl"]
    hero, benefits, story, fit = (copy.get(k) or {} for k in ("hero", "benefits", "story", "fit"))
    final, prods = copy.get("finalCta") or {}, copy.get("products") or {}

    def img(offset: int) -> str | None:
        return images[(index + offset) % len(images)] if images else None

    hero_image = (products[0].get("images") or [None])[0] if products else None
    sections: list[dict[str, Any]] = [
        {
            "id": "hero",
            "kind": "hero",
            "eyebrow": hero.get("eyebrow", ""),
            "heading": hero.get("heading", kit["name"]),
            "body": hero.get("subheading", ""),
            "image": hero_image or img(0),
            "cta": {"label": hero.get("ctaLabel") or page["brief"]["ctaLabel"], "href": cta_url},
        },
        {
            "id": "benefits",
            "kind": "benefits",
            "heading": benefits.get("heading", ""),
            "items": [{"title": i.get("title", ""), "body": i.get("body", "")} for i in benefits.get("items") or []][:3],
        },
    ]
    if products:
        sections.append(
            {
                "id": "products",
                "kind": "products",
                "heading": prods.get("heading", ""),
                "body": prods.get("body", ""),
                "items": [
                    {
                        "title": p["name"],
                        "image": (p.get("images") or [None])[0],
                        "href": p.get("url"),
                        "price": _price(p.get("price"), currency),
                    }
                    for p in products[:6]
                ],
            }
        )
    sections += [
        {
            "id": "story",
            "kind": "story",
            "eyebrow": story.get("eyebrow", ""),
            "heading": story.get("heading", ""),
            "body": story.get("body", ""),
            "image": img(1),
        },
        {
            "id": "fit",
            "kind": "fit",
            "heading": fit.get("heading", ""),
            "items": [{"title": i.get("title", ""), "body": i.get("body", "")} for i in fit.get("items") or []][:3],
        },
        {
            "id": "faq",
            "kind": "faq",
            "heading": "Questions",
            "items": [{"title": i.get("title", ""), "body": i.get("body", "")} for i in copy.get("faq") or []][:4],
        },
        {
            "id": "cta",
            "kind": "cta",
            "heading": final.get("heading", ""),
            "body": final.get("body", ""),
            "cta": {"label": final.get("ctaLabel") or page["brief"]["ctaLabel"], "href": cta_url},
        },
    ]
    sections = [_compact(x) for x in sections if x.get("heading")]
    out: dict[str, Any] = {
        "id": s["id"],
        "name": s["name"],
        "summary": s.get("summary", ""),
        "why": copy.get("why", ""),
        "isDefault": bool(s.get("isDefault")),
        "anchors": s.get("anchors") or [],
        "tags": s.get("tags") or [],
        "utmKeywords": s.get("utmKeywords") or [],
        "seo": {"title": copy.get("seoTitle", kit["name"]), "description": copy.get("seoDescription", "")},
        "sections": sections,
    }
    if s.get("demographics"):
        out["demographics"] = s["demographics"]
    accent = str(copy.get("accent", "")).lower()
    if re.fullmatch(r"#[0-9a-f]{6}", accent):
        out["accent"] = accent
    return out


def _compact(section: dict[str, Any]) -> dict[str, Any]:
    """Drop empty optional fields; Convex rejects nulls for optional strings."""
    out: dict[str, Any] = {}
    for k, v in section.items():
        if v is None or v == "":
            continue
        if k == "items":
            v = [{ik: iv for ik, iv in item.items() if iv not in (None, "")} for item in v if item.get("title")]
        out[k] = v
    return out
