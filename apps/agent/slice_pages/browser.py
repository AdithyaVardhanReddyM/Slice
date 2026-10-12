"""Headless Chromium for the Pages service: screenshots and a DOM audit.

One browser per process, a fresh context per capture. Used to capture a
brand's homepage at intake (so the builder can see the site) and to review
the builder's own output (the preview route of apps/web).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import Browser, Playwright, async_playwright

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 SliceReview/1.0"
MAX_FULL_HEIGHT = 6000

_pw: Playwright | None = None
_browser: Browser | None = None
_lock = asyncio.Lock()


async def browser() -> Browser:
    global _pw, _browser
    async with _lock:
        if _browser is None or not _browser.is_connected():
            _pw = _pw or await async_playwright().start()
            _browser = await _pw.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
    return _browser


@dataclass
class Capture:
    url: str
    fold: bytes
    full: bytes
    audit: dict[str, Any]
    html: str = ""
    console_errors: list[str] = field(default_factory=list)


# What the review tool needs to know about the rendered page, from inside it.
AUDIT_JS = """
async () => {
  const doc = document.documentElement;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const rgb = (s) => { const m = s && s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return p.length >= 4 && p[3] === 0 ? null : p.slice(0, 3); };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgOf = (el) => { let e = el; while (e && e !== document.body) { const s = getComputedStyle(e); const c = rgb(s.backgroundColor); if (c) return c; if (s.backgroundImage && s.backgroundImage !== 'none') return 'image'; e = e.parentElement; } return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255]; };
  // Text that cannot be read: same colour as what it sits on (black button with black label, white on white).
  const invisible = [];
  for (const el of document.querySelectorAll('a, button, h1, h2, h3, p, li, span, label, summary')) {
    if (invisible.length >= 8 || !visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const fg = rgb(getComputedStyle(el).color); const bg = bgOf(el);
    if (!fg || bg === 'image') continue;
    if (contrast(fg, bg) < 1.6) invisible.push({ section: (el.closest('[data-section]') || {}).dataset?.section || 'page', text: el.textContent.trim().slice(0, 50), tag: el.tagName.toLowerCase() });
  }
  // Background images that did not load.
  const bgUrls = new Map();
  for (const el of document.querySelectorAll('*')) { const m = getComputedStyle(el).backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/); if (m && /^https?:/.test(m[1]) && !bgUrls.has(m[1])) bgUrls.set(m[1], (el.closest('[data-section]') || {}).dataset?.section || 'page'); }
  const brokenBg = [];
  await Promise.all([...bgUrls].slice(0, 20).map(([u, sec]) => new Promise((res) => { const im = new Image(); im.onload = res; im.onerror = () => { brokenBg.push({ src: u.slice(0, 160), section: sec }); res(); }; im.src = u; })));
  // Coloured boxes with nothing in them (a thumbnail that never got its image, an empty card).
  const emptyBoxes = [];
  for (const el of document.querySelectorAll('div, figure, li, a, article')) {
    if (emptyBoxes.length >= 6 || !visible(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 60 || r.width * r.height > 500000) continue;
    const s = getComputedStyle(el); if (!rgb(s.backgroundColor) || (s.backgroundImage && s.backgroundImage !== 'none')) continue;
    if (el.textContent.trim() || el.querySelector('img, svg, video, input, button, iframe')) continue;
    if (el.children.length > 0 && [...el.children].some((c) => visible(c) && c.getBoundingClientRect().height > 20 && (c.textContent.trim() || c.querySelector('img, svg')))) continue;
    emptyBoxes.push({ section: (el.closest('[data-section]') || {}).dataset?.section || 'page', tag: el.tagName.toLowerCase(), className: (el.className || '').toString().slice(0, 60), size: Math.round(r.width) + 'x' + Math.round(r.height) });
  }
  // Buttons and links with nothing in them.
  const emptyControls = [...document.querySelectorAll('a, button')].filter((el) => visible(el) && !el.textContent.trim() && !el.querySelector('img, svg') && !el.getAttribute('aria-label')).length;
  const sections = [...document.querySelectorAll('[data-section]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.section, top: Math.round(r.top + window.scrollY), height: Math.round(r.height), empty: el.textContent.trim().length === 0 && !el.querySelector('img') };
  });
  const imgs = [...document.images];
  await Promise.all(imgs.filter((i) => !i.complete).map((i) => new Promise((res) => { i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); setTimeout(res, 4000); })));
  const broken = imgs.filter((i) => i.naturalWidth === 0 && i.getAttribute('src')).map((i) => ({ src: i.getAttribute('src').slice(0, 160), section: (i.closest('[data-section]') || {}).dataset?.section || 'page' }));
  const noAlt = imgs.filter((i) => !i.hasAttribute('alt')).length;
  const tiny = [...document.querySelectorAll('p, a, li, span, button, label')].filter((el) => {
    const s = getComputedStyle(el);
    return el.textContent.trim() && parseFloat(s.fontSize) < 12 && s.display !== 'none';
  }).length;
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))];
  const h1s = document.querySelectorAll('h1').length;
  const ctas = [...document.querySelectorAll('[data-cta]')].map((el) => (el.dataset.cta || el.textContent).trim().slice(0, 60));
  const forms = [...document.querySelectorAll('form[data-pg-form]')].map((f) => f.dataset.pgForm);
  return {
    width: window.innerWidth,
    height: doc.scrollHeight,
    overflowX: doc.scrollWidth > window.innerWidth + 2,
    sections,
    brokenImages: broken,
    brokenBackgrounds: brokenBg,
    invisibleText: invisible,
    emptyBoxes,
    emptyControls,
    imagesTotal: imgs.length,
    imagesWithoutAlt: noAlt,
    tinyTextElements: tiny,
    fontsLoaded: fonts,
    h1Count: h1s,
    ctas,
    forms,
    title: document.title,
  };
}
"""

SCROLL_JS = """
async () => {
  const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
  const total = document.documentElement.scrollHeight;
  for (let y = 0; y < total; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 250));
}
"""


async def capture(url: str, *, width: int = 1440, height: int = 900, settle_ms: int = 700, with_html: bool = False, timeout_ms: int = 45_000) -> Capture:
    """Load `url`, scroll it once (lazy images), then take the fold and the full page."""
    b = await browser()
    context = await b.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, user_agent=UA, ignore_https_errors=True)
    errors: list[str] = []
    try:
        page = await context.new_page()
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        try:
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        except Exception:
            await page.goto(url, wait_until="load", timeout=timeout_ms)
        try:
            await page.evaluate("document.fonts && document.fonts.ready")
        except Exception:
            pass
        await page.evaluate(SCROLL_JS)
        await page.wait_for_timeout(settle_ms)
        fold = await page.screenshot(type="png", clip={"x": 0, "y": 0, "width": width, "height": height})
        total = int(await page.evaluate("document.documentElement.scrollHeight") or height)
        full = await page.screenshot(type="png", clip={"x": 0, "y": 0, "width": width, "height": min(total, MAX_FULL_HEIGHT)}, full_page=True)
        audit = await page.evaluate(AUDIT_JS)
        html = await page.content() if with_html else ""
        return Capture(url=page.url, fold=fold, full=full, audit=audit, html=html, console_errors=errors[:12])
    finally:
        await context.close()


async def close() -> None:
    global _pw, _browser
    if _browser is not None:
        await _browser.close()
        _browser = None
    if _pw is not None:
        await _pw.stop()
        _pw = None
