"""Capturing how a brand's site looks, for the builder.

The kit holds colours and fonts; this holds the rest of the identity: a
permanent screenshot of the homepage (fold and full page), the cleaned
markup, the photographs on it, and an "anatomy" written by a vision pass
describing how the site is laid out and styled. Stored as `pagesBrands.site`.
"""

from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import urljoin

from google.genai import types

from slice_agent import convex_client as convex
from slice_agent.trace import record

from . import browser, crawl, images
from .extract import pick_icon
from .llm import clip, generate_text
from .timing import timer

MAX_HTML = 120_000
MAX_IMAGES = 30

_html_cache: dict[str, str] = {}
_bytes_cache: dict[str, bytes] = {}


def clean_html(html: str, base_url: str) -> str:
    """The homepage markup a model can read: no scripts, styles, svg bodies, comments or data URIs."""
    out = re.sub(r"<!--[\s\S]*?-->", "", html)
    for tag in ("script", "style", "noscript", "template", "iframe"):
        out = re.sub(rf"<{tag}\b[^>]*>[\s\S]*?</{tag}\s*>", "", out, flags=re.I)
    out = re.sub(r"<svg\b[^>]*>[\s\S]*?</svg\s*>", "<svg></svg>", out, flags=re.I)
    out = re.sub(r"<head\b[^>]*>[\s\S]*?</head\s*>", "", out, flags=re.I)
    out = re.sub(r"\s(srcset|sizes|data-srcset)\s*=\s*(\"[^\"]*\"|'[^']*')", "", out, flags=re.I)
    out = re.sub(r"(src|href)\s*=\s*\"data:[^\"]{0,100000}\"", r'\1=""', out, flags=re.I)
    out = re.sub(r"\s(src|href)\s*=\s*\"(?!https?:|#|mailto:|tel:)([^\"]+)\"", lambda m: f' {m.group(1)}="{urljoin(base_url, m.group(2))}"', out, flags=re.I)
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n\s*\n+", "\n", out)
    return out.strip()[:MAX_HTML]


def pick_images(page: crawl.Page) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for img in page.images:
        src = (img.get("src") or "").strip()
        if not src.startswith(("http://", "https://")) or src in seen:
            continue
        if re.search(r"\.(svg|gif|ico)(\?|$)", src, re.I) or re.search(r"logo|icon|sprite|pixel|tracking|badge|flag|avatar", src, re.I):
            continue
        seen.add(src)
        out.append({"src": src, "alt": (img.get("alt") or "")[:120]})
        if len(out) >= MAX_IMAGES:
            break
    return out


ANATOMY_PROMPT = """You are a design director documenting a brand's website so another designer can build new pages that look like an extension of it. Look at the screenshots (first the top of the page, then the whole page) and the markup excerpt, and write a plain-text read in about 300 words, under these headings exactly: Header; Hero; Section rhythm; Typography; Colour; Imagery; Buttons and links; Cards, borders, shadows; Spacing; Motion; Character; Rules.

Be concrete and measurable where you can: heading sizes relative to body, weights, casing, letter-spacing; which colours go where (backgrounds, text, accents, dark bands); whether images are full-bleed or framed, their corner radius and aspect ratios, overlays and captions; button shape, size and casing; borders and shadows; how much air between sections. Under Rules, give the 6 most important things a new page must do to pass as this brand's own work, as imperatives. No markdown, no bullets, no em dashes. Write the heading, a colon, then the text."""


async def write_anatomy(fold: bytes, full: bytes, html: str) -> str:
    text = await generate_text(
        [
            ANATOMY_PROMPT,
            types.Part.from_bytes(data=fold, mime_type="image/png"),
            types.Part.from_bytes(data=full, mime_type="image/png"),
            "Markup excerpt:\n" + clip(html, 18_000),
        ],
        name="Read the site's visual system",
        temperature=0.2,
        max_tokens=1200,
    )
    return text.strip()


