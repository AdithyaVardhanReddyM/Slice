"""Read a brand's look and words out of its homepage HTML (stdlib only).

Nothing here is rendered: the output is plain strings and URLs that the
backend sanitises again before they reach a page.
"""

from __future__ import annotations

import base64
import colorsys
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit

GENERIC_FONTS = {
    "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif",
    "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto",
    "helvetica", "helvetica neue", "arial", "inherit", "initial", "unset", "emoji",
    "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "var",
    "times new roman", "times", "courier new", "courier", "georgia", "verdana", "tahoma",
}

BRAND_VAR = re.compile(
    r"--(?:[\w-]*?)(primary|brand|accent|main|theme|highlight|cta|button)(?:[\w-]*)\s*:\s*([^;}{]+)",
    re.I,
)
HEX = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
RGB = re.compile(r"rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)")
FONT_FAMILY = re.compile(r"font-family\s*:\s*([^;}{]+)", re.I)
BG_DECL = re.compile(r"(?:background(?:-color)?|color|fill|border-color)\s*:\s*([^;}{]+)", re.I)


@dataclass
class Page:
    url: str
    title: str = ""
    description: str = ""
    meta: dict[str, str] = field(default_factory=dict)
    lang: str = ""
    headings: list[str] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    nav: list[tuple[str, str]] = field(default_factory=list)
    buttons: list[str] = field(default_factory=list)
    images: list[tuple[str, int]] = field(default_factory=list)  # (url, score)
    logos: list[tuple[str, int]] = field(default_factory=list)
    icons: list[tuple[str, int]] = field(default_factory=list)
    stylesheets: list[str] = field(default_factory=list)
    google_fonts: list[str] = field(default_factory=list)
    css: list[str] = field(default_factory=list)
    jsonld: list[Any] = field(default_factory=list)


