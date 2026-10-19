"""A Media brand from its website: one homepage read into the guidelines the agent designs by.

Reuses the Email setup's reader (slice_mail/setup.py): the page's text, links and
images, a headless browser measuring the rendered colours, fonts, buttons and the
logo, and one Gemini call for the name, what the business does and its voice. Media
adds the brand's photography: a vision pass over a few photos from the page writes
its imagery style and what it never shows, which the brand check (check.py) later
holds every generated picture to. Progress and the result go to /media/brand.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any
from urllib.parse import urlparse

from google.genai import types

from slice_agent.trace import record
from slice_mail import setup as S
from slice_pages import browser, crawl
from slice_pages.extract import apply_branding, apply_probe, extract, pick_icon
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import gen
from . import jobs as J
from . import store

MAX_PHOTOS = 16
_NOT_PHOTO = re.compile(r"logo|icon|favicon|sprite|avatar|badge|payment|flag|\.svg(\?|$)|placeholder|spinner|pixel|tracking", re.I)

IMAGERY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "style": {"type": "string"},
        "treatment": {"type": "string"},
        "avoid": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["style", "treatment", "avoid"],
}


async def _patch(brand_id: str, patch: dict[str, Any]) -> str | None:
    try:
        await store.post("/media/brand", {"brandId": brand_id, "patch": patch})
        return None
    except Exception as err:
        return f"{type(err).__name__}: {str(err)[:200]}"


async def _probe(url: str) -> dict[str, Any]:
    """The rendered homepage: styles, and the logo cut out as a transparent PNG when it is SVG or inline."""
    with timer() as t:
        p = await browser.probe(url)
    s = p.styles
    box = s.get("logo") or {}
    logo = None
    if p.logo_png:
        on_dark = (p.logo_ink or {}).get("lightness", 0) > 0.72
        alt = box.get("alt") or box.get("text") or "Logo"
        src = str(box.get("src") or "")
        if src.startswith("http") and not re.search(r"\.svg(\?|$)", src, re.I):
            logo = {"src": src, "alt": alt, "onDark": on_dark}
        else:
            logo = {"src": await J.storage_url(p.logo_png, "image/png"), "alt": alt, "onDark": on_dark}
    icon = pick_icon(s.get("icons") or [])
    record("slice", "Measure the rendered homepage", f"logo {'captured' if logo else 'not found'}, fonts {', '.join(s.get('fontsLoaded') or []) or 'none loaded'}", ms=t.ms, started=t.started, params={"url": url})
    return {"styles": s, **({"logo": logo} if logo else {}), **({"icon": icon} if icon else {})}


def _photos(home: crawl.Page) -> list[str]:
    out: list[str] = []
    for i in home.images:
        src = str(i.get("src") or "")
        if not src.startswith("http") or _NOT_PHOTO.search(src) or _NOT_PHOTO.search(str(i.get("alt") or "")) or src in out:
            continue
        out.append(src)
    return out[:MAX_PHOTOS]


def media_kit(kit: dict[str, Any], name: str, url: str, imagery: dict[str, Any] | None) -> dict[str, Any]:
    """The Email setup's kit in the MediaKit shape (mediaTypes.ts)."""
    font = lambda f: {"family": f["family"], "source": "google" if f.get("google", True) else "system", "weights": f.get("weights") or [400, 700], "fallback": f.get("fallback") or "system-ui, sans-serif"}  # noqa: E731
    out: dict[str, Any] = {
        "name": name,
        "url": url,
        "colors": kit["colors"],
        "fonts": {"heading": font(kit["fonts"]["heading"]), "body": font(kit["fonts"]["body"])},
        "voice": kit.get("voice"),
        "wordmark": kit.get("wordmark") or name,
        "buttonStyle": kit.get("buttonStyle") or "rounded",
        "uppercaseLabels": bool(kit.get("uppercaseLabels")),
    }
    if kit.get("logo"):
        out["logo"] = {k: v for k, v in kit["logo"].items() if k in ("src", "alt", "onDark")}
    if imagery:
        out["imagery"] = imagery
    return out


async def _imagery(name: str, about: str, photos: list[str]) -> dict[str, Any] | None:
    """How the brand's own photos look, read from a few of them."""
    got = [r for r in await asyncio.gather(*[gen.fetch_image(u) for u in photos[:5]], return_exceptions=True) if isinstance(r, tuple)]
    got = [g for g in got if len(g[0]) > 12_000][:4]
    if not got:
        return None
    prompt = (
        f"These are photos from {name}'s website ({about[:300]}). Write the brand's imagery guidelines for an AI image model:\n"
        "- style: subjects, setting, people, light, lens and composition, in one or two sentences (\"warm window light, people mid-meal, close and candid, shallow depth of field\").\n"
        "- treatment: the colour grade and finish in one sentence (\"muted warm tones, soft contrast, natural grain\").\n"
        "- avoid: 3 to 5 things this brand's pictures never show (\"studio white backgrounds\", \"stock-photo smiles at camera\").\n"
        "Describe what the photos show, not what you imagine. No em dashes."
    )
    parts = [prompt, *[types.Part.from_bytes(data=d, mime_type=m) for d, m in got]]
    # Runs right after two other calls, so a busy model gets one more try.
    for attempt in (1, 2):
        try:
            return await generate_json(parts, IMAGERY_SCHEMA, name="Read the brand's photography", temperature=0.3, result=lambda r: str(r.get("style", ""))[:100])
        except Exception as err:
            record("slice", "Read the brand's photography", f"{'retrying' if attempt == 1 else 'skipped'}: {type(err).__name__}: {str(err)[:120]}", ms=0)
            if attempt == 1:
                await asyncio.sleep(2)
    return None


