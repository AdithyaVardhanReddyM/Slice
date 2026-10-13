"""Brand intake: URL -> brand kit + brand brief, streamed.

Steps (each written to Convex via POST /pages/brand so the console follows along):
1. fetch the homepage, then up to 7 linked pages (Firecrawl or direct);
2. deterministic extraction of design tokens from HTML + same-host CSS, then the
   rendered homepage measured in a headless browser (logo cut-out, icon, button
   shape, corner radius, colour roles), which wins where it has a reading;
3. one Gemini call with a JSON schema producing the kit and the brief;
4. write kit + brief + screenshot + crawled, status "review", then ask Convex to
   run `pagesBrands:qlooLookup`.

`run_intake` is an async generator of NDJSON-ready events:
{type: "status", text, progress}, {type: "span", span}, {type: "error", message},
{type: "done", brandId, kit, brief, crawled, qloo}.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, AsyncIterator
from urllib.parse import urljoin, urlparse

from slice_agent import convex_client as convex
from slice_agent.trace import Span, record, start_turn
from .timing import timer

from . import capture, crawl
from .extract import Extracted, apply_branding, apply_probe, extract, font_fallback, parse_color
from .llm import clip, generate_json

MAX_LINKED_PAGES = 7
RADII = ("none", "sm", "md", "lg", "full")
DENSITIES = ("compact", "regular", "airy")
BUTTONS = ("pill", "rounded", "square")
ITEM_KINDS = ("product", "room", "experience", "plan", "service", "offer")

_FONT = {
    "type": "object",
    "properties": {"family": {"type": "string"}, "source": {"type": "string", "enum": ["google", "system"]}},
    "required": ["family", "source"],
}
_COLOR_KEYS = ["background", "foreground", "primary", "primaryForeground", "accent", "muted", "surface"]

KIT_BRIEF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "kit": {
            "type": "object",
            "properties": {
                "colors": {"type": "object", "properties": {k: {"type": "string"} for k in _COLOR_KEYS}, "required": _COLOR_KEYS},
                "fonts": {"type": "object", "properties": {"heading": _FONT, "body": _FONT}, "required": ["heading", "body"]},
                "radius": {"type": "string", "enum": list(RADII)},
                "density": {"type": "string", "enum": list(DENSITIES)},
                "buttonStyle": {"type": "string", "enum": list(BUTTONS)},
                "uppercaseLabels": {"type": "boolean"},
                "wordmark": {"type": "string"},
                "logoOnDark": {"type": "boolean"},
                "imagery": {
                    "type": "object",
                    "properties": {"style": {"type": "string"}, "treatment": {"type": "string"}},
                    "required": ["style", "treatment"],
                },
                "voice": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "do": {"type": "array", "items": {"type": "string"}},
                        "avoid": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["summary", "do", "avoid"],
                },
            },
            "required": ["colors", "fonts", "radius", "density", "buttonStyle", "uppercaseLabels", "imagery", "voice"],
        },
        "brief": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "summary": {"type": "string"},
                "categories": {"type": "array", "items": {"type": "string"}},
                "positioning": {"type": "string"},
                "audience": {"type": "string"},
                "proof": {"type": "array", "items": {"type": "string"}},
                "ctas": {"type": "array", "items": {"type": "string"}},
                "locations": {"type": "array", "items": {"type": "string"}},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "kind": {"type": "string", "enum": list(ITEM_KINDS)},
                            "description": {"type": "string"},
                            "price": {"type": "string"},
                            "image": {"type": "string"},
                            "url": {"type": "string"},
                            "tags": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["name", "kind", "description", "tags"],
                    },
                },
                "relatedBrands": {"type": "array", "items": {"type": "string"}},
                "comparableBrands": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["name", "summary", "categories", "positioning", "audience", "proof", "ctas", "locations", "items", "relatedBrands"],
        },
    },
    "required": ["kit", "brief"],
}


def _event(type_: str, **kw: Any) -> dict[str, Any]:
    return {"type": type_, **kw}


async def _patch(brand_id: str, patch: dict[str, Any]) -> str | None:
    """Write a progress patch; the stream keeps going if Convex is not reachable."""
    # Convex validators reject null for optional fields; send only what is set.
    patch = {k: v for k, v in patch.items() if v is not None}
    try:
        await convex.site("/pages/brand", {"brandId": brand_id, "patch": patch})
        return None
    except Exception as err:
        return f"{type(err).__name__}: {str(err)[:200]}"


def _prompt(url: str, pages: list[crawl.Page], cands: Extracted) -> str:
    budget = 64_000
    blocks: list[str] = []
    for i, p in enumerate(pages):
        cap = 16_000 if i == 0 else max(4_000, (budget - 16_000) // max(1, len(pages) - 1))
        blocks.append(f"### PAGE {p.url}\nTitle: {p.title}\n\n{clip(p.markdown, cap)}")
    cand_view = {
        "wordmark": cands.get("wordmark"),
        "logo": (cands.get("logo") or {}).get("alt") if cands.get("logo") else None,
        "themeColor": cands.get("themeColor"),
        "colorRoles": cands.get("colors"),
        "paletteByFrequency": cands.get("palette"),
        "fonts": cands.get("fonts"),
        "radius": cands.get("radius"),
        "buttonStyle": cands.get("buttonStyle"),
        "uppercaseLabels": cands.get("uppercaseLabels"),
        "measured": sorted((cands.get("measured") or {}).keys()),
        "meta": cands.get("meta"),
        "firecrawlBranding": cands.get("branding"),
    }
    jsonld = cands.get("jsonld") or {}
    images = [{"src": im["src"], "alt": im["alt"]} for im in (cands.get("images") or [])[:60]]
    measured_block = (
        "\nMEASURED ON THE RENDERED HOMEPAGE (computed styles in a real browser: buttons as drawn, the median corner of cards and of photos in px, text colours as seen):\n"
        + json.dumps(cands.get("measuredView"), ensure_ascii=False)
        + "\n"
        if cands.get("measuredView")
        else ""
    )
    return f"""You are writing the brand kit and brand brief for a B2C business from its website, for a tool that builds landing pages in that brand's own look and voice.

