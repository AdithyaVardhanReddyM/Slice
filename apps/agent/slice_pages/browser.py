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


# The brand's look as the browser renders it: the header logo, what the buttons,
# cards and text actually are. Regexes over CSS guess these; computed styles know.
# Colours go through a 1px canvas so oklch(), color() and named colours all come
# back as sRGB.
PROBE_JS = """
() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const memo = new Map();
  const rgba = (css) => {
    if (!css || css === 'transparent' || css === 'none' || css.startsWith('url(')) return null;
    if (memo.has(css)) return memo.get(css);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const out = d[3] === 0 ? null : [d[0], d[1], d[2], d[3] / 255];
    memo.set(css, out); return out;
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const W = window.innerWidth, H = window.innerHeight;
  const shown = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.right > 0 && r.left < W; };
  const seen = (el) => shown(el) && (!el.checkVisibility || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  const declaredBg = rgba(getComputedStyle(document.body).backgroundColor) || rgba(getComputedStyle(document.documentElement).backgroundColor);
  let pageBg = declaredBg || [255, 255, 255, 1];
  // What an element sits on: translucent layers composited up to the first opaque one.
  const bgBehind = (el) => {
    const layers = []; let e = el, image = false;
    while (e && e.nodeType === 1) {
      const s = getComputedStyle(e); const c = rgba(s.backgroundColor);
      if (c) { layers.push(c); if (c[3] >= 0.99) break; }
      if (s.backgroundImage && s.backgroundImage !== 'none' && !c) image = true;
      e = e.parentElement;
    }
    let out = layers.length && layers[layers.length - 1][3] >= 0.99 ? layers.pop() : pageBg.slice();
    while (layers.length) out = over(layers.pop(), out);
    return { color: out, image };
  };
  // A corner never rounds past half the short side (rounded-full is calc(infinity * 1px)).
  const radiusPx = (v, w, h) => { if (!v) return 0; const t = v.split(' ')[0]; const px = t.endsWith('%') ? (parseFloat(t) / 100) * Math.min(w, h) : parseFloat(t) || 0; return Math.min(px, Math.min(w, h) / 2); };
  const family = (ff) => (ff || '').split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).find((f) => f && !/^(-apple-system|system-ui|sans-serif|serif|monospace|ui-[a-z-]+|BlinkMacSystemFont)$/i.test(f)) || null;
  // An SVG paint server (url(#gold)) reads as the average of its stops.
  const paint = (v) => {
    const ref = v && v.match(/url\\(["']?#([^"')]+)/);
    if (!ref) return rgba(v);
    const stops = [...(document.getElementById(ref[1])?.querySelectorAll('stop') || [])].map((s) => rgba(getComputedStyle(s).stopColor)).filter(Boolean);
    return stops.length ? [0, 1, 2].map((i) => stops.reduce((t, c) => t + c[i], 0) / stops.length).concat(1) : null;
  };

  // Cookie banners, region pickers and other overlays are not the brand.
  // (A fixed wrapper holding most of the page is the page, not an overlay.)
  const total = document.body.getElementsByTagName('*').length;
  const overlays = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.getElementsByTagName('*').length > total * 0.5) return false;
    if (el.matches('[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]')) return true;
    const s = getComputedStyle(el); if (s.position !== 'fixed') return false;
    const r = el.getBoundingClientRect(); return r.width * r.height > W * H * 0.4;
  });
  const inOverlay = (el) => overlays.some((o) => o.contains(el));
  const els = [...document.body.querySelectorAll('*')].slice(0, 8000).filter((el) => !inOverlay(el));
  const btnSel = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
  const tally = (m, k, w) => m.set(k, (m.get(k) || 0) + w);

  // Painted area per background colour. A body with no colour of its own takes the biggest one.
  const area = new Map();
  for (const el of els) {
    const s = getComputedStyle(el); const own = rgba(s.backgroundColor);
    if (!own || own[3] < 0.5 || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    tally(area, hex(over(own, bgBehind(el.parentElement || document.body).color)), Math.min(r.width, W) * Math.min(r.height, 4000));
  }
  if (!declaredBg && area.size) { const [top] = [...area].sort((x, y) => y[1] - x[1])[0]; pageBg = rgba(top); }

  // Text: colour as seen (alpha blended over what it sits on), weighted by characters x size.
  const text = new Map(); const heads = new Map(); const headFam = new Map(); const bodyFam = new Map();
  let eyebrows = 0;
  for (const el of els) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'SVG'].includes(el.tagName)) continue;
    let chars = 0; for (const n of el.childNodes) if (n.nodeType === 3) chars += n.textContent.trim().length;
    if (!chars || !shown(el)) continue;
    const s = getComputedStyle(el); const c = rgba(s.color); if (!c) continue;
    const behind = bgBehind(el); if (behind.image) continue;
    const seenCol = hex(over(c, behind.color)); const size = parseFloat(s.fontSize) || 16;
    const onPage = Math.hypot(...[0, 1, 2].map((i) => behind.color[i] - pageBg[i])) < 24;
    const w = Math.min(chars, 400) * size / 16;
    const heading = /^H[1-3]$/.test(el.tagName) || (size >= 30 && chars < 120);
    if (onPage) { text.set(seenCol, (text.get(seenCol) || 0) + w); if (heading) heads.set(seenCol, (heads.get(seenCol) || 0) + w); }
    const fam = family(s.fontFamily);
    if (fam) { if (heading) headFam.set(fam, (headFam.get(fam) || 0) + w); else if (el.tagName === 'P' || el.tagName === 'LI' || size <= 19) bodyFam.set(fam, (bodyFam.get(fam) || 0) + w); }
    if (size <= 14 && s.textTransform === 'uppercase' && parseFloat(s.letterSpacing) > 0) eyebrows++;
  }

  // Buttons: controls with a fill or a border, button-sized, with a short label.
  const buttons = [];
  for (const el of document.querySelectorAll(btnSel)) {
    if (buttons.length >= 60 || !shown(el) || inOverlay(el)) continue;
    const r = el.getBoundingClientRect(); if (r.height < 26 || r.height > 96 || r.width < 56 || r.width > 560) continue;
    const label = (el.innerText || el.value || '').trim(); if (!label || label.length > 42) continue;
    const s = getComputedStyle(el); const own = rgba(s.backgroundColor);
    const parent = bgBehind(el.parentElement || document.body);
    const fill = own && own[3] >= 0.5 ? over(own, parent.color) : null;
    const filled = !!fill && Math.hypot(...[0, 1, 2].map((i) => fill[i] - parent.color[i])) > 18;
    const bc = rgba(s.borderTopColor); const bordered = parseFloat(s.borderTopWidth) >= 1 && bc && bc[3] > 0.3;
    if (!filled && !bordered) continue;
    const fg = rgba(s.color);
    buttons.push({
      label: label.slice(0, 40), filled, bordered: !!bordered,
      bg: filled ? hex(fill) : null, fg: fg ? hex(over(fg, fill || parent.color)) : null,
      radius: Math.round(radiusPx(s.borderTopLeftRadius, r.width, r.height)), height: Math.round(r.height), width: Math.round(r.width),
      top: Math.round(r.top + window.scrollY), upper: s.textTransform === 'uppercase', weight: s.fontWeight, family: family(s.fontFamily),
    });
  }

  // Surfaces: cards, panels and framed images; full-bleed bands are layout, not cards.
  const isBtn = (el) => el.matches(btnSel);
  // Every colour in use (text, fills, borders, SVG paint, gradient stops), for the accent.
  const cards = []; const imgRadii = []; const sat = new Map();
  for (const el of els) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    const own = rgba(s.backgroundColor);
    const a = Math.min(r.width, W) * Math.min(r.height, 4000);
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) {
      const v = s[prop]; let c = null;
      if (prop === 'fill' || prop === 'stroke') {
        if (!(el instanceof SVGElement)) continue;
        c = paint(v);
      } else if (prop === 'borderTopColor') { if (parseFloat(s.borderTopWidth) >= 1) c = rgba(v); } else c = rgba(v);
      if (!c || c[3] < 0.5) continue;
      const w = prop === 'backgroundColor' ? Math.sqrt(a) : prop === 'color' ? 6 : 10;
      tally(sat, hex(c), w);
    }
    const bgImg = s.backgroundImage;
    if (bgImg && bgImg.includes('gradient')) for (const m of bgImg.matchAll(/(rgba?\\([^)]*\\)|oklch\\([^)]*\\)|#[0-9a-f]{3,8})/gi)) { const c = rgba(m[1]); if (c && c[3] >= 0.5) tally(sat, hex(c), 4); }
    if (r.width < 110 || r.height < 70 || r.width > W * 0.94 || isBtn(el)) continue;
    const rad = radiusPx(s.borderTopLeftRadius, r.width, r.height);
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'PICTURE') {
      // A rounded image is usually a rounded wrapper with overflow hidden.
      let best = rad, e = el.parentElement;
      for (let i = 0; i < 3 && e && !best; i++, e = e.parentElement) { const ps = getComputedStyle(e); const pr = e.getBoundingClientRect(); if (ps.overflow !== 'visible' && Math.abs(pr.width - r.width) < 40) best = radiusPx(ps.borderTopLeftRadius, pr.width, pr.height); }
      imgRadii.push(Math.round(best)); continue;
    }
    const parentBg = bgBehind(el.parentElement || document.body).color;
    const fill = own && own[3] >= 0.3 ? over(own, parentBg) : null;
    const distinct = fill && Math.hypot(...[0, 1, 2].map((i) => fill[i] - parentBg[i])) > 4;
    const framed = (parseFloat(s.borderTopWidth) >= 1 && rgba(s.borderTopColor)) || (s.boxShadow && s.boxShadow !== 'none');
    if (!distinct && !framed) continue;
    cards.push({ radius: Math.round(rad), bg: fill ? hex(fill) : null, w: Math.round(r.width), h: Math.round(r.height) });
    if (cards.length >= 120) break;
  }

  // Logo: the header link home (or the most logo-like thing at the top), measured tight.
  const site = ((document.querySelector('meta[property="og:site_name"]') || {}).content || document.title.split(/[|\\-–—·:]/)[0] || '').trim().toLowerCase();
  const startPath = location.pathname.replace(/\\/$/, '') || '/';
  const firstSeg = '/' + (startPath.split('/')[1] || '');
  const header = [...document.querySelectorAll('header, [role="banner"]')].find((h) => shown(h) && h.getBoundingClientRect().top < 160);
  const pool = [...(header || document.body).querySelectorAll('a, img, svg, picture')].filter((el) => { if (!seen(el) || inOverlay(el)) return false; const r = el.getBoundingClientRect(); return r.top < 180 && r.bottom > 0 && r.height >= 10 && r.height <= 140 && r.width >= 14 && r.width <= 520; });
  let logoEl = null, bestScore = 3;
  for (const el of pool) {
    const a = el.closest('a'); if (el.tagName !== 'A' && a && pool.includes(a)) continue;
    let score = 0;
    const hay = [el.getAttribute('aria-label'), el.getAttribute('title'), el.id, el.getAttribute('class'), el.getAttribute('alt'), el.getAttribute('src')].join(' ').toLowerCase();
    if (el.tagName === 'A') {
      try { const u = new URL(el.href, location.href); const p = u.pathname.replace(/\\/$/, '') || '/'; if (u.origin === location.origin && (p === '/' || p === startPath || p === firstSeg)) score += 4; } catch {}
      const graphic = el.querySelector('img, svg, picture'); if (graphic) score += 2;
      const label = (el.innerText || '').trim(); if (label.length > 30) score -= 4; if (!graphic && !label) continue;
      if (site && (hay + ' ' + label.toLowerCase() + ' ' + (graphic?.getAttribute('alt') || '').toLowerCase()).includes(site)) score += 2;
      if (/logo/.test(graphic?.outerHTML.slice(0, 300).toLowerCase() || '')) score += 2;
    }
    if (/logo|brand|home/.test(hay)) score += 3;
    const r = el.getBoundingClientRect(); if (r.left < W * 0.4) score += 1; if (r.left > W * 0.6) score -= 1;
    if (score > bestScore) { bestScore = score; logoEl = el; }
  }
  let logo = null;
  if (logoEl) {
    // The union of what is drawn inside: graphics plus text runs, not the link's padding.
    const rects = [];
    for (const g of logoEl.matches('img, svg, picture') ? [logoEl] : logoEl.querySelectorAll('img, svg, picture')) if (seen(g) && !(g.parentElement && g.parentElement.closest('svg'))) rects.push(g.getBoundingClientRect());
    const walker = document.createTreeWalker(logoEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (!n.textContent.trim() || !seen(n.parentElement)) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const rr of rg.getClientRects()) if (rr.width > 0) rects.push(rr); }
    if (!rects.length) rects.push(logoEl.getBoundingClientRect());
    const box = { x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)), r: Math.max(...rects.map((r) => r.right)), b: Math.max(...rects.map((r) => r.bottom)) };
    const imgs = logoEl.matches('img') ? [logoEl] : [...logoEl.querySelectorAll('img')];
    const words = (logoEl.innerText || '').trim();
    const single = imgs.length === 1 && !logoEl.querySelector('svg') && !words ? imgs[0] : null;
    const label = (logoEl.getAttribute('aria-label') || imgs[0]?.getAttribute('alt') || words || '').replace(/\\b(home ?page|homepage|home|logo|go to|back to|link to)\\b/gi, ' ').replace(/\\s+/g, ' ').trim();
    logoEl.setAttribute('data-slice-logo', '');
    logo = {
      x: box.x, y: box.y, width: box.r - box.x, height: box.b - box.y,
      src: single && /^https?:/.test(single.currentSrc || single.src) ? (single.currentSrc || single.src) : null,
      alt: label.slice(0, 40), text: words.slice(0, 40), behind: hex(bgBehind(logoEl).color),
    };
  }

  const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')].map((l) => ({ href: l.href, rel: l.rel.toLowerCase(), sizes: (l.getAttribute('sizes') || '').toLowerCase(), type: (l.type || '').toLowerCase() }));
  const top = (m, n) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
  return {
    pageBg: hex(pageBg), text: top(text, 8), headings: top(heads, 4), headingFamilies: top(headFam, 3), bodyFamilies: top(bodyFam, 3),
    buttons, cards, imageRadii: imgRadii.slice(0, 60), areas: top(area, 8), colors: top(sat, 24), eyebrows, logo, icons,
    fontsLoaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))],
  };
}
"""

