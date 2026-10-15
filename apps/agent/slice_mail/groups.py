"""Names and briefs for a contact list's taste groups (POST /email/name-groups).

`emailLists.process` clusters a list into group audiences named after their top
entities; this gives each a short human name ("Quiet literary readers") and a short
audience brief (summary, speakTo, leadWith, hooks with evidence), saved through
/email/audience-brief. The names come back to the console, which renames the groups.
"""

from __future__ import annotations

import asyncio
import json
from collections import Counter
from typing import Any

from slice_agent.trace import record
from slice_pages.audience_brief import _clean_name, profile_summary
from slice_pages.llm import generate_json

from . import doc as D
from . import store

GROUPS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "audienceId": {"type": "string"},
                    "name": {"type": "string"},
                    "summary": {"type": "string"},
                    "speakTo": {"type": "string"},
                    "leadWith": {"type": "string"},
                    "hooks": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"text": {"type": "string"}, "evidence": {"type": "string"}}, "required": ["text", "evidence"]},
                    },
                },
                "required": ["audienceId", "name", "summary", "speakTo", "leadWith", "hooks"],
            },
        }
    },
    "required": ["groups"],
}


async def _members(audience_id: str) -> dict[str, Any]:
    try:
        people = await store.read("emailContacts:byAudience", {"audienceId": audience_id}) or []
    except Exception:
        people = []
    cities = Counter(p.get("city") for p in people if isinstance(p, dict) and p.get("city"))
    ages = Counter(p.get("age") for p in people if isinstance(p, dict) and p.get("age"))
    return {"cities": [f"{k} x{v}" for k, v in cities.most_common(3)], "ages": [f"{k} x{v}" for k, v in ages.most_common(3)]}


async def name_groups(list_id: str) -> dict[str, Any]:
    lst = await store.read("emailLists:get", {"id": list_id})
    if not lst:
        return {"ok": False, "names": [], "error": f"list {list_id} not found"}
    audiences = await store.read("emailAudiences:list", {"brandId": lst.get("brandId")}) or []
    groups = [a for a in audiences if isinstance(a, dict) and a.get("listId") == list_id and a.get("kind") == "group"]
    if not groups:
        return {"ok": False, "names": [], "error": "this list has no taste groups yet"}
    brand = await store.read("emailBrands:get", {"id": lst.get("brandId")}) or {}
    stats = await asyncio.gather(*(_members(store.row_id(g)) for g in groups))
    view = [
        {
            "audienceId": store.row_id(g),
            "currentName": g.get("name"),
            "size": g.get("size"),
            "topEntities": (g.get("topEntities") or [])[:8],
            "taste": profile_summary(g.get("profile"), tags_per_type=5, brands=5, culture=5),
            **s,
        }
        for g, s in zip(groups, stats)
    ]
    about = (brand.get("about") or {}).get("summary") or ""
    prompt = f"""Name the taste groups of {brand.get('name', 'a brand')}'s contact list "{lst.get('name')}" and write a short brief for each, for a marketer writing emails to them.
The business: {about[:400]}
Each group was found by clustering the contacts on their Qloo taste entities (authors, books, artists, films, brands, places they named), plus city and age.

GROUPS:
{json.dumps(view, ensure_ascii=False)}

For each group, by audienceId:
- name: 2 to 4 words a marketer would use as a segment label, about their taste, distinct from the others ("Quiet literary readers", "Speculative worldbuilders"). Sentence case, no colon, no quotes, never "Cluster" or "Group".
- summary: one sentence on who they are, in taste terms.
- speakTo: how to write to them (register, length, words that land), two sentences.
- leadWith: what an email to them should lead with.
- hooks: 3 or 4 cultural hooks an email could use, each with evidence naming the Qloo entity or tag behind it ("Qloo: Ursula K. Le Guin and N. K. Jemisin lead the group").
Never frame anything against bestsellers or trends. Never infer anything about individuals."""
    raw = await generate_json(prompt, GROUPS_SCHEMA, name=f"Name {len(groups)} taste groups", temperature=0.6, result=lambda r: ", ".join(str(g.get("name")) for g in r.get("groups") or []))
    known = {store.row_id(g) for g in groups}
    names: list[dict[str, str]] = []
    used: set[str] = set()
    saves = []
    for g in raw.get("groups") or []:
        aid = str(g.get("audienceId") or "")
        if aid not in known or aid in {n["audienceId"] for n in names}:
            continue
        name = _clean_name(D.clean_dashes(str(g.get("name") or ""))[0])
        brief = {
            "summary": D.clean_dashes(str(g.get("summary") or "").strip())[0],
            "speakTo": D.clean_dashes(str(g.get("speakTo") or "").strip())[0],
            "leadWith": D.clean_dashes(str(g.get("leadWith") or "").strip())[0],
            "hooks": [{"text": str(h.get("text") or "").strip(), "evidence": str(h.get("evidence") or "").strip()} for h in g.get("hooks") or [] if isinstance(h, dict) and h.get("text")][:4],
        }
        fresh = bool(name) and name.lower() not in used
        # The console renames the groups from the reply too; saving the name here keeps them right if it does not.
        saves.append(store.post("/email/audience-brief", {"audienceId": aid, "brief": brief, **({"name": name} if fresh else {})}))
        if fresh:
            used.add(name.lower())
            names.append({"audienceId": aid, "name": name})
    results = await asyncio.gather(*saves, return_exceptions=True)
    failed = [r for r in results if isinstance(r, Exception)]
    if failed:
        record("slice", "Save the group briefs", f"{len(failed)} not saved: {str(failed[0])[:140]}", ms=0)
    return {"ok": bool(names), "names": names, **({"error": f"{len(failed)} briefs not saved"} if failed else {})}
