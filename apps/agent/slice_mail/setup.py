"""Brand setup for the Email service: one homepage read into the brand's email kit.

POST /email/setup reads ONE page, no crawl: `crawl.fetch_page(url, first=True)` for its
text, links, images and Firecrawl branding, while a headless browser measures the
rendered homepage (colours, fonts, buttons, corners, the logo cut-out). The Pages
extractor turns both into kit candidates; one Gemini call writes the name, what the
business does, its voice, the footer address and up to 12 items shown on the page.
Progress goes to `emailBrands.setup` as it happens (/email/brand), items to /email/items.
Anything the model names that the page does not show (an image, a link, a price, an
address) is dropped rather than trusted.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

from slice_agent.trace import record
from slice_pages import browser, crawl, images
from slice_pages.extract import apply_branding, apply_probe, contrast, extract, font_fallback, parse_color, pick_icon
from slice_pages.llm import clip, generate_json
from slice_pages.timing import timer

from . import store

MAX_ITEMS = 12
ITEM_KINDS = ("book", "product", "event", "offer", "service")
COLOR_KEYS = ("background", "foreground", "primary", "primaryForeground", "accent", "muted", "surface")
SOCIAL_HOSTS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "x.com": "x",
    "twitter.com": "x",
    "tiktok.com": "tiktok",
    "youtube.com": "youtube",
    "linkedin.com": "linkedin",
    "pinterest.com": "pinterest",
    "threads.net": "threads",
    "threads.com": "threads",
}
_SHARE = re.compile(r"share|sharer|intent|dialog|/plugins/|/embed", re.I)

_FONT = {"type": "object", "properties": {"family": {"type": "string"}, "google": {"type": "boolean"}}, "required": ["family", "google"]}

BRAND_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "about": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "audience": {"type": "string"},
                "categories": {"type": "array", "items": {"type": "string"}},
                "location": {"type": "string"},
            },
            "required": ["summary", "audience", "categories"],
        },
        "voice": {
            "type": "object",
            "properties": {"summary": {"type": "string"}, "do": {"type": "array", "items": {"type": "string"}}, "avoid": {"type": "array", "items": {"type": "string"}}},
            "required": ["summary", "do", "avoid"],
        },
        "address": {"type": "string"},
        "fonts": {"type": "object", "properties": {"heading": _FONT, "body": _FONT}, "required": ["heading", "body"]},
    },
    "required": ["name", "about", "voice", "fonts"],
}

ITEMS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "subtitle": {"type": "string"},
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
    },
    "required": ["items"],
}


def _now() -> int:
    return int(time.time() * 1000)


async def _brand(brand_id: str, patch: dict[str, Any]) -> str | None:
    """Patch the brand; setup keeps going when Convex is unreachable."""
    try:
        await store.post("/email/brand", {"brandId": brand_id, "patch": patch})
        return None
    except Exception as err:
        return f"{type(err).__name__}: {str(err)[:200]}"


def socials_from(links: list[str]) -> list[dict[str, str]]:
    """Profile links in the page's links, one per network (share buttons are not profiles)."""
    out: dict[str, str] = {}
    for link in links:
        p = urlparse(link)
        host = (p.hostname or "").lower().removeprefix("www.").removeprefix("m.")
        network = SOCIAL_HOSTS.get(host)
        if not network or network in out or not p.path.strip("/") or _SHARE.search(link):
            continue
        out[network] = f"https://{host}{p.path.rstrip('/')}"
    return [{"network": n, "url": u} for n, u in out.items()]


async def _probe(brand_id: str, url: str) -> dict[str, Any]:
    """capture.probe_brand, but the logo must be a bitmap: email clients do not show SVG, so an
    SVG or inline logo is replaced by the transparent PNG cut out of the rendered header."""
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
            up = await images.upload_image(brand_id, p.logo_png, "image/png")
            logo = {"src": up["url"], "alt": alt, "onDark": on_dark}
    icon = pick_icon(s.get("icons") or [])
    record("slice", "Measure the rendered homepage", f"logo {'captured' if logo else 'not found'}, {len(s.get('buttons') or [])} buttons, fonts {', '.join(s.get('fontsLoaded') or []) or 'none loaded'}", ms=t.ms, started=t.started, params={"url": url})
    return {"styles": s, **({"logo": logo} if logo else {}), **({"icon": icon} if icon else {})}


