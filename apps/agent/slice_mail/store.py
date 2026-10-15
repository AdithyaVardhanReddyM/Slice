"""Reading the Email service's data from Convex, normalised for the agent.

`emailCampaigns:getForAgent` bundles a campaign with its brand, audience, items and
(for a customer list kept one by one) its contacts. Rows come back with Convex `_id`s;
the agent works with `id`s, as emailTypes.ts does.
"""

from __future__ import annotations

from typing import Any

from slice_agent import convex_client as convex


async def read(path: str, args: dict[str, Any]) -> Any:
    """A public Convex query, or the action of that name when it is one (renderFor may be either)."""
    try:
        return await convex.query(path, args)
    except Exception as first:
        try:
            return await convex.action(path, args)
        except Exception:
            raise first


async def post(path: str, body: dict[str, Any]) -> Any:
    """POST to an agent route on the Convex site; optional fields never carry null."""
    res, _ = await convex.site(path, _strip_none(body))
    return res


def _strip_none(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _strip_none(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [_strip_none(x) for x in v]
    return v


def row_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("_id") or "")


def item_row(it: dict[str, Any]) -> dict[str, Any]:
    out = {
        "id": row_id(it),
        "name": str(it.get("name") or ""),
        "kind": str(it.get("kind") or "product"),
        "description": str(it.get("description") or ""),
        "tags": [str(t) for t in it.get("tags") or []],
    }
    for k in ("subtitle", "price", "image", "url", "qloo"):
        if it.get(k):
            out[k] = it[k]
    return out


def first_name(contact: dict[str, Any]) -> str:
    return str(contact.get("firstName") or str(contact.get("name") or "").split(" ")[0] or "")


def contact_names(contact: dict[str, Any], n: int = 8) -> list[str]:
    """What a person told us they love: resolved Qloo entities first, then their raw terms."""
    names = [str(e.get("name")) for e in contact.get("entities") or [] if isinstance(e, dict) and e.get("name")]
    for term in contact.get("interests") or []:
        if str(term).lower() not in {x.lower() for x in names}:
            names.append(str(term))
    return names[:n]


async def load_campaign(campaign_id: str) -> dict[str, Any]:
    """{campaign, brand, audience, items: {id: item}, contacts: [...], doc}."""
    data = await read("emailCampaigns:getForAgent", {"id": campaign_id})
    if not data or not data.get("campaign"):
        raise ValueError(f"campaign {campaign_id} not found")
    campaign = dict(data["campaign"])
    doc = campaign.get("doc") if isinstance(campaign.get("doc"), dict) else {}
    brand = data.get("brand") or {}
    audience = data.get("audience") or None
    items = {r["id"]: r for r in (item_row(i) for i in data.get("items") or [] if isinstance(i, dict)) if r["id"]}
    contacts = [c for c in data.get("contacts") or [] if isinstance(c, dict)]
    if audience and audience.get("kind") == "people" and not contacts:
        try:
            contacts = [c for c in await read("emailContacts:byAudience", {"audienceId": row_id(audience)}) or [] if isinstance(c, dict)]
        except Exception:
            contacts = []
    return {"campaign": campaign, "brand": brand, "audience": audience, "items": items, "contacts": contacts, "doc": doc}


def brand_site(brand: dict[str, Any]) -> str | None:
    return (brand.get("footer") or {}).get("website") or brand.get("url") or None


def brand_links(brand: dict[str, Any]) -> set[str]:
    footer = brand.get("footer") or {}
    out = {u for u in (brand.get("url"), footer.get("website")) if u}
    out.update(str(s.get("url")) for s in footer.get("socials") or [] if isinstance(s, dict) and s.get("url"))
    return out


def brand_images(brand: dict[str, Any]) -> set[str]:
    kit = brand.get("kit") or {}
    out = {kit.get("icon")} | {(kit.get("logo") or {}).get("src")}
    return {u for u in out if isinstance(u, str) and u.startswith("http")}
