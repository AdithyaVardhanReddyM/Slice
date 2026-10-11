"""Deterministic brand-kit candidates from a site's HTML and CSS.

No model here: regexes and frequency counts over the pages' markup and the
same-host stylesheets. The result is a set of *candidates* (logo, colour roles,
font families, radius, button style, uppercase labels, JSON-LD products and
organisation) that the LLM step confirms and the merchant reviews. Firecrawl's
`branding` output, when present, overrides the colour and font guesses.
"""

from __future__ import annotations

import colorsys
import json
import math
import re
from collections import Counter, defaultdict
from html import unescape
from typing import Any
from urllib.parse import quote, urljoin

from .crawl import Page

# --- colours ---------------------------------------------------------------------

_HEX = re.compile(r"#([0-9a-fA-F]{3,8})\b")
_FUNC = re.compile(r"\b(rgba?|hsla?|oklch)\(([^()]*)\)", re.I)
_VAR = re.compile(r"var\((--[\w-]+)")


def _clamp(x: float) -> int:
    return max(0, min(255, int(round(x))))


def _hex(r: float, g: float, b: float) -> str:
    return "#%02x%02x%02x" % (_clamp(r), _clamp(g), _clamp(b))


def _parse_hex(h: str) -> tuple[str, float] | None:
    h = h.lstrip("#")
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    if len(h) not in (6, 8):
        return None
    alpha = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    return "#" + h[:6].lower(), alpha


