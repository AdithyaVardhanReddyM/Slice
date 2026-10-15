"""Reading the Email service's data from Convex, normalised for the agent.

`emailCampaigns:getForAgent` bundles a campaign with its brand, items, the taste
groups ticked (with their members) and the individual contacts ticked. Rows come
back with Convex `_id`s; the agent works with `id`s, as emailTypes.ts does.
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


def targets_name(groups: list[dict[str, Any]], people: int) -> str:
    """"Crime & suspense, Sci-fi & fantasy and 3 individual contacts", as the console says it."""
    parts = [str(g.get("name")) for g in groups] + ([f"{people} individual contact{'s' if people != 1 else ''}"] if people else [])
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1] if parts else "no one yet"


def merged_profile(profiles: list[dict[str, Any] | None]) -> dict[str, Any]:
    """Everyone ticked as one profile: each one's leading signals, tags and brands, interleaved."""
    profiles = [p for p in profiles if isinstance(p, dict) and p]
    out: dict[str, Any] = {"entities": [], "tags": [], "brands": [], "geo": [], "culture": {"artists": [], "films": [], "places": [], "books": []}, "demographics": None}

    def weave(lists: list[list[Any]], key: str, n: int) -> list[Any]:
        seen: set[str] = set()
        woven: list[Any] = []
        for i in range(max((len(x) for x in lists), default=0)):
            for x in lists:
                if i < len(x) and isinstance(x[i], dict) and str(x[i].get(key)) not in seen:
                    seen.add(str(x[i].get(key)))
                    woven.append(x[i])
        return woven[:n]

    out["entities"] = weave([p.get("entities") or [] for p in profiles], "id", 24)
    out["tags"] = weave([p.get("tags") or [] for p in profiles], "id", 40)
    out["brands"] = weave([p.get("brands") or [] for p in profiles], "name", 16)
    out["geo"] = weave([p.get("geo") or [] for p in profiles], "name", 8)
    for k in out["culture"]:
        out["culture"][k] = weave([(p.get("culture") or {}).get(k) or [] for p in profiles], "name", 10)
    return out


def audience_of(groups: list[dict[str, Any]], contacts: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Who the email is written for: the one taste group when it goes only to that group,
    else a stand-in for everyone ticked (kind "versions", their profiles merged), None when
    no one is ticked."""
    if not groups and not contacts:
        return None
    if len(groups) == 1 and not contacts:
        return groups[0]
    return {
        "name": targets_name(groups, len(contacts)),
        "kind": "versions",
        "size": sum(int(g.get("size") or 0) for g in groups) + len(contacts),
        "profile": merged_profile([g.get("profile") for g in groups] + [c.get("profile") for c in contacts]),
    }


async def load_campaign(campaign_id: str) -> dict[str, Any]:
    """{campaign, brand, groups, contacts, audience (see audience_of), items: {id: item}, doc}."""
    data = await read("emailCampaigns:getForAgent", {"id": campaign_id})
    if not data or not data.get("campaign"):
        raise ValueError(f"campaign {campaign_id} not found")
    campaign = dict(data["campaign"])
    doc = campaign.get("doc") if isinstance(campaign.get("doc"), dict) else {}
    brand = data.get("brand") or {}
    groups = [g for g in data.get("groups") or [] if isinstance(g, dict)]
    contacts = [c for c in data.get("contacts") or [] if isinstance(c, dict)]
    items = {r["id"]: r for r in (item_row(i) for i in data.get("items") or [] if isinstance(i, dict)) if r["id"]}
    return {"campaign": campaign, "brand": brand, "groups": groups, "contacts": contacts, "audience": audience_of(groups, contacts), "items": items, "doc": doc}


def brand_site(brand: dict[str, Any]) -> str | None:
    return (brand.get("footer") or {}).get("website") or brand.get("url") or None


def brand_links(brand: dict[str, Any]) -> set[str]:
    footer = brand.get("footer") or {}
    out = {u for u in (brand.get("url"), footer.get("website")) if u}
    out.update(str(s.get("url")) for s in footer.get("socials") or [] if isinstance(s, dict) and s.get("url"))
    return out


def brand_images(brand: dict[str, Any]) -> set[str]:
    kit = brand.get("kit") or {}
    logo = kit.get("logo") or {}
    out = {kit.get("icon"), logo.get("src"), logo.get("light")}
    return {u for u in out if isinstance(u, str) and u.startswith("http")}