# Ink coverage, bounds and lightness of a transparent PNG, read in the page's canvas.
INK_JS = """
async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0, lum = 0, x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255; if (a < 0.1) continue;
    const p = i / 4, px = p % c.width, py = (p - px) / c.width;
    n += a; lum += a * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  return { coverage: n / (c.width * c.height), lightness: n ? lum / n : 0, bounds: x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1], size: [c.width, c.height] };
}
"""

ISOLATE_CSS = """
*, *::before, *::after { transition: none !important; animation: none !important; }
html, body { background: transparent !important; }
body * { visibility: hidden !important; }
[data-slice-logo], [data-slice-logo] * { visibility: visible !important; }
"""


@dataclass
class Probe:
    url: str
    styles: dict[str, Any]
    # The header logo on a transparent background, at 3x, when one was found.
    logo_png: bytes | None = None
    logo_ink: dict[str, Any] | None = None


async def probe(url: str, *, width: int = 1440, height: int = 900, scale: int = 3, timeout_ms: int = 30_000) -> Probe:
    """Computed styles of the rendered homepage plus a transparent cut-out of its logo."""
    import base64

    b = await browser()
    context = await b.new_context(viewport={"width": width, "height": height}, device_scale_factor=scale, user_agent=UA, ignore_https_errors=True)
    try:
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="load", timeout=timeout_ms)
        except Exception:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        try:
            await page.evaluate("document.fonts && document.fonts.ready")
        except Exception:
            pass
        # Scroll once so lazily mounted sections exist, then let the header settle.
        await page.evaluate(SCROLL_JS)
        await page.wait_for_timeout(500)
        styles = await page.evaluate(PROBE_JS)
        out = Probe(url=page.url, styles=styles)
        box = styles.get("logo")
        if box and box["width"] >= 8 and box["height"] >= 8:
            await page.add_style_tag(content=ISOLATE_CSS)
            await page.wait_for_timeout(60)
            pad = 2
            clip = {
                "x": max(0, box["x"] - pad),
                "y": max(0, box["y"] - pad),
                "width": min(box["width"] + pad * 2, width),
                "height": min(box["height"] + pad * 2, height),
            }
            png = await page.screenshot(type="png", clip=clip, omit_background=True)
            ink = await page.evaluate(INK_JS, base64.b64encode(png).decode())
            if ink.get("coverage", 0) > 0.01:
                out.logo_png, out.logo_ink = png, ink
        return out
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