def _hex(v: Any, fallback: str) -> str:
    parsed = parse_color(str(v)) if v else None
    return parsed[0] if parsed else fallback


def _font(family: str, google: bool, weights: list[int]) -> dict[str, Any]:
    return {"family": family, "fallback": font_fallback(family), "google": google, "weights": weights}


def build_kit(cands: dict[str, Any], raw: dict[str, Any], name: str) -> dict[str, Any]:
    cc = cands.get("colors") or {}
    colors = {k: _hex(cc.get(k), "#ffffff" if k in ("background", "surface", "primaryForeground") else "#111111") for k in COLOR_KEYS}
    if min(contrast(colors["primary"], colors["surface"]), contrast(colors["primary"], colors["background"])) < 1.8:
        # Buttons measured on photos (white on a hero image) vanish on an email's light body: use the ink.
        colors["primary"] = colors["foreground"]
        colors["primaryForeground"] = "#ffffff" if contrast(colors["foreground"], "#ffffff") >= 4.5 else "#111111"
    cf = cands.get("fonts") or {}
    rf = raw.get("fonts") or {}

    def pick(role: str) -> tuple[str, bool]:
        # The model maps a proprietary family to the closest Google one (emails can only load those).
        r = rf.get(role) or {}
        if isinstance(r, dict) and str(r.get("family") or "").strip() and str(r["family"]).lower() not in ("serif", "sans-serif", "system-ui"):
            return str(r["family"]).strip(), bool(r.get("google", True))
        c = cf.get(role) or {}
        return str(c.get("family") or "Inter"), c.get("source", "google") == "google"

    hf, hg = pick("heading")
    bf, bg = pick("body")
    radius = cands.get("radius") or "sm"
    voice = raw.get("voice") or {}
    kit: dict[str, Any] = {
        "colors": colors,
        "fonts": {"heading": _font(hf, hg, [400, 600, 700]), "body": _font(bf, bg, [400, 700])},
        "buttonStyle": cands.get("buttonStyle") if cands.get("buttonStyle") in ("pill", "rounded", "square") else "rounded",
        # The kit has no "full" corner for images and cards; the roundest is "lg".
        "radius": "lg" if radius == "full" else radius if radius in ("none", "sm", "md", "lg") else "sm",
        "uppercaseLabels": bool(cands.get("uppercaseLabels")),
        "voice": {
            "summary": str(voice.get("summary") or f"{name} speaks plainly and warmly, in short sentences.").strip(),
            "do": [str(x).strip() for x in voice.get("do") or [] if str(x).strip()][:6],
            "avoid": [str(x).strip() for x in voice.get("avoid") or [] if str(x).strip()][:5],
        },
        # The brand's name: the header link's text is often a menu label, not the wordmark.
        "wordmark": name[:40],
    }
    logo = cands.get("logo") or {}
    src = str(logo.get("src") or "")
    if src.startswith("http") and not re.search(r"\.svg(\?|$)", src, re.I):
        alt = str(logo.get("alt") or "").strip()
        kit["logo"] = {"src": src, "alt": alt if alt and alt.lower() not in ("logo", "home") else name, "onDark": bool(logo.get("onDark"))}
    icon = cands.get("icon") or cands.get("favicon")
    if isinstance(icon, str) and icon.startswith("http"):
        kit["icon"] = icon
    return kit


def _context(home: crawl.Page, cands: dict[str, Any]) -> str:
    jsonld = cands.get("jsonld") or {}
    imgs = [{"src": i["src"], "alt": i.get("alt", "")} for i in home.images if str(i.get("src", "")).startswith("http")][:50]
    fonts = {r: (cands.get("fonts") or {}).get(r) for r in ("heading", "body")}
    return f"""You are setting up a business for email marketing from its homepage.

PAGE: {home.url}
Title: {home.title}
Meta: {cands.get('meta')}
Fonts measured on the page: {fonts}
STRUCTURED DATA (JSON-LD): organization {jsonld.get('organization')}; places {jsonld.get('places')}; products {(jsonld.get('products') or [])[:20]}
IMAGES ON THE PAGE (src, alt): {imgs}
LINKS ON THE PAGE: {home.links[:120]}

PAGE TEXT:
{clip(home.markdown, 14_000)}
"""