SITE: {url}

DESIGN TOKENS (colour roles, radius, button style and casing were measured on the rendered page when "measured" lists them; otherwise read from the CSS. Trust them unless the copy or markup contradicts them):
{json.dumps(cand_view, ensure_ascii=False, indent=1)}
{measured_block}
STRUCTURED DATA (JSON-LD found on the pages):
{json.dumps({"organization": jsonld.get("organization"), "places": jsonld.get("places"), "products": jsonld.get("products")}, ensure_ascii=False, indent=1)}

IMAGES ON THE PAGES (absolute URLs with alt text; use them for item images when the alt or URL clearly matches an item):
{json.dumps(images, ensure_ascii=False)}

PAGE TEXT:
{chr(10).join(blocks)}

WRITE
kit:
- colors: seven hex values. Start from colorRoles; fix a role only when it is clearly wrong (a near-white "primary", a link blue that the site never uses on buttons). primary is the colour of the main buttons/links; accent a second brand colour; muted for secondary text; surface for cards. primaryForeground must read on primary.
- fonts: heading and body family names. Use the candidates; if a family is proprietary or unknown to Google Fonts, name the closest Google Fonts family and set source "google". A monospace family is for labels, never body.
- radius, density (how much whitespace the site uses), buttonStyle, uppercaseLabels: from the candidates unless the markup contradicts them.
- wordmark: the brand name as written in the header.
- imagery: style ("warm natural light, products in use, lived-in rooms") and treatment ("full-bleed, no borders, slight warm grade") as the site actually does it. When imageCornerPx was measured, the treatment's corners must match it (0 is square, 20 and up is clearly rounded).
- voice: summary (3 lines max: register, sentence length, words they use), do (4 to 6 concrete habits), avoid (3 to 5 things the brand would never say).
brief:
- name: the brand name. summary: one paragraph, what they are and sell. categories: product or service categories. positioning: "premium" | "mid" | "accessible" plus one clause of reasoning. audience: who the site appears to sell to. proof: press, numbers, guarantees exactly as written. ctas: button labels used on the site. locations: cities and addresses mentioned.
- items: up to 24 things a landing page could feature (products, rooms, experiences, plans, services, offers). JSON-LD products first, then items named in the page text. Each with kind, a one-sentence description in the brand's words, price as written when present, an image URL from the lists above when one clearly matches (else omit), the item's URL when known, and 2 to 6 tags that describe taste (materials, flavours, moods, use: "light roast", "sea view", "walnut", "minimal").
- relatedBrands: brand names mentioned that are not the brand itself (partners, suppliers, stockists, "as seen in"), up to 10.
- comparableBrands: 5 to 8 well-known brands (national or global names a shopper would recognise) whose customers overlap with this business: same category, similar positioning and price level. Not suppliers, not local one-offs. These anchor the cultural read when the brand itself is too small to be known.
Write in sentence case, no em dashes, no exclamation marks. Never invent prices, press or locations that are not in the text."""


def _is_hex(v: Any) -> bool:
    return isinstance(v, str) and bool(re.fullmatch(r"#[0-9a-fA-F]{6}", v.strip()))


def _color(v: Any, fallback: str) -> str:
    if _is_hex(v):
        return v.strip().lower()
    parsed = parse_color(str(v)) if v else None
    return parsed[0] if parsed else fallback


def _font(raw: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    fam = str((raw or {}).get("family") or "").strip() if isinstance(raw, dict) else ""
    if not fam or fam.lower() in ("sans-serif", "serif", "system-ui"):
        fam = fallback.get("family") or "Inter"
    source = (raw or {}).get("source") if isinstance(raw, dict) else None
    if source not in ("google", "system"):
        source = fallback.get("source", "google")
    return {"family": fam, "source": source, "fallback": font_fallback(fam)}


def build_kit(raw: dict[str, Any] | None, cands: Extracted, brand_name: str) -> dict[str, Any]:
    raw = raw or {}
    cc = cands.get("colors") or {}
    rc = raw.get("colors") or {}
    # A value measured on the rendered page beats the model, which only read text.
    measured = cands.get("measured") or {}
    mc = measured.get("colors") or {}
    colors = {
        k: mc[k] if _is_hex(mc.get(k)) else _color(rc.get(k), cc.get(k, "#ffffff" if k in ("background", "primaryForeground") else "#111111"))
        for k in _COLOR_KEYS
    }
    cf = cands.get("fonts") or {}
    rf = raw.get("fonts") or {}
    kit: dict[str, Any] = {
        "colors": colors,
        "fonts": {"heading": _font(rf.get("heading"), cf.get("heading") or {}), "body": _font(rf.get("body"), cf.get("body") or {})},
        "radius": measured.get("radius") or (raw.get("radius") if raw.get("radius") in RADII else cands.get("radius", "md")),
        "density": raw.get("density") if raw.get("density") in DENSITIES else "regular",
        "imagery": {
            "style": str((raw.get("imagery") or {}).get("style") or "natural light, real settings, people using the products"),
            "treatment": str((raw.get("imagery") or {}).get("treatment") or "full-bleed photography, minimal borders"),
        },
        "voice": {
            "summary": str((raw.get("voice") or {}).get("summary") or f"{brand_name} speaks plainly and warmly in short sentences."),
            "do": [str(x) for x in (raw.get("voice") or {}).get("do") or []][:6],
            "avoid": [str(x) for x in (raw.get("voice") or {}).get("avoid") or []][:5],
        },
        "buttonStyle": measured.get("buttonStyle") or (raw.get("buttonStyle") if raw.get("buttonStyle") in BUTTONS else cands.get("buttonStyle", "rounded")),
        "uppercaseLabels": bool(measured["uppercaseLabels"] if "uppercaseLabels" in measured else raw.get("uppercaseLabels", cands.get("uppercaseLabels", False))),
    }
    logo = cands.get("logo")
    org_logo = ((cands.get("jsonld") or {}).get("organization") or {}).get("logo")
    if not logo and org_logo:
        logo = {"src": org_logo, "alt": brand_name}
    if logo and logo.get("src"):
        on_dark = logo["onDark"] if "onDark" in logo else raw.get("logoOnDark", False)
        kit["logo"] = {"src": logo["src"], "alt": logo.get("alt") or brand_name, "onDark": bool(on_dark)}
    # The square app icon / favicon, for small tiles where a wide logo will not fit.
    icon = cands.get("icon") or cands.get("favicon")
    if isinstance(icon, str) and icon.startswith("http"):
        kit["icon"] = icon
    wordmark = str(raw.get("wordmark") or cands.get("wordmark") or brand_name).strip()
    if wordmark:
        kit["wordmark"] = wordmark[:40]
    return kit


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:48] or "item"


def _abs(base: str, value: Any) -> str | None:
    if not value or not isinstance(value, str):
        return None
    v = urljoin(base, value.strip())
    return v if urlparse(v).scheme in ("http", "https") else None


def build_brief(raw: dict[str, Any] | None, cands: Extracted, base_url: str, brand_name: str) -> dict[str, Any]:
    raw = raw or {}
    items_raw = list(raw.get("items") or [])
    if not items_raw:
        items_raw = [
            {"name": p["name"], "kind": "product", "description": p.get("description") or "", "price": p.get("price"), "image": p.get("image"), "url": p.get("url"), "tags": [p["category"]] if p.get("category") else []}
            for p in ((cands.get("jsonld") or {}).get("products") or [])
        ]
    items: list[dict[str, Any]] = []
    ids: set[str] = set()
    for it in items_raw:
        if not isinstance(it, dict) or not str(it.get("name") or "").strip():
            continue
        name = str(it["name"]).strip()[:80]
        iid = _slug(name)
        n = 2
        while iid in ids:
            iid = f"{_slug(name)}-{n}"
            n += 1
        ids.add(iid)
        item: dict[str, Any] = {
            "id": iid,
            "name": name,
            "kind": it.get("kind") if it.get("kind") in ITEM_KINDS else "product",
            "description": str(it.get("description") or "")[:300],
            "tags": [str(t).strip().lower() for t in (it.get("tags") or []) if str(t).strip()][:8],
        }
        if it.get("price"):
            item["price"] = str(it["price"])[:24]
        image = _abs(base_url, it.get("image"))
        if image:
            item["image"] = image
        url = _abs(base_url, it.get("url"))
        if url:
            item["url"] = url
        items.append(item)
        if len(items) >= 24:
            break
    meta = cands.get("meta") or {}
    own = brand_name.lower()
    return {
        "summary": str(raw.get("summary") or meta.get("description") or f"{brand_name} ({urlparse(base_url).netloc}).").strip(),
        "categories": [str(c) for c in raw.get("categories") or []][:12],
        "positioning": str(raw.get("positioning") or "mid"),
        "audience": str(raw.get("audience") or ""),
        "proof": [str(p) for p in raw.get("proof") or []][:10],
        "ctas": [str(c) for c in raw.get("ctas") or []][:10],
        "locations": [str(l) for l in raw.get("locations") or []][:12],
        "items": items,
        "relatedBrands": [str(b) for b in raw.get("relatedBrands") or [] if str(b).strip().lower() != own][:10],
        "comparableBrands": [str(b) for b in raw.get("comparableBrands") or [] if str(b).strip().lower() != own][:8],
    }


async def run_intake(brand_id: str, url: str) -> AsyncIterator[dict[str, Any]]:
    t_start = time.perf_counter()
    spans: list[Span] = start_turn()
    sent = 0

    def drain() -> list[dict[str, Any]]:
        nonlocal sent
        out = [_event("span", span=s) for s in spans[sent:]]
        sent = len(spans)
        return out

    async def step(progress: float, label: str, **fields: Any) -> list[dict[str, Any]]:
        events = drain()
        new_spans = [e["span"] for e in events]
        err = await _patch(brand_id, {"progress": {"value": progress, "label": label}, **({"spans": new_spans} if new_spans else {}), **fields})
        if err:
            events.append(_event("status", text=f"Convex write skipped ({err})", progress=progress, warning=True))
        return events

    if not re.match(r"^https?://", url):
        url = "https://" + url

    # 1. Homepage.
    yield _event("status", text="Reading the homepage", progress=0.05)
    await _patch(brand_id, {"status": "extracting", "progress": {"value": 0.05, "label": "Reading the homepage"}})
    try:
        with timer() as t:
            home = await crawl.fetch_page(url, first=True)
        via = "Firecrawl" if crawl.use_firecrawl(url) and (home.branding is not None or home.screenshot) else "direct fetch"
        record("slice", f"Read {urlparse(home.url).netloc}{urlparse(home.url).path or '/'}", f"{len(home.markdown):,} chars via {via}, {len(home.links)} links", ms=t.ms, started=t.started)
    except Exception as err:
        msg = f"Could not read {url}: {type(err).__name__}: {str(err)[:200]}"
        await _patch(brand_id, {"status": "failed", "error": msg, "spans": spans})
        yield _event("error", message=msg)
        return
    if home.status >= 400 or (not home.markdown and not home.html):
        msg = f"{url} answered {home.status} with no readable content"
        await _patch(brand_id, {"status": "failed", "error": msg, "spans": spans})
        yield _event("error", message=msg)
        return

    # The look of the homepage (screenshot, markup, photos, anatomy) is captured alongside the rest.
    capture_task = asyncio.create_task(capture.capture_site(brand_id, home.url, home=home))
    # So is the measuring pass the kit needs (logo, buttons, corners, colours as rendered).
    probe_task = asyncio.create_task(capture.probe_brand(brand_id, home.url))

    # 2. Linked pages.
    candidates = list(home.links)
    if crawl.use_firecrawl(url):
        with timer() as t:
            mapped = await crawl.firecrawl_map(home.url)
        if mapped:
            record("slice", "Map the site", f"{len(mapped)} URLs", ms=t.ms, started=t.started)
            candidates += mapped
    picked = crawl.pick_links(home.url, candidates, take=MAX_LINKED_PAGES)
    yield _event("status", text=f"Following {len(picked)} links", progress=0.2)
    for ev in await step(0.2, f"Following {len(picked)} links", crawled=[home.url] + picked):
        yield ev
    pages: list[crawl.Page] = [home]
    if picked:
        sem = asyncio.Semaphore(4)

        async def one(u: str) -> crawl.Page | None:
            async with sem:
                try:
                    return await crawl.fetch_page(u)
                except Exception:
                    return None

        with timer() as t:
            results = await asyncio.gather(*(one(u) for u in picked))
        got = [p for p in results if p and p.status < 400 and (p.markdown or p.html)]
        pages += got
        record("slice", f"Read {len(got)} linked pages", ", ".join(urlparse(p.url).path or "/" for p in got) or "none readable", ms=t.ms, started=t.started)

    # 3. Deterministic extraction.
    yield _event("status", text="Reading colours and type", progress=0.45)
    probe: dict[str, Any] | None = None
    try:
        probe = await asyncio.wait_for(probe_task, timeout=60)
    except Exception as err:
        record("slice", "Measure the rendered homepage", f"skipped: {type(err).__name__}: {str(err)[:140]}", ms=0)
    with timer() as t:
        css_urls = crawl.stylesheet_urls(home)
        sheets = [s for s in await asyncio.gather(*(crawl.fetch_text(u) for u in css_urls)) if s]
        cands = apply_probe(apply_branding(extract(pages, sheets), home.branding), probe)
    c = cands["colors"]
    record(
        "slice",
        "Read colours and type from the CSS",
        f"primary {c['primary']}, accent {c['accent']}, background {c['background']}, heading {cands['fonts']['heading']['family']}, body {cands['fonts']['body']['family']}, corners {cands['radius']}, buttons {cands['buttonStyle']}"
        + (", Firecrawl branding applied" if home.branding else "")
        + (", measured on the rendered page" if cands.get("measured") else ""),
        ms=t.ms,
        started=t.started,
        params={"stylesheets": str(len(sheets)), "jsonld products": str(len((cands.get('jsonld') or {}).get('products') or []))},
    )
    meta = cands.get("meta") or {}
    provisional_name = (cands.get("wordmark") or ((cands.get("jsonld") or {}).get("organization") or {}).get("name") or meta.get("siteName") or home.title.split("|")[0].split("-")[0].strip() or urlparse(home.url).netloc)
    provisional_kit = build_kit(None, cands, provisional_name)
    for ev in await step(0.5, "Writing the brand brief", kit=provisional_kit):
        yield ev

    # 4. LLM: kit + brief.
    yield _event("status", text="Writing the brand brief", progress=0.55)
    raw: dict[str, Any] = {}
    try:
        raw = await generate_json(
            _prompt(home.url, pages, cands),
            KIT_BRIEF_SCHEMA,
            name="Write the brand kit and brief",
            temperature=0.3,
            result=lambda r: f"{len((r.get('brief') or {}).get('items') or [])} items, voice: {str((r.get('kit') or {}).get('voice', {}).get('summary', ''))[:80]}",
        )
    except Exception as err:
        yield _event("status", text=f"Brief model call failed, keeping the extracted kit ({type(err).__name__})", progress=0.8, warning=True)
    brand_name = str((raw.get("brief") or {}).get("name") or provisional_name).strip()[:60]
    kit = build_kit(raw.get("kit"), cands, brand_name)
    brief = build_brief(raw.get("brief"), cands, home.url, brand_name)
    crawled = [p.url for p in pages]
    # The name replaces the console's URL guess (Convex ignores it for names a person typed).
    for ev in await step(0.85, "Asking Qloo about the brand", name=brand_name, kit=kit, brief=brief, crawled=crawled, status="review"):
        yield ev

    # The capture usually finished during the brief; wait for it now.
    yield _event("status", text="Capturing how the site looks", progress=0.88)
    site: dict[str, Any] | None = None
    try:
        site = await asyncio.wait_for(capture_task, timeout=120)
    except Exception as err:
        record("slice", "Capture the homepage", f"failed: {type(err).__name__}: {str(err)[:140]}", ms=0)
        if home.screenshot:
            await _patch(brand_id, {"screenshot": home.screenshot})
    for ev in drain():
        yield ev

    # 5. Qloo's view of the brand (Convex action; it writes its own spans).
    yield _event("status", text="Asking Qloo about the brand", progress=0.9)
    qloo_result: dict[str, Any]
    with timer() as t:
        try:
            value = await convex.action("pagesBrands:qlooLookup", {"id": brand_id}, timeout=180.0)
            qloo_result = {"ok": True, "value": value if isinstance(value, (dict, list, str, int, float, bool)) else None}
            record("qloo", "Qloo lookup for the brand", "done" if value is None else json.dumps(value, ensure_ascii=False)[:160], ms=t.ms, started=t.started)
        except Exception as err:
            qloo_result = {"ok": False, "error": f"{type(err).__name__}: {str(err)[:200]}"}
            record("qloo", "Qloo lookup for the brand", f"skipped: {qloo_result['error']}", ms=t.ms, started=t.started)
    for ev in drain():
        yield ev
    await _patch(brand_id, {"progress": {"value": 1.0, "label": "Ready for review"}, "spans": [spans[-1]] if spans else []})
    yield _event(
        "done",
        brandId=brand_id,
        name=brand_name,
        kit=kit,
        brief=brief,
        crawled=crawled,
        screenshot=(site or {}).get("screenshot") or home.screenshot,
        site=site,
        qloo=qloo_result,
        totalMs=int((time.perf_counter() - t_start) * 1000),
    )
