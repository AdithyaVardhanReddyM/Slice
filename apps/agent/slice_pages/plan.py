"""Turns the merchant's first prompt in the builder into a page plan.

The console used to ask for title, slug, goal, offer, CTA, items and audiences
in a form. Now the merchant just describes the page (mentioning audiences with
@) and this decides the rest: page settings, items worth featuring, which
existing audiences the page is for, and new audiences to compile when the
prompt names a group in plain words ("for people under 25", "for Berlin").
A page is one version: for everyone, for one audience, or for several
audiences combined into one group. The builder's start_new_page passes the
page it came from (`source_page_id`), whose settings carry over.

When the prompt leaves something out that would change the page a lot (what
it is about, the offer, who it is for when it hints at targeting), the planner
asks one question with options instead of planning, up to MAX_QUESTIONS per
conversation; the console sends the answers back as `conversation`.
"""

from __future__ import annotations

from typing import Any

from slice_agent import convex_client as convex

from .audience_parse import parse_audience, to_sources
from .llm import generate_json

AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]
GOALS = ["launch", "sale", "subscription", "waitlist", "booking", "other"]
MAX_QUESTIONS = 3
# Icons the console can draw next to an option (lucide, mapped in the console).
OPTION_ICONS = ["users", "globe", "tag", "ticket", "calendar", "mail", "cart", "gift", "map-pin", "music", "heart", "percent", "clock", "star", "megaphone", "pencil", "layout"]

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["ask", "plan"]},
        "question": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "options": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "detail": {"type": "string"},
                            "icon": {"type": "string", "enum": OPTION_ICONS},
                            "audienceId": {"type": "string"},
                            "itemId": {"type": "string"},
                        },
                        "required": ["label", "icon"],
                    },
                },
                "other": {"type": "string"},
            },
            "required": ["text", "options", "other"],
        },
        "title": {"type": "string"},
        "slug": {"type": "string"},
        "goal": {"type": "string", "enum": GOALS},
        "offer": {"type": "string"},
        "ctaLabel": {"type": "string"},
        "ctaHref": {"type": "string"},
        "itemIds": {"type": "array", "items": {"type": "string"}},
        "existingAudienceIds": {"type": "array", "items": {"type": "string"}},
        "newAudiences": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "kind": {"type": "string", "enum": ["demographic", "location", "interests", "custom"]},
                    "ages": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "every age band the group's description names (under 25s → 24_and_younger); empty only when no age is named",
                    },
                    "gender": {"type": "string", "enum": ["male", "female"]},
                    "city": {"type": "string"},
                    "country": {"type": "string"},
                    "interests": {"type": "array", "items": {"type": "string"}},
                    "lifestyle": {"type": "array", "items": {"type": "string"}, "description": "custom audiences: segment slugs the request names outright"},
                    "description": {
                        "type": "string",
                        "description": "custom audiences: the group in the request's own words with every condition it states, ages and gender included ('under 25s in Porto who love Nike and listen to Tyler, the Creator')",
                    },
                },
                "required": ["name", "kind"],
            },
        },
        "reply": {"type": "string"},
    },
    "required": ["action"],
}


def _audience_line(a: dict[str, Any]) -> str:
    src = a.get("sources") or {}
    bits = []
    if src.get("location"):
        bits.append(f"city {src['location'].get('city')}")
    d = src.get("demographics") or {}
    ages = d.get("ages") or ([d["age"]] if d.get("age") else [])
    if ages or d.get("gender"):
        bits.append(f"age {' or '.join(ages) or 'any'}, gender {d.get('gender') or 'any'}")
    if src.get("interests"):
        bits.append("likes " + ", ".join(src["interests"][:5]))
    if src.get("segments"):
        bits.append("lifestyle " + ", ".join(x.get("name", "") for x in src["segments"][:4]))
    if src.get("tags"):
        bits.append("genres " + ", ".join(t.get("name", "") for t in src["tags"][:4]))
    return f"  - {a['_id']}: {a.get('name')} [{a.get('kind')}{'; ' + '; '.join(bits) if bits else ''}]"


def _transcript(prompt: str, conversation: list[dict[str, Any]]) -> str:
    lines = [f"Merchant: {prompt.strip()}"]
    for t in conversation:
        text = str(t.get("text") or "").strip()
        if text:
            lines.append(f"{'Merchant' if t.get('role') == 'merchant' else 'You'}: {text}")
    return "\n".join(lines)


