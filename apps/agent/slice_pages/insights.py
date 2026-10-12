"""Insights: why a built page looks and reads the way it does, section by section.

The builder writes them itself as the last step of a build (`explain_page` in
builder.py), with its whole context; the helpers here check that output (quotes
must be on the page, taste references resolve to Qloo data it saw). This
module's `write_insights` is the fallback for pages built before that, or a
turn where the builder did not explain: it reconstructs them from what the
builder had: the
page's own text per `data-section`, the evidence the builder noted per
section, the audience's Qloo profile, the Qloo look-ups in the build trace and
the brand's homepage anatomy. The model may only point at taste references
from a numbered catalogue (so every chip in the console is a real Qloo entity
or tag with its picture) and may only quote phrases that are on the page.
Stored on the version as `insights` with the doc version it explains.
"""

from __future__ import annotations

import re
import time
from html.parser import HTMLParser
from typing import Any

from google.genai import types

from slice_agent import convex_client as convex

from . import capture
from .llm import clip, generate_json

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _SectionText(HTMLParser):
    """Visible text, image alts and CTA labels per data-section, in page order."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sections: dict[str, dict[str, Any]] = {}
        self.order: list[str] = []
        self._stack: list[str | None] = []  # the section each open element belongs to
        self._skip = 0

    def _current(self) -> str | None:
        for s in reversed(self._stack):
            if s:
                return s
        return None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: v or "" for k, v in attrs}
        sec = a.get("data-section") or None
        if sec and sec not in self.sections:
            self.sections[sec] = {"text": [], "images": [], "ctas": []}
            self.order.append(sec)
        cur = sec or self._current()
        if cur:
            if tag == "img":
                self.sections[cur]["images"].append(a.get("alt") or "(no alt)")
            if a.get("data-cta"):
                self.sections[cur]["ctas"].append(a["data-cta"])
        if tag in ("script", "style", "svg"):
            self._skip += 1
        if tag not in VOID:
            self._stack.append(sec)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "svg"):
            self._skip = max(0, self._skip - 1)
        if tag not in VOID and self._stack:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        cur = self._current()
        text = re.sub(r"\s+", " ", data).strip()
        if cur and text and not self._skip:
            self.sections[cur]["text"].append(text)


def section_text(html: str) -> dict[str, dict[str, Any]]:
    p = _SectionText()
    try:
        p.feed(html)
    except Exception:
        pass
    return {sid: {**p.sections[sid], "text": " ".join(p.sections[sid]["text"])} for sid in p.order}


def catalogue(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Every taste reference the model may cite, with a short ref."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(kind: str, name: Any, image: Any = None, note: str = "") -> None:
        n = str(name or "").strip()
        if not n or n.lower() in seen:
            return
        seen.add(n.lower())
        out.append({"ref": f"r{len(out) + 1}", "kind": kind, "name": n, **({"image": image} if isinstance(image, str) and image.startswith("http") else {}), **({"note": note} if note else {})})

    for e in (profile.get("entities") or [])[:12]:
        add(str(e.get("type") or "").split(":")[-1].replace("_", " ") or "signal", e.get("name"), e.get("image"), "one of the audience's own signals")
    cult = profile.get("culture") or {}
    for key, kind in (("artists", "artist"), ("films", "film"), ("places", "place"), ("books", "book")):
        for e in (cult.get(key) or [])[:8]:
            add(kind, e.get("name"), e.get("image"), e.get("subtitle") or "")
    for b in (profile.get("brands") or [])[:12]:
        words = (b.get("personalStyle") or [])[:2] + (b.get("lifestyle") or [])[:1]
        add("brand", b.get("name"), b.get("image"), ", ".join(words))
    for g in (profile.get("geo") or [])[:4]:
        add("place", g.get("name"))
    tags = sorted((profile.get("tags") or []), key=lambda t: -float(t.get("affinity") or 0))
    for t in tags[:30]:
        group = (t.get("type") or "").split(":")[2] if (t.get("type") or "").count(":") >= 2 else "tag"
        add(f"{group.replace('_', ' ')} tag", t.get("name"))
    return out


SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "portrait": {"type": "string"},
        "traits": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"label": {"type": "string"}, "detail": {"type": "string"}, "refs": {"type": "array", "items": {"type": "string"}}},
                "required": ["label", "detail", "refs"],
            },
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "role": {"type": "string"},
                    "why": {"type": "string"},
                    "wording": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"quote": {"type": "string"}, "why": {"type": "string"}}, "required": ["quote", "why"]},
                    },
                    "taste": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"ref": {"type": "string"}, "why": {"type": "string"}}, "required": ["ref", "why"]},
                    },
                    "brand": {"type": "array", "items": {"type": "string"}},
                    "imagery": {"type": "string"},
                },
                "required": ["id", "title", "role", "why", "wording", "taste", "brand"],
            },
        },
    },
    "required": ["headline", "summary", "portrait", "traits", "sections"],
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def remember_entities(seen: dict[str, dict[str, Any]], value: Any, depth: int = 0) -> None:
    """Collect every named thing with a picture, id or type from a tool result (Qloo entities,
    places, brands), keyed by lower-cased name, so the builder's explanation can cite them."""
    if depth > 5 or len(seen) > 600:
        return
    if isinstance(value, dict):
        name = value.get("name")
        if isinstance(name, str) and name.strip() and any(value.get(k) for k in ("image", "id", "type", "entity_id")):
            key = name.strip().lower()
            if key not in seen or (not seen[key].get("image") and value.get("image")):
                kind = str(value.get("type") or value.get("kind") or "").split(":")[-1].replace("_", " ")
                kind = "" if kind in ("entity", "tag", "signal") else kind
                img = value.get("image")
                if isinstance(img, dict):
                    img = img.get("url")
                seen[key] = {"name": name.strip(), "kind": kind, **({"image": img} if isinstance(img, str) and img.startswith("http") else {})}
        for v in value.values():
            if isinstance(v, (dict, list)):
                remember_entities(seen, v, depth + 1)
    elif isinstance(value, list):
        for v in value[:80]:
            remember_entities(seen, v, depth + 1)


