"""The email document on the agent side: ids, block defaults, the outline the model
reads, the checks on what it writes, and cleaning one person's personalisation.

Shapes are packages/backend/convex/emailTypes.ts. Convex validates every write
(emailDoc.validateEmailDoc: ids, numbers, inline HTML, the footer), so the checks
here are the ones only the agent can make: links and images it may have invented,
catalog ids, merge tags, the copy rules. Defaults let the model write terse blocks.
Pure functions, no I/O.
"""

from __future__ import annotations

import copy
import re
import secrets
import string
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

BLOCK_TYPES = ("logo", "heading", "text", "image", "button", "divider", "spacer", "items", "social", "quote", "coupon", "video", "footer")
COLOR_TOKENS = ("surface", "backdrop", "primary", "accent", "muted", "text", "border")
NETWORKS = ("instagram", "facebook", "x", "tiktok", "youtube", "linkedin", "pinterest", "threads", "website")
# emailTypes.MERGE_TAGS: key -> example, used to measure a subject the way an inbox shows it.
MERGE_TAGS = {"first_name": "Maya", "last_name": "Okafor", "name": "Maya Okafor", "email": "maya@example.com", "city": "Brooklyn", "brand": "Folio & Fern"}
OPS = ("update_block", "insert_block", "remove_block", "move_block", "update_section", "insert_section", "remove_section", "move_section", "set_columns", "update_column", "set_subject", "set_theme")

SUBJECT_MAX = 45
PREHEADER_MIN, PREHEADER_MAX = 40, 90

# Personalisation may replace only these fields, per block type (docs/email-plan.md).
PERSONAL_FIELDS: dict[str, tuple[str, ...]] = {
    "heading": ("text",),
    "text": ("html",),
    "image": ("src", "alt"),
    "button": ("label", "href"),
    "items": ("itemIds", "reasons"),
    "quote": ("text", "author"),
}

ITEMS_SHOW = {"image": True, "subtitle": True, "description": False, "price": True, "button": True, "reason": True}

DEFAULTS: dict[str, dict[str, Any]] = {
    "logo": {"width": 140, "align": "center"},
    "heading": {"level": 2, "align": "left"},
    "text": {"align": "left"},
    "image": {"width": 100, "align": "center"},
    "button": {"align": "left", "variant": "solid"},
    "divider": {"thickness": 1, "width": 100, "style": "solid"},
    "spacer": {"height": 24},
    "items": {"itemIds": [], "pick": "manual", "layout": "grid", "buttonLabel": "View"},
    "social": {"align": "center", "style": "dark", "links": []},
    "quote": {"align": "center"},
    "coupon": {"align": "center"},
    "video": {"width": 100, "align": "center"},
    "footer": {"text": "", "align": "center", "unsubscribeLabel": "Unsubscribe"},
}

# What a block must say for the renderer to draw something real.
REQUIRED: dict[str, tuple[str, ...]] = {
    "heading": ("text",),
    "text": ("html",),
    "image": ("src",),
    "button": ("label", "href"),
    "items": ("itemIds",),
    "quote": ("text",),
    "coupon": ("code", "label"),
    "video": ("thumbnail", "href"),
    "social": ("links",),
}

# Shared with the Pages builder's rule: taste is additive.
BANNED = re.compile(r"\b(best[- ]?sellers?|best[- ]?selling|trending|most popular|popular|hot right now)\b", re.I)
PLACEHOLDER_HOSTS = ("example.com", "example.org", "yourdomain.com", "yourstore.com")
# Promises a model "knows" about a brand from training: allowed only when the brief, the merchant,
# the brand or the catalog says them. (claim pattern, words that must appear in those facts)
CLAIMS: tuple[tuple[re.Pattern[str], tuple[str, ...], str], ...] = (
    (re.compile(r"\bfree (?:\w+ )?(?:shipping|delivery)\b|\bships? free\b", re.I), ("shipping", "delivery", "ships"), "free shipping"),
    (re.compile(r"\b(?:free|easy|simple|hassle[- ]free) returns?\b|\b\d+[- ]day returns?\b|\breturns? (?:are|is) (?:free|easy|simple|on us)", re.I), ("return",), "returns"),
    (re.compile(r"\b(?:money[- ]back|guarantee[ds]?|warranty)\b", re.I), ("guarantee", "warranty", "money back", "money-back"), "a guarantee"),
    (re.compile(r"\b\d+ ?% off\b|\b(?:discount|promo code|coupon|on sale|sale ends)\b", re.I), ("%", "discount", "sale", "code", " off"), "a discount"),
    (re.compile(r"\b\d+[- ]day (?:trial|test)\b|\btry (?:them|it) (?:on )?(?:at home|for \d+)", re.I), ("trial", "try them", "try it"), "a trial period"),
)
_MERGE = re.compile(r"\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}")
_TAG = re.compile(r"<[^>]+>")
_HREF = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)
_URL = re.compile(r"https?://[^\s<>\"')\]]+")