async def run(brand_id: str, url: str) -> dict[str, Any]:
    if not re.match(r"^https?://", url.strip()):
        url = "https://" + url.strip()
    t0 = time.perf_counter()

    async def progress(value: float, label: str, **patch: Any) -> None:
        await _patch(brand_id, {"progress": {"value": value, "label": label}, **patch})

    async def fail(message: str) -> dict[str, Any]:
        await _patch(brand_id, {"status": "failed", "error": message})
        return {"ok": False, "error": message}

    await progress(0.05, "Reading the homepage")
    probe_task = asyncio.create_task(_probe(url))
    try:
        home = await asyncio.wait_for(crawl.fetch_page(url, first=True), timeout=35)
    except Exception:
        try:
            home = await crawl.fetch_direct(url)
        except Exception as err:
            probe_task.cancel()
            return await fail(f"Could not read {url}: {str(err)[:160] or type(err).__name__}")
    if home.status >= 400 or not (home.markdown or home.html):
        probe_task.cancel()
        return await fail(f"{url} answered {home.status} with nothing to read")

    await progress(0.3, "Measuring colours, fonts and the logo")
    sheets = [s for s in await asyncio.gather(*(crawl.fetch_text(u) for u in crawl.stylesheet_urls(home))) if s]
    probe: dict[str, Any] | None = None
    try:
        probe = await asyncio.wait_for(probe_task, timeout=25)
    except Exception as err:
        record("slice", "Measure the rendered homepage", f"skipped: {type(err).__name__}: {str(err)[:140]}", ms=0)
    cands = apply_probe(apply_branding(extract([home], sheets), home.branding), probe)
    meta = cands.get("meta") or {}
    guess = cands.get("wordmark") or ((cands.get("jsonld") or {}).get("organization") or {}).get("name") or meta.get("siteName") or home.title.split("|")[0].split(" - ")[0].strip() or urlparse(home.url).netloc
    website = crawl.normalize(home.url)
    photos = _photos(home)
    await progress(0.5, "Reading the voice, products and photography", kit=media_kit(S.build_kit(cands, {}, str(guess)), str(guess), website, None), images=photos)

    context = S._context(home, cands)
    brand_read, items_read = await asyncio.gather(
        generate_json(context + S.BRAND_TASK, S.BRAND_SCHEMA, name="Read the brand's voice", temperature=0.3, result=lambda r: f"{r.get('name')}: {str((r.get('voice') or {}).get('summary', ''))[:100]}"),
        generate_json(context + S.ITEMS_TASK, S.ITEMS_SCHEMA, name="Read the products on the homepage", temperature=0.2, result=lambda r: f"{len(r.get('items') or [])} items"),
        return_exceptions=True,
    )
    raw: dict[str, Any] = {}
    for got in (brand_read, items_read):
        if isinstance(got, dict):
            raw.update(got)
    name = " ".join(str(raw.get("name") or guess).split())[:60] or str(guess)
    about_raw = raw.get("about") or {}
    about = {
        "summary": str(about_raw.get("summary") or meta.get("description") or f"{name} ({urlparse(home.url).netloc}).").strip(),
        "audience": str(about_raw.get("audience") or "").strip(),
        "categories": [str(c).strip() for c in about_raw.get("categories") or [] if str(c).strip()][:8],
        **({"location": str(about_raw["location"]).strip()} if str(about_raw.get("location") or "").strip() else {}),
    }
    imagery = await _imagery(name, about["summary"], photos)
    items = S.clean_items(raw.get("items") or [], home, cands)
    products = [{"id": f"p{i + 1}", "name": it["name"], **{k: it[k] for k in ("image", "price", "url", "description") if it.get(k)}} for i, it in enumerate(items)]
    kit = media_kit(S.build_kit(cands, raw, name), name, website, imagery)
    err = await _patch(brand_id, {"name": name, "url": website, "about": about, "kit": kit, "products": products, "images": photos, "status": "ready", "progress": {"value": 1.0, "label": "Done"}})
    total = int((time.perf_counter() - t0) * 1000)
    record("slice", "Set up the brand", f"{name}: {len(products)} products, {len(photos)} photos, logo {'yes' if kit.get('logo') else 'no'}, {total / 1000:.1f}s", ms=0)
    if err:
        return {"ok": False, "error": f"Read the site but could not save it: {err}"}
    return {"ok": True, "name": name, "totalMs": total}
