"""Read a merchant's website into a brand kit, then ask Qloo who its audience is.

The site gives the look (logo, colours, fonts, imagery) and the words (what
they sell, how they sound). Gemini reads the words and names a few cultural
reference points; Qloo resolves those to real entities and returns the
audience's taste as tags and demographics. That taste is what the page
generator segments and writes for.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from urllib.parse import urljoin, urlsplit

from google.genai import types

from .. import convex_client as convex
from ..brief import MODEL, client
from ..trace import Span, record, start_turn, timer
from . import extract
from . import qloo as Q
from .fetch import FetchError, fetch

SEED_KINDS = ["brand", "artist", "movie", "tv_show", "destination", "book", "podcast"]

READ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "tagline": {"type": "string"},
        "description": {"type": "string"},
        "vertical": {"type": "string"},
        "audience": {"type": "string"},
        "offer": {"type": "string"},
        "valueProps": {"type": "array", "items": {"type": "string"}},
        "tone": {"type": "array", "items": {"type": "string"}},
        "voiceSummary": {"type": "string"},
        "primary": {"type": "string"},
        "accent": {"type": "string"},
        "darkTheme": {"type": "boolean"},
        "headingFont": {"type": "string"},
        "bodyFont": {"type": "string"},
        "seeds": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "kind": {"type": "string", "enum": SEED_KINDS},
                    "why": {"type": "string"},
                },
                "required": ["name", "kind", "why"],
            },
        },
    },
    "required": [
        "name", "tagline", "description", "vertical", "audience", "offer", "valueProps",
        "tone", "voiceSummary", "primary", "accent", "darkTheme", "seeds",
    ],
}


def _read_prompt(digest: str, palette: dict[str, Any], fonts: list[str]) -> str:
    return f"""You are a brand strategist reading a company's homepage to build its brand kit.

{digest}

