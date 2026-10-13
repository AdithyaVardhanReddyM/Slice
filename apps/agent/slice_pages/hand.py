"""The merchant's hand edits (the console's visual editor), as the builder sees them.

Mirrors `HandEdits` in packages/backend/convex/pagesTypes.ts. Elements the merchant
touched carry `data-pg-id="<id>"` in the html; `doc["hand"]["elements"][id]` records
what they set (styles per screen, motion, and the text, picture or link they chose),
and `doc["hand"]["changes"]` lists structural changes in plain words. The web app
renders the hand styles after the page CSS with !important, so they always win.

The builder must keep these edits: `hand_block` tells it what they are, `guard` finds
the ones a write or edit would undo, `release` hands content back to the builder when
it overrides them on purpose, and `apply_entry` changes the hand styles themselves
when the merchant asks.
"""

from __future__ import annotations

import re
import time
from html.parser import HTMLParser
from typing import Any

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
# Start tags that close an open element of these kinds first (a simplified HTML tree builder).
_CLOSES = {
    "li": {"li"},
    "dt": {"dt", "dd"},
    "dd": {"dt", "dd"},
    "option": {"option"},
    "tr": {"tr", "td", "th"},
    "td": {"td", "th"},
    "th": {"td", "th"},
}
_BLOCKS = {
    "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "menu", "nav", "ol", "p",
    "pre", "section", "table", "ul",
}
CONTENT_MARKS = ("text", "src", "href")
SCREENS = {"all": "style", "phone": "phone", "hover": "hover"}
STYLE_KEYS = ("style", "phone", "hover", "motion")
MAX_LISTED = 40
MAX_CHANGES = 15

HAND_ID = re.compile(r"^[a-z0-9-]{2,24}$")
CSS_PROP = re.compile(r"^(--)?[a-z][a-z0-9-]*$")
BAD_VALUE = re.compile(r"""[{};<>]|javascript:|expression\s*\(|url\s*\(\s*["']?\s*(?!https?:|data:image/)""", re.I)

KEEP_NOTE = (
    "These are the merchant's own hand edits: keep each element with its data-pg-id, and keep their words, "
    "pictures and links. Only if the merchant asked in this turn to change one of them, call again with "
    "override_hand_edits=true."
)


def collapse(text: str | None) -> str:
    return " ".join((text or "").split())


def _clip(text: Any, n: int) -> str:
    s = collapse(str(text or ""))
    return s if len(s) <= n else s[: n - 3].rstrip() + "..."


class _Facts(HTMLParser):
    """Every element with data-pg-id: tag, visible text, src, href, section and its span in the html."""

    def __init__(self, html: str) -> None:
        super().__init__(convert_charrefs=True)
        self.html = html
        self._lines = [0] + [m.end() for m in re.finditer("\n", html)]
        self.facts: dict[str, dict[str, Any]] = {}
        # Open elements: (tag, pg id or None, section).
        self._stack: list[tuple[str, str | None, str | None]] = []
        self._text: dict[str, list[str]] = {}
        self._skip = 0

    def _at(self) -> int:
        line, col = self.getpos()
        return self._lines[line - 1] + col if line - 1 < len(self._lines) else len(self.html)

    def _close(self, frame: tuple[str, str | None, str | None], end: int) -> None:
        tag, pid, _ = frame
        if tag in ("script", "style", "template"):
            self._skip = max(0, self._skip - 1)
        if pid and pid in self._text:
            self.facts[pid]["text"] = collapse("".join(self._text.pop(pid)))
            self.facts[pid]["span"] = (self.facts[pid]["span"][0], end)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        start = self._at()
        closes = _CLOSES.get(tag) or set()
        if tag in _BLOCKS:
            closes = closes | {"p"}
        while self._stack and self._stack[-1][0] in closes:
            self._close(self._stack.pop(), start)
        a = {k: (v or "") for k, v in attrs}
        section = a.get("data-section") or (self._stack[-1][2] if self._stack else None)
        pid = a.get("data-pg-id") or None
        if pid and pid in self.facts:
            pid = None  # a second element with the same id: the first one counts
        if pid:
            end = start + len(self.get_starttag_text() or "")
            self.facts[pid] = {"tag": tag, "text": "", "src": a.get("src"), "href": a.get("href"), "section": section, "span": (start, end)}
        if tag in VOID:
            return
        if tag in ("script", "style", "template"):
            self._skip += 1
        if pid:
            self._text[pid] = []
        self._stack.append((tag, pid, section))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID or not any(f[0] == tag for f in self._stack):
            return
        start = self._at()
        gt = self.html.find(">", start)
        end = gt + 1 if gt >= 0 else len(self.html)
        while self._stack:
            frame = self._stack.pop()
            self._close(frame, end if frame[0] == tag else start)
            if frame[0] == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        for _, pid, _ in self._stack:
            if pid and pid in self._text:
                self._text[pid].append(data)

    def finish(self) -> dict[str, dict[str, Any]]:
        while self._stack:
            self._close(self._stack.pop(), len(self.html))
        return self.facts


