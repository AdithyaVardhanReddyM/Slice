"""Pre-test: a simulated panel looks at a poster, video, image or clip before money is spent on it.

Ported from Shaik's studio pre-test (PR #3, slice_media/insights.py) to the canvas and
the Why modal: five people Gemini builds from the audience's Qloo profile (their loves,
traits, brands and culture) and Qloo's age and gender skew see the piece as it will be
seen, and say one by one whether they would stop, tap or scroll past, and why. Their
scores average into one panel score; the fixes say what to change and where.

It is a model's judgement grounded in Qloo data, not a Qloo measurement, and the console
labels it that way. Each person's tastes are checked by name against the profile, like
the Why report's signals. Stored in Convex (mediaInsights, kind "pretest"), latest per item.
"""

from __future__ import annotations

import time
from typing import Any

from google.genai import types

from slice_agent.trace import record
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import builder as B
from . import docs as D
from . import store
from .why import Lookup, NotFound, _city, _demographics, _frames, _profile_block, subject

PANEL = 5

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string"},
        "personas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "gender": {"type": "string", "enum": ["woman", "man"]},
                    "city": {"type": "string"},
                    "bio": {"type": "string"},
                    "tastes": {"type": "array", "items": {"type": "string"}},
                    "firstGlance": {"type": "string"},
                    "reaction": {"type": "string"},
                    "score": {"type": "integer"},
                    "action": {"type": "string", "enum": ["scroll_past", "pause", "tap", "save_or_share"]},
                    "likes": {"type": "array", "items": {"type": "string"}},
                    "dislikes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "age", "gender", "city", "bio", "tastes", "firstGlance", "reaction", "score", "action", "likes", "dislikes"],
            },
        },
        "fixes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "what": {"type": "string"},
                    "why": {"type": "string"},
                    "where": {"type": "string"},
                    "layer": {"type": "string"},
                    "impact": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["what", "why", "where", "impact"],
            },
        },
    },
    "required": ["verdict", "personas", "fixes"],
}