def _oklch_to_rgb(L: float, C: float, H: float) -> tuple[float, float, float]:
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(c: float) -> float:
        c = max(0.0, min(1.0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    return gamma(lr) * 255, gamma(lg) * 255, gamma(lb) * 255


def _num(tok: str, scale: float = 1.0) -> float:
    tok = tok.strip()
    if tok.endswith("%"):
        return float(tok[:-1]) / 100 * scale
    if tok.endswith("deg"):
        return float(tok[:-3])
    return float(tok)


def parse_color(value: str) -> tuple[str, float] | None:
    """A CSS colour value -> (#rrggbb, alpha), or None when it is not one colour."""
    value = value.strip()
    m = _HEX.fullmatch(value) or _HEX.match(value)
    if m and value.startswith("#"):
        return _parse_hex(m.group(1))
    f = _FUNC.match(value)
    if not f:
        return None
    fn, body = f.group(1).lower(), f.group(2)
    try:
        alpha = 1.0
        if "/" in body:
            body, a = body.split("/", 1)
            alpha = _num(a)
        toks = [t for t in re.split(r"[,\s]+", body.strip()) if t]
        if fn.startswith("rgb"):
            if len(toks) == 4:
                alpha = _num(toks[3])
            r, g, b = (_num(t, 255) if t.endswith("%") else float(t) for t in toks[:3])
            return _hex(r, g, b), alpha
        if fn.startswith("hsl"):
            if len(toks) == 4:
                alpha = _num(toks[3])
            h = _num(toks[0]) / 360
            s = _num(toks[1]) if toks[1].endswith("%") else float(toks[1])
            l = _num(toks[2]) if toks[2].endswith("%") else float(toks[2])
            r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
            return _hex(r * 255, g * 255, b * 255), alpha
        if fn == "oklch":
            L = _num(toks[0])
            C = _num(toks[1], 0.4)
            H = _num(toks[2]) if len(toks) > 2 and toks[2] != "none" else 0.0
            r, g, b = _oklch_to_rgb(L, C, H)
            return _hex(r, g, b), alpha
    except (ValueError, IndexError):
        return None
    return None


def luminance(hex_color: str) -> float:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def saturation(hex_color: str) -> float:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    _, _, s = colorsys.rgb_to_hls(r, g, b)
    return s


def distance(a: str, b: str) -> float:
    ra, ga, ba = (int(a[i : i + 2], 16) for i in (1, 3, 5))
    rb, gb, bb = (int(b[i : i + 2], 16) for i in (1, 3, 5))
    return math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a) + 0.05, luminance(b) + 0.05
    return la / lb if la > lb else lb / la


# --- CSS parsing -----------------------------------------------------------------

# A selector that is one class (with optional pseudo/state), e.g. ".bg-sl-sea",
# ".hover\\:bg-sl-sea:hover", ".btn::before". Anything else is kept.
_SINGLE_CLASS = re.compile(r"^\.((?:\\.|[\w-])+)(?::[\w-]+(?:\([^)]*\))?)*$")
# Every class token in a selector (escaped characters kept for unescaping).
_CLASS_TOKEN = re.compile(r"(?<![\w\\])\.((?:\\.|[\w-])+)")
_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
_DECL = re.compile(r"([\w-]+)\s*:\s*([^;]+)")
_BUTTONISH = re.compile(r"button|\.btn|\bbtn\b|cta|primary|\[type=[\"']?submit", re.I)
_LINKISH = re.compile(r"(^|[\s,>+~])a([\s.:,\[>]|$)", re.I)
_BODYISH = re.compile(r"(^|[\s,])(html|body|:root|p)([\s,.:\[]|$)", re.I)
_HEADISH = re.compile(r"\bh[1-3]\b|display|heading|headline|title|hero", re.I)
_GENERIC_FONTS = {
    "inherit", "initial", "unset", "serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif",
    "ui-monospace", "cursive", "fantasy", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue",
    "helvetica", "arial", "noto sans", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji",
    "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono", "courier new", "times new roman", "georgia",
    "emoji", "math", "fangsong",
}
SERIF_FAMILIES = {
    "fraunces", "playfair display", "lora", "merriweather", "cormorant", "cormorant garamond", "eb garamond", "libre baskerville",
    "dm serif display", "dm serif text", "newsreader", "instrument serif", "source serif 4", "source serif pro", "crimson pro",
    "crimson text", "spectral", "literata", "bitter", "domine", "pt serif", "noto serif", "roboto serif", "young serif", "gloock",
    "libre caslon text", "cardo", "alegreya", "vollkorn", "zilla slab", "roboto slab", "arvo", "old standard tt", "bodoni moda",
    "prata", "italiana", "cinzel", "marcellus", "garamond", "georgia", "times", "baskerville", "caslon", "didot", "canela",
    "tiempos", "freight", "editorial new", "gt super", "gt sectra", "recoleta", "ogg", "reckless", "signifier", "untitled serif",
}
FRAMEWORK_DEFAULTS = {
    # Bootstrap 5
    "#0d6efd", "#0b5ed7", "#0a58ca", "#6c757d", "#198754", "#dc3545", "#ffc107", "#0dcaf0", "#212529", "#f8f9fa", "#e9ecef", "#dee2e6", "#adb5bd",
    # Tailwind blue/indigo/violet scale defaults
    "#2563eb", "#3b82f6", "#1d4ed8", "#60a5fa", "#6366f1", "#4f46e5", "#7c3aed", "#8b5cf6", "#0ea5e9", "#06b6d4",
    # Material
    "#1976d2", "#2196f3", "#1565c0", "#6200ee", "#3f51b5",
}
MONO_FAMILIES = {"ibm plex mono", "jetbrains mono", "fira code", "fira mono", "space mono", "dm mono", "roboto mono", "source code pro", "inconsolata", "courier prime", "geist mono", "berkeley mono", "sf mono"}


def font_fallback(family: str) -> str:
    f = family.lower()
    if f in MONO_FAMILIES or "mono" in f:
        return "ui-monospace, SFMono-Regular, Menlo, monospace"
    if f in SERIF_FAMILIES or "serif" in f and "sans" not in f:
        return "Georgia, 'Times New Roman', serif"
    return "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"


def _first_family(value: str) -> str | None:
    value = value.split("!")[0]
    # `var(--x, A, B)`: the fallback stack is still worth reading; drop the wrapper.
    value = re.sub(r"var\(--[\w-]+\s*,?", "", value).replace(")", "")
    for part in value.split(","):
        name = part.strip().strip("'\"").strip()
        if not name or name.startswith("var(") or name.lower() in _GENERIC_FONTS:
            continue
        name = re.sub(r"\s+Fallback$", "", name, flags=re.I)
        if name.lower().startswith(("__", "font-")):  # next/font internals
            continue
        return name
    return None


def _strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


class Extracted(dict):
    """A plain dict with attribute access for readability in intake.py."""

    __getattr__ = dict.get


def _collect_vars(css: str) -> dict[str, str]:
    vars_: dict[str, str] = {}
    for m in re.finditer(r"(--[\w-]+)\s*:\s*([^;{}]+)", css):
        name, value = m.group(1), m.group(2).strip()
        if name not in vars_ and not value.startswith("var("):
            vars_[name] = value
    return vars_


def _resolve(value: str, vars_: dict[str, str], depth: int = 0) -> str:
    m = _VAR.search(value)
    if not m or depth > 3:
        return value
    inner = vars_.get(m.group(1))
    if inner is None:
        return value
    return _resolve(inner, vars_, depth + 1)


def extract(pages: list[Page], stylesheets: list[str]) -> Extracted:
    """Candidates from the pages' HTML plus the fetched stylesheets."""
    home = pages[0]
    html_all = "\n".join(p.html for p in pages)
    inline_css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html_all, re.S | re.I))
    css_all = _strip_comments("\n".join(stylesheets + [inline_css]))
    vars_ = _collect_vars(css_all)

    # Colour and font frequency by context.
    bg = Counter()
    fg = Counter()
    accent_ctx = Counter()  # buttons, links, primary-ish selectors
    any_color = Counter()
    light_ctx_bg = Counter()
    fonts = Counter()
    heading_fonts = Counter()
    body_fonts = Counter()
    radii = Counter()
    button_radii = Counter()
    uppercase = 0

    # Class names the pages actually use. A compiled stylesheet (Tailwind, a
    # multi-site bundle) carries utilities for every page of the app; a rule
    # for a class that never appears in this site's HTML says nothing about
    # this site's colours.
    used_counts: Counter = Counter()
    for cm in re.finditer(r'class=["\']([^"\']*)["\']', html_all):
        used_counts.update(cm.group(1).split())
    used_classes: set[str] = set(used_counts)
    # Classes on the page's links and buttons: whatever background they get is
    # the call-to-action colour, which a utility-class site never says in CSS.
    cta_classes: Counter = Counter()
    for tm in re.finditer(r"<(?:a|button)\b[^>]*class=[\"']([^\"']*)[\"']", html_all, re.I):
        cta_classes.update(tm.group(1).split())
    class_bg: dict[str, str] = {}

    def rule_used(selector: str) -> bool:
        """False when the selector names a class none of the pages use, or styles
        a transient state (selection, focus ring, placeholder) that says nothing
        about the palette."""
        if re.search(r"::?selection|focus-visible|::?placeholder", selector):
            return False
        if not used_classes or selector.startswith("@"):
            return True
        for cm in _CLASS_TOKEN.finditer(selector):
            cls = re.sub(r"\\(.)", r"\1", cm.group(1))
            if cls not in used_classes:
                return False
        return True

    # Custom properties count only when a used rule reads them; a theme block
    # that declares every site's palette says nothing about this site.
    referenced: set[str] = set()
    for m in _RULE.finditer(css_all):
        if not rule_used(m.group(1).strip()):
            continue
        for d in _DECL.finditer(m.group(2)):
            if not d.group(1).startswith("--"):
                referenced.update(v.lower() for v in re.findall(r"var\(\s*(--[\w-]+)", d.group(2)))
    # Follow one level of var(--a) → var(--b) indirection.
    for name in list(referenced):
        referenced.update(v.lower() for v in re.findall(r"var\(\s*(--[\w-]+)", vars_.get(name, "")))

    for m in _RULE.finditer(css_all):
        selector, decls = m.group(1).strip(), m.group(2)
        if not rule_used(selector):
            continue
        # On a utility-class site every colour is declared once; how often the
        # page uses the class is the real frequency.
        classes = [re.sub(r"\\(.)", r"\1", cm.group(1)) for cm in _CLASS_TOKEN.finditer(selector)]
        usage = min((used_counts[c] for c in classes), default=1) if classes and used_counts else 1
        usage = max(1, min(usage, 40))
        single = _SINGLE_CLASS.match(selector)
        single_cls = re.sub(r"\\(.)", r"\1", single.group(1)) if single and ":" not in selector.replace("\\:", "") else None
        if selector.startswith("@") and "{" not in selector:
            # @font-face and friends. Keep font-family names from @font-face as candidates.
            if selector.lower().startswith("@font-face"):
                fam = re.search(r"font-family\s*:\s*([^;]+)", decls)
                if fam:
                    f = _first_family(fam.group(1))
                    if f:
                        fonts[f] += 1
            continue
        buttonish = bool(_BUTTONISH.search(selector))
        linkish = bool(_LINKISH.search(selector))
        # A rule that sets the text colour and the font family is the page's
        # body text rule, whether it sits on `body` or on a wrapper class.
        bodyish = bool(_BODYISH.search(selector)) or bool(
            re.search(r"(^|[;\s])color\s*:", decls) and re.search(r"font-family\s*:", decls) and not buttonish
        )
        headish = bool(_HEADISH.search(selector))
        for d in _DECL.finditer(decls):
            prop, raw = d.group(1).lower(), d.group(2).strip()
            value = _resolve(raw, vars_)
            if prop.startswith("--") and referenced and prop.lower() not in referenced:
                continue
            if prop in ("background", "background-color", "color", "border-color", "fill", "stroke") or prop.startswith("--"):
                for cm in list(_HEX.finditer(value)) + list(_FUNC.finditer(value)):
                    parsed = parse_color(cm.group(0))
                    if not parsed:
                        continue
                    col, alpha = parsed
                    if alpha < 0.6:
                        continue
                    weight = (3 if buttonish else 1) * usage
                    if single_cls and prop.startswith("background"):
                        class_bg[single_cls] = col
                    # Bootstrap/Tailwind defaults ship with the framework, not the brand.
                    if col in FRAMEWORK_DEFAULTS:
                        weight = max(1, weight // 3) if buttonish else 0
                        if not weight:
                            continue
                    any_color[col] += weight
                    if prop.startswith("background"):
                        bg[col] += weight
                        if buttonish or linkish:
                            accent_ctx[col] += 3 if buttonish else 1
                        if bodyish:
                            light_ctx_bg[col] += 5
                    elif prop == "color":
                        fg[col] += weight * (60 if bodyish else 1)
                        if linkish and not bodyish:
                            accent_ctx[col] += 1
                    elif prop.startswith("--"):
                        name = prop.lower()
                        if re.search(r"primary|brand|accent", name):
                            accent_ctx[col] += 2
                        if re.search(r"background|bg|cream|paper|surface", name):
                            bg[col] += 1
                        if re.search(r"foreground|ink|text", name):
                            fg[col] += 1
            elif prop == "font-family":
                f = _first_family(value)
                if f:
                    fonts[f] += 1
                    if headish:
                        heading_fonts[f] += 2
                    if bodyish:
                        body_fonts[f] += 3
            elif prop == "border-radius":
                for tok in value.split():
                    px = _radius_px(tok)
                    if px is None:
                        continue
                    radii[px] += 1
                    if buttonish:
                        button_radii[px] += 1
            elif prop == "text-transform" and "uppercase" in value and (buttonish or linkish or "label" in selector.lower() or "eyebrow" in selector.lower()):
                uppercase += 1

    # Tailwind-style markup: class names on buttons and links tell us the same things.
    for tag in re.findall(r"<(?:a|button)\b[^>]*class=[\"']([^\"']+)[\"'][^>]*>", html_all, re.I):
        if re.search(r"\buppercase\b", tag):
            uppercase += 1
        if re.search(r"\brounded-full\b", tag):
            button_radii[9999] += 1
        elif re.search(r"\brounded-(xl|2xl|3xl)\b", tag):
            button_radii[16] += 1
        elif re.search(r"\brounded(-md|-lg)?\b", tag):
            button_radii[6] += 1
        elif re.search(r"\brounded-none\b", tag) or not re.search(r"\brounded", tag):
            button_radii[0] += 1

    theme_color = _meta(html_all, "theme-color")
    theme_hex = None
    if theme_color:
        p = parse_color(theme_color)
        theme_hex = p[0] if p else None

    for cls, n in cta_classes.items():
        col = class_bg.get(cls)
        if col and col not in FRAMEWORK_DEFAULTS:
            accent_ctx[col] += 3 * min(n, 20)
    colors = _roles(bg, fg, accent_ctx, any_color, light_ctx_bg, theme_hex)

    google = _google_families(html_all, css_all)
    for g in google:
        fonts[g] += 2
    heading, body = _font_roles(fonts, heading_fonts, body_fonts, google)

    radius_px = _mode(button_radii) if button_radii else _mode(radii)
    radius = _radius_token(radius_px)
    button_style = "pill" if radius == "full" else "square" if radius == "none" else "rounded"

    logo, wordmark, favicon, og_image = _logo(home)

    out = Extracted(
        logo=logo,
        wordmark=wordmark,
        favicon=favicon,
        ogImage=og_image,
        themeColor=theme_hex,
        colors=colors,
        palette=[c for c, _ in any_color.most_common(12)],
        fonts={
            "heading": heading,
            "body": body,
            "google": google,
            "candidates": [{"family": f, "count": n} for f, n in fonts.most_common(8)],
        },
        radius=radius,
        buttonStyle=button_style,
        uppercaseLabels=uppercase >= 3,
        jsonld=_jsonld(pages),
        images=_page_images(pages),
        meta={
            "title": home.title,
            "description": _meta(html_all, "description") or _meta(html_all, "og:description"),
            "siteName": _meta(html_all, "og:site_name"),
        },
    )
    return out


def _radius_px(tok: str) -> float | None:
    tok = tok.strip().lower()
    try:
        if tok.endswith("px"):
            return float(tok[:-2])
        if tok.endswith("rem") or tok.endswith("em"):
            return float(re.sub(r"r?em$", "", tok)) * 16
        if tok.endswith("%"):
            return 9999.0 if float(tok[:-1]) >= 50 else None
        if tok in ("0", "0px"):
            return 0.0
        if tok.startswith("calc(infinity") or tok == "9999px":
            return 9999.0
    except ValueError:
        return None
    return None


def _mode(counter: Counter) -> float:
    if not counter:
        return 6.0
    return counter.most_common(1)[0][0]


def _radius_token(px: float) -> str:
    if px <= 1:
        return "none"
    if px <= 4:
        return "sm"
    if px <= 10:
        return "md"
    if px <= 24:
        return "lg"
    return "full"


def _meta(html: str, name: str) -> str | None:
    for attr in ("name", "property"):
        m = re.search(rf"<meta[^>]+{attr}=[\"']{re.escape(name)}[\"'][^>]*>", html, re.I)
        if m:
            c = re.search(r"content=[\"']([^\"']*)[\"']", m.group(0), re.I)
            if c and c.group(1).strip():
                return unescape(c.group(1).strip())
    return None


def _roles(
    bg: Counter, fg: Counter, accent_ctx: Counter, any_color: Counter, light_ctx_bg: Counter, theme_hex: str | None
) -> dict[str, str]:
    lights = [(c, n) for c, n in (light_ctx_bg + bg).most_common() if luminance(c) > 0.8]
    darks = [(c, n) for c, n in (fg + Counter({c: n for c, n in bg.items() if luminance(c) < 0.2})).most_common() if luminance(c) < 0.3]
    background = lights[0][0] if lights else "#ffffff"
    foreground = darks[0][0] if darks else "#111111"

    def saturated(c: str) -> bool:
        return saturation(c) > 0.2 and 0.08 < luminance(c) < 0.75 and distance(c, background) > 60 and distance(c, foreground) > 40

    sat = [(c, n) for c, n in accent_ctx.most_common() if saturated(c)]
    if not sat:
        sat = [(c, n) for c, n in any_color.most_common() if saturated(c)]
    if theme_hex and saturated(theme_hex):
        sat.insert(0, (theme_hex, 10**6))
    primary = sat[0][0] if sat else foreground
    accent = next((c for c, _ in sat[1:] if distance(c, primary) > 70), None)
    if accent is None:
        accent = next((c for c, _ in any_color.most_common() if saturated(c) and distance(c, primary) > 70), primary)
    muted = next(
        (c for c, _ in any_color.most_common() if 0.3 < luminance(c) < 0.8 and saturation(c) < 0.35 and distance(c, background) > 40),
        None,
    )
    if muted is None:
        muted = _mix(foreground, background, 0.55)
    surface = next((c for c, _ in lights[1:] if distance(c, background) > 6), None) or _mix(background, foreground, 0.04)
    primary_fg = "#ffffff" if contrast(primary, "#ffffff") >= contrast(primary, foreground) else foreground
    if theme_hex and not saturated(theme_hex) and luminance(theme_hex) > 0.8:
        background = theme_hex
    return {
        "background": background,
        "foreground": foreground,
        "primary": primary,
        "primaryForeground": primary_fg,
        "accent": accent,
        "muted": muted,
        "surface": surface,
    }


def _mix(a: str, b: str, t: float) -> str:
    ra, ga, ba = (int(a[i : i + 2], 16) for i in (1, 3, 5))
    rb, gb, bb = (int(b[i : i + 2], 16) for i in (1, 3, 5))
    return _hex(ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t)


def _google_families(html: str, css: str) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r"fonts\.googleapis\.com/css2?\?([^\"'\s)]+)", html + "\n" + css):
        q = unescape(m.group(1))
        for part in q.split("&"):
            if not part.startswith("family="):
                continue
            fams = part[len("family=") :]
            for fam in fams.split("|"):
                name = fam.split(":")[0].replace("+", " ").strip()
                name = re.sub(r"%20", " ", name)
                if name and name not in out:
                    out.append(name)
    return out