def element_facts(html: str) -> dict[str, dict[str, Any]]:
    """By data-pg-id, in page order: {tag, text (visible, whitespace-collapsed), src, href,
    section (the nearest data-section, or its own), span (start, end offsets in the html)}."""
    p = _Facts(html or "")
    try:
        p.feed(html or "")
        p.close()
    except Exception:
        pass
    return p.finish()


# --- reading the hand edits -------------------------------------------------------------


def _hand(doc: Any) -> dict[str, Any]:
    h = doc.get("hand") if isinstance(doc, dict) else None
    return h if isinstance(h, dict) else {}


def _elements(doc: Any) -> dict[str, dict[str, Any]]:
    els = _hand(doc).get("elements")
    return {k: v for k, v in els.items() if isinstance(v, dict)} if isinstance(els, dict) else {}


def _changes(doc: Any) -> list[str]:
    out = []
    for c in _hand(doc).get("changes") or []:
        text = c.get("text") if isinstance(c, dict) else c
        if isinstance(text, str) and text.strip():
            out.append(collapse(text))
    return out


def has_edits(doc: Any) -> bool:
    return bool(_elements(doc) or _changes(doc))


def count_elements(doc: Any) -> int:
    """Hand-edited elements still on the page."""
    els = _elements(doc)
    if not els:
        return 0
    facts = element_facts((doc or {}).get("html") or "")
    return sum(1 for i in els if i in facts)


def _label(rec: dict[str, Any], pid: str) -> str:
    return _clip(rec.get("label"), 80) or f"Element {pid}"


def _decls(d: Any, n: int = 12) -> str:
    if not isinstance(d, dict) or not d:
        return ""
    items = [f"{k} {_clip(v, 60)}" for k, v in list(d.items())[:n]]
    more = len(d) - n
    return ", ".join(items) + (f" and {more} more" if more > 0 else "")


def _motion(m: Any) -> list[str]:
    if not isinstance(m, dict):
        return []
    out = []
    if m.get("enter"):
        bits = [f"{m.get('duration')}ms" if m.get("duration") is not None else "", f"{m.get('delay')}ms delay" if m.get("delay") else "", str(m.get("easing") or "")]
        detail = ", ".join(b for b in bits if b)
        out.append(f"entrance {m['enter']}{' on scroll' if m.get('trigger') == 'scroll' else ' on load' if m.get('trigger') == 'load' else ''}{f' ({_clip(detail, 80)})' if detail else ''}")
    if m.get("hoverEffect"):
        out.append(f"hover effect {m['hoverEffect']}")
    return out


def _element_line(pid: str, rec: dict[str, Any], fact: dict[str, Any]) -> str:
    where = f"<{fact.get('tag')}>" + (f", section {fact['section']}" if fact.get("section") else "")
    parts = []
    if isinstance(rec.get("text"), str):
        parts.append(f'text set by them, word for word "{_clip(rec["text"], 200)}"')
    if isinstance(rec.get("src"), str):
        parts.append(f"picture set by them: {_clip(rec['src'], 110)}")
    if isinstance(rec.get("href"), str):
        parts.append(f"link set by them: {_clip(rec['href'], 110)}")
    if _decls(rec.get("style")):
        parts.append(f"their style: {_decls(rec.get('style'))}")
    if _decls(rec.get("phone")):
        parts.append(f"on phones: {_decls(rec.get('phone'))}")
    if _decls(rec.get("hover")):
        parts.append(f"on hover: {_decls(rec.get('hover'))}")
    parts += _motion(rec.get("motion"))
    return f"  [{pid}] {_label(rec, pid)} ({where}): " + ("; ".join(parts) or "keep it as it is")