COLOUR CANDIDATES (from the site's CSS; evidence = how often/strongly used; named = the CSS variable it came from):
{json.dumps(palette["candidates"], indent=1)}
Darkest neutral: {palette["dark"]}  Lightest neutral: {palette["light"]}

FONTS USED: {", ".join(fonts) or "none detected"}

Fill in the kit:
- name: the brand name as customers say it (not the page title).
- tagline: their own tagline if they have one, else a short line in their voice.
- description: two plain sentences on what they make and for whom.
- vertical: one or two words (e.g. "outdoor apparel", "coffee", "B2B software", "home furniture").
- audience: who buys from them, one sentence, from the evidence on the page.
- offer: what they sell, one sentence.
- valueProps: 3 to 5 short claims the site actually makes. Do not invent claims, numbers or awards.
- tone: 3 adjectives for the voice. voiceSummary: one sentence on how they write.
- primary and accent: hex colours chosen from the candidates (primary = the main brand colour, accent = a second one used for highlights; reuse primary if there is only one). If there are no candidates, use the darkest neutral for primary.
- darkTheme: true only if the site is clearly dark-background.
- headingFont / bodyFont: from FONTS USED, or empty.
- seeds: 6 to 8 real, specific cultural reference points this brand's customers are into, across at least 3 kinds. Start with the brand itself (kind "brand") and 2 or 3 peer brands the same people buy. Then artists, films, TV shows, destinations, books or podcasts that match the brand's world, preferring ones the site itself mentions (collaborations, ambassadors, places). They must be well-known proper names a taste graph would know, never generic categories ("hiking", "indie music")."""


async def _read(digest: str, palette: dict[str, Any], fonts: list[str]) -> dict[str, Any]:
    with timer() as t:
        res = await client().aio.models.generate_content(
            model=MODEL,
            contents=_read_prompt(digest, palette, fonts),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=READ_SCHEMA,
                temperature=0.3,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    raw = json.loads(res.text or "{}")
    record(
        "llm",
        "Read the brand from its site",
        f"{raw.get('name', '?')}: {raw.get('vertical', '?')}; {len(raw.get('seeds') or [])} cultural seeds",
        ms=t.ms,
        started=t.started,
    )
    return raw


async def _fetch_text(url: str, accept: tuple[str, ...], max_bytes: int) -> str:
    try:
        return (await fetch(url, accept=accept, max_bytes=max_bytes)).text
    except Exception:
        return ""


async def _patch(brand_id: str, **patch: Any) -> None:
    await convex.site("/agent/pages/brand", {"brandId": brand_id, "patch": patch})


async def extract_brand(brand_id: str) -> dict[str, Any]:
    spans: list[Span] = start_turn()
    try:
        doc, _ = await convex.site("/agent/pages/load", {"brandId": brand_id})
        if not doc:
            return {"ok": False, "error": "unknown brand"}
        kit, taste = await _extract(brand_id, doc["url"])
        await _patch(brand_id, status="ready", progress="Done", kit=kit, taste=taste, trace=_sorted(spans))
        return {"ok": True}
    except Exception as err:
        message = str(err) if isinstance(err, FetchError) else f"{type(err).__name__}: {err}"
        try:
            await _patch(brand_id, status="failed", error=message, trace=_sorted(spans))
        except Exception as save_err:
            print(f"[slice] could not save brand failure: {save_err}")
        return {"ok": False, "error": message}


def _sorted(spans: list[Span]) -> list[Span]:
    return sorted(spans, key=lambda s: s.get("started", 0))


async def _extract(brand_id: str, url: str) -> tuple[dict[str, Any], dict[str, Any]]:
    domain = urlsplit(url).hostname or url
    await _patch(brand_id, progress=f"Reading {domain}")
    with timer() as t:
        home = await fetch(url)
    page = extract.parse(home.url, home.text)
    record(
        "slice",
        f"Read {domain}",
        f"{len(page.headings)} headings, {len(page.paragraphs)} paragraphs, {len(page.logos)} logo candidates",
        ms=t.ms,
        started=t.started,
    )

    with timer() as t:
        about_url = extract.about_link(page)
        css_urls = page.stylesheets[:3]
        results = await asyncio.gather(
            *(_fetch_text(u, ("text/css", "text/plain"), 800_000) for u in css_urls),
            _fetch_text(about_url, ("text/html",), 1_000_000) if about_url else asyncio.sleep(0, ""),
        )
    css = [r for r in results[:-1] if r]
    about = extract.parse(about_url, results[-1]) if about_url and results[-1] else None
    palette = extract.colors(page, css, page.meta.get("theme-color"))
    fonts = extract.fonts(page, css)
    record(
        "slice",
        "Read the look",
        f"{len(palette['candidates'])} brand colours, fonts: {', '.join(fonts[:3]) or 'none'}"
        + (", plus the about page" if about else ""),
        ms=t.ms,
        started=t.started,
    )

    await _patch(brand_id, progress="Understanding the brand")
    read = await _read(extract.text_digest(page, about), palette, fonts)

    candidates = [c["hex"] for c in palette["candidates"]]
    primary = _pick(read.get("primary"), candidates) or (candidates[0] if candidates else palette["dark"])
    accent = _pick(read.get("accent"), candidates) or (candidates[1] if len(candidates) > 1 else primary)
    dark = bool(read.get("darkTheme"))
    by_lower = {f.lower(): f for f in fonts}
    heading_font = by_lower.get(str(read.get("headingFont", "")).lower()) or (fonts[0] if fonts else None)
    body_font = by_lower.get(str(read.get("bodyFont", "")).lower()) or (fonts[1] if len(fonts) > 1 else heading_font)

    icon = extract.best(page.icons) or urljoin(home.url, "/favicon.ico")
    kit = {
        "name": str(read.get("name") or page.meta.get("og:site_name") or domain)[:80],
        "tagline": str(read.get("tagline", "")),
        "description": str(read.get("description", "")),
        "vertical": str(read.get("vertical", "")),
        "audience": str(read.get("audience", "")),
        "offer": str(read.get("offer", "")),
        "valueProps": [str(v) for v in read.get("valueProps") or []][:5],
        "voice": {"tone": [str(v) for v in read.get("tone") or []][:4], "summary": str(read.get("voiceSummary", ""))},
        "images": extract.images(page),
        "colors": {
            "primary": primary,
            "accent": accent,
            "background": palette["dark"] if dark else palette["light"],
            "text": palette["light"] if dark else palette["dark"],
            "palette": candidates[:8],
        },
        "fonts": {k: v for k, v in (("heading", heading_font), ("body", body_font)) if v},
    }
    logo = extract.best(page.logos)
    if logo:
        kit["logo"] = logo
    if icon:
        kit["icon"] = icon

    await _patch(brand_id, progress="Finding the brand's audience in Qloo")
    taste = await _taste(kit["name"], read.get("seeds") or [])
    return kit, taste


def _pick(value: Any, candidates: list[str]) -> str | None:
    v = str(value or "").strip().lower()
    return v if v in candidates else None


async def _taste(name: str, seeds: list[dict[str, Any]]) -> dict[str, Any]:
    """Resolve the brand and its cultural seeds in Qloo, then read the audience's taste."""
    qloo_brand = await Q.search(name, "brand")
    seeds = [s for s in seeds if str(s.get("name", "")).strip().lower() != name.strip().lower()][:8]
    resolved = await asyncio.gather(
        *(Q.search(str(s["name"]), s["kind"] if s.get("kind") in Q.ENTITY else None) for s in seeds)
    )
    entities: dict[str, dict[str, Any]] = {}
    if qloo_brand:
        entities[qloo_brand["id"]] = qloo_brand
    for e in resolved:
        if e and e["id"] not in entities:
            entities[e["id"]] = e
    if qloo_brand:
        peers = await Q.related("brand", [qloo_brand["id"]], take=6, label=f"Brands {name}'s audience also loves")
        for p in peers[:3]:
            if p["id"] not in entities:
                entities[p["id"]] = {k: v for k, v in p.items() if k not in ("tags", "affinity")}
    refs = list(entities.values())
    signal_ids = [e["id"] for e in refs][:10]
    tags = await Q.tags(signal_ids, label_prefix="Audience: ") if signal_ids else []
    demo = await Q.demographics(signal_ids, label="Who the audience is") if signal_ids else None
    taste: dict[str, Any] = {"entities": refs, "tags": tags[:40]}
    if qloo_brand:
        taste["qlooBrand"] = qloo_brand
    if demo:
        taste["demographics"] = demo
    if not refs:
        record("slice", "Qloo grounding", "no seeds resolved; pages will use the brand copy only", ms=0, started=time.time())
    return taste
