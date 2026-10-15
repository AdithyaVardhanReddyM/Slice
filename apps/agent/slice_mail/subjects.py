"""Subject line suggestions for a campaign (POST /email/subjects): five options with
distinct angles, written from the email itself, the brand's voice and the audience's taste."""

from __future__ import annotations

import json
from typing import Any

from slice_pages.audience_brief import profile_summary
from slice_pages.llm import generate_json

from . import doc as D
from . import store

SUBJECTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"subject": {"type": "string"}, "preheader": {"type": "string"}, "angle": {"type": "string"}},
                "required": ["subject", "preheader", "angle"],
            },
        }
    },
    "required": ["options"],
}


async def suggest_subjects(campaign_id: str) -> dict[str, Any]:
    data = await store.load_campaign(campaign_id)
    doc, brand, audience, items = data["doc"], data["brand"], data["audience"], data["items"]
    voice = (brand.get("kit") or {}).get("voice") or {}
    aud = (
        f"\"{audience.get('name')}\" ({'one taste group' if audience.get('kind') == 'group' else 'a customer list, each person gets their own version'}). Brief: {json.dumps(audience.get('brief'), ensure_ascii=False)}. Taste: {json.dumps(profile_summary(audience.get('profile'), tags_per_type=4, brands=5, culture=4), ensure_ascii=False)}"
        if audience
        else "not chosen yet: the brand's customers in general"
    )
    prompt = f"""Write subject lines for this marketing email from {brand.get('name')}.

BRAND VOICE: {voice.get('summary', '')} Do: {'; '.join(voice.get('do') or [])}. Avoid: {'; '.join(voice.get('avoid') or [])}.
AUDIENCE: {aud}
THE EMAIL (outline):
{D.outline(doc, items, n=140)}

WRITE 7 options, each with a different angle, named in 1 to 3 words (for example: the specific pick, curiosity, the taste hook, the occasion or date, plain and direct, personal, the offer when the email has one). For each:
- subject: 45 characters or fewer, counting a merge tag as the length of its fallback. Specific and concrete: a title, a name, a date, a place or a taste reference the email really contains. Sentence case. No hype, no ALL CAPS, no emoji, no exclamation marks, no spam words ("free", "act now", "limited time"). A merge tag only as {{{{first_name|fallback}}}}, in at most two options.
- preheader: 40 to 90 characters that add to the subject (never repeat it), true to the email's content.
Never frame anything against bestsellers or trends. Never promise what the email does not contain."""
    raw = await generate_json(prompt, SUBJECTS_SCHEMA, name="Suggest subject lines", temperature=0.8, result=lambda r: "; ".join(str(o.get("subject")) for o in (r.get("options") or [])[:3]))
    options: list[dict[str, str]] = []
    angles: set[str] = set()
    for o in raw.get("options") or []:
        if not isinstance(o, dict):
            continue
        subject = D.clean_dashes(" ".join(str(o.get("subject") or "").split()))[0].rstrip("!")
        preheader = D.clean_dashes(" ".join(str(o.get("preheader") or "").split()))[0]
        angle = " ".join(str(o.get("angle") or "").split())[:30] or "Option"
        problems, _ = D.check_subject(subject, preheader)
        if problems or angle.lower() in angles:
            continue
        angles.add(angle.lower())
        options.append({"subject": subject, "preheader": D.clip(preheader, D.PREHEADER_MAX), "angle": angle[0].upper() + angle[1:]})
        if len(options) >= 5:
            break
    return {"ok": bool(options), "options": options, **({} if options else {"error": "No usable subject lines came back; try again."})}