def hand_block(doc: Any) -> str:
    """The merchant's hand edits for the builder's instruction; empty when there are none."""
    els = _elements(doc)
    changes = _changes(doc)
    facts = element_facts((doc or {}).get("html") or "") if els else {}
    live = [i for i in facts if i in els]
    if not live and not changes:
        return ""
    lines = ["THE MERCHANT'S HAND EDITS (made by them in the visual editor; they are deliberate)"]
    if live:
        shown = live
        if len(live) > MAX_LISTED:
            recent = set(sorted(live, key=lambda i: -float(els[i].get("at") or 0))[:MAX_LISTED])
            shown = [i for i in live if i in recent]
        lines.append("Elements they changed (data-pg-id, what, where):")
        lines += [_element_line(i, els[i], facts[i]) for i in shown]
        if len(live) > len(shown):
            lines.append(f"  and {len(live) - len(shown)} more elements with a data-pg-id: keep them as they are too.")
    if changes:
        recent = changes[-MAX_CHANGES:]
        lines.append(("Other changes they made" + (f" (latest {MAX_CHANGES})" if len(changes) > MAX_CHANGES else "") + ": ") + "; ".join(_clip(c, 120) for c in recent))
    lines += [
        "Rules:",
        '- Leave every one of these exactly as they are, in every turn, including page-wide requests ("make the copy punchier", "restyle the page", "make it darker"): keep each element and its data-pg-id attribute, keep their words, pictures and links, and do not bring back what they removed or undo what they moved.',
        "- Their styles are applied after your css and win; do not try to override them in css, and do not restyle those elements' properties through other selectors.",
        '- Change one of them only when the merchant asks for that specific element or says to override their edits. Text, pictures and links: edit the markup and pass override_hand_edits=true. Their styles: an edit_page entry {"hand": "<data-pg-id>", ...}. If a request cannot be done without touching one and they did not name it, say so in your reply or ask.',
        "- When you rewrite markup, carry each data-pg-id attribute over to the element that replaces it.",
    ]
    return "\n".join(lines)


def protected_ranges(doc: Any) -> list[tuple[int, int]]:
    """Spans in doc["html"] of the elements whose text the merchant set (copy fixes must skip them)."""
    els = {i: r for i, r in _elements(doc).items() if isinstance(r.get("text"), str)}
    if not els:
        return []
    facts = element_facts((doc or {}).get("html") or "")
    return [facts[i]["span"] for i in els if i in facts]


# --- keeping them --------------------------------------------------------------------------


def guard(old_doc: Any, new_doc: Any) -> list[str]:
    """What turning old_doc into new_doc would undo of the merchant's hand edits."""
    els = _elements(old_doc)
    if not els:
        return []
    old = element_facts((old_doc or {}).get("html") or "")
    new = element_facts((new_doc or {}).get("html") or "")
    out: list[str] = []
    for pid, rec in els.items():
        if pid not in old:
            continue
        label = _label(rec, pid)
        if pid not in new:
            out.append(f"{label} (data-pg-id={pid}) was removed or lost its data-pg-id")
            continue
        o, n = old[pid], new[pid]
        if isinstance(rec.get("text"), str) and collapse(o.get("text")) != collapse(n.get("text")):
            out.append(f'{label} (data-pg-id={pid}): its text is the merchant\'s, keep it word for word: "{_clip(o.get("text"), 200)}"')
        if isinstance(rec.get("src"), str) and (o.get("src") or "") != (n.get("src") or ""):
            out.append(f'{label} (data-pg-id={pid}): its picture is the merchant\'s, keep src="{o.get("src") or ""}"')
        if isinstance(rec.get("href"), str) and (o.get("href") or "") != (n.get("href") or ""):
            out.append(f'{label} (data-pg-id={pid}): its link is the merchant\'s, keep href="{o.get("href") or ""}"')
    return out


def prune(doc: Any) -> None:
    """Drop records of elements no longer in the html."""
    els = _elements(doc)
    if not els:
        return
    facts = element_facts(doc.get("html") or "")
    for pid in [i for i in els if i not in facts]:
        doc["hand"]["elements"].pop(pid, None)


