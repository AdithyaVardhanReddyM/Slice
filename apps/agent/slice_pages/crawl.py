"""Fetching a brand's site for intake and for reference lookups.

Two paths produce the same `Page` shape: Firecrawl v2 (`/v2/scrape` with
markdown, html, links, screenshot and branding; `/v2/map` for the site map) for
public URLs when FIRECRAWL_API_KEY is set, and a direct httpx fetch with a light
HTML-to-text pass for localhost URLs or when the key is missing.

Field names verified against https://docs.firecrawl.dev/api-reference (2026-10-11):
request `{url, formats: ["markdown", "html", "links", {type: "screenshot", fullPage},
{type: "branding"}], onlyMainContent}`; response `{success, data: {markdown, html,
links: string[], screenshot: url, branding: {...}, metadata: {title, description,
sourceURL, url, statusCode}}}`. Map: `{url, limit, includeSubdomains}` ->
`{success, links: [{url, title?, description?}]}`.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0 Safari/537.36 SliceIntake/1.0"
)

# Which linked pages are worth reading, best first (the contract's list).
PREFERRED = [
    re.compile(r"/about", re.I),
    re.compile(r"/(products?|shop|collections?|rooms?|menu|coffees?|hotels?|catalog|store)(/|$|\?)", re.I),
    re.compile(r"/(locations?|contact|visit|cafes?|stores?|find-us)(/|$|\?)", re.I),
    re.compile(r"/(journal|blog|stories|news)(/|$|\?)", re.I),
    re.compile(r"/(subscriptions?|offers?|experiences?|gifts?|gifting|plans?)(/|$|\?)", re.I),
]
ASSET_EXT = re.compile(r"\.(png|jpe?g|gif|webp|svg|ico|css|js|json|xml|pdf|zip|mp4|mp3|woff2?|ttf)(\?|$)", re.I)
SKIP_PATH = re.compile(r"/(cart|checkout|account|login|signin|sign-in|register|wp-admin|privacy|terms|cookie)", re.I)


@dataclass
class Page:
    url: str
    html: str = ""
    markdown: str = ""
    title: str = ""
    links: list[str] = field(default_factory=list)
    images: list[dict[str, str]] = field(default_factory=list)
    screenshot: str | None = None
    branding: dict[str, Any] | None = None
    status: int = 200


def is_local(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith((".localhost", ".test", ".local"))


def firecrawl_key() -> str | None:
    return os.environ.get("FIRECRAWL_API_KEY") or None


def use_firecrawl(url: str) -> bool:
    return bool(firecrawl_key()) and not is_local(url)


def normalize(url: str, *, keep_query: bool = False) -> str:
    """Drop fragments, query strings and trailing slashes so the same page is not read twice."""
    p = urlparse(url)
    path = p.path.rstrip("/") or "/"
    return urlunparse((p.scheme, p.netloc, path, "", p.query if keep_query else "", ""))


# --- HTML to text ----------------------------------------------------------------

_BLOCK = {"p", "div", "section", "article", "header", "footer", "main", "nav", "aside", "ul", "ol", "table", "tr", "br", "hr", "blockquote", "figure", "figcaption", "dd", "dt"}
_SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "canvas"}


class _TextParser(HTMLParser):
    """Markdown-ish text plus the links and images on the page."""

    def __init__(self, base: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base = base
        self.out: list[str] = []
        self.links: list[str] = []
        self.images: list[dict[str, str]] = []
        self.title = ""
        self._skip = 0
        self._in_title = False
        self._heading: str | None = None
        self._pending_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag in _SKIP:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == "title":
            self._in_title = True
        elif tag in ("h1", "h2", "h3", "h4"):
            self._heading = "#" * int(tag[1])
            self.out.append("\n\n" + self._heading + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in _BLOCK:
            self.out.append("\n")
        elif tag == "a" and a.get("href"):
            href = a["href"].strip()
            if href and not href.startswith(("#", "mailto:", "tel:", "javascript:")):
                self.links.append(urljoin(self.base, href))
        elif tag == "img":
            src = a.get("src") or a.get("data-src") or ""
            if src.startswith("data:"):
                src = ""
            if not src and a.get("srcset"):
                src = a["srcset"].split(",")[0].strip().split(" ")[0]
            if src:
                self.images.append({"src": urljoin(self.base, src), "alt": a.get("alt", "").strip()})
            if a.get("alt"):
                self.out.append(f" [image: {a['alt'].strip()}] ")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
            return
        if tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2", "h3", "h4"):
            self._heading = None
            self.out.append("\n")
        elif tag in _BLOCK or tag == "li":
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._in_title:
            self.title += data
            return
        text = re.sub(r"\s+", " ", data)
        if text.strip():
            self.out.append(text)

    def text(self) -> str:
        raw = "".join(self.out)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r" ?\n ?", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def html_to_page(url: str, html: str) -> Page:
    parser = _TextParser(url)
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    return Page(
        url=url,
        html=html,
        markdown=parser.text(),
        title=unescape(parser.title.strip()),
        links=list(dict.fromkeys(parser.links)),
        images=parser.images,
    )


# --- fetching --------------------------------------------------------------------

_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=10.0), follow_redirects=True, headers={"User-Agent": UA})
    return _http


async def fetch_direct(url: str) -> Page:
    res = await http().get(url)
    ctype = res.headers.get("content-type", "")
    if "html" not in ctype and "xml" not in ctype and not res.text.lstrip().startswith("<"):
        page = Page(url=str(res.url), status=res.status_code)
        page.markdown = res.text[:20000]
        return page
    page = html_to_page(str(res.url), res.text)
    page.status = res.status_code
    return page


async def fetch_text(url: str, limit: int = 400_000) -> str:
    """Same-host stylesheets and such; empty string on any failure."""
    try:
        res = await http().get(url)
        if res.status_code >= 400:
            return ""
        return res.text[:limit]
    except Exception:
        return ""


async def fetch_bytes(url: str, limit: int = 8_000_000) -> tuple[bytes, str]:
    res = await http().get(url)
    res.raise_for_status()
    return res.content[:limit], res.headers.get("content-type", "application/octet-stream").split(";")[0]


async def firecrawl_scrape(url: str, *, first: bool) -> Page:
    formats: list[Any] = ["markdown", "html", "links"]
    if first:
        formats += [{"type": "screenshot", "fullPage": True}, {"type": "branding"}]
    res = await http().post(
        f"{FIRECRAWL_BASE}/scrape",
        json={"url": url, "formats": formats, "onlyMainContent": False, "timeout": 60000},
        headers={"Authorization": f"Bearer {firecrawl_key()}"},
        timeout=90.0,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"Firecrawl scrape {res.status_code}: {res.text[:200]}")
    body = res.json()
    if not body.get("success", True):
        raise RuntimeError(f"Firecrawl scrape failed: {body.get('error') or body}")
    data = body.get("data") or {}
    html = data.get("html") or data.get("rawHtml") or ""
    meta = data.get("metadata") or {}
    final_url = meta.get("url") or meta.get("sourceURL") or url
    page = html_to_page(final_url, html) if html else Page(url=final_url)
    page.markdown = data.get("markdown") or page.markdown
    page.title = meta.get("title") or page.title
    links = data.get("links") or []
    if links:
        page.links = list(dict.fromkeys(urljoin(final_url, str(l)) for l in links))
    shot = data.get("screenshot")
    if isinstance(shot, str) and shot.startswith("http"):
        page.screenshot = shot
    if isinstance(data.get("branding"), dict):
        page.branding = data["branding"]
    page.status = int(meta.get("statusCode") or 200)
    return page


async def firecrawl_map(url: str, limit: int = 200) -> list[str]:
    try:
        res = await http().post(
            f"{FIRECRAWL_BASE}/map",
            json={"url": url, "limit": limit, "includeSubdomains": False},
            headers={"Authorization": f"Bearer {firecrawl_key()}"},
            timeout=60.0,
        )
        if res.status_code >= 400:
            return []
        links = (res.json() or {}).get("links") or []
        out = []
        for l in links:
            u = l.get("url") if isinstance(l, dict) else l
            if isinstance(u, str):
                out.append(u)
        return out
    except Exception:
        return []


async def fetch_page(url: str, *, first: bool = False) -> Page:
    """One page, by whichever path applies. Firecrawl failures fall back to direct."""
    if use_firecrawl(url):
        try:
            return await firecrawl_scrape(url, first=first)
        except Exception:
            pass
    return await fetch_direct(url)


def pick_links(start: str, candidates: list[str], take: int = 7) -> list[str]:
    """Up to `take` same-site pages worth reading, preferring the contract's paths.
    When the start URL lives under a path prefix (a demo site at /marlow), stay under it."""
    s = urlparse(start)
    start_norm = normalize(start)
    first_seg = s.path.strip("/").split("/")[0] if s.path.strip("/") else ""
    seen: set[str] = set()
    scored: list[tuple[int, int, str]] = []
    for i, raw in enumerate(candidates):
        try:
            p = urlparse(raw)
        except Exception:
            continue
        if p.scheme not in ("http", "https") or p.netloc.lower() != s.netloc.lower():
            continue
        if ASSET_EXT.search(p.path) or SKIP_PATH.search(p.path):
            continue
        url = normalize(raw)
        if url == start_norm or url in seen:
            continue
        if first_seg and not p.path.startswith(f"/{first_seg}/") and p.path.strip("/") != first_seg:
            continue
        seen.add(url)
        path = p.path[len(first_seg) + 1 :] if first_seg else p.path
        rank = next((n for n, rx in enumerate(PREFERRED) if rx.search(path)), len(PREFERRED))
        # Shallow pages before deep ones; product detail pages still make it when room is left.
        depth = path.count("/")
        scored.append((rank * 10 + min(depth, 4), i, url))
    scored.sort()
    out: list[str] = []
    per_section: dict[str, int] = {}
    for _, _, url in scored:
        if len(out) >= take:
            break
        # Two pages per site section (/c/living, /c/bedroom), so one listing tree
        # does not crowd out /about or /locations.
        segs = urlparse(url).path.strip("/").split("/")
        section = "/".join(segs[: 2 if first_seg else 1])
        if per_section.get(section, 0) >= 2:
            continue
        per_section[section] = per_section.get(section, 0) + 1
        out.append(url)
    return out


def stylesheet_urls(page: Page, limit: int = 6) -> list[str]:
    hrefs = re.findall(r"<link[^>]+rel=[\"'][^\"']*stylesheet[^\"']*[\"'][^>]*>", page.html, re.I)
    out: list[str] = []
    host = urlparse(page.url).netloc.lower()
    for tag in hrefs:
        m = re.search(r"href=[\"']([^\"']+)[\"']", tag)
        if not m:
            continue
        u = urljoin(page.url, unescape(m.group(1)))
        if urlparse(u).netloc.lower() == host and u not in out:
            out.append(u)
    return out[:limit]