def _attr(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
    return {k.lower(): (v or "") for k, v in attrs}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class _Parser(HTMLParser):
    VOID = {"img", "meta", "link", "br", "hr", "input", "source", "area", "base", "col", "embed", "wbr", "track"}

    def __init__(self, url: str, raw: str) -> None:
        super().__init__(convert_charrefs=True)
        self.page = Page(url=url)
        self.raw = raw
        self._line_offsets = [0]
        for line in raw.splitlines(keepends=True):
            self._line_offsets.append(self._line_offsets[-1] + len(line))
        self._stack: list[str] = []
        self._text: list[str] | None = None
        self._text_tag = ""
        self._in_header = 0
        self._in_nav = 0
        self._in_style = False
        self._in_script = ""
        self._script_buf: list[str] = []
        self._link_href = ""
        self._svg_start: int | None = None
        self._svg_depth = 0
        self._svg_logo = False

    def _offset(self) -> int:
        line, col = self.getpos()
        return self._line_offsets[line - 1] + col if line - 1 < len(self._line_offsets) else len(self.raw)

    def _abs(self, href: str) -> str | None:
        href = href.strip()
        if not href or href.startswith(("data:", "javascript:", "#", "mailto:", "tel:")):
            return None
        url = urljoin(self.page.url, href)
        return url if urlsplit(url).scheme in ("http", "https") else None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = _attr(attrs)
        hint = " ".join([a.get("class", ""), a.get("id", ""), a.get("alt", ""), a.get("aria-label", "")]).lower()
        if tag not in self.VOID:
            self._stack.append(tag)
        if tag == "html":
            self.page.lang = a.get("lang", "")
        elif tag == "header":
            self._in_header += 1
        if tag == "nav":
            self._in_nav += 1
        elif tag == "style":
            self._in_style = True
        elif tag == "script":
            if a.get("type", "").lower() == "application/ld+json":
                self._in_script = "ld"
                self._script_buf = []
            else:
                self._in_script = "js"
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content"):
                self.page.meta[key] = a["content"]
        elif tag == "link":
            rel = a.get("rel", "").lower()
            href = self._abs(a.get("href", ""))
            if not href:
                return
            if "stylesheet" in rel:
                if "fonts.googleapis.com" in href:
                    self.page.google_fonts.extend(_google_families(href))
                else:
                    self.page.stylesheets.append(href)
            elif "icon" in rel:
                size = 0
                m = re.search(r"(\d+)x\d+", a.get("sizes", ""))
                if m:
                    size = int(m.group(1))
                if "apple-touch-icon" in rel:
                    size = max(size, 180)
                if href.endswith(".svg"):
                    size = max(size, 256)
                self.page.icons.append((href, size))
        elif tag == "img":
            src = a.get("src") or a.get("data-src") or ""
            if not src and a.get("srcset"):
                src = a["srcset"].split(",")[0].strip().split(" ")[0]
            url = self._abs(src)
            if not url:
                return
            in_head = self._in_header > 0 or self._in_nav > 0
            if "logo" in hint or "logo" in src.lower() or (in_head and "a" in self._stack and not self.page.logos):
                score = 10 if "logo" in hint or "logo" in src.lower() else 4
                if in_head:
                    score += 5
                self.page.logos.append((url, score))
                return
            try:
                width = int(re.sub(r"\D", "", a.get("width", "")) or 0)
            except ValueError:
                width = 0
            if re.search(r"pixel|tracking|spacer|1x1|icon|badge|payment|flag", src.lower()):
                return
            score = 1 + (3 if width >= 600 else 1 if width >= 300 else 0)
            if re.search(r"hero|banner|cover|lifestyle|campaign", hint + " " + src.lower()):
                score += 3
            self.page.images.append((url, score))
        elif tag == "svg" and self._svg_start is None:
            in_head = self._in_header > 0 or self._in_nav > 0
            if "logo" in hint or (in_head and "a" in self._stack and not self.page.logos):
                self._svg_start = self._offset()
                self._svg_depth = 1
                self._svg_logo = "logo" in hint
            return
        elif tag == "svg" and self._svg_start is not None:
            self._svg_depth += 1
        elif tag == "a":
            self._link_href = a.get("href", "")
            if self._in_nav or self._in_header:
                self._start_text("nav")
            elif re.search(r"\b(btn|button|cta)\b", a.get("class", "").lower()):
                self._start_text("button")
        elif tag == "button":
            self._start_text("button")
        elif tag in ("h1", "h2", "h3"):
            self._start_text(tag)
        elif tag == "p" and not self._in_nav:
            self._start_text("p")

    def _start_text(self, kind: str) -> None:
        self._text = []
        self._text_tag = kind

    def handle_endtag(self, tag: str) -> None:
        if tag == "svg" and self._svg_start is not None:
            self._svg_depth -= 1
            if self._svg_depth == 0:
                end = self.raw.find(">", self._offset()) + 1
                svg = self.raw[self._svg_start : end]
                if 100 < len(svg) < 40_000 and "<script" not in svg.lower():
                    if 'xmlns="http://www.w3.org/2000/svg"' not in svg:
                        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
                    uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
                    self.page.logos.append((uri, 12 if self._svg_logo else 6))
                self._svg_start = None
        if tag == "style":
            self._in_style = False
        elif tag == "script":
            if self._in_script == "ld":
                try:
                    self.page.jsonld.append(json.loads("".join(self._script_buf)))
                except (ValueError, TypeError):
                    pass
            self._in_script = ""
        elif tag == "header":
            self._in_header = max(0, self._in_header - 1)
        elif tag == "nav":
            self._in_nav = max(0, self._in_nav - 1)
        if self._text is not None and (
            tag == self._text_tag
            or (self._text_tag in ("nav", "button") and tag in ("a", "button"))
        ):
            text = _clean("".join(self._text))
            kind = self._text_tag
            self._text = None
            if not text:
                pass
            elif kind == "nav" and len(text) < 40:
                self.page.nav.append((text, self._link_href))
            elif kind == "button" and len(text) < 40:
                self.page.buttons.append(text)
            elif kind in ("h1", "h2", "h3") and len(text) < 200:
                self.page.headings.append(text)
            elif kind == "p" and len(text) > 30:
                self.page.paragraphs.append(text[:400])
        while self._stack and self._stack[-1] != tag and tag in self._stack:
            self._stack.pop()
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self.page.css.append(data)
        elif self._in_script == "ld":
            self._script_buf.append(data)
        elif self._in_script:
            return
        elif self._stack and self._stack[-1] == "title":
            self.page.title += data
        elif self._text is not None:
            self._text.append(data)


def _google_families(href: str) -> list[str]:
    out = []
    for m in re.finditer(r"family=([^&:]+)", href):
        for fam in m.group(1).split("|"):
            name = fam.split(":")[0].replace("+", " ").strip()
            if name:
                out.append(name)
    return out


def parse(url: str, html: str) -> Page:
    p = _Parser(url, html)
    try:
        p.feed(html)
        p.close()
    except Exception:  # malformed markup: keep what was read so far
        pass
    page = p.page
    page.title = _clean(page.title)
    page.description = _clean(page.meta.get("description") or page.meta.get("og:description") or "")
    # Inline style attributes count too (colours on buttons, banners).
    page.css.extend(m.group(1) for m in re.finditer(r'style="([^"]{0,400})"', html))
    for item in _flatten_jsonld(page.jsonld):
        if not isinstance(item, dict):
            continue
        kind = item.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if any(k in ("Organization", "Brand", "Corporation", "Store", "OnlineStore", "LocalBusiness") for k in kinds):
            logo = item.get("logo")
            if isinstance(logo, dict):
                logo = logo.get("url") or logo.get("contentUrl")
            if isinstance(logo, str):
                abs_logo = urljoin(url, logo)
                if urlsplit(abs_logo).scheme in ("http", "https"):
                    page.logos.append((abs_logo, 20))
    return page


def _flatten_jsonld(items: list[Any]) -> list[Any]:
    out: list[Any] = []
    for item in items:
        if isinstance(item, list):
            out.extend(_flatten_jsonld(item))
        elif isinstance(item, dict):
            out.append(item)
            graph = item.get("@graph")
            if isinstance(graph, list):
                out.extend(_flatten_jsonld(graph))
    return out


# --- Colours ----------------------------------------------------------------


def _hex(value: str) -> str | None:
    value = value.strip()
    m = HEX.search(value)
    if m:
        h = m.group(0).lower()
        if len(h) == 4:
            h = "#" + "".join(c * 2 for c in h[1:])
        return h
    m = RGB.search(value)
    if m:
        alpha = m.group(4)
        if alpha:
            a = float(alpha.rstrip("%")) / (100 if alpha.endswith("%") else 1)
            if a < 0.6:
                return None
        r, g, b = (min(255, int(m.group(i))) for i in (1, 2, 3))
        return f"#{r:02x}{g:02x}{b:02x}"
    return None


def _hls(h: str) -> tuple[float, float, float]:
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hls(r, g, b)


def is_neutral(h: str) -> bool:
    _, light, sat = _hls(h)
    return sat < 0.15 or light < 0.08 or light > 0.95


def colors(page: Page, extra_css: list[str], theme_color: str | None) -> dict[str, Any]:
    """Brand colour candidates with evidence counts, plus the darkest and lightest neutrals."""
    css = "\n".join(page.css + extra_css)
    scores: Counter[str] = Counter()
    neutrals: Counter[str] = Counter()
    named: dict[str, str] = {}
    for m in BRAND_VAR.finditer(css):
        h = _hex(m.group(2))
        if h and not is_neutral(h):
            scores[h] += 25
            named.setdefault(h, m.group(1).lower())
    for m in BG_DECL.finditer(css):
        h = _hex(m.group(1))
        if not h:
            continue
        if is_neutral(h):
            neutrals[h] += 1
        else:
            scores[h] += 2
    for m in HEX.finditer(css):
        h = _hex(m.group(0))
        if h and not is_neutral(h):
            scores[h] += 1
    if theme_color:
        h = _hex(theme_color)
        if h:
            if is_neutral(h):
                neutrals[h] += 20
            else:
                scores[h] += 30
                named.setdefault(h, "theme-color")
    # Merge near-duplicates (#e85c0d and #ea580c are the same brand orange).
    merged: list[tuple[str, int]] = []
    for h, n in scores.most_common(40):
        for i, (k, m) in enumerate(merged):
            if _close(h, k):
                merged[i] = (k, m + n)
                break
        else:
            merged.append((h, n))
    merged.sort(key=lambda x: -x[1])
    darks = [h for h, _ in neutrals.most_common(20) if _hls(h)[1] < 0.3]
    lights = [h for h, _ in neutrals.most_common(20) if _hls(h)[1] > 0.85]
    return {
        "candidates": [{"hex": h, "evidence": n, "named": named.get(h)} for h, n in merged[:10]],
        "dark": darks[0] if darks else "#111111",
        "light": lights[0] if lights else "#ffffff",
    }


def _close(a: str, b: str) -> bool:
    ra, ga, ba = (int(a[i : i + 2], 16) for i in (1, 3, 5))
    rb, gb, bb = (int(b[i : i + 2], 16) for i in (1, 3, 5))
    return abs(ra - rb) + abs(ga - gb) + abs(ba - bb) < 30


# --- Fonts ------------------------------------------------------------------


def fonts(page: Page, extra_css: list[str]) -> list[str]:
    """Font families by use, brand fonts first; generic and system stacks dropped."""
    counts: Counter[str] = Counter()
    for fam in page.google_fonts:
        counts[fam] += 10
    for css in page.css + extra_css:
        for m in FONT_FAMILY.finditer(css):
            first = m.group(1).split(",")[0].strip().strip("'\"")
            if first and first.lower() not in GENERIC_FONTS and not first.startswith("var("):
                counts[first] += 1
        for m in re.finditer(r"@font-face\s*{[^}]*font-family\s*:\s*['\"]?([^;'\"}]+)", css, re.I):
            counts[m.group(1).strip()] += 3
    return [f for f, _ in counts.most_common(6) if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ]{0,40}", f)]


# --- Summary for the model --------------------------------------------------


def best(items: list[tuple[str, int]]) -> str | None:
    if not items:
        return None
    seen: dict[str, int] = {}
    for url, score in items:
        seen[url] = max(seen.get(url, 0), score)
    return max(seen.items(), key=lambda x: x[1])[0]


def images(page: Page, take: int = 10) -> list[str]:
    seen: dict[str, int] = {}
    og = page.meta.get("og:image")
    if og:
        abs_og = urljoin(page.url, og)
        if urlsplit(abs_og).scheme in ("http", "https"):
            seen[abs_og] = 6
    for url, score in page.images:
        if url.lower().split("?")[0].endswith((".svg", ".gif", ".ico")):
            continue
        seen[url] = max(seen.get(url, 0), score)
    return [u for u, _ in sorted(seen.items(), key=lambda x: -x[1])[:take]]


def text_digest(page: Page, about: Page | None = None, limit: int = 7000) -> str:
    parts = [
        f"URL: {page.url}",
        f"TITLE: {page.title}",
        f"META DESCRIPTION: {page.description}",
        f"OG: {page.meta.get('og:site_name', '')} | {page.meta.get('og:title', '')}",
        "NAV: " + " · ".join(dict.fromkeys(t for t, _ in page.nav[:25])),
        "BUTTONS: " + " · ".join(dict.fromkeys(page.buttons[:12])),
        "HEADINGS:\n" + "\n".join(f"- {h}" for h in list(dict.fromkeys(page.headings))[:20]),
        "COPY:\n" + "\n".join(f"- {p}" for p in list(dict.fromkeys(page.paragraphs))[:25]),
    ]
    if about:
        parts.append("ABOUT PAGE:\n" + "\n".join(f"- {p}" for p in list(dict.fromkeys(about.headings + about.paragraphs))[:20]))
    return "\n".join(parts)[:limit]


def about_link(page: Page) -> str | None:
    for text, href in page.nav:
        if re.search(r"\b(about|our story|who we are|mission)\b", text, re.I):
            url = urljoin(page.url, href)
            if urlsplit(url).netloc == urlsplit(page.url).netloc:
                return url
    return None