def release(doc: Any, old_doc: Any) -> list[str]:
    """After an override: forget elements that are gone and content the builder changed
    (it is the builder's now; their styles stay). Returns what was released, in plain lines."""
    els = _elements(doc)
    if not els:
        return []
    new = element_facts(doc.get("html") or "")
    old = element_facts((old_doc or {}).get("html") or "")
    store = doc["hand"]["elements"]
    lines: list[str] = []
    for pid, rec in list(els.items()):
        label = _label(rec, pid)
        if pid not in new:
            store.pop(pid, None)
            if pid in old:
                lines.append(f"{label}: no longer on the page")
            continue
        if pid not in old:
            continue
        what = []
        for mark, name in (("text", "text"), ("src", "picture"), ("href", "link")):
            if not isinstance(rec.get(mark), str):
                continue
            a, b = old[pid].get(mark), new[pid].get(mark)
            if (collapse(a) != collapse(b)) if mark == "text" else ((a or "") != (b or "")):
                rec.pop(mark, None)
                what.append(name)
        if what:
            lines.append(f"{label}: the {' and '.join(what)} is yours now")
            if not any(k in rec for k in (*STYLE_KEYS, *CONTENT_MARKS)):
                store.pop(pid, None)
    return lines


# --- changing their styles on request -------------------------------------------------------

_TAG_NAMES = {
    "h1": "Headline", "h2": "Heading", "h3": "Heading", "h4": "Heading", "h5": "Heading", "h6": "Heading",
    "p": "Text", "a": "Link", "button": "Button", "img": "Picture", "section": "Section", "header": "Header",
    "footer": "Footer", "ul": "List", "ol": "List", "li": "List item", "form": "Form", "span": "Text",
}


def _new_label(fact: dict[str, Any]) -> str:
    name = _TAG_NAMES.get(fact.get("tag") or "", "Block")
    sec = str(fact.get("section") or "")
    return f"{name} in {sec.replace('-', ' ').capitalize()}" if sec else name


def _value(v: Any) -> str | None:
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        return None
    s = re.sub(r"\s*!important\s*$", "", collapse(str(v)), flags=re.I)
    return s


def apply_entry(doc: dict[str, Any], entry: dict[str, Any]) -> str | None:
    """Apply one edit_page hand entry {"hand": id, "screen": "all"|"phone"|"hover", "set": {prop: value},
    "unset": [prop], "release": bool} to doc["hand"]. Returns a problem, or None when applied."""
    pid = str(entry.get("hand") or "").strip()
    if not HAND_ID.match(pid):
        return f"hand must be an element's data-pg-id, not {pid[:40]!r}"
    facts = element_facts(doc.get("html") or "")
    if pid not in facts:
        return f'no element with data-pg-id="{pid}" on the page'
    screen = str(entry.get("screen") or "all")
    if screen not in SCREENS:
        return 'screen must be "all", "phone" or "hover"'
    sets = entry.get("set") or {}
    unset = entry.get("unset") or []
    if not isinstance(sets, dict):
        return "set must be an object of CSS property: value"
    if isinstance(unset, str):
        unset = [unset]
    if not isinstance(unset, list):
        return "unset must be a list of CSS properties"
    rel = entry.get("release") is True
    if not sets and not unset and not rel:
        return "nothing to change: give set, unset or release"
    clean: dict[str, str] = {}
    for prop, raw in sets.items():
        p = str(prop).strip().lower()
        if not CSS_PROP.match(p):
            return f"{prop!r} is not a CSS property"
        v = _value(raw)
        if v is None or len(v) > 400 or BAD_VALUE.search(v):
            return f"the value of {p} is not allowed"
        clean[p] = v
    gone = [str(p).strip().lower() for p in unset]
    hand = doc.get("hand") if isinstance(doc.get("hand"), dict) else None
    if hand is None:
        hand = doc["hand"] = {"elements": {}, "changes": []}
    if not isinstance(hand.get("elements"), dict):
        hand["elements"] = {}
    if not isinstance(hand.get("changes"), list):
        hand["changes"] = []
    rec = hand["elements"].get(pid)
    created = not isinstance(rec, dict)
    if created:
        rec = hand["elements"][pid] = {"label": _new_label(facts[pid]), "at": int(time.time() * 1000)}
    had = created or any(k in rec for k in (*STYLE_KEYS, *CONTENT_MARKS))
    if rel:
        for k in STYLE_KEYS:
            rec.pop(k, None)
    key = SCREENS[screen]
    decls = dict(rec.get(key) or {}) if isinstance(rec.get(key), dict) else {}
    for p in gone:
        decls.pop(p, None)
    for p, v in clean.items():
        if v:
            decls[p] = v
        else:
            decls.pop(p, None)
    if decls:
        rec[key] = decls
    else:
        rec.pop(key, None)
    # A record left with nothing but its label goes (one the merchant kept bare stays).
    if had and not any(k in rec for k in (*STYLE_KEYS, *CONTENT_MARKS)):
        hand["elements"].pop(pid, None)
    return None