async def pretest(tool_context: Any, item_id: str, audience_id: str = "") -> dict:
    """Score a creative, image or clip with a simulated panel drawn from an audience's Qloo taste (its own audience unless `audience_id`)."""
    state = tool_context.state
    cid = B._cid(state)
    camp = state.get(B.CAMPAIGN) or {}
    kit = camp.get("kit") or {}
    try:
        item, aud, everyone = await subject(state, item_id, audience_id)
    except NotFound as err:
        return {"ok": False, "error": str(err)}
    profile = aud.get("profile") or {}
    look = Lookup(profile)

    with timer() as t:
        try:
            frames = await _frames(item, kit)
        except Exception as err:
            record("slice", "Look at it", f"failed: {str(err)[:140]}", ms=t.ms, started=t.started)
            return {"ok": False, "error": f"could not look at it ({str(err)[:160]})"}
        demo = await _demographics(profile) if profile else None
    record("slice", "Look at it", f"{len(frames)} frame{'s' if len(frames) != 1 else ''}", ms=t.ms, started=t.started)

    if item["itemKind"] == "creative":
        what = f"a {item.get('kind')} ad ({D.FORMATS.get(item.get('format'), {}).get('label', item.get('format'))})"
        parts = f"Its layers (fixes name the layer id they change, or \"frame\" or \"new\"):\n{D.outline(item['doc'])}\n"
    else:
        what = "a video clip" if item.get("kind") == "video" else "an image"
        parts = ""
    products = "; ".join(f"{p.get('name')}" + (f" ({p['price']})" if p.get("price") else "") for p in (camp.get("products") or [])[:6])
    labels = ", ".join(f"picture {i + 1} = {f[2]}" for i, f in enumerate(frames))
    city = _city(aud)
    grounded = bool(profile) and not everyone
    prompt = (
        f"Run a pre-test of {what} by {kit.get('name') or 'the brand'}, before any money is spent showing it. The pictures show it as it will be seen ({labels}).\n"
        + parts
        + (f"Products: {products}\n" if products else "")
        + (f"\n{_profile_block(aud, look)}\n\n" if grounded else "\nThe audience is everyone who might buy from the brand; there is no taste data.\n\n")
        + f"Assemble a panel of {PANEL} people from this audience, as different from each other as the audience allows. "
        + (
            "Their ages and genders follow the Qloo demographics (most from the ages they lean toward). Each person's tastes are 2 to 4 names copied exactly from the LOVES, TRAITS, BRANDS and culture lists above. "
            + (f"They live in different parts of {city}. " if city else "They live in places where this taste is common. ")
            if grounded
            else "Spread them over the ages and places that plausibly buy from this brand. "
        )
        + "Include one sceptic who is in the audience but hard to win. bio: one short line (job, life).\n"
        "Each person scrolls their feed and meets it. firstGlance: what they notice in the first second. reaction: what they think, in the first person, as they would say it, in one or two sentences, reacting to what is actually in the pictures (the picture, any words, the colours) through their own taste. "
        "score 1 to 10: how much it speaks to them. action: scroll_past, pause, tap or save_or_share. likes and dislikes: specific, at most 2 each, a few words each.\n"
        "Be honest, like a real focus group, not polite: a generic, off-taste or hard-to-read piece scores low and gets scrolled past. Do not let every person agree.\n"
        "fixes: at most 4 changes that would win over the people who scrolled past without losing the others, most impactful first. what: the change, concretely, at most 16 words. why: in terms of the panel's tastes, at most 18 words. where: the part it changes in plain words (\"the headline\", \"the background\", \"the light\")."
        + (" layer: the layer id it changes." if parts else " layer: empty.")
        + " impact: high, medium or low.\n"
        "verdict: two sentences on how this audience will receive it. Plain words, no markdown, no em dashes, no middle dots."
    )
    with timer() as t:
        try:
            res = await generate_json(
                [prompt, *[types.Part.from_bytes(data=f[0], mime_type=f[1]) for f in frames]],
                SCHEMA,
                name="Audience pre-test",
                temperature=0.7,
                thinking=True,
                result=lambda r: f"{len(r.get('personas') or [])} people, {len(r.get('fixes') or [])} fixes",
            )
        except Exception as err:
            return {"ok": False, "error": f"the panel failed ({type(err).__name__}: {str(err)[:120]})"}

    personas = []
    for p in (res.get("personas") or [])[:PANEL]:
        if not isinstance(p, dict) or not p.get("reaction"):
            continue
        tastes, seen = [], set()
        for name in p.get("tastes") or []:
            hit = look.find(str(name)) if grounded else None
            if hit and hit["name"] not in seen:
                seen.add(hit["name"])
                tastes.append(look.signal(hit))
        personas.append(
            {
                "name": str(p.get("name") or "")[:40],
                "age": int(p.get("age") or 0),
                "gender": p.get("gender") if p.get("gender") in ("woman", "man") else "",
                "city": str(p.get("city") or "")[:60],
                "bio": str(p.get("bio") or "")[:140],
                "tastes": tastes[:4],
                "firstGlance": str(p.get("firstGlance") or "")[:200],
                "reaction": str(p.get("reaction") or "")[:400],
                "score": max(1, min(10, int(p.get("score") or 1))),
                "action": p.get("action") if p.get("action") in ("scroll_past", "pause", "tap", "save_or_share") else "pause",
                "likes": [str(x)[:80] for x in p.get("likes") or []][:2],
                "dislikes": [str(x)[:80] for x in p.get("dislikes") or []][:2],
            }
        )
    if not personas:
        return {"ok": False, "error": "the panel returned no reactions; try again"}
    score = round(sum(p["score"] for p in personas) / len(personas) * 10)
    stopped = sum(1 for p in personas if p["action"] != "scroll_past")
    data = {
        "itemId": item_id,
        "itemKind": item["itemKind"],
        "version": int(item.get("version") or 0),
        "audienceKey": aud.get("id") or "all",
        "audienceName": aud.get("name") or "Everyone",
        "everyone": everyone,
        "score": score,
        "stopped": stopped,
        "verdict": str(res.get("verdict") or "")[:400],
        "personas": personas,
        "fixes": [
            {"what": str(f["what"])[:160], "why": str(f.get("why") or "")[:200], "where": str(f.get("where") or "")[:60], "impact": f.get("impact") if f.get("impact") in ("high", "medium", "low") else "medium", **({"layer": str(f["layer"])[:40]} if parts and f.get("layer") else {})}
            for f in res.get("fixes") or []
            if isinstance(f, dict) and f.get("what")
        ][:4],
        "demographics": demo,
        "at": int(time.time() * 1000),
    }
    await store.post("/media/insight", {"campaignId": cid, "kind": "pretest", "key": item_id, "data": data})
    record("slice", "Pre-test", f"panel score {score}, {stopped} of {len(personas)} would stop", ms=t.ms, started=t.started)
    return {"ok": True, "score": score, "stopped": stopped}