async def capture_site(brand_id: str, url: str, *, home: crawl.Page | None = None) -> dict[str, Any]:
    """Screenshot, markup, images and anatomy for the brand's homepage; patches `pagesBrands.site`."""
    if not re.match(r"^https?://", url):
        url = "https://" + url
    with timer() as t:
        shot = await browser.capture(url, with_html=home is None)
    record("slice", "Capture the homepage", f"{shot.audit.get('height')}px tall, {shot.audit.get('imagesTotal')} images, {len(shot.audit.get('fontsLoaded') or [])} fonts", ms=t.ms, started=t.started, params={"url": url})

    page = home or crawl.html_to_page(shot.url, shot.html)
    html = clean_html(page.html or shot.html, page.url)
    imgs = pick_images(page)

    with timer() as t:
        fold_up = await images.upload_image(brand_id, shot.fold, "image/png")
        full_up = await images.upload_image(brand_id, shot.full, "image/png")
        html_up = await images.upload_image(brand_id, html.encode("utf-8"), "text/html")
    record("slice", "Store the capture", f"{len(shot.full) // 1024} KB screenshot, {len(html) // 1024} KB markup", ms=t.ms, started=t.started)

    anatomy = ""
    error = None
    try:
        anatomy = await write_anatomy(shot.fold, shot.full, html)
    except Exception as err:
        error = f"anatomy: {type(err).__name__}: {str(err)[:160]}"

    site = {
        "screenshot": full_up["url"],
        "fold": fold_up["url"],
        "htmlUrl": html_up["url"],
        "images": imgs,
        "anatomy": anatomy or None,
        "capturedAt": int(time.time() * 1000),
        **({"error": error} if error else {}),
    }
    site = {k: v for k, v in site.items() if v is not None}
    await convex.site("/pages/brand", {"brandId": brand_id, "patch": {"site": site, "screenshot": full_up["url"]}})
    _html_cache[html_up["url"]] = html
    _bytes_cache[fold_up["url"]] = shot.fold
    _bytes_cache[full_up["url"]] = shot.full
    return site


async def probe_brand(brand_id: str, url: str) -> dict[str, Any]:
    """The rendered homepage's styles, its logo stored as a transparent PNG (or the
    logo image's own URL when the header link is one plain <img>), and its icon.
    Shape: {styles, logo?: {src, alt, onDark}, icon?}, for extract.apply_probe."""
    with timer() as t:
        p = await browser.probe(url)
    s = p.styles
    box = s.get("logo") or {}
    alt = box.get("alt") or box.get("text") or ""
    logo = None
    if p.logo_png:
        on_dark = (p.logo_ink or {}).get("lightness", 0) > 0.72
        if box.get("src") and not box["src"].startswith("data:"):
            logo = {"src": box["src"], "alt": alt or "Logo", "onDark": on_dark}
        else:
            up = await images.upload_image(brand_id, p.logo_png, "image/png")
            logo = {"src": up["url"], "alt": alt or "Logo", "onDark": on_dark}
    icon = pick_icon(s.get("icons") or [])
    shapes = sorted({b["radius"] for b in s.get("buttons") or []})[:4]
    record(
        "slice",
        "Measure the rendered homepage",
        f"logo {'captured' if logo else 'not found'}{' (light)' if logo and logo['onDark'] else ''}, "
        f"{len(s.get('buttons') or [])} buttons (radius {', '.join(str(r) for r in shapes) or 'none'}px), "
        f"{len(s.get('cards') or [])} cards, fonts {', '.join(s.get('fontsLoaded') or []) or 'none loaded'}",
        ms=t.ms,
        started=t.started,
        params={"url": url},
    )
    return {"styles": s, **({"logo": logo} if logo else {}), **({"icon": icon} if icon else {})}


async def site_html(url: str) -> str:
    if url in _html_cache:
        return _html_cache[url]
    text = await crawl.fetch_text(url, limit=MAX_HTML + 10)
    _html_cache[url] = text
    return text


async def site_bytes(url: str) -> bytes:
    if url in _bytes_cache:
        return _bytes_cache[url]
    data, _ = await crawl.fetch_bytes(url, limit=12_000_000)
    _bytes_cache[url] = data
    return data