def resolve_name(name: str, cat: list[dict[str, Any]], seen: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """A taste reference the builder named, matched to the audience profile or Qloo results it saw."""
    key = (name or "").strip().lower()
    if not key:
        return None
    for c in cat:
        if c["name"].lower() == key:
            return c
    if key in seen:
        return seen[key]
    for c in cat:
        if _norm(c["name"]) == _norm(key):
            return c
    return None


def quote_on_page(quote: str, text: str) -> bool:
    q = _norm(quote or "")
    return bool(q) and q in _norm(text or "")


async def write_insights(variant_id: str) -> dict[str, Any]:
    from .builder import combine_audiences, default_audience

    variant = await convex.query("pages:variant", {"id": variant_id})
    if not variant:
        raise ValueError(f"version {variant_id} not found")
    doc = variant.get("doc") or {}
    if doc.get("kind") != "html":
        return {"ok": False, "error": "insights need a page built as HTML"}
    bundle = await convex.query("pages:get", {"id": variant["pageId"]}) or {}
    page = bundle.get("page") or {}
    brand = await convex.query("pagesBrands:get", {"id": page.get("brandId")}) or {}
    audiences = [a for a in (bundle.get("audiences") or []) if isinstance(a, dict)]
    audience = combine_audiences(audiences) if audiences else default_audience(brand)
    profile = audience.get("profile") or {}
    refs_list = catalogue(profile)
    by_ref = {c["ref"]: c for c in refs_list}

    texts = section_text(doc.get("html") or "")
    notes = {s.get("id"): s for s in (doc.get("sections") or []) if isinstance(s, dict)}
    order = [sid for sid in texts if sid in notes] or [s.get("id") for s in (doc.get("sections") or [])]
    section_lines = []
    for sid in order:
        t = texts.get(sid) or {}
        n = notes.get(sid) or {}
        section_lines.append(
            f'SECTION "{sid}" (builder\'s label: {n.get("label") or sid})\n'
            f"  Text on the page: {clip(t.get('text') or '', 900)}\n"
            f"  Images (alt text): {'; '.join((t.get('images') or [])[:6]) or 'none'}\n"
            f"  Buttons: {', '.join(t.get('ctas') or []) or 'none'}\n"
            f"  Builder's own note on why: {n.get('evidence') or 'none'}"
        )
    lookups = [f"  - {s.get('name')}: {str(s.get('result') or '')[:160]}" for s in (variant.get("trace") or []) if s.get("kind") == "qloo"][:14]
    pb = page.get("brief") or {}
    who = "everyone (no specific audience): the brand's own Qloo read stands in for the audience" if not audiences else audience.get("name")
    cat_lines = "\n".join(f"  {c['ref']}: {c['name']} ({c['kind']}{'; ' + c['note'] if c.get('note') else ''})" for c in refs_list)

    prompt = f"""You explain to a marketer why an AI page builder made a landing page the way it did. They are smart but not technical: write plain, warm, specific English. No jargon: never say "affinity", "entity", "signal", "urn", "tag", "Qloo graph", "variant" or "LLM". Say "people in this audience love…", "Qloo's taste data shows…" (Qloo is the taste data company; naming it is fine). No em dashes, no exclamation marks, no markdown.

BRAND: {brand.get('name')} ({brand.get('url')}). {(brand.get('brief') or {}).get('summary', '')}
HOW THE BRAND'S OWN HOMEPAGE LOOKS: {clip(str((brand.get('site') or {}).get('anatomy') or 'unknown'), 1500)}

THE PAGE: "{page.get('title')}", goal {pb.get('goal')}. The merchant asked for: {clip(pb.get('prompt') or '', 600)}
Offer: {pb.get('offer') or 'none'}. Main button: {(pb.get('cta') or {}).get('label')}

WHO IT IS FOR: {who}
{('Notes: ' + audience['note']) if audience.get('note') else ''}
Audience brief: {clip(str(audience.get('brief') or 'none'), 1500)}

TASTE REFERENCES (cite ONLY these, by ref; they are what Qloo knows these people love, strongest first within each kind):
{cat_lines or '  (none)'}

WHAT THE BUILDER LOOKED UP IN QLOO WHILE BUILDING:
{chr(10).join(lookups) or '  (nothing recorded)'}

THE PAGE, SECTION BY SECTION:
{chr(10).join(section_lines)}

WRITE
- headline: the page's strategy in under 12 words ("Leads with the warehouse nights Berliners already go out for").
- summary: 2 or 3 sentences on the overall angle and why it suits these people.
- portrait: 1 or 2 sentences on who these people are, from the taste references, as a person would describe friends.
- traits: 3 or 4 things about this audience that shaped the page. label 2 to 4 words; detail one sentence; refs 1 to 4 refs that show it.
- sections: one per section above, same ids, same order.
  - title: 2 to 4 words naming the section for a marketer ("Opening promise", "Lineup picks", "Getting there").
  - role: one short sentence, what the section is there to do for the visitor.
  - why: 2 or 3 sentences: why it is built and worded like this for these people, connecting the taste data to concrete choices. Build on the builder's note but do not invent data.
  - wording: 1 to 3 short phrases copied EXACTLY from that section's text (3 to 12 words each, same spelling), each with one sentence on why that wording. Pick the phrases that carry the personalisation.
  - taste: 0 to 4 refs from TASTE REFERENCES that drove this section, each with a short clause on how.
  - brand: 0 to 2 short sentences on what was carried over from the brand's own site (layout, type, colour, photography, voice), in plain words a marketer uses: no pixel sizes, no CSS or code terms.
  - imagery: one sentence on why these pictures, or empty when the section has none.
- Never claim numbers, sales results or facts not given above."""

    parts: list[Any] = [prompt]
    if isinstance(variant.get("screenshot"), str) and variant["screenshot"].startswith("http"):
        try:
            parts = [types.Part(text=prompt), types.Part(text="A screenshot of the page as built:"), types.Part.from_bytes(data=await capture.site_bytes(variant["screenshot"]), mime_type="image/png")]
        except Exception:
            parts = [prompt]

    raw = await generate_json(parts, SCHEMA, name="Explain the page", temperature=0.3, thinking=True, result=lambda r: f"{len(r.get('sections') or [])} sections explained")

    def refs(items: list[Any]) -> list[dict[str, Any]]:
        out = []
        for r in items:
            ref = r if isinstance(r, str) else (r or {}).get("ref")
            c = by_ref.get(str(ref or "").strip())
            if c and all(o["name"] != c["name"] for o in out):
                out.append({"name": c["name"], "kind": c["kind"], **({"image": c["image"]} if c.get("image") else {}), **({"why": r.get("why", "")} if isinstance(r, dict) else {})})
        return out

    sections = []
    for s in raw.get("sections") or []:
        sid = s.get("id")
        if sid not in notes:
            continue
        page_text = _norm((texts.get(sid) or {}).get("text") or "")
        wording = [w for w in (s.get("wording") or []) if _norm(w.get("quote") or "") and _norm(w["quote"]) in page_text][:3]
        sections.append({
            "id": sid,
            "title": (s.get("title") or notes[sid].get("label") or sid).strip(),
            "role": (s.get("role") or "").strip(),
            "why": (s.get("why") or "").strip(),
            "wording": [{"quote": w["quote"].strip(), "why": (w.get("why") or "").strip()} for w in wording],
            "taste": refs(s.get("taste") or [])[:4],
            "brand": [b.strip() for b in (s.get("brand") or []) if isinstance(b, str) and b.strip()][:2],
            **({"imagery": s["imagery"].strip()} if (s.get("imagery") or "").strip() else {}),
        })
    insights = {
        "version": int(variant.get("version") or 0),
        "at": int(time.time() * 1000),
        "headline": (raw.get("headline") or "").strip(),
        "summary": (raw.get("summary") or "").strip(),
        "portrait": (raw.get("portrait") or "").strip(),
        "traits": [{"label": t.get("label", "").strip(), "detail": t.get("detail", "").strip(), "refs": refs(t.get("refs") or [])} for t in (raw.get("traits") or [])[:4] if t.get("label")],
        "sections": sections,
        "source": "review",
    }
    await convex.site("/pages/variant", {"variantId": variant_id, "patch": {"insights": insights}})
    return {"ok": True, "insights": insights}
