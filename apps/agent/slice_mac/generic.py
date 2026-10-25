"""Slice without taste: the same requests answered from a model's general knowledge.

For judges (Settings > General > "Use my taste" off, or "without taste" said out
loud): picks, rankings, a city's areas and gift ideas come from Gemini with no
Qloo call and no profile, so the difference taste makes shows side by side.
Every answer says it's the generic version.
"""

from __future__ import annotations

import json
import os
from typing import Any

from google import genai
from google.genai import types

MODEL = os.environ.get("MAC_GENERIC_MODEL", "gemini-3.5-flash-lite")
NOTE = "Taste is off: these are popular picks anyone would get, not chosen for you."
_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def _json(prompt: str, schema: types.Schema) -> Any:
    try:
        res = await _client().aio.models.generate_content(
            model=MODEL, contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema),
        )
        return json.loads(res.text or "null")
    except Exception as err:
        print(f"mac: generic answer failed: {err}", flush=True)
        return None


_PICK = types.Schema(type="OBJECT", properties={
    "name": types.Schema(type="STRING"), "description": types.Schema(type="STRING"), "address": types.Schema(type="STRING"),
}, required=["name", "description"])


async def picks(kind: str, where: str = "", genre: str = "", count: int = 5) -> dict[str, Any]:
    what = kind.replace("_", " ") + (f" ({genre.replace('_', ' ')})" if genre else "")
    place = f" in or near {where}" if where and kind == "place" else ""
    rows = await _json(
        f"List the {count} most popular, widely recommended {what}s{place} right now. "
        "For each: name, a one-line description, and for places the street address.",
        types.Schema(type="ARRAY", items=_PICK),
    ) or []
    out = [{"name": r.get("name"), "description": r.get("description"), "address": r.get("address") or None, "rank": i}
           for i, r in enumerate(rows[:count], start=1) if isinstance(r, dict) and r.get("name")]
    return {"for": "anyone", "based_on": [], "picks": out, "note": NOTE}


async def rank(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Scores from general acclaim and popularity, with no reasons tied to a person."""
    names = [i.get("name") or "" for i in items]
    rows = await _json(
        "Score each of these from 0 to 100 by how acclaimed and popular it is in general "
        f"(not for any one person). Keep the names exactly.\n{json.dumps(names)}",
        types.Schema(type="ARRAY", items=types.Schema(type="OBJECT", properties={
            "name": types.Schema(type="STRING"), "score": types.Schema(type="INTEGER")}, required=["name", "score"])),
    ) or []
    scores = {str(r.get("name")).lower(): r.get("score") for r in rows if isinstance(r, dict)}
    out = []
    for item in items:
        score = scores.get((item.get("name") or "").lower())
        out.append(dict(item, match=int(score) if isinstance(score, (int, float)) else None, because=[], generic=True))
    out.sort(key=lambda r: r["match"] if r["match"] is not None else -1, reverse=True)
    return out


async def explain(thing: str) -> dict[str, Any]:
    row = await _json(
        f"In one short sentence, say why people in general like {thing}. No mention of any particular person.",
        types.Schema(type="OBJECT", properties={"line": types.Schema(type="STRING")}, required=["line"]),
    ) or {}
    line = (row.get("line") or f"{thing} is well liked.").strip()
    return {"thing": {"name": thing}, "for": "anyone", "match": None, "strong": False, "because": [], "shared": [], "also": [],
            "line": f"{line} With taste off, I can't say how it fits you.", "generic": True}


async def areas(city: str) -> list[dict[str, Any]]:
    rows = await _json(
        f"Name the 5 neighbourhoods of {city} most often recommended to visitors, best first, each with one example "
        "place there.",
        types.Schema(type="ARRAY", items=types.Schema(type="OBJECT", properties={
            "name": types.Schema(type="STRING"), "example": types.Schema(type="STRING")}, required=["name"])),
    ) or []
    return [{"name": r["name"], "examples": [r["example"]] if r.get("example") else []}
            for r in rows[:5] if isinstance(r, dict) and r.get("name")]


async def gifts(person: str, about: str, budget_usd: int = 0) -> list[dict[str, Any]]:
    budget = f" under ${budget_usd}" if budget_usd else ""
    rows = await _json(
        f"Suggest 6 popular gift ideas{budget} for {person} ({about or 'an adult'}): brands, a record and a book. "
        "For each: title, tag (Brand, Vinyl or Book) and a one-line reason anyone would like it.",
        types.Schema(type="ARRAY", items=types.Schema(type="OBJECT", properties={
            "title": types.Schema(type="STRING"), "tag": types.Schema(type="STRING"), "reason": types.Schema(type="STRING")},
            required=["title", "tag"])),
    ) or []
    return [{k: r[k] for k in ("title", "tag", "reason") if r.get(k)} for r in rows[:6] if isinstance(r, dict) and r.get("title")]