# --- ids ----------------------------------------------------------------------------


def new_id(prefix: str) -> str:
    """"b_k3x9q2mf" style, like emailDoc.newId."""
    alphabet = string.ascii_lowercase + string.digits
    return f"{prefix}_" + "".join(secrets.choice(alphabet) for _ in range(8))


def with_ids(section: dict[str, Any]) -> dict[str, Any]:
    """A section input with ids on itself, its columns and its blocks (kept where given)."""
    out = copy.deepcopy(section)
    out["id"] = str(out.get("id") or new_id("s"))
    for col in out.get("columns") or []:
        col["id"] = str(col.get("id") or new_id("c"))
        for b in col.get("blocks") or []:
            b["id"] = str(b.get("id") or new_id("b"))
    return out


# --- reading a doc ------------------------------------------------------------------


def sections(doc: dict[str, Any] | None) -> list[dict[str, Any]]:
    return [s for s in ((doc or {}).get("sections") or []) if isinstance(s, dict)]


def all_blocks(doc: dict[str, Any] | None) -> list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]]:
    """(block, column, section) for every block, top to bottom."""
    out = []
    for s in sections(doc):
        for c in s.get("columns") or []:
            for b in c.get("blocks") or []:
                if isinstance(b, dict):
                    out.append((b, c, s))
    return out