def _font_roles(fonts: Counter, heading_fonts: Counter, body_fonts: Counter, google: list[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    def entry(family: str | None) -> dict[str, Any]:
        if not family:
            return {"family": "Inter", "source": "google", "fallback": font_fallback("Inter"), "guessed": True}
        return {"family": family, "source": "google" if family in google or _looks_google(family) else "system", "fallback": font_fallback(family)}

    def is_mono(f: str) -> bool:
        return f.lower() in MONO_FAMILIES or "mono" in f.lower()

    body = body_fonts.most_common(1)[0][0] if body_fonts else (fonts.most_common(1)[0][0] if fonts else None)
    # A monospace face is for labels, not paragraphs; use the next family for body text.
    if body and is_mono(body):
        body = next((f for f, _ in fonts.most_common() if not is_mono(f)), body)
    heading = None
    if heading_fonts:
        heading = heading_fonts.most_common(1)[0][0]
    if not heading or heading == body:
        # The other family in play: a serif among the candidates, else the next non-mono one, else body.
        others = [f for f, _ in fonts.most_common() if f != body]
        serif = next((f for f in others if f.lower() in SERIF_FAMILIES or ("serif" in f.lower() and "sans" not in f.lower())), None)
        heading = serif or next((f for f in others if not is_mono(f)), None) or body
    # Prefer the Google family when a proprietary one and a Google one compete for body.
    if body and body not in google and google:
        gb = next((g for g in google if g != heading), None)
        if gb and fonts[gb] >= fonts[body] * 0.5:
            body = gb
    return entry(heading), entry(body)


def _looks_google(family: str) -> bool:
    f = family.lower()
    return f in SERIF_FAMILIES | MONO_FAMILIES or f in {
        "inter", "archivo", "dm sans", "manrope", "work sans", "space grotesk", "sora", "outfit", "poppins", "montserrat",
        "nunito", "nunito sans", "lato", "open sans", "raleway", "rubik", "karla", "figtree", "plus jakarta sans", "be vietnam pro",
        "public sans", "ibm plex sans", "source sans 3", "jost", "urbanist", "lexend", "red hat display", "red hat text", "albert sans",
        "instrument sans", "geist", "onest", "schibsted grotesk", "hanken grotesk", "bricolage grotesque", "epilogue", "syne",
    }


def _logo(home: Page) -> tuple[dict[str, Any] | None, str | None, str | None, str | None]:
    html = home.html
    og = _meta(html, "og:image")
    og_image = urljoin(home.url, og) if og else None
    favicon = None
    for m in re.finditer(r"<link[^>]+rel=[\"']([^\"']*icon[^\"']*)[\"'][^>]*>", html, re.I):
        href = re.search(r"href=[\"']([^\"']+)[\"']", m.group(0), re.I)
        if href:
            favicon = urljoin(home.url, unescape(href.group(1)))
            if "apple-touch" in m.group(1).lower():
                break
    logo: dict[str, Any] | None = None
    header = _header_html(html)
    img = re.search(r"<img\b[^>]*(?:src|alt|class)=[\"'][^\"']*logo[^\"']*[\"'][^>]*>", header or html, re.I)
    if img:
        logo = _img_ref(img.group(0), home)
    # The anchor that links home: its image is the logo, its text the wordmark.
    home_links = _home_links(header, home) if header else []
    if logo is None:
        for a_html in home_links:
            im = re.search(r"<img\b[^>]*>", a_html, re.I)
            if im:
                logo = _img_ref(im.group(0), home)
                if logo:
                    break
    if logo is None and header:
        logo = _header_svg_logo(header, home)
    wordmark = None
    for a_html in home_links:
        text = unescape(" ".join(re.sub(r"<[^>]+>", " ", a_html).split()))
        label = re.search(r"aria-label=[\"']([^\"']+)[\"']", a_html, re.I)
        if 1 < len(text) <= 28 and not re.search(r"menu|cart|search|skip", text, re.I):
            wordmark = text
            break
        if label:
            cleaned = re.sub(r"\s*(home ?page|homepage|home|logo|go to|back to|link to)\s*", " ", label.group(1), flags=re.I).strip()
            if 1 < len(cleaned) <= 28:
                wordmark = cleaned
                break
    if wordmark is None and logo and logo.get("alt") and 1 < len(logo["alt"]) <= 28 and logo["alt"].lower() != "logo":
        wordmark = re.sub(r"\s*logo\s*$", "", logo["alt"], flags=re.I).strip() or None
    return logo, wordmark, favicon, og_image


def _img_ref(img_tag: str, home: Page) -> dict[str, Any] | None:
    src = re.search(r"\bsrc=[\"']([^\"']+)[\"']", img_tag, re.I)
    alt = re.search(r"\balt=[\"']([^\"']*)[\"']", img_tag, re.I)
    if not src or src.group(1).startswith("data:"):
        return None
    return {"src": urljoin(home.url, unescape(src.group(1))), "alt": unescape(alt.group(1)).strip() if alt and alt.group(1).strip() else "Logo"}


def _home_links(header: str, home: Page) -> list[str]:
    """Anchors in the header whose href is the site root or the start page (demo sites live under a prefix)."""
    from urllib.parse import urlparse as _up

    start = _up(home.url)
    start_path = start.path.rstrip("/") or "/"
    out: list[str] = []
    for a in re.finditer(r"<a\b[^>]*>(.*?)</a>", header, re.S | re.I):
        href_m = re.search(r"href=[\"']([^\"']*)[\"']", a.group(0), re.I)
        if not href_m:
            continue
        target = _up(urljoin(home.url, unescape(href_m.group(1))))
        if target.netloc.lower() != start.netloc.lower():
            continue
        path = target.path.rstrip("/") or "/"
        if path == "/" or path == start_path or re.search(r"home|logo", a.group(0), re.I):
            out.append(a.group(0))
    return out


def _header_svg_logo(header: str, home: Page) -> dict[str, Any] | None:
    """The header SVG most likely to be the logo: inside the home link, labelled, wide, with
    real paths. Menu, search and cart icons (small, unlabelled) score below the threshold."""
    site_name = (home.title.split("|")[0].split("-")[0].strip() or "").lower()
    best: tuple[int, str, str] | None = None
    for m in re.finditer(r"<svg\b.*?</svg>", header, re.S | re.I):
        svg = m.group(0)
        if len(svg) > 20000:
            continue
        head = svg[: svg.find(">") + 1]
        score = 0
        before = header[max(0, m.start() - 600) : m.start()]
        last_a = before.rfind("<a")
        if last_a != -1 and before.find("</a>", last_a) == -1:
            a_tag = before[last_a : before.find(">", last_a) + 1]
            if re.search(r"href=[\"'](/|[^\"']*//[^/\"']+/?|[^\"']*/)[\"']", a_tag) or re.search(r"home|logo", a_tag, re.I):
                score += 3
        label_m = re.search(r"aria-label=[\"']([^\"']+)[\"']", head) or re.search(r"<title>([^<]+)</title>", svg)
        label = unescape(label_m.group(1)).strip() if label_m else ""
        if label and (re.search(r"logo|home", label, re.I) or (site_name and site_name in label.lower())):
            score += 3
        if re.search(r"class=[\"'][^\"']*logo", head, re.I) or re.search(r"menu|hamburger|search|cart|bag|close|chevron|arrow|icon", head, re.I) is None and "logo" in svg[:400].lower():
            score += 2
        w = re.search(r"\bwidth=[\"']?(\d+)", head)
        vb = re.search(r"viewBox=[\"']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)", head)
        width = float(w.group(1)) if w else (float(vb.group(1)) if vb else 0)
        height = float(vb.group(2)) if vb else width
        if width >= 60 and width > height:
            score += 2
        elif width and width <= 32 and not label:
            score -= 3
        if svg.count("<path") >= 3:
            score += 1
        if re.search(r"menu|hamburger|search|cart|bag|close|chevron|arrow", head + label, re.I):
            score -= 4
        if best is None or score > best[0]:
            best = (score, svg, label)
    if not best or best[0] < 3:
        return None
    _, svg, label = best
    if "xmlns" not in svg:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    alt = re.sub(r"\s*(home|logo|homepage)\s*$", "", label, flags=re.I).strip() or home.title or "Logo"
    return {"src": "data:image/svg+xml;utf8," + quote(svg), "alt": alt, "inlineSvg": True}


def _header_html(html: str) -> str | None:
    m = re.search(r"<header\b.*?</header>", html, re.S | re.I)
    if m:
        return m.group(0)
    m = re.search(r"<[^>]+(role=[\"']banner[\"']|class=[\"'][^\"']*\bheader\b)[^>]*>.*?</(header|div)>", html, re.S | re.I)
    if m and len(m.group(0)) < 60_000:
        return m.group(0)
    # No header element: the top of the body is where the logo and nav live.
    body = re.search(r"<body\b[^>]*>(.*)", html, re.S | re.I)
    if body:
        return body.group(1)[:40_000]
    m = re.search(r"<nav\b.*?</nav>", html, re.S | re.I)
    return m.group(0) if m else None


def _jsonld(pages: list[Page]) -> dict[str, Any]:
    products: list[dict[str, Any]] = []
    organization: dict[str, Any] | None = None
    places: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        for block in re.findall(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", page.html, re.S | re.I):
            try:
                data = json.loads(unescape(block.strip()))
            except Exception:
                continue
            for node in _walk_jsonld(data):
                t = node.get("@type")
                types = [t] if isinstance(t, str) else [str(x) for x in (t or [])]
                if "Product" in types:
                    name = str(node.get("name") or "").strip()
                    if not name or name.lower() in seen:
                        continue
                    seen.add(name.lower())
                    offers = node.get("offers") or {}
                    if isinstance(offers, list):
                        offers = offers[0] if offers else {}
                    image = node.get("image")
                    if isinstance(image, list):
                        image = image[0] if image else None
                    if isinstance(image, dict):
                        image = image.get("url") or image.get("contentUrl")
                    brand = node.get("brand")
                    if isinstance(brand, dict):
                        brand = brand.get("name")
                    products.append(
                        {
                            "name": name,
                            "description": str(node.get("description") or "")[:400],
                            "price": _price(offers),
                            "image": urljoin(page.url, str(image)) if image else None,
                            "url": urljoin(page.url, str(node.get("url") or offers.get("url") or page.url)),
                            "sku": node.get("sku"),
                            "brand": brand,
                            "category": node.get("category"),
                        }
                    )
                elif any(x in types for x in ("Organization", "Corporation", "Brand")) and organization is None:
                    logo = node.get("logo")
                    if isinstance(logo, dict):
                        logo = logo.get("url")
                    organization = {
                        "name": node.get("name"),
                        "description": node.get("description"),
                        "logo": urljoin(page.url, str(logo)) if logo else None,
                        "url": node.get("url"),
                        "sameAs": node.get("sameAs"),
                        "address": _address(node.get("address")),
                        "telephone": node.get("telephone"),
                    }
                elif any(x in types for x in ("LocalBusiness", "Store", "Hotel", "Restaurant", "CafeOrCoffeeShop", "LodgingBusiness", "Place")):
                    places.append({"name": node.get("name"), "type": types[0], "address": _address(node.get("address")), "telephone": node.get("telephone")})
    return {"products": products[:40], "organization": organization, "places": places[:12]}


def _walk_jsonld(data: Any):
    if isinstance(data, list):
        for d in data:
            yield from _walk_jsonld(d)
    elif isinstance(data, dict):
        if "@graph" in data and isinstance(data["@graph"], list):
            for d in data["@graph"]:
                yield from _walk_jsonld(d)
        if data.get("@type"):
            yield data
        for key in ("mainEntity", "itemListElement", "hasOfferCatalog", "makesOffer"):
            if key in data:
                for d in _walk_jsonld(data[key]):
                    yield d
        if "item" in data and isinstance(data["item"], dict):
            yield from _walk_jsonld(data["item"])


def _price(offers: Any) -> str | None:
    if not isinstance(offers, dict):
        return None
    price = offers.get("price") or offers.get("lowPrice")
    if price is None:
        spec = offers.get("priceSpecification") or {}
        price = spec.get("price") if isinstance(spec, dict) else None
    if price is None:
        return None
    cur = offers.get("priceCurrency") or ""
    symbol = {"USD": "$", "EUR": "€", "GBP": "£"}.get(str(cur).upper(), f"{cur} " if cur else "")
    try:
        p = float(price)
        text = f"{p:,.0f}" if p == int(p) else f"{p:,.2f}"
    except (TypeError, ValueError):
        text = str(price)
    return f"{symbol}{text}".strip()


def _address(addr: Any) -> str | None:
    if not addr:
        return None
    if isinstance(addr, str):
        return addr
    if isinstance(addr, list):
        addr = addr[0] if addr else None
        if not isinstance(addr, dict):
            return None
    parts = [addr.get(k) for k in ("streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry")]
    return ", ".join(str(p) for p in parts if p) or None


def _page_images(pages: list[Page], limit: int = 80) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for page in pages:
        for img in page.images:
            src = img.get("src", "")
            if not src or src in seen or re.search(r"\.(svg|gif|ico)(\?|$)", src, re.I) or re.search(r"logo|icon|sprite|pixel|tracking|badge", src, re.I):
                continue
            seen.add(src)
            out.append({"src": src, "alt": img.get("alt", "")[:120], "page": page.url})
            if len(out) >= limit:
                return out
    return out


def apply_branding(cands: Extracted, branding: dict[str, Any] | None) -> Extracted:
    """Firecrawl's branding read wins over the regex guesses where it has values."""
    if not branding:
        return cands
    colors = branding.get("colors") or {}
    mapping = {
        "primary": "primary",
        "background": "background",
        "textPrimary": "foreground",
        "accent": "accent",
        "textSecondary": "muted",
        "secondary": "surface",
    }
    for src, dst in mapping.items():
        val = colors.get(src)
        parsed = parse_color(str(val)) if val else None
        if parsed:
            cands["colors"][dst] = parsed[0]
    c = cands["colors"]
    c["primaryForeground"] = "#ffffff" if contrast(c["primary"], "#ffffff") >= contrast(c["primary"], c["foreground"]) else c["foreground"]
    fams = (branding.get("typography") or {}).get("fontFamilies") or {}
    google = cands["fonts"]["google"]
    for role, key in (("heading", "heading"), ("body", "primary")):
        fam = fams.get(key)
        if fam:
            f = _first_family(str(fam))
            if f:
                cands["fonts"][role] = {"family": f, "source": "google" if f in google or _looks_google(f) else "system", "fallback": font_fallback(f)}
    logo = branding.get("logo") or (branding.get("images") or {}).get("logo")
    if isinstance(logo, str) and logo.startswith("http") and not (cands.get("logo") or {}).get("src", "").startswith("http"):
        cands["logo"] = {"src": logo, "alt": cands.get("wordmark") or "Logo"}
    radius = (branding.get("spacing") or {}).get("borderRadius")
    if radius:
        px = _radius_px(str(radius))
        if px is not None:
            cands["radius"] = _radius_token(px)
            cands["buttonStyle"] = "pill" if cands["radius"] == "full" else "square" if cands["radius"] == "none" else "rounded"
    cands["branding"] = {k: branding.get(k) for k in ("colorScheme", "personality") if branding.get(k)}
    return cands