BRAND_TASK = """
WRITE who the business is and how it speaks:
- name: the business's name as it writes it.
- about: summary (one paragraph: what it is and what it sells), audience (who it sells to, one sentence), categories (what it sells, 2 to 6), location (city or neighbourhood when it is local, else empty).
- voice: summary (2 or 3 lines: register, sentence length, the words it uses), do (4 to 6 concrete habits from its copy), avoid (3 to 5 things it would never say).
- address: the postal address exactly as the page shows it (usually the footer), or empty when there is none.
- fonts: the heading and body families. Keep the measured ones; when a family is not on Google Fonts, name the closest Google Fonts family and set google true; a system family (Georgia, Arial) has google false.
Sentence case, no em dashes, no exclamation marks. Never invent an address."""

ITEMS_TASK = f"""
WRITE the items: up to {MAX_ITEMS} things the page itself shows that an email could feature (books, products, events, offers, services), in page order, JSON-LD products first. For each: name; subtitle (author, maker, colour or date line, when shown); kind; description (one short sentence in the brand's words, never invented facts); price exactly as written (empty when not shown); image (a src from IMAGES that clearly shows this item, else empty); url (the item's link from LINKS, else empty); tags (2 to 6 lowercase taste words: genre, mood, material, use).
No em dashes. Never invent items, prices or links."""


def _same_site(u: str, home: str) -> bool:
    return (urlparse(u).hostname or "").removeprefix("www.") == (urlparse(home).hostname or "").removeprefix("www.")


def clean_items(raw_items: list[Any], home: crawl.Page, cands: dict[str, Any]) -> list[dict[str, Any]]:
    """The model's items, keeping only what the page shows: its images, its links, its prices."""
    page_images = {i["src"] for i in home.images if i.get("src")} | {p["image"] for p in (cands.get("jsonld") or {}).get("products") or [] if p.get("image")}
    page_links = {crawl.normalize(u) for u in home.links}
    text = (home.markdown or "") + " " + re.sub(r"<[^>]+>", " ", home.html or "")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for it in raw_items or []:
        if not isinstance(it, dict):
            continue
        name = " ".join(str(it.get("name") or "").split())[:80]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        item: dict[str, Any] = {
            "name": name,
            "kind": it.get("kind") if it.get("kind") in ITEM_KINDS else "product",
            "description": str(it.get("description") or "").strip()[:240],
            "tags": [str(t).strip().lower() for t in it.get("tags") or [] if str(t).strip()][:6],
        }
        if str(it.get("subtitle") or "").strip():
            item["subtitle"] = str(it["subtitle"]).strip()[:80]
        price = str(it.get("price") or "").strip()
        digits = re.sub(r"[^\d.,]", "", price).strip(".,")
        if price and digits and digits in text:
            item["price"] = price[:24]
        image = urljoin(home.url, str(it.get("image") or "").strip()) if it.get("image") else ""
        if image in page_images:
            item["image"] = image
        url = urljoin(home.url, str(it.get("url") or "").strip()) if it.get("url") else ""
        if url.startswith("http") and (crawl.normalize(url) in page_links or _same_site(url, home.url)):
            item["url"] = url
        out.append(item)
        if len(out) >= MAX_ITEMS:
            break
    return out


def _address(raw: str, home: crawl.Page, cands: dict[str, Any]) -> str:
    text = (home.markdown or "") + " " + re.sub(r"<[^>]+>", " ", home.html or "")
    words = [w for w in re.findall(r"[A-Za-z0-9]+", raw or "")[:4]]
    if raw and words and all(w in text for w in words):
        return raw.strip()[:200]
    jsonld = cands.get("jsonld") or {}
    for found in [(jsonld.get("organization") or {}).get("address")] + [p.get("address") for p in jsonld.get("places") or []]:
        if found:
            return str(found)[:200]
    return ""