def _question(q: dict[str, Any], items: set[str], audiences: set[str]) -> dict[str, Any] | None:
    options = []
    for o in q.get("options") or []:
        label = str(o.get("label") or "").strip()
        if not label:
            continue
        opt: dict[str, Any] = {"label": label[:60], "detail": str(o.get("detail") or "").strip()[:120], "icon": o.get("icon") if o.get("icon") in OPTION_ICONS else "layout"}
        if o.get("audienceId") in audiences:
            opt["audienceId"] = o["audienceId"]
        if o.get("itemId") in items:
            opt["itemId"] = o["itemId"]
        options.append(opt)
    text = str(q.get("text") or "").strip()
    if not text or len(options) < 2:
        return None
    return {"text": text, "options": options[:4], "other": str(q.get("other") or "").strip()[:80] or "Type your own answer"}


def _custom_sources(a: dict[str, Any], segment_names: dict[str, str]) -> dict[str, Any] | None:
    """A custom audience's sources from the plan; None when it names no condition."""
    src: dict[str, Any] = {}
    parts = 0
    city = (a.get("city") or "").strip()
    if city:
        src["location"] = {"city": city, **({"country": a["country"].strip()} if (a.get("country") or "").strip() else {})}
        parts += 1
    ages = [x for x in AGES if x in (a.get("ages") or []) or x == a.get("age")]
    gender = a.get("gender") if a.get("gender") in ("male", "female") else None
    if ages or gender:
        src["demographics"] = {**({"age": ages[0]} if len(ages) == 1 else {"ages": ages} if ages else {}), **({"gender": gender} if gender else {})}
        parts += bool(ages) + bool(gender)
    interests = [x.strip() for x in a.get("interests") or [] if isinstance(x, str) and x.strip()][:6]
    if interests:
        src["interests"] = interests
        parts += 1
    by_slug = {k.split(":")[-1]: k for k in segment_names}
    segments = []
    for x in a.get("lifestyle") or []:
        sid = x if x in segment_names else by_slug.get(str(x).strip().lower().replace(" ", "_"))
        if sid and all(s["id"] != sid for s in segments):
            segments.append({"id": sid, "name": segment_names[sid]})
    if segments:
        src["segments"] = segments[:4]
        parts += 1
    return src if parts >= 1 else None


