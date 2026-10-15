"""Per-person versions of a people campaign (POST /email/personalise).

For each individual contact ticked for the campaign (or the contactIds given): rank the
catalog for them (Convex `emailItems:rank` with their contactId), then one Gemini call
rewrites the email's personal blocks for them, limited to the fields each block type
may change, checked in Python (doc.clean_personalization) and saved as their
`emailVersions` row (/email/version). Runs in the background, three people at a time;
progress goes to the campaign (/email/personalization) and one person's failure is
recorded on their row without stopping the rest.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from slice_agent import convex_client as convex
from slice_agent.trace import record, start_turn
from slice_pages import builder as PB
from slice_pages.audience_brief import profile_summary
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import doc as D
from . import store

CONCURRENCY = 3
_runs: dict[str, asyncio.Task[Any]] = {}

PERSONAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "preheader": {"type": "string"},
        "why": {"type": "string"},
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "text": {"type": "string"},
                    "html": {"type": "string"},
                    "src": {"type": "string"},
                    "alt": {"type": "string"},
                    "label": {"type": "string"},
                    "href": {"type": "string"},
                    "itemIds": {"type": "array", "items": {"type": "string"}},
                    "reasons": {"type": "array", "items": {"type": "object", "properties": {"itemId": {"type": "string"}, "reason": {"type": "string"}}, "required": ["itemId", "reason"]}},
                    "author": {"type": "string"},
                },
                "required": ["id"],
            },
        },
    },
    "required": ["why", "blocks"],
}

FIELD_HELP = {
    "heading": "text (inline html, under 8 words)",
    "text": "html (<p> paragraphs, 1 to 3 sentences)",
    "image": "src and alt (src only from the PICKS images)",
    "button": "label (2 to 4 words) and href (only a PICKS url or the base href)",
    "items": "itemIds (from PICKS, in your order) and reasons (one short line each, under 70 characters, in the reader's terms)",
    "quote": "text and author",
}


async def _progress(campaign_id: str, status: str, done: int, total: int, error: str | None = None) -> None:
    try:
        await store.post("/email/personalization", {"campaignId": campaign_id, "status": status, "done": done, "total": total, "error": error})
    except Exception as err:
        print(f"[slice-email] personalisation progress not saved: {err}")


async def start_personalise(campaign_id: str, contact_ids: list[str] | None = None) -> dict[str, Any]:
    data = await store.load_campaign(campaign_id)
    audience = data["audience"]
    if not audience or audience.get("kind") != "people":
        return {"ok": False, "error": "Personal versions are for campaigns sent to individual contacts."}
    doc = data["doc"]
    slots = D.personal_blocks(doc)
    if not slots:
        return {"ok": False, "error": "Mark at least one block as personal (the taste slot icon on its toolbar) first."}
    people = [c for c in data["contacts"] if not c.get("unsubscribed")]
    if contact_ids:
        wanted = set(contact_ids)
        people = [c for c in people if store.row_id(c) in wanted]
    if not people:
        return {"ok": False, "error": "Tick at least one individual contact first."}
    old = _runs.get(campaign_id)
    if old and not old.done():
        old.cancel()  # the doc or the list changed: the newer run wins
    total = len(people)
    await _progress(campaign_id, "running", 0, total)
    _runs[campaign_id] = asyncio.create_task(_run(campaign_id, data, people))
    return {"ok": True, "total": total}


async def _run(campaign_id: str, data: dict[str, Any], people: list[dict[str, Any]]) -> None:
    start_turn()
    sem = asyncio.Semaphore(CONCURRENCY)
    total = len(people)
    done = 0
    failed: list[str] = []
    version = int(data["doc"].get("version") or 0)

    async def one(contact: dict[str, Any]) -> None:
        nonlocal done
        cid = store.row_id(contact)
        async with sem:
            try:
                p, notes = await personalise_one(data, contact)
                body: dict[str, Any] = {"campaignId": campaign_id, "contactId": cid, "docVersion": version, "personalization": p, "status": "ready"}
                if notes:
                    record("slice", f"Personalise for {contact.get('name')}", "; ".join(notes)[:200], ms=0)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                failed.append(str(contact.get("name") or cid))
                body = {"campaignId": campaign_id, "contactId": cid, "docVersion": version, "personalization": {"blocks": {}}, "status": "failed", "error": f"{type(err).__name__}: {str(err)[:200]}"}
            try:
                await store.post("/email/version", body)
            except Exception as err:
                failed.append(str(contact.get("name") or cid))
                print(f"[slice-email] version for {cid} not saved: {err}")
            done += 1
            await _progress(campaign_id, "running", done, total)

    try:
        await asyncio.gather(*(one(c) for c in people))
    except asyncio.CancelledError:
        return
    ok = total - len(set(failed))
    error = f"{len(set(failed))} of {total} could not be personalised: {', '.join(sorted(set(failed))[:5])}" if failed else None
    await _progress(campaign_id, "ready" if ok else "failed", total, total, error)


def _slot_view(block: dict[str, Any], section: dict[str, Any], items: dict[str, dict[str, Any]]) -> dict[str, Any]:
    keep = {k: block.get(k) for k in D.PERSONAL_FIELDS[block["type"]] if block.get(k) is not None}
    if block["type"] == "items":
        keep["count"] = block.get("count") or len(block.get("itemIds") or [])
        keep["itemNames"] = [items.get(i, {}).get("name") for i in block.get("itemIds") or []]
    return {"id": block["id"], "type": block["type"], "section": section.get("label"), "evidence": section.get("evidence"), "current": keep, "write": FIELD_HELP[block["type"]]}


async def _rank(data: dict[str, Any], contact: dict[str, Any], take: int) -> list[dict[str, Any]]:
    campaign = data["campaign"]
    items = data["items"]
    with timer() as t:
        try:
            res = await convex.action("emailItems:rank", {"brandId": campaign.get("brandId"), "contactId": store.row_id(contact), "take": take})
            ranked = [r for r in (res or {}).get("items") or [] if str(r.get("id")) in items]
        except Exception as err:
            ranked = _local(contact, items, take)
            record("slice", f"Rank for {contact.get('name')}", f"Qloo ranking unavailable ({str(err)[:80]}); tag overlap instead", ms=t.ms, started=t.started)
    return ranked[:take]


def _local(contact: dict[str, Any], items: dict[str, dict[str, Any]], take: int) -> list[dict[str, Any]]:
    profile = contact.get("profile") or {}
    taste: set[str] = set()
    for name in store.contact_names(contact, 12) + [t.get("name", "") for t in profile.get("tags") or []]:
        taste |= PB._words(name)
    # Like emailItems:rank: what they already told us they love is never recommended back.
    listed = {n.lower() for n in store.contact_names(contact, 20)}
    scored = []
    for it in items.values():
        if it["name"].lower() in listed:
            continue
        overlap = sorted(taste & PB._words(" ".join([it["name"], it.get("subtitle") or "", it["description"], " ".join(it.get("tags") or [])])))
        scored.append((len(overlap), it["id"], overlap))
    scored.sort(key=lambda s: -s[0])
    return [{"id": i, "score": n, "evidence": ("shares " + ", ".join(ov[:3]) + " with what they love") if ov else "fills out the range"} for n, i, ov in scored[:take]]


async def personalise_one(data: dict[str, Any], contact: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """One person's Personalization and the notes from cleaning it."""
    doc = data["doc"]
    items = data["items"]
    brand = data["brand"]
    slots = D.personal_blocks(doc)
    count = max([int(b.get("count") or len(b.get("itemIds") or []) or 3) for b, _ in slots if b.get("type") == "items"] or [3])
    ranked = await _rank(data, contact, min(12, count + 5))
    picks = [{**{k: items[r["id"]].get(k) for k in ("id", "name", "subtitle", "kind", "price", "image", "url") if items[r["id"]].get(k)}, "tags": (items[r["id"]].get("tags") or [])[:4], "evidence": r.get("evidence") or ""} for r in ranked if str(r.get("id")) in items]
    loves = store.contact_names(contact, 10)
    profile = contact.get("profile") or {}
    voice = (brand.get("kit") or {}).get("voice") or {}
    base_links = {b.get("href") for b, _ in slots if b.get("href")}
    allowed = D.Allowed(
        item_ids=[p["id"] for p in picks],
        images={p["image"] for p in picks if p.get("image")} | {b.get("src") for b, _ in slots if b.get("src")},
        links={p["url"] for p in picks if p.get("url")} | {u for u in base_links if u} | store.brand_links(brand),
        reasons={p["id"]: p["evidence"] for p in picks if p.get("evidence")},
    )
    first = store.first_name(contact)
    prompt = f"""You personalise one marketing email from {brand.get('name')} for one of its individual contacts. The merchant wrote the base email for the whole list; its personal blocks (below) are rewritten for each person from their own taste, which comes from Qloo, the cultural taste graph. Everything else in the email stays as it is.

BRAND VOICE: {voice.get('summary', '')} Do: {'; '.join(voice.get('do') or [])}. Avoid: {'; '.join(voice.get('avoid') or [])}.
THE EMAIL: subject "{doc.get('subject')}", preheader "{doc.get('preheader')}".
{D.outline(doc, items, n=90)}

PERSONAL BLOCKS TO REWRITE (keep each one's role in the email; write only the listed fields):
{json.dumps([_slot_view(b, s, items) for b, s in slots], ensure_ascii=False)}

THE PERSON: {contact.get('name')} (first name {first or 'unknown'}{', ' + str(contact['city']) if contact.get('city') else ''}).
What they told us they love: {', '.join(loves) or 'nothing listed'}.
Their Qloo taste profile: {json.dumps(profile_summary(profile, tags_per_type=5, brands=6, culture=5), ensure_ascii=False) if profile else 'not compiled; use what they love'}

PICKS (the catalog ranked for this person by Qloo; the only items, pictures and links you may use, with the evidence that ranked each):
{json.dumps(picks, ensure_ascii=False)}

WRITE
- blocks: one entry per personal block, by id, with only its fields. Items blocks: choose from PICKS (their order is a good default) and give each a reason in their terms that names something they love ("Because you loved Normal People"), never generic. Headings and text: speak to this person's taste with one or two concrete hooks from what they love or their profile, in the brand's voice; keep the length of the base copy. Use {{{{first_name|there}}}} at most once, and only where the base copy greets them.
- subject and preheader: only when a personal angle makes them clearly better for this person; the subject 45 characters or fewer. Otherwise leave them empty.
- why: one or two sentences for the merchant: what changed for {first or 'this person'} and which of their signals drove it, naming them.
Sentence case, no em dashes, no exclamation marks. Never frame picks against bestsellers or trends. Never invent prices, facts or links."""
    raw = await generate_json(
        prompt,
        PERSONAL_SCHEMA,
        name=f"Personalise for {contact.get('name')}",
        temperature=0.6,
        result=lambda r: str(r.get("why") or "")[:140],
    )
    p, notes = D.clean_personalization(raw, doc, allowed)
    why = p.get("why") or ""
    if loves and not any(n.lower() in why.lower() for n in loves):
        # The merchant reads `why` to trust the version: it has to name their real signals.
        chosen = next((v.get("itemIds") for v in p["blocks"].values() if v.get("itemIds")), [])
        names = [items[i]["name"] for i in chosen if i in items][:2]
        owner = f"{first}'s" if first else "their"
        p["why"] = f"Written around {owner} love of {' and '.join(loves[:2])}" + (f": the picks lead with {' and '.join(names)}." if names else ".")
    return p, notes
