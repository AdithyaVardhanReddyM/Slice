"""Turns the merchant's first prompt in the builder into a page plan.

The console used to ask for title, slug, goal, offer, CTA, items and audiences
in a form. Now the merchant just describes the page (mentioning audiences with
@) and this decides the rest: page settings, items worth featuring, which
existing audiences get a version, and new audiences to compile when the prompt
names a group in plain words ("for people under 25", "for Berlin").
"""

from __future__ import annotations

from typing import Any

from slice_agent import convex_client as convex

from .llm import generate_json

AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]
GOALS = ["launch", "sale", "subscription", "waitlist", "booking", "other"]

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
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
                    "kind": {"type": "string", "enum": ["demographic", "location", "interests"]},
                    "age": {"type": "string", "enum": AGES},
                    "gender": {"type": "string", "enum": ["male", "female"]},
                    "city": {"type": "string"},
                    "country": {"type": "string"},
                    "interests": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "kind"],
            },
        },
        "reply": {"type": "string"},
    },
    "required": ["title", "slug", "goal", "ctaLabel", "ctaHref", "itemIds", "existingAudienceIds", "newAudiences", "reply"],
}


def _audience_line(a: dict[str, Any]) -> str:
    src = a.get("sources") or {}
    bits = []
    if src.get("location"):
        bits.append(f"city {src['location'].get('city')}")
    d = src.get("demographics") or {}
    if d.get("age") or d.get("gender"):
        bits.append(f"age {d.get('age') or 'any'}, gender {d.get('gender') or 'any'}")
    if src.get("interests"):
        bits.append("likes " + ", ".join(src["interests"][:5]))
    return f"  - {a['_id']}: {a.get('name')} [{a.get('kind')}{'; ' + '; '.join(bits) if bits else ''}]"


async def plan_page(brand_id: str, prompt: str, mentioned: list[str], *, model: str = "gemini-3.8-flash") -> dict[str, Any]:
    brand = await convex.query("pagesBrands:get", {"id": brand_id})
    if not brand:
        raise ValueError(f"brand {brand_id} not found")
    audiences = await convex.query("pagesAudiences:list", {"brandId": brand_id}) or []
    brief = brand.get("brief") or {}
    items = brief.get("items") or []
    item_lines = "\n".join(
        f"  - {it['id']}: {it.get('name')} [{it.get('kind', 'product')}{', ' + it['price'] if it.get('price') else ''}] {it.get('url') or ''}" for it in items[:40]
    ) or "  (none)"
    mentioned_set = set(mentioned)
    named = [a for a in audiences if a["_id"] in mentioned_set]
    others = [a for a in audiences if a["_id"] not in mentioned_set and a.get("status") != "failed"]

    text = f"""You set up a targeted landing page for {brand.get('name')} ({brand.get('url')}) from the merchant's request. A page has one version per audience plus a default version for everyone else; a builder agent then writes each version from Qloo taste data. Decide the page settings and the audiences.

BRAND: {brief.get('summary', '')}
Sells to: {brief.get('audience', '')}. Site CTAs: {', '.join(brief.get('ctas') or []) or 'none'}
ITEMS (id: name [kind, price] url):
{item_lines}

AUDIENCES THE MERCHANT MENTIONED WITH @ (always include their ids in existingAudienceIds):
{chr(10).join(_audience_line(a) for a in named) or '  (none)'}
OTHER SAVED AUDIENCES (include one only if the request clearly describes it, e.g. it names the same city or group):
{chr(10).join(_audience_line(a) for a in others[:30]) or '  (none)'}

MERCHANT'S REQUEST:
{prompt}

RULES
- title: short page name in sentence case, 2 to 5 words, the way a marketer would label it internally ("Summer pass launch"). slug: lowercase words joined by hyphens, 1 to 4 words.
- goal: launch (new product, event, opening), sale (discount or offer), subscription, waitlist (sign ups before availability), booking (rooms, tables, appointments), else other.
- offer: only if the request states one (a discount, a perk, a bundle price); otherwise an empty string. Never invent one.
- ctaLabel: 1 to 3 words in sentence case, matching the goal and the brand's site CTAs ("Get tickets", "Book a room", "Join the waitlist"). ctaHref: the URL of the item the page is about when there is exactly one, else the brand URL {brand.get('url')}.
- itemIds: the items the request is about or clearly implies, by id, at most 6. Empty when the request is general; the builder then ranks items by taste.
- newAudiences: only when the request asks to target or personalise for a group that no mentioned or saved audience covers. One per group named. kind demographic for age or gender ("under 20" and "teenagers" map to age 24_and_younger, "students" too; "over 60" to 55_and_older; gender only when stated), location for a city or country (city, country), interests for people defined by what they love (interests: 2 to 6 artists, brands, films, books or places that define them). name: a short audience name in sentence case ("Under 25s", "Berlin", "Indie music fans"). Do not create an audience for "everyone"; the default version covers that.
- reply: one or two plain sentences to the merchant saying what you set up: the page, and the versions that will be built (the default plus each audience by name). No markdown, no em dashes, no exclamation marks.
"""
    plan = await generate_json(
        text,
        PLAN_SCHEMA,
        name="Plan the page from the prompt",
        temperature=0.3,
        model=model,
        result=lambda p: f"{p.get('title')} ({p.get('goal')}), {len(p.get('existingAudienceIds') or [])} saved + {len(p.get('newAudiences') or [])} new audiences",
    )

    known_items = {it["id"] for it in items}
    known_audiences = {a["_id"] for a in audiences}
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
        if kind == "demographic" and (a.get("age") in AGES or a.get("gender") in ("male", "female")):
            demo = {k: a[k] for k in ("age", "gender") if a.get(k)}
            new.append({"name": name, "kind": kind, "sources": {"demographics": demo}})
        elif kind == "location" and (a.get("city") or "").strip():
            loc = {"city": a["city"].strip(), **({"country": a["country"].strip()} if (a.get("country") or "").strip() else {})}
            new.append({"name": name, "kind": kind, "sources": {"location": loc}})
        elif kind == "interests" and a.get("interests"):
            new.append({"name": name, "kind": kind, "sources": {"interests": [s for s in a["interests"] if s.strip()][:6]}})

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