async def run_setup(brand_id: str, url: str) -> dict[str, Any]:
    if not re.match(r"^https?://", url.strip()):
        url = "https://" + url.strip()
    t0 = time.perf_counter()

    async def progress(value: float, label: str, **patch: Any) -> None:
        await _brand(brand_id, {"setup": {"status": "reading", "progress": {"value": value, "label": label}, "at": _now()}, **patch})

    async def fail(message: str) -> dict[str, Any]:
        await _brand(brand_id, {"setup": {"status": "failed", "error": message, "at": _now()}})
        return {"ok": False, "error": message}

    await progress(0.05, "Reading the homepage", url=url)
    probe_task = asyncio.create_task(_probe(brand_id, url))
    with timer() as t:
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
    via = "Firecrawl" if home.branding is not None or home.screenshot else "a direct fetch"
    record("slice", f"Read {urlparse(home.url).netloc}{urlparse(home.url).path or '/'}", f"{len(home.markdown):,} chars via {via}, {len(home.links)} links, {len(home.images)} images", ms=t.ms, started=t.started)

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
    kit = build_kit(cands, {}, str(guess))
    await progress(0.5, "Reading how the brand writes", kit=kit)

    # Two calls side by side: who the brand is, and what the page sells (the long one).
    context = _context(home, cands)
    brand_read, items_read = await asyncio.gather(
        generate_json(context + BRAND_TASK, BRAND_SCHEMA, name="Read the brand's voice and footer", temperature=0.3, result=lambda r: f"{r.get('name')}: {str((r.get('voice') or {}).get('summary', ''))[:100]}"),
        generate_json(context + ITEMS_TASK, ITEMS_SCHEMA, name="Read the items on the homepage", temperature=0.2, result=lambda r: f"{len(r.get('items') or [])} items: " + ", ".join(str(i.get("name")) for i in (r.get("items") or [])[:4])),
        return_exceptions=True,
    )
    raw: dict[str, Any] = {}
    for got in (brand_read, items_read):
        if isinstance(got, dict):
            raw.update(got)
        else:
            record("slice", "Brand read incomplete, keeping what was measured", f"{type(got).__name__}: {str(got)[:140]}", ms=0)
    name = " ".join(str(raw.get("name") or guess).split())[:60] or str(guess)
    kit = build_kit(cands, raw, name)
    about_raw = raw.get("about") or {}
    about = {
        "summary": str(about_raw.get("summary") or meta.get("description") or f"{name} ({urlparse(home.url).netloc}).").strip(),
        "audience": str(about_raw.get("audience") or "").strip(),
        "categories": [str(c).strip() for c in about_raw.get("categories") or [] if str(c).strip()][:8],
        **({"location": str(about_raw["location"]).strip()} if str(about_raw.get("location") or "").strip() else {}),
    }
    website = crawl.normalize(home.url)
    footer = {"address": _address(str(raw.get("address") or ""), home, cands), "website": website, "socials": socials_from(home.links)}
    items = clean_items(raw.get("items") or [], home, cands)

    if items:
        await progress(0.85, f"Saving {len(items)} item{'s' if len(items) != 1 else ''}")
        try:
            await store.post("/email/items", {"brandId": brand_id, "items": items})
        except Exception as err:
            record("slice", "Save the items", f"failed: {str(err)[:140]}", ms=0)
    patch = {
        "name": name,
        "url": website,
        "kit": kit,
        "about": about,
        "footer": footer,
        "sender": {"fromName": name, "fromLocal": "hello"},
        "setup": {"status": "done", "progress": {"value": 1.0, "label": "Done"}, "at": _now()},
    }
    err = await _brand(brand_id, patch)
    total = int((time.perf_counter() - t0) * 1000)
    record("slice", "Set up the brand", f"{name}: {len(items)} items, logo {'yes' if kit.get('logo') else 'no'}, {total / 1000:.1f}s", ms=0)
    if err:
        return {"ok": False, "error": f"Read the site but could not save it: {err}"}
    return {"ok": True, "name": name, "items": len(items), "totalMs": total}
