"""PageDoc validation, mirroring `validateDoc` in packages/backend/convex/pagesTypes.ts.

Keep the two in step: the backend re-validates on save, so anything this lets
through that the backend rejects costs the agent a wasted round trip.
"""

from __future__ import annotations

import re
from typing import Any

SECTION_TYPES = [
    "hero", "split", "grid", "story", "gallery", "testimonials", "stats", "faq",
    "offer", "locations", "culture", "form", "cta", "custom",
]


def _nonempty_list(v: Any) -> bool:
    return isinstance(v, list) and len(v) > 0


def validate_doc(doc: Any) -> list[str]:
    problems: list[str] = []
    if not isinstance(doc, dict):
        return ["doc is not an object"]
    meta = doc.get("meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("title"), str):
        problems.append("meta.title missing")
    sections = doc.get("sections")
    if not _nonempty_list(sections):
        problems.append("sections missing or empty")
        return problems
    ids: set[str] = set()
    for i, sec in enumerate(sections):
        if not isinstance(sec, dict):
            problems.append(f"sections[{i}] is not an object")
            continue
        sid = sec.get("id")
        if not sid or not isinstance(sid, str):
            problems.append(f"sections[{i}].id missing")
        elif sid in ids:
            problems.append(f"duplicate section id {sid}")
        else:
            ids.add(sid)
        t = sec.get("type")
        if not t or t not in SECTION_TYPES:
            problems.append(f"sections[{i}].type invalid: {t}")
        label = sid or f"sections[{i}]"
        if t == "hero":
            if not sec.get("headline"):
                problems.append(f"{label}: hero.headline missing")
            if not (sec.get("primaryCta") or {}).get("label"):
                problems.append(f"{label}: hero.primaryCta missing")
        elif t == "split":
            if not sec.get("headline") or not sec.get("body"):
                problems.append(f"{label}: split needs headline and body")
            if not (sec.get("image") or {}).get("src"):
                problems.append(f"{label}: split.image missing")
        elif t == "grid":
            if not _nonempty_list(sec.get("items")):
                problems.append(f"{label}: grid.items empty")
        elif t == "story":
            if not _nonempty_list(sec.get("paragraphs")):
                problems.append(f"{label}: story.paragraphs empty")
        elif t == "gallery":
            if not _nonempty_list(sec.get("images")):
                problems.append(f"{label}: gallery.images empty")
        elif t == "testimonials":
            if not _nonempty_list(sec.get("quotes")):
                problems.append(f"{label}: testimonials.quotes empty")
        elif t == "stats":
            if not _nonempty_list(sec.get("items")):
                problems.append(f"{label}: stats.items empty")
        elif t == "faq":
            if not _nonempty_list(sec.get("items")):
                problems.append(f"{label}: faq.items empty")
        elif t == "offer":
            if not sec.get("headline") or not (sec.get("cta") or {}).get("label"):
                problems.append(f"{label}: offer needs headline and cta")
        elif t == "locations":
            if not _nonempty_list(sec.get("places")):
                problems.append(f"{label}: locations.places empty")
        elif t == "culture":
            if not _nonempty_list(sec.get("items")):
                problems.append(f"{label}: culture.items empty")
        elif t == "form":
            if not _nonempty_list(sec.get("fields")):
                problems.append(f"{label}: form.fields empty")
        elif t == "cta":
            if not sec.get("headline") or not (sec.get("cta") or {}).get("label"):
                problems.append(f"{label}: cta needs headline and cta")
        elif t == "custom":
            html = sec.get("html")
            if not isinstance(html, str):
                problems.append(f"{label}: custom.html missing")
            elif re.search(r"<script", html, re.I):
                problems.append(f"{label}: custom.html may not contain scripts")
    return problems


def style_problems(doc: dict[str, Any], *, generated: bool) -> list[str]:
    """Softer checks the builder's instruction demands (returned as warnings, not blockers)."""
    warnings: list[str] = []
    sections = doc.get("sections") or []
    if not sections:
        return warnings
    if sections[0].get("type") != "hero":
        warnings.append("first section should be a hero")
    if sections[-1].get("type") != "cta":
        warnings.append("last section should be a cta")
    if generated and not 6 <= len(sections) <= 9:
        warnings.append(f"{len(sections)} sections; aim for 6 to 9")
    text = _all_text(doc)
    if "—" in text or "–" in text:
        warnings.append("remove em/en dashes; use a comma or a full stop")
    if re.search(r"\b(best[- ]?sellers?|trending|most popular|popular)\b", text, re.I):
        warnings.append("no bestseller/trending/popular framing (taste is additive)")
    missing_evidence = [s.get("id") for s in sections if not s.get("evidence")]
    if missing_evidence:
        warnings.append("evidence missing on: " + ", ".join(str(m) for m in missing_evidence))
    return warnings


def _all_text(obj: Any) -> str:
    if isinstance(obj, str):
        return obj + "\n"
    if isinstance(obj, dict):
        return "".join(_all_text(v) for k, v in obj.items() if k not in ("src", "href", "evidence", "image", "prompt"))
    if isinstance(obj, list):
        return "".join(_all_text(v) for v in obj)
    return ""
