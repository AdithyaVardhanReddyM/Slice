"""Brand check: does a generated picture follow the brand's guidelines?

Adapted from the ADK on-brand-genmedia recipe: the brand's guidelines become
named rules, a critic scores each one pass/fail with a reason from the actual
pixels, and a generation that fails is made once more with the critic's
reasons written into the prompt. Unlike the recipe, some rules are hard gates
(no stray text or logos, nothing on the brand's "never show" list, the
product true to its reference), so a high total cannot hide a broken one, and
a missing verdict never counts as a pass.
"""

from __future__ import annotations

from typing import Any

from google.genai import types

from slice_pages.llm import generate_json

THRESHOLD = 0.7
MAX_TRIES = 2

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "pass": {"type": "boolean"}, "reason": {"type": "string"}},
                "required": ["id", "pass", "reason"],
            },
        },
        "fix": {"type": "string"},
    },
    "required": ["rules", "fix"],
}


def rules_for(kit: dict[str, Any], about: dict[str, Any] | None, *, refs: bool) -> list[dict[str, Any]]:
    """The brand's guidelines as rules a picture can be checked against. `hard` rules must pass."""
    imagery = kit.get("imagery") or {}
    colors = kit.get("colors") or {}
    out: list[dict[str, Any]] = [
        {"id": "clean", "hard": True, "rule": "No text, letters, numbers, logos, watermarks or UI anywhere in the picture (the design adds those)."},
        {"id": "quality", "hard": True, "rule": "Looks like professional photography or art direction: no warped hands or faces, melted objects, extra limbs or obvious AI artefacts."},
    ]
    if refs:
        out.append({"id": "product", "hard": True, "rule": "The products or subjects from the reference images appear and stay true to them (shape, colour, label), not redrawn as something else."})
    if imagery.get("avoid"):
        out.append({"id": "never", "hard": True, "rule": f"Shows none of what the brand never shows: {'; '.join(str(x) for x in imagery['avoid'][:8])}."})
    if imagery.get("style") or imagery.get("treatment"):
        out.append({"id": "style", "hard": False, "rule": f"Matches the brand's imagery: {imagery.get('style', '')} {imagery.get('treatment', '')}".strip()})
    if colors:
        palette = ", ".join(f"{k} {v}" for k, v in colors.items() if k in ("primary", "accent", "background", "foreground"))
        out.append({"id": "palette", "hard": False, "rule": f"Its colours sit well with the brand palette ({palette}): no clashing dominant colour."})
    if about and about.get("summary"):
        out.append({"id": "fit", "hard": False, "rule": f"Fits what the business is: {str(about['summary'])[:300]}"})
    out.append({"id": "brief", "hard": False, "rule": "Shows what the prompt asked for, with one clear subject and a composition that leaves room for a headline."})
    return out


async def review(data: bytes, mime: str, prompt: str, rules: list[dict[str, Any]], refs: list[tuple[bytes, str]] | None = None) -> dict[str, Any]:
    """{score, total, passed, rules: [{id, pass, reason}], fix}. A failed critic call is not a pass."""
    listed = "\n".join(f"- {r['id']}{' (must pass)' if r['hard'] else ''}: {r['rule']}" for r in rules)
    text = (
        "You check generated pictures against a brand's guidelines before anyone sees them. "
        + (f"The first {len(refs)} image(s) are references the picture had to keep true; the LAST image is the picture to check.\n" if refs else "The image is the picture to check.\n")
        + f"It was asked for: {prompt[:600]}\n\nRULES\n{listed}\n\n"
        "For every rule give pass true or false and one short reason about what you see (under 14 words). "
        "fix: one or two sentences telling the image model what to change, empty when everything passes. No em dashes."
    )
    parts: list[Any] = [text, *[types.Part.from_bytes(data=d, mime_type=m) for d, m in (refs or [])[:3]], types.Part.from_bytes(data=data, mime_type=mime)]
    try:
        got = await generate_json(parts, SCHEMA, name="Brand check", temperature=0.1, result=lambda r: f"{sum(1 for x in r.get('rules') or [] if x.get('pass'))}/{len(r.get('rules') or [])} rules pass")
    except Exception as err:
        return {"score": 0, "total": len(rules), "passed": False, "rules": [], "fix": "", "error": f"{type(err).__name__}"}
    by_id = {str(x.get("id")): x for x in got.get("rules") or [] if isinstance(x, dict)}
    results = [{"id": r["id"], "hard": r["hard"], "pass": bool((by_id.get(r["id"]) or {}).get("pass")), "reason": str((by_id.get(r["id"]) or {}).get("reason") or "not checked")[:160]} for r in rules]
    score = sum(1 for x in results if x["pass"])
    passed = all(x["pass"] for x in results if x["hard"]) and score >= THRESHOLD * len(results)
    return {"score": score, "total": len(results), "passed": passed, "rules": results, "fix": str(got.get("fix") or "")[:400]}


def summary(r: dict[str, Any], tries: int) -> dict[str, Any]:
    """What the asset keeps: the score, and the reasons of the rules that failed."""
    return {
        "score": r.get("score", 0),
        "total": r.get("total", 0),
        "passed": bool(r.get("passed")),
        "tries": tries,
        "notes": [f"{x['id']}: {x['reason']}" for x in r.get("rules") or [] if not x["pass"]][:4],
    }