async def plan_page(
    brand_id: str,
    prompt: str,
    mentioned: list[str],
    *,
    model: str = "gemini-3.8-flash",
    source_page_id: str | None = None,
    conversation: list[dict[str, Any]] | None = None,
    ask: bool = True,
) -> dict[str, Any]:
    brand = await convex.query("pagesBrands:get", {"id": brand_id})
    if not brand:
        raise ValueError(f"brand {brand_id} not found")
    audiences = await convex.query("pagesAudiences:list", {"brandId": brand_id}) or []
    try:
        segments = await convex.query("pagesAudiences:segments", {}) or []
    except Exception:
        segments = []
    segment_names = {x["id"]: x["name"] for x in segments}
    segment_lines = "; ".join(f"{x['id'].split(':')[-1]} ({x['name']})" for x in segments) or "(none)"
    brief = brand.get("brief") or {}
    items = brief.get("items") or []
    item_lines = "\n".join(
        f"  - {it['id']}: {it.get('name')} [{it.get('kind', 'product')}{', ' + it['price'] if it.get('price') else ''}] {it.get('url') or ''}" for it in items[:40]
    ) or "  (none)"
    mentioned_set = set(mentioned)
    named = [a for a in audiences if a["_id"] in mentioned_set]
    others = [a for a in audiences if a["_id"] not in mentioned_set and a.get("status") != "failed"]
    source_block = ""
    if source_page_id:
        try:
            src = ((await convex.query("pages:get", {"id": source_page_id})) or {}).get("page") or {}
        except Exception:
            src = {}
        if src:
            sb = src.get("brief") or {}
            source_block = f"""
THE MERCHANT ASKED FOR THIS PAGE WHILE EDITING ANOTHER ONE: "{src.get('title')}" (/{src.get('slug')}), goal {sb.get('goal')}, offer {sb.get('offer') or 'none'}, CTA {sb.get('cta')}, items {', '.join(sb.get('itemIds') or []) or 'none'}.
Its brief: {sb.get('prompt', '')}
Keep its goal, offer, CTA and items unless the request changes them. The title names the new audience ("Camping pass for under 25s"); the slug is new.
"""

    conversation = conversation or []
    asked = sum(1 for t in conversation if t.get("role") != "merchant")
    may_ask = ask and asked < MAX_QUESTIONS
    if may_ask:
        ask_block = f"""ASK OR PLAN (action)
- plan when you can set the page up well from the conversation: it says what the page is about (a product, an event, a season, an offer) and the goal is clear or obvious. Who it is for may go unsaid: a page with no audiences is for everyone, a fine default. If the merchant leaves a choice to you ("whatever", "you decide"), decide and plan.
- ask only when a missing answer would change the page a lot and the request, the brand and its items cannot tell you: what the page is about when the request is vague ("a landing page", "something for summer"); the offer when they want a sale or promotion but name none; who it is for when they hint at targeting without saying who ("a personalised page", "for our fans", "for a specific crowd"). Never ask what the conversation already answers, and never about the title, slug or wording. One question per turn; {asked} of at most {MAX_QUESTIONS} asked so far.
- question.text: one short question in plain words, ending with a question mark. After an answer, open with a few words that show you got it ("Got it, a summer sale. What is the offer?").
- question.options: 2 to 4 concrete choices drawn from this brand: its items (set itemId), its saved audiences (set audienceId; add "Everyone" with icon globe when asking who the page is for), its site CTAs, offers that suit it. label 2 to 5 words in sentence case; detail one short line; icon from the list.
- question.other: a placeholder for typing their own answer ("Describe the offer").
- When you ask, leave the plan fields out."""
    else:
        ask_block = "PLAN NOW (action \"plan\"): decide anything the conversation leaves open yourself."

    text = f"""You set up a targeted landing page for {brand.get('name')} ({brand.get('url')}) from the merchant's request. A page is built for one audience, or for several audiences combined into one group, or for everyone when it names none; a builder agent then writes it from Qloo taste data. Decide the page settings and the audiences.

BRAND: {brief.get('summary', '')}
Sells to: {brief.get('audience', '')}. Site CTAs: {', '.join(brief.get('ctas') or []) or 'none'}
ITEMS (id: name [kind, price] url):
{item_lines}

AUDIENCES THE MERCHANT MENTIONED WITH @ (always include their ids in existingAudienceIds):
{chr(10).join(_audience_line(a) for a in named) or '  (none)'}
OTHER SAVED AUDIENCES (include one only if the request clearly describes it, e.g. it names the same city or group):
{chr(10).join(_audience_line(a) for a in others[:30]) or '  (none)'}

{source_block}
CONVERSATION (the merchant's request, then any questions you asked and their answers; later answers win):
{_transcript(prompt, conversation)}

{ask_block}

RULES FOR THE PLAN
- title: short page name in sentence case, 2 to 5 words, the way a marketer would label it internally ("Summer pass launch"). slug: lowercase words joined by hyphens, 1 to 4 words.
- goal: launch (new product, event, opening), sale (discount or offer), subscription, waitlist (sign ups before availability), booking (rooms, tables, appointments), else other.
- offer: only if the conversation states one (a discount, a perk, a bundle price); otherwise an empty string. Never invent one.
- ctaLabel: 1 to 3 words in sentence case, matching the goal and the brand's site CTAs ("Get tickets", "Book a room", "Join the waitlist"). ctaHref: the URL of the item the page is about when there is exactly one, else the brand URL {brand.get('url')}.
- itemIds: the items the request is about or clearly implies, by id, at most 6. Empty when the request is general; the builder then ranks items by taste.
- newAudiences: only when the request asks to target or personalise for a group that no mentioned or saved audience covers. One per group named. A group described by one thing is one simple audience: kind demographic for age or gender (ages: "under 20" and "teenagers" map to 24_and_younger, "students" too; "over 60" to 55_and_older; gender only when stated), location for a city or country (city, country), interests for people defined by what they love (interests: 2 to 6 artists, brands, films, books or places that define them).
- A group described by several things at once is ONE audience of kind custom carrying all of them, never several audiences: "under 25s in Lisbon who love Nike" is one custom audience (city Lisbon, ages [24_and_younger], interests [Nike]); "women in Austin into running" is one (city, gender, lifestyle [running]). Custom fields: city and country; ages whenever the request names an age, as one or more bands ("under 25s" is [24_and_younger], "18 to 30" is [24_and_younger, 25_to_29]); gender; interests (names of artists, brands, films, books, places they love, as written); lifestyle (segment slugs from this list, only when the request itself names that hobby, life stage or habit, never inferred from a brand or artist: {segment_lines}). Every condition the request states goes in; nothing it does not state. Separate groups ("for London and for Paris") are separate audiences, all on this one page, combined.
- name: a short audience name in sentence case ("Under 25s", "Berlin", "Indie music fans", "Lisbon under 25s into Nike"). Do not create an audience for "everyone"; a page with no audiences is for everyone.
- reply: one or two plain sentences to the merchant saying what you set up: the page and who it is for (everyone, or the audiences by name, combined when there are several). No markdown, no em dashes, no exclamation marks.
"""
    plan = await generate_json(
        text,
        PLAN_SCHEMA,
        name="Plan the page from the prompt",
        temperature=0.3,
        model=model,
        result=lambda p: f"asks: {(p.get('question') or {}).get('text')}" if p.get("action") == "ask" else f"{p.get('title')} ({p.get('goal')}), {len(p.get('existingAudienceIds') or [])} saved + {len(p.get('newAudiences') or [])} new audiences",
    )

    known_items = {it["id"] for it in items}
    known_audiences = {a["_id"] for a in audiences}
    if may_ask and plan.get("action") == "ask":
        q = _question(plan.get("question") or {}, known_items, known_audiences)
        if q:
            return {"question": q}
    ids = [i for i in (plan.get("existingAudienceIds") or []) if i in known_audiences]
    for i in mentioned:
        if i in known_audiences and i not in ids:
            ids.append(i)
    new: list[dict[str, Any]] = []
    for a in plan.get("newAudiences") or []:
        kind = a.get("kind")
        name = (a.get("name") or "").strip()
        if not name:
            continue
        ages = [x for x in AGES if x in (a.get("ages") or []) or x == a.get("age")]
        if kind == "demographic" and (ages or a.get("gender") in ("male", "female")):
            demo = {**({"age": ages[0]} if len(ages) == 1 else {"ages": ages} if ages else {}), **({"gender": a["gender"]} if a.get("gender") in ("male", "female") else {})}
            new.append({"name": name, "kind": kind if len(ages) <= 1 else "custom", "sources": {"demographics": demo}})
        elif kind == "location" and (a.get("city") or "").strip():
            loc = {"city": a["city"].strip(), **({"country": a["country"].strip()} if (a.get("country") or "").strip() else {})}
            new.append({"name": name, "kind": kind, "sources": {"location": loc}})
        elif kind == "interests" and a.get("interests"):
            new.append({"name": name, "kind": kind, "sources": {"interests": [s for s in a["interests"] if s.strip()][:6]}})
        elif kind == "custom":
            # The describe-box reader turns the group's words into conditions with every name
            # resolved in Qloo; it keeps ages and gender that this plan's nested list tends to drop.
            src = None
            desc = (a.get("description") or "").strip()
            if desc:
                try:
                    parsed = await parse_audience(brand_id, desc)
                    src = to_sources(parsed["definition"], parsed.get("unresolved")) or None
                except Exception:
                    src = None
            src = src or _custom_sources(a, segment_names)
            if src:
                new.append({"name": name, "kind": kind, "sources": src})

    href = (plan.get("ctaHref") or "").strip()
    return {
        "title": (plan.get("title") or "Untitled page").strip(),
        "slug": (plan.get("slug") or "").strip(),
        "goal": plan.get("goal") if plan.get("goal") in GOALS else "other",
        "offer": (plan.get("offer") or "").strip(),
        "cta": {"label": (plan.get("ctaLabel") or "Shop now").strip(), "href": href if href.startswith(("http://", "https://")) else brand.get("url")},
        "itemIds": [i for i in (plan.get("itemIds") or []) if i in known_items][:6],
        "audienceIds": ids,
        "newAudiences": new[:4],
        "reply": (plan.get("reply") or "").strip(),
    }
