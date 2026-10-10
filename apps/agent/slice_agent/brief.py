"""The taste brief, written once per profile.

A brief is the model's translation of a Qloo taste read into one store's own
style vocabulary (styles with weights, palette, materials, things to avoid).
It used to be the agent's first tool call of every conversation; now it is
written right after the profile is built (POST /brief) so the first turn can
go straight to ranking. The same function backs the set_taste_brief tool.
"""

from __future__ import annotations

import json
import time
from typing import Any

from google import genai
from google.genai import types

from . import convex_client as convex
from . import tools as T

MODEL = "gemini-3.8-flash"

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client()  # Vertex settings come from the environment (see .env.example)
    return _client


BRIEF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "styles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "weight": {"type": "number"},
                    "because": {"type": "string"},
                },
                "required": ["id", "weight", "because"],
            },
        },
        "palette": {"type": "array", "items": {"type": "string"}},
        "materials": {"type": "array", "items": {"type": "string"}},
        "avoid": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "styles", "palette", "materials", "avoid"],
}


def _prompt(store: dict[str, Any], profile: dict[str, Any]) -> str:
    styles = "\n".join(f"  - {s['id']}: {s['label']}. {s['description']}" for s in store.get("styles", []))
    summary = T.profile_summary(profile, store)
    summary.pop("brief", None)
    return f"""You translate a shopper's taste, as read by Qloo (the cultural taste graph), into one store's own style vocabulary.

STORE: {store.get('name')} — {store.get('tagline', '')}
What they sell: {store.get('vertical', 'retail')}. {store.get('description', '')}

Style vocabulary (use these exact ids):
{styles}

SHOPPER TASTE PROFILE (Qloo tags with their type, brand affinities with each brand's own style words, the shopper's signals):
{json.dumps(summary, ensure_ascii=False, indent=1)}

Write the brief:
- styles: 2 to 4 entries from the vocabulary with weights (strongest = 1.0, others relative) and a "because" that names the Qloo tags or brand affinities pointing there. Translate, don't parrot: "utilitarian" and "Huckberry: workwear-inspired" point to the workwear style, not to a style whose name merely sounds similar.
- palette: up to 6 colour words this shopper would gravitate to.
- materials: up to 6 materials or fabrics.
- avoid: up to 4 things that would feel wrong for this taste.
- summary: one plain sentence spoken to the shopper, no jargon, no exclamation marks, no em dashes. Like a good shop assistant: "you lean quiet and earthy, with a soft spot for things that are built to last".
Never infer the shopper's gender or age from the audience skew."""


async def write_brief(
    store: dict[str, Any], profile: dict[str, Any], profile_id: str | None
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """One model call. Returns (brief, span); the brief is None when the model
    produced no usable style ids."""
    t0 = time.perf_counter()
    started = time.time()
    res = await client().aio.models.generate_content(
        model=MODEL,
        contents=_prompt(store, profile),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=BRIEF_SCHEMA,
            temperature=0.4,
            # A structured translation; deliberation doubles the latency for no gain.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    raw = json.loads(res.text or "{}")
    brief = T.clean_brief(
        store,
        summary=str(raw.get("summary", "")),
        styles=list(raw.get("styles") or []),
        palette=list(raw.get("palette") or []),
        materials=list(raw.get("materials") or []),
        avoid=list(raw.get("avoid") or []),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    span = {
        "kind": "llm",
        "name": f"Translate Qloo taste into {store.get('name', 'the store')}'s styles",
        "ms": ms,
        "started": started,
        "result": ", ".join(f"{s['id']} {int(s['weight'] * 100)}%" for s in (brief or {}).get("styles", []))
        or "no usable styles",
    }
    if brief and profile_id:
        try:
            await convex.site("/agent/brief", {"profileId": profile_id, "brief": brief, "span": span})
        except Exception as err:
            span["result"] += f" (not saved: {err})"
    return brief, span