def find_block(doc: dict[str, Any] | None, block_id: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    return next((x for x in all_blocks(doc) if x[0].get("id") == block_id), None)


def personal_blocks(doc: dict[str, Any] | None) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """(block, section) for the taste slots: blocks marked personal whose type can be rewritten."""
    return [(b, s) for b, _, s in all_blocks(doc) if b.get("personal") and b.get("type") in PERSONAL_FIELDS]


def is_footer(section: dict[str, Any]) -> bool:
    return any(b.get("type") == "footer" for c in section.get("columns") or [] for b in c.get("blocks") or [] if isinstance(b, dict))


def footer_section(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    found = [s for s in sections(doc) if is_footer(s)]
    return found[-1] if found else None


def is_chrome(section: dict[str, Any]) -> bool:
    """Header and footer sections: logo, social, spacing and the footer only. They need no evidence."""
    kinds = {b.get("type") for c in section.get("columns") or [] for b in c.get("blocks") or [] if isinstance(b, dict)}
    return bool(kinds) and kinds <= {"logo", "social", "spacer", "divider", "footer"}


def insert_point(doc: dict[str, Any] | None) -> str:
    """Where a new section goes by default: after the last section above the footer, or "start"."""
    secs = sections(doc)
    foot = footer_section(doc)
    if foot is None:
        return secs[-1]["id"] if secs else "start"
    i = secs.index(foot)
    return secs[i - 1]["id"] if i > 0 else "start"


def doc_links(doc: dict[str, Any] | None) -> set[str]:
    out: set[str] = set()
    for b, _, _ in all_blocks(doc):
        for key in ("href",):
            if isinstance(b.get(key), str):
                out.add(b[key])
        if b.get("type") == "text":
            out.update(_HREF.findall(str(b.get("html") or "")))
        if b.get("type") == "heading":
            out.update(_HREF.findall(str(b.get("text") or "")))
        if b.get("type") == "social":
            out.update(str(link.get("url")) for link in b.get("links") or [] if isinstance(link, dict) and link.get("url"))
    return {u for u in out if not is_placeholder(u)}


def doc_images(doc: dict[str, Any] | None) -> set[str]:
    out: set[str] = set()
    for b, _, s in all_blocks(doc):
        for key in ("src", "thumbnail", "avatar"):
            if isinstance(b.get(key), str) and b[key].startswith("http"):
                out.add(b[key])
        if isinstance(s.get("backgroundImage"), str):
            out.add(s["backgroundImage"])
    return out


def is_placeholder(url: str) -> bool:
    u = (url or "").strip()
    if not u or u == "#" or u.startswith("#"):
        return True
    host = (urlparse(u).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in PLACEHOLDER_HOSTS)


# --- text ---------------------------------------------------------------------------


def visible(text: str) -> str:
    """The words a reader sees: tags dropped, merge tags shown as their fallback or example."""
    t = _MERGE.sub(lambda m: (m.group(2) if m.group(2) is not None else MERGE_TAGS.get(m.group(1).lower(), "")), str(text or ""))
    t = _TAG.sub(" ", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&")
    return " ".join(t.split())


def clean_dashes(text: str) -> tuple[str, bool]:
    """Em and en dashes in the copy become commas (or "to" in ranges); tags are left alone."""
    changed = False

    def fix(seg: str) -> str:
        nonlocal changed
        if seg.startswith("<") or not re.search("[–—]", seg):
            return seg
        changed = True
        seg = re.sub(r"(?<=\d)\s*–\s*(?=\d)", " to ", seg)
        return re.sub(r"\s*[–—]\s*", ", ", seg)

    out = "".join(fix(p) for p in re.split(r"(<[^>]+>)", str(text or "")))
    return out, changed


def merge_problems(text: str) -> tuple[list[str], list[str]]:
    problems, warnings = [], []
    for m in _MERGE.finditer(str(text or "")):
        key = m.group(1).lower()
        if key not in MERGE_TAGS:
            problems.append(f"unknown merge tag {{{{{m.group(1)}}}}}; use one of {', '.join(MERGE_TAGS)}")
        elif m.group(2) is None and key in ("first_name", "last_name", "name", "city"):
            warnings.append(f"{{{{{key}}}}} has no fallback; write {{{{{key}|...}}}}")
    return problems, warnings


def urls_in(text: str) -> list[str]:
    return [u.rstrip(".,;:") for u in _URL.findall(str(text or ""))]


def norm_url(url: str) -> str:
    p = urlparse(str(url or "").strip())
    path = p.path.rstrip("/")
    return f"{(p.scheme or 'https').lower()}://{(p.netloc or '').lower()}{path}"


def strip_tags(html: str, allowed: tuple[str, ...]) -> str:
    """Keeps only `allowed` tags (attributes dropped except href on links); the rest become their text."""

    def keep(m: re.Match[str]) -> str:
        tag = m.group(0)
        name = re.match(r"</?\s*([a-zA-Z0-9]+)", tag)
        if not name or name.group(1).lower() not in allowed:
            return ""
        n = name.group(1).lower()
        if tag.startswith("</"):
            return f"</{n}>"
        if n == "a":
            href = _HREF.search(tag)
            return f'<a href="{href.group(1)}">' if href else "<a>"
        return f"<{n}>" if not tag.endswith("/>") else f"<{n} />"

    html = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?</\1\s*>", "", str(html or ""), flags=re.I)
    return re.sub(r"<[^>]*>", keep, html)


INLINE_TAGS = ("b", "strong", "i", "em", "u", "a", "br", "span")
RICH_TAGS = INLINE_TAGS + ("p", "ul", "ol", "li")


def clip(text: str, n: int) -> str:
    t = str(text or "").strip()
    if len(visible(t)) <= n:
        return t
    plain = visible(t)
    cut = plain[: n - 1].rsplit(" ", 1)[0].rstrip(",;: ")
    return cut + "…" if cut else plain[:n]


# --- defaults -----------------------------------------------------------------------


def reasons_dict(reasons: list[Any]) -> dict[str, str]:
    """Reasons written as [{itemId, reason}] (what a JSON schema can express), keyed by id as the doc keeps them."""
    return {str(r.get("itemId") or r.get("id")): str(r.get("reason") or "") for r in reasons if isinstance(r, dict) and (r.get("itemId") or r.get("id"))}


def fill_block(raw: dict[str, Any], *, socials: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """A block with the contract's required fields filled with sensible defaults."""
    b = {k: v for k, v in (raw or {}).items() if v is not None}
    t = b.get("type")
    for k, v in DEFAULTS.get(str(t), {}).items():
        b.setdefault(k, copy.deepcopy(v))
    if t == "heading":
        try:
            b["level"] = max(1, min(3, int(b.get("level") or 2)))
        except (TypeError, ValueError):
            b["level"] = 2
    if t == "items":
        ids = [str(i) for i in b.get("itemIds") or [] if i]
        b["itemIds"] = ids
        b["show"] = {**ITEMS_SHOW, **(b.get("show") if isinstance(b.get("show"), dict) else {})}
        b.setdefault("count", len(ids) or 3)
        b.setdefault("columns", max(1, min(3, int(b["count"]) if str(b["count"]).isdigit() else 3)))
        if isinstance(b.get("reasons"), list):
            b["reasons"] = reasons_dict(b["reasons"])
    if t == "social" and not b.get("links") and socials:
        b["links"] = [dict(s) for s in socials]
    return b


def fill_section(raw: dict[str, Any], *, socials: list[dict[str, str]] | None = None) -> dict[str, Any]:
    s = {k: v for k, v in (raw or {}).items() if v is not None}
    cols = [c for c in s.get("columns") or [] if isinstance(c, dict)]
    if not cols and isinstance(s.get("blocks"), list):
        # A one-column section written without the column wrapper.
        cols = [{"width": 1, "blocks": s.pop("blocks")}]
    given = [float(c["width"]) for c in cols if isinstance(c.get("width"), (int, float)) and c["width"] > 0]
    missing = [c for c in cols if not (isinstance(c.get("width"), (int, float)) and c["width"] > 0)]
    rest = max(0.0, 1.0 - sum(given))
    for c in missing:
        c["width"] = rest / len(missing) if rest > 0 else 1 / len(cols)
    total = sum(float(c["width"]) for c in cols) or 1.0
    for c in cols:
        c["width"] = round(float(c["width"]) / total, 4)
        c["blocks"] = [fill_block(b, socials=socials) for b in c.get("blocks") or [] if isinstance(b, dict)]
    s["columns"] = cols
    return s


# --- the outline the model reads ---------------------------------------------------------


def _short(text: Any, n: int = 70) -> str:
    v = visible(str(text or ""))
    return v if len(v) <= n else v[: n - 1].rstrip() + "…"


def block_line(b: dict[str, Any], items: dict[str, dict[str, Any]] | None = None, *, n: int = 70) -> str:
    t = b.get("type")
    head = f"{b.get('id')} {t}"
    mark = " (personal)" if b.get("personal") else ""
    if t == "heading":
        return f'{head} h{b.get("level", 2)} "{_short(b.get("text"), n)}"{mark}'
    if t == "text":
        return f'{head} "{_short(b.get("html"), n)}"{mark}'
    if t == "image":
        return f'{head} "{_short(b.get("alt"), 40)}"' + (" (placeholder src)" if not str(b.get("src") or "").startswith("http") else "") + mark
    if t == "button":
        href = str(b.get("href") or "")
        return f'{head} "{b.get("label")}" -> {href if not is_placeholder(href) else href + " (placeholder link)"}{" outline" if b.get("variant") == "outline" else ""}{mark}'
    if t == "items":
        ids = b.get("itemIds") or []
        names = [(items or {}).get(i, {}).get("name") or i for i in ids]
        return f"{head} {b.get('pick', 'manual')} x{b.get('count', len(ids))} [{', '.join(str(x) for x in names)}]{mark}"
    if t == "quote":
        return f'{head} "{_short(b.get("text"), 50)}"' + (f" by {b.get('author')}" if b.get("author") else "") + mark
    if t == "coupon":
        return f'{head} {b.get("code")} "{_short(b.get("label"), 40)}"{mark}'
    if t == "social":
        return f"{head} {', '.join(str(x.get('network')) for x in b.get('links') or [] if isinstance(x, dict))}"
    if t == "footer":
        return f"{head} (address, unsubscribe)"
    return head + mark


def outline(doc: dict[str, Any] | None, items: dict[str, dict[str, Any]] | None = None, *, n: int = 70) -> str:
    """The email as the model reads it: subject, preheader, then every section with its ids."""
    if not doc:
        return "(no email yet)"
    subj, pre = str(doc.get("subject") or ""), str(doc.get("preheader") or "")
    lines = [f'subject "{subj}" ({len(visible(subj))} chars) · preheader "{pre}" ({len(visible(pre))} chars)']
    for i, s in enumerate(sections(doc), 1):
        bits = [f'{i}. {s.get("id")} "{s.get("label") or "Section"}"']
        if s.get("background"):
            bits.append(f"bg {s['background']}")
        if s.get("evidence"):
            bits.append(f'evidence: "{_short(s["evidence"], 110)}"')
        lines.append(" ".join(bits))
        for c in s.get("columns") or []:
            blocks = " · ".join(block_line(b, items, n=n) for b in c.get("blocks") or [] if isinstance(b, dict)) or "(empty)"
            lines.append(f"   {c.get('id')} ({round(float(c.get('width') or 1) * 100)}%): {blocks}")
    return "\n".join(lines)


# --- checks -------------------------------------------------------------------------


@dataclass
class Checker:
    """What the agent may put in the email: catalog ids, known images, known links."""

    items: dict[str, dict[str, Any]]
    images: set[str] = field(default_factory=set)
    links: set[str] = field(default_factory=set)
    # The brand's own site: its root (and a path prefix for sites living under one) is always fine.
    site: str | None = None
    audience_kind: str | None = None
    # What the brief, the merchant's messages, the brand and the catalog say; offers and policies must come from it.
    facts: str | None = None

    def __post_init__(self) -> None:
        self._links = {norm_url(u) for u in self.links if u and not is_placeholder(u)}
        if self.site:
            self._links.add(norm_url(self.site))
            p = urlparse(self.site)
            self._links.add(norm_url(f"{p.scheme}://{p.netloc}/"))
        self._images = {u for u in self.images if u}

    def link_ok(self, href: str) -> bool:
        h = str(href or "").strip()
        if h.startswith("mailto:") or _MERGE.fullmatch(h):
            return True
        if not h.startswith(("http://", "https://")) or is_placeholder(h):
            return False
        return norm_url(h) in self._links

    def image_ok(self, src: str) -> bool:
        return str(src or "") in self._images

    def check_text(self, label: str, text: str, out: tuple[list[str], list[str]]) -> None:
        problems, warnings = out
        v = visible(text)
        if BANNED.search(v):
            problems.append(f"{label}: bestseller/trending/popular framing; taste picks are additive, rewrite it")
        if "!" in v:
            warnings.append(f"{label}: exclamation mark; drop it unless the brand's voice uses them")
        if self.facts is not None:
            facts = self.facts.lower()
            for pattern, words, what in CLAIMS:
                if pattern.search(v) and not any(w in facts for w in words):
                    problems.append(f"{label}: promises {what}, which nothing the merchant or the brand gave you says; take it out (never promise offers or policies from memory)")
        p, w = merge_problems(text)
        problems += [f"{label}: {x}" for x in p]
        warnings += [f"{label}: {x}" for x in w]

    def check_block(self, b: dict[str, Any], *, only: set[str] | None = None, where: str = "") -> tuple[list[str], list[str]]:
        """Problems (blocking) and warnings for one block; `only` limits the checks to fields being set."""
        problems: list[str] = []
        warnings: list[str] = []
        out = (problems, warnings)
        t = b.get("type")
        label = f"{where}{t} {b.get('id') or ''}".strip()

        def has(k: str) -> bool:
            return only is None or k in only

        if t not in BLOCK_TYPES:
            return [f"{label}: unknown block type {t!r}; use one of {', '.join(BLOCK_TYPES)}"], []
        for k in REQUIRED.get(str(t), ()):
            if has(k) and not b.get(k):
                problems.append(f"{label}: {k} is required")
        if t == "heading" and has("text"):
            self.check_text(label, str(b.get("text") or ""), out)
            if len(visible(b.get("text") or "")) > 90:
                warnings.append(f"{label}: headline is {len(visible(b.get('text') or ''))} characters; keep headlines short")
        if t == "text" and has("html"):
            html = str(b.get("html") or "")
            self.check_text(label, html, out)
            for href in _HREF.findall(html):
                if not self.link_ok(href):
                    problems.append(f"{label}: link {href} is not a real link you were given (the brand's site, an item's url or one the merchant named)")
        if t in ("image", "video") and (has("src") or has("thumbnail")):
            src = str(b.get("src") or b.get("thumbnail") or "")
            if src and not self.image_ok(src):
                problems.append(f"{label}: image {src[:90]} is not from search_images, an item, the brand or the merchant; never invent image URLs")
        if t in ("image", "video") and has("alt") and not str(b.get("alt") or "").strip():
            problems.append(f"{label}: alt text is required")
        if t in ("image", "button", "logo", "video") and has("href") and b.get("href"):
            if not self.link_ok(str(b["href"])):
                problems.append(f"{label}: link {b['href']} is not a real link you were given (the brand's site, an item's url or one the merchant named)")
        if t == "button" and has("label"):
            self.check_text(label, str(b.get("label") or ""), out)
            if len(str(b.get("label") or "")) > 32:
                warnings.append(f"{label}: button label is long; 2 to 4 words")
        if t == "quote" and has("text"):
            self.check_text(label, str(b.get("text") or ""), out)
        if t == "items":
            if has("itemIds"):
                unknown = [i for i in b.get("itemIds") or [] if i not in self.items]
                if unknown:
                    problems.append(f"{label}: unknown item ids {', '.join(map(str, unknown[:5]))}; use ids from pick_items or list_items")
            if has("reasons"):
                for iid, why in (b.get("reasons") or {}).items():
                    self.check_text(f"{label} reason for {iid}", str(why), out)
        if t == "social" and has("links"):
            for link in b.get("links") or []:
                if not isinstance(link, dict) or link.get("network") not in NETWORKS:
                    problems.append(f"{label}: social links are {{network, url}} with network one of {', '.join(NETWORKS)}")
                    break
                if not self.link_ok(str(link.get("url") or "")):
                    problems.append(f"{label}: {link.get('url')} is not one of the brand's own links")
        if b.get("personal") and self.audience_kind != "people" and (only is None or "personal" in only):
            warnings.append(f"{label}: personal is ignored unless the campaign goes to a customer list one by one")
        if b.get("personal") and t not in PERSONAL_FIELDS:
            warnings.append(f"{label}: only heading, text, image, button, items and quote blocks can be personal")
        return problems, warnings

    def check_section(self, s: dict[str, Any], *, where: str = "") -> tuple[list[str], list[str]]:
        problems: list[str] = []
        warnings: list[str] = []
        name = f'{where}section "{s.get("label") or s.get("id") or "new"}"'
        if is_footer(s):
            problems.append(f"{name}: the email already has its footer (address and unsubscribe); edit that one instead of adding another")
        cols = s.get("columns") or []
        if not cols or not any(c.get("blocks") for c in cols):
            problems.append(f"{name}: a section needs at least one column with blocks")
        if len(cols) > 3:
            problems.append(f"{name}: at most 3 columns")
        for c in cols:
            for b in c.get("blocks") or []:
                p, w = self.check_block(b, where=f"{name} ")
                problems += p
                warnings += w
        if not is_chrome(s) and not str(s.get("evidence") or "").strip():
            warnings.append(f"{name}: add evidence (the taste signal or brief behind it)")
        if s.get("background") and s["background"] not in COLOR_TOKENS and not re.fullmatch(r"#[0-9a-fA-F]{6}", str(s["background"])):
            problems.append(f"{name}: background is a theme token ({', '.join(COLOR_TOKENS)}) or a #rrggbb hex")
        if s.get("backgroundImage") and not self.image_ok(str(s["backgroundImage"])):
            problems.append(f"{name}: backgroundImage is not from search_images, an item or the brand")
        return problems, warnings


def check_subject(subject: str | None, preheader: str | None) -> tuple[list[str], list[str]]:
    problems: list[str] = []
    warnings: list[str] = []
    if subject is not None:
        n = len(visible(subject))
        if not subject.strip():
            problems.append("subject is empty")
        elif n > SUBJECT_MAX:
            problems.append(f"subject is {n} characters; keep it to {SUBJECT_MAX} or fewer so phones show all of it")
        if BANNED.search(visible(subject)):
            problems.append("subject: bestseller/trending/popular framing; rewrite it")
        if _MERGE.match(subject.strip()):
            warnings.append("the subject opens with a merge tag; when the name is missing the fallback leads it, so move the name later or drop it")
        p, w = merge_problems(subject)
        problems += p
        warnings += w
    if preheader is not None:
        n = len(visible(preheader))
        if n and not PREHEADER_MIN <= n <= PREHEADER_MAX:
            warnings.append(f"preheader is {n} characters; aim for {PREHEADER_MIN} to {PREHEADER_MAX}")
        if subject and preheader and visible(preheader).lower().startswith(visible(subject).lower()[:20]):
            warnings.append("the preheader repeats the subject; make it add to it")
        p, _ = merge_problems(preheader)
        problems += p
    return problems, warnings


def clean_copy_fields(block: dict[str, Any]) -> bool:
    """Dashes out of a block's copy, in place. True when something changed."""
    changed = False
    for k in ("text", "html", "label", "author", "note"):
        if isinstance(block.get(k), str):
            block[k], c = clean_dashes(block[k])
            changed |= c
    if isinstance(block.get("reasons"), dict):
        for iid, why in list(block["reasons"].items()):
            block["reasons"][iid], c = clean_dashes(str(why))
            changed |= c
    return changed


def prepare_ops(
    doc: dict[str, Any],
    ops: list[Any],
    checker: Checker,
    *,
    socials: list[dict[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """(ops with ids and defaults, problems, warnings). Any problem means nothing is sent."""
    problems: list[str] = []
    warnings: list[str] = []
    out: list[dict[str, Any]] = []
    by_block = {b.get("id"): (b, s) for b, _, s in all_blocks(doc)}
    by_col = {c.get("id"): s for s in sections(doc) for c in s.get("columns") or []}
    by_sec = {s.get("id"): s for s in sections(doc)}
    foot = footer_section(doc)
    dashed = False
    sec_ids = ", ".join(str(k) for k in by_sec)

    def no_section(where: str, sid: Any) -> str:
        return f"{where}: no section {sid!r}; section ids are {sec_ids} (a block or column id is not a section id)"

    for i, op in enumerate(ops or []):
        where = f"ops[{i}]"
        if not isinstance(op, dict) or op.get("op") not in OPS:
            problems.append(f"{where}: each op is an object with op one of {', '.join(OPS)}")
            continue
        op = copy.deepcopy(op)
        kind = op["op"]
        if kind == "update_block":
            found = by_block.get(op.get("id"))
            if not found or not isinstance(op.get("set"), dict):
                problems.append(f"{where}: update_block needs an existing block id and a set object" + ("" if found else f" (no block {op.get('id')})"))
                continue
            block, _ = found
            for k in ("id", "type"):
                op["set"].pop(k, None)
            if isinstance(op["set"].get("reasons"), list):
                op["set"]["reasons"] = reasons_dict(op["set"]["reasons"])
            dashed |= clean_copy_fields(op["set"])
            if block.get("personal") and op["set"].get("personal") is False and checker.audience_kind == "people":
                warnings.append(f"{where}: {block.get('id')} is no longer a taste slot, so it will read the same for everyone; keep personal: true unless the merchant asked")
            merged = {**block, **op["set"]}
            p, w = checker.check_block(merged, only=set(op["set"]), where=f"{where} ")
            problems += p
            warnings += w
        elif kind == "insert_block":
            if op.get("columnId") not in by_col or not isinstance(op.get("block"), dict):
                problems.append(f"{where}: insert_block needs an existing columnId and a block")
                continue
            if op["block"].get("type") == "footer":
                problems.append(f"{where}: the email already has a footer")
                continue
            op["block"] = fill_block(op["block"], socials=socials)
            op["block"]["id"] = str(op["block"].get("id") or new_id("b"))
            dashed |= clean_copy_fields(op["block"])
            p, w = checker.check_block(op["block"], where=f"{where} ")
            problems += p
            warnings += w
        elif kind == "remove_block":
            found = by_block.get(op.get("id"))
            if not found:
                problems.append(f"{where}: no block {op.get('id')}")
            elif found[0].get("type") == "footer":
                problems.append(f"{where}: the footer (address and unsubscribe) must stay")
        elif kind == "move_block":
            if op.get("id") not in by_block or op.get("columnId") not in by_col:
                problems.append(f"{where}: move_block needs an existing block id and columnId")
            op["index"] = int(op.get("index") or 0)
        elif kind == "update_section":
            if op.get("id") not in by_sec or not isinstance(op.get("set"), dict):
                problems.append(no_section(where, op.get("id")) if op.get("id") not in by_sec else f"{where}: update_section needs a set object")
                continue
            op["set"].pop("id", None)
            op["set"].pop("columns", None)
            if op["set"].get("backgroundImage") and not checker.image_ok(str(op["set"]["backgroundImage"])):
                problems.append(f"{where}: backgroundImage is not from search_images, an item or the brand")
        elif kind == "insert_section":
            if not isinstance(op.get("section"), dict):
                problems.append(f"{where}: insert_section needs a section")
                continue
            after = op.get("after")
            if after not in (None, "", "start") and after not in by_sec:
                problems.append(no_section(where, after))
                continue
            if after in (None, ""):
                op["after"] = insert_point(doc)
            sec = with_ids(fill_section(op["section"], socials=socials))
            for c in sec["columns"]:
                for b in c["blocks"]:
                    dashed |= clean_copy_fields(b)
            p, w = checker.check_section(sec, where=f"{where} ")
            problems += p
            warnings += w
            op["section"] = sec
        elif kind == "remove_section":
            if op.get("id") not in by_sec:
                problems.append(no_section(where, op.get("id")))
            elif foot is not None and op.get("id") == foot.get("id"):
                problems.append(f"{where}: the footer section must stay")
        elif kind == "move_section":
            if op.get("id") not in by_sec:
                problems.append(no_section(where, op.get("id")))
            op["index"] = int(op.get("index") or 0)
        elif kind == "set_columns":
            sec = by_sec.get(op.get("sectionId"))
            if sec is None or not isinstance(op.get("columns"), list):
                problems.append(no_section(where, op.get("sectionId")) if sec is None else f"{where}: set_columns needs columns")
                continue
            filled = fill_section({"columns": op["columns"]}, socials=socials)
            for c in filled["columns"]:
                c["id"] = str(c.get("id") or new_id("c"))
                for b in c["blocks"]:
                    b["id"] = str(b.get("id") or new_id("b"))
                    known = by_block.get(b["id"])
                    if known:
                        # A block carried over by id keeps its content; only new fields are checked.
                        continue
                    dashed |= clean_copy_fields(b)
                    p, w = checker.check_block(b, where=f"{where} ")
                    problems += p
                    warnings += w
            op["columns"] = filled["columns"]
        elif kind == "update_column":
            if op.get("id") not in by_col or not isinstance(op.get("set"), dict):
                problems.append(f"{where}: update_column needs an existing column id and a set object")
                continue
            op["set"].pop("id", None)
            op["set"].pop("blocks", None)
        elif kind == "set_subject":
            for k in ("subject", "preheader"):
                if isinstance(op.get(k), str):
                    op[k], c = clean_dashes(op[k])
                    dashed |= c
            p, w = check_subject(op.get("subject"), op.get("preheader"))
            problems += [f"{where}: {x}" for x in p]
            warnings += w
        elif kind == "set_theme":
            if not isinstance(op.get("set"), dict):
                problems.append(f"{where}: set_theme needs a set object")
        out.append(op)
    if dashed:
        warnings.append("em/en dashes in the copy were replaced with commas; write without them")
    return out, problems, warnings


# --- personalisation ---------------------------------------------------------------------


@dataclass
class Allowed:
    """What one person's version may use: their ranked items and the links and images that come with them."""

    item_ids: list[str]
    images: set[str]
    links: set[str]
    reasons: dict[str, str] = field(default_factory=dict)


def clean_personalization(raw: dict[str, Any], doc: dict[str, Any], allowed: Allowed) -> tuple[dict[str, Any], list[str]]:
    """A Personalization limited to the personal blocks and the fields each type may change,
    with lengths clipped, unknown ids, links and images dropped. Returns (personalization, notes)."""
    notes: list[str] = []
    slots = {b.get("id"): b for b, _ in personal_blocks(doc)}
    links = {norm_url(u) for u in allowed.links}
    out: dict[str, Any] = {"blocks": {}}
    for key, limit in (("subject", 60), ("preheader", 110)):
        v = raw.get(key)
        if isinstance(v, str) and v.strip():
            v = _known_merge(clean_dashes(v)[0])
            if BANNED.search(visible(v)):
                notes.append(f"{key} dropped (bestseller framing)")
            else:
                out[key] = clip(v, limit)
    entries = raw.get("blocks") or []
    if isinstance(entries, dict):
        entries = [{"id": k, **(v if isinstance(v, dict) else {})} for k, v in entries.items()]
    for e in entries:
        if not isinstance(e, dict):
            continue
        bid = str(e.get("id") or "")
        base = slots.get(bid)
        if base is None:
            notes.append(f"dropped unknown block {bid or '?'}")
            continue
        t = base.get("type")
        fields: dict[str, Any] = {}
        if t == "heading" and _str(e.get("text")):
            fields["text"] = clip(strip_tags(_known_merge(clean_dashes(e["text"])[0]), INLINE_TAGS), 120)
        elif t == "text" and _str(e.get("html")):
            html = strip_tags(_known_merge(clean_dashes(e["html"])[0]), RICH_TAGS)
            html = re.sub(r"""<a href="([^"]+)">""", lambda m: m.group(0) if norm_url(m.group(1)) in links else "<a>", html)
            if len(visible(html)) > 700:
                html = f"<p>{clip(visible(html), 700)}</p>"
            fields["html"] = html if html.lstrip().startswith("<") else f"<p>{html}</p>"
        elif t == "image":
            if _str(e.get("src")) and e["src"] in allowed.images:
                fields["src"] = e["src"]
            elif _str(e.get("src")):
                notes.append(f"{bid}: image not from their picks, kept the base one")
            if _str(e.get("alt")) and ("src" in fields or not _str(e.get("src"))):
                fields["alt"] = clip(visible(e["alt"]), 160)
        elif t == "button":
            if _str(e.get("label")):
                fields["label"] = clip(visible(clean_dashes(e["label"])[0]), 40)
            if _str(e.get("href")):
                if norm_url(e["href"]) in links:
                    fields["href"] = e["href"]
                else:
                    notes.append(f"{bid}: link not allowed, kept the base one")
        elif t == "items":
            count = int(base.get("count") or len(base.get("itemIds") or []) or 3)
            picks: list[str] = []
            for iid in e.get("itemIds") or []:
                if isinstance(iid, str) and iid in allowed.item_ids and iid not in picks:
                    picks.append(iid)
            # Top up from the ranking so the block is never short.
            for iid in allowed.item_ids:
                if len(picks) >= count:
                    break
                if iid not in picks:
                    picks.append(iid)
            picks = picks[:count]
            if picks:
                fields["itemIds"] = picks
                given = e.get("reasons") or {}
                if isinstance(given, list):
                    given = reasons_dict(given)
                reasons = {}
                for iid in picks:
                    why = given.get(iid) if isinstance(given, dict) else None
                    why = why if _str(why) and not BANNED.search(str(why)) else allowed.reasons.get(iid)
                    if _str(why):
                        reasons[iid] = clip(visible(clean_dashes(str(why))[0]), 100)
                if reasons:
                    fields["reasons"] = reasons
        elif t == "quote":
            if _str(e.get("text")):
                fields["text"] = clip(visible(clean_dashes(e["text"])[0]), 320)
            if _str(e.get("author")):
                fields["author"] = clip(visible(e["author"]), 60)
        for k, v in list(fields.items()):
            if isinstance(v, str) and BANNED.search(visible(v)):
                notes.append(f"{bid}.{k} dropped (bestseller framing)")
                fields.pop(k)
        if fields:
            out["blocks"][bid] = fields
    why = raw.get("why")
    if _str(why):
        out["why"] = clip(visible(clean_dashes(str(why))[0]), 320)
    return out, notes


def _str(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip())


def _known_merge(text: str) -> str:
    """Unknown merge tags would print as braces; drop them."""
    return _MERGE.sub(lambda m: m.group(0) if m.group(1).lower() in MERGE_TAGS else "", text)
