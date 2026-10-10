"""The concierge's tools.

Catalog reads and taste reads go to Convex; taste writes go through Convex's
agent routes. Every tool records a span (trace.py) so the shopper can see how
a recommendation was made.
"""

from __future__ import annotations

import time
from typing import Any

from google.adk.tools import ToolContext

from . import convex_client as convex
from .trace import record, timer

# --- session state keys ----------------------------------------------------
STORE_KEY = "store_key"
PROFILE_ID = "profile_id"
PROFILE = "profile"  # cached profile doc for this turn
STORE = "store"  # cached store doc
BRIEF = "brief"
PAGE = "page"
LAST_CANDIDATES = "last_candidates"
PICKS = "picks"
SHOWN_IDS = "shown_ids"

_store_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def load_store(key: str) -> dict[str, Any] | None:
    cached = _store_cache.get(key)
    if cached and time.time() - cached[0] < 300:
        return cached[1]
    store = await convex.query("catalog:store", {"key": key})
    if store:
        _store_cache[key] = (time.time(), store)
    return store


async def load_profile(profile_id: str | None) -> dict[str, Any] | None:
    if not profile_id:
        return None
    try:
        return await convex.query("taste:get", {"id": profile_id})
    except Exception:
        return None


def _short(text: str, n: int = 150) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _compact_product(p: dict[str, Any]) -> dict[str, Any]:
    a = p.get("attributes", {})
    out = {
        "id": p["id"],
        "name": p["name"],
        "brand": p.get("brand"),
        "price": p["price"],
        "category": p["category"],
        "subcategory": p["subcategory"],
        "department": p.get("department"),
        "in_stock": any(v.get("inStock") for v in p.get("variants", [])),
        "styles": a.get("style", []),
        "materials": a.get("material", []),
        "colors": a.get("colors", []),
        "description": _short(p.get("description", ""), 220),
    }
    if p.get("compareAtPrice"):
        out["was"] = p["compareAtPrice"]
    return out


def _taste_from_state(state: Any) -> dict[str, Any]:
    """The taste the ranker uses: the agent's brief if it exists, else the Qloo hints."""
    profile = state.get(PROFILE) or {}
    brief = state.get(BRIEF) or profile.get("brief")
    hints = profile.get("hints") or {"styles": [], "terms": []}
    if brief:
        styles = [{"id": s["id"], "weight": float(s["weight"])} for s in brief.get("styles", [])]
    else:
        styles = [{"id": s["id"], "weight": float(s["score"])} for s in hints.get("styles", [])]
    terms = [{"term": t["term"], "weight": float(t["weight"])} for t in hints.get("terms", [])][:40]
    brands = [
        {"name": b["name"], "weight": float(b["affinity"])}
        for b in profile.get("brands", [])
        if b.get("inStore")
    ]
    taste: dict[str, Any] = {"styles": styles, "terms": terms, "brands": brands}
    if brief:
        taste["palette"] = brief.get("palette", [])
        taste["materials"] = brief.get("materials", [])
        taste["avoid"] = brief.get("avoid", [])
    return taste


# --- tools -----------------------------------------------------------------


async def set_taste_brief(
    summary: str,
    styles: list[dict],
    palette: list[str],
    materials: list[str],
    avoid: list[str],
    tool_context: ToolContext,
) -> dict:
    """Translate the shopper's Qloo taste read into this store's own vocabulary. Call this
    once at the start of a conversation that has a taste profile, and again after
    add_taste_signal.

    Args:
        summary: One sentence, in plain words, of what the shopper's taste looks like in
            this store. Spoken to the shopper, so no jargon.
        styles: 2 to 4 entries of {"id": <style id from the store's vocabulary>,
            "weight": <0.0-1.0>, "because": <which Qloo tags or brand affinities point here>}.
            Weights are relative; the strongest fit is 1.0.
        palette: Up to 6 color words the shopper would gravitate to (e.g. "olive", "oatmeal").
        materials: Up to 6 materials or fabrics (e.g. "waxed canvas", "linen").
        avoid: Up to 4 things that would feel wrong for this taste (e.g. "logos", "neon").
    """
    state = tool_context.state
    store = state.get(STORE) or {}
    valid = {s["id"] for s in store.get("styles", [])}
    cleaned = []
    for s in styles:
        sid = str(s.get("id", "")).strip()
        if sid not in valid:
            continue
        w = max(0.0, min(1.0, float(s.get("weight", 0.5))))
        cleaned.append({"id": sid, "weight": w, "because": str(s.get("because", ""))[:300]})
    if not cleaned:
        return {"ok": False, "error": f"No valid style ids. Use ids from: {sorted(valid)}"}
    brief = {
        "summary": summary.strip()[:400],
        "styles": cleaned,
        "palette": [p.strip() for p in palette if p.strip()][:6],
        "materials": [m.strip() for m in materials if m.strip()][:6],
        "avoid": [a.strip() for a in avoid if a.strip()][:4],
    }
    state[BRIEF] = brief
    with timer() as t:
        profile_id = state.get(PROFILE_ID)
        if profile_id:
            try:
                await convex.site("/agent/brief", {"profileId": profile_id, "brief": brief})
            except Exception as err:  # the brief still works for this session
                record("slice", "Save taste brief", f"not saved: {err}", ms=t.ms)
    record(
        "llm",
        "Translate Qloo taste into the store's styles",
        ", ".join(f"{s['id']} {int(s['weight'] * 100)}%" for s in cleaned),
        ms=t.ms,
        started=t.started,
    )
    return {"ok": True, "brief": brief}


async def recommend_products(
    tool_context: ToolContext,
    category: str | None = None,
    subcategory: str | None = None,
    department: str | None = None,
    room: str | None = None,
    keywords: list[str] | None = None,
    price_max: float | None = None,
    price_min: float | None = None,
    exclude_ids: list[str] | None = None,
    take: int = 10,
) -> dict:
    """Rank the catalog by fit with the shopper's taste, within what they asked for. Returns
    candidates with a score breakdown and which taste signals each one matched. Never
    ranks by popularity, sales or newness.

    Args:
        category: Exact top-level category from the store's navigation, if the shopper
            asked for one. Leave empty to browse across the store.
        subcategory: Exact subcategory, if asked.
        department: "women" | "men" for fashion stores, only when the shopper said so or chose it in
            the questionnaire ("shops_for" in the profile). Never infer it from the audience skew.
        room: For home stores: "living room", "bedroom", ...
        keywords: Words from the shopper's request that must show up in the product
            ("linen", "gift", "rain", "small apartment"). Keep to 1-3.
        price_max: Budget ceiling in the store currency, if stated.
        price_min: Price floor, if stated.
        exclude_ids: Product ids already shown, so follow-ups bring new options.
        take: How many candidates to return (default 10, max 20).
    """
    state = tool_context.state
    taste = _taste_from_state(state)
    intent: dict[str, Any] = {}
    if category:
        intent["category"] = category
    if subcategory:
        intent["subcategory"] = subcategory
    if department:
        intent["department"] = department.lower()
    if room:
        intent["room"] = room
    if keywords:
        intent["keywords"] = [k for k in keywords if k.strip()][:4]
    if price_max is not None:
        intent["priceMax"] = float(price_max)
    if price_min is not None:
        intent["priceMin"] = float(price_min)
    shown = list(state.get(SHOWN_IDS) or [])
    excl = list(dict.fromkeys((exclude_ids or []) + shown))
    if excl:
        intent["excludeIds"] = excl

    with timer() as t:
        result = await convex.query(
            "catalog:recommend",
            {
                "storeKey": state.get(STORE_KEY),
                "taste": taste,
                "intent": intent,
                "take": max(1, min(20, int(take))),
            },
        )
    cands = result.get("candidates", [])
    state[LAST_CANDIDATES] = {c["product"]["id"]: c for c in cands}
    ask = ", ".join(f"{k}={v}" for k, v in intent.items() if k != "excludeIds") or "whole store"
    record(
        "catalog",
        f"Rank {int(result.get('pool') or 0)} of {int(result.get('catalogSize') or 0)} products by taste",
        f"{ask}; top: " + ", ".join(c["product"]["name"] for c in cands[:3]),
        ms=t.ms,
        started=t.started,
        params={
            "styles": ", ".join(f"{s['id']}:{s['weight']:.2f}" for s in taste["styles"][:4]),
            "terms": ", ".join(t_["term"] for t_ in taste["terms"][:8]),
            "brands": ", ".join(b["name"] for b in taste["brands"][:6]) or "none in store",
            **{k: str(v) for k, v in intent.items() if k != "excludeIds"},
        },
    )
    return {
        "catalog_size": result.get("catalogSize"),
        "pool_after_filters": result.get("pool"),
        "taste_used": {
            "styles": taste["styles"][:4],
            "brands_in_store": [b["name"] for b in taste["brands"][:6]],
        },
        "candidates": [
            {
                **_compact_product(c["product"]),
                "fit": c["score"],
                "matched": {k: v for k, v in c["matched"].items() if v},
            }
            for c in cands
        ],
    }


async def search_catalog(
    query: str,
    tool_context: ToolContext,
    category: str | None = None,
    department: str | None = None,
    price_max: float | None = None,
) -> dict:
    """Plain text search of the catalog, for "do you have ...?" questions. Use
    recommend_products when the shopper wants suggestions; use this to check what exists.

    Args:
        query: Words to look for in names, descriptions, materials and tags.
        category: Exact top-level category to restrict to, if any.
        department: "women" | "men", if relevant.
        price_max: Budget ceiling, if stated.
    """
    state = tool_context.state
    args: dict[str, Any] = {"storeKey": state.get(STORE_KEY), "query": query, "take": 8}
    if category:
        args["category"] = category
    if department:
        args["department"] = department.lower()
    if price_max is not None:
        args["priceMax"] = float(price_max)
    with timer() as t:
        result = await convex.query("catalog:search", args)
    products = result.get("products", [])
    record(
        "catalog",
        f'Search catalog for "{query}"',
        f"{int(result.get('matches') or 0)} matches of {int(result.get('total') or 0)}",
        ms=t.ms,
        started=t.started,
        params={k: str(v) for k, v in args.items() if k != "storeKey"},
    )
    return {"matches": result.get("matches"), "products": [_compact_product(p) for p in products]}


async def get_product(product_id: str, tool_context: ToolContext) -> dict:
    """Full details of one product by id or slug (for the product the shopper is looking at,
    or one they ask about).

    Args:
        product_id: The product id or URL slug.
    """
    state = tool_context.state
    with timer() as t:
        products = await convex.query("catalog:get", {"storeKey": state.get(STORE_KEY), "ids": [product_id]})
    if not products:
        record("catalog", f"Look up {product_id}", "not found", ms=t.ms)
        return {"found": False}
    p = products[0]
    record("catalog", f"Look up {p['name']}", f"{p['subcategory']}, ${p['price']:g}", ms=t.ms, started=t.started)
    return {
        "found": True,
        "product": {
            **_compact_product(p),
            "description": p.get("description"),
            "details": p.get("details", []),
            "use_case": p.get("attributes", {}).get("useCase", []),
            "occasion": p.get("attributes", {}).get("occasion", []),
            "room": p.get("attributes", {}).get("room", []),
            "fit": p.get("attributes", {}).get("fit"),
            "variants": [f"{v['label']}{'' if v['inStock'] else ' (sold out)'}" for v in p.get("variants", [])],
            "url": p.get("url"),
        },
    }


async def add_taste_signal(name: str, tool_context: ToolContext, kind: str | None = None) -> dict:
    """Add something the shopper mentioned liking (an artist, film, show, book, place, brand,
    designer, city) to their taste profile. Qloo re-reads the whole profile, so call
    set_taste_brief again afterwards.

    Args:
        name: What they mentioned, as they said it ("Wes Anderson", "Aesop", "Lisbon").
        kind: Optional Qloo type to disambiguate: artist, movie, tv_show, book, place,
            destination, brand, person, podcast, videogame.
    """
    state = tool_context.state
    profile_id = state.get(PROFILE_ID)
    if not profile_id:
        return {
            "ok": False,
            "error": "No taste profile yet. Tell the shopper they can build one from the taste button.",
        }
    with timer() as t:
        result, _ = await convex.site("/agent/signal", {"profileId": profile_id, "query": name, "kind": kind})
    for span in result.get("trace", []):
        record(
            span.get("kind", "qloo"),
            span.get("name", "Qloo"),
            span.get("result", ""),
            ms=int(span.get("ms", 0)),
            path=span.get("path"),
            params=span.get("params"),
            cache=span.get("cache"),
        )
    entity = result.get("entity")
    if not entity:
        record("qloo", f'Resolve "{name}"', "no match", ms=t.ms)
        return {"ok": False, "error": f'Qloo has no entity for "{name}". Carry on without it.'}
    profile = result.get("profile") or {}
    state[PROFILE] = profile
    state[BRIEF] = None
    return {
        "ok": True,
        "added": {"name": entity["name"], "type": entity["type"]},
        "profile": profile_summary(profile, store=state.get(STORE) or {}),
        "next": "Call set_taste_brief again, then recommend_products.",
    }


async def present_picks(picks: list[dict], tool_context: ToolContext) -> dict:
    """Show product cards to the shopper. Only products returned by recommend_products,
    search_catalog or get_product in this conversation can be shown. Call this before
    writing your reply; the reply then only needs a sentence or two.

    Args:
        picks: 1 to 4 entries of {"product_id": <id>, "reason": <one sentence, spoken to the
            shopper, naming the concrete taste evidence: the Qloo tag, brand affinity or
            thing they said that this product answers>}.
    """
    state = tool_context.state
    ids = [str(p.get("product_id", "")).strip() for p in picks if p.get("product_id")][:4]
    if not ids:
        return {"ok": False, "error": "No product ids given."}
    with timer() as t:
        products = await convex.query("catalog:get", {"storeKey": state.get(STORE_KEY), "ids": ids})
    by_id = {p["id"]: p for p in products}
    by_id.update({p["slug"]: p for p in products})
    cands = state.get(LAST_CANDIDATES) or {}
    out = []
    missing = []
    for pick in picks:
        pid = str(pick.get("product_id", "")).strip()
        p = by_id.get(pid)
        if not p:
            missing.append(pid)
            continue
        c = cands.get(p["id"])
        out.append(
            {
                "product": {
                    "id": p["id"],
                    "slug": p["slug"],
                    "name": p["name"],
                    "brand": p.get("brand"),
                    "price": p["price"],
                    "compareAtPrice": p.get("compareAtPrice"),
                    "category": p["category"],
                    "subcategory": p["subcategory"],
                    "image": (p.get("images") or [None])[0],
                    "url": p.get("url"),
                    "styles": p.get("attributes", {}).get("style", []),
                    "materials": p.get("attributes", {}).get("material", []),
                    "colors": p.get("attributes", {}).get("colors", []),
                    "description": p.get("description", ""),
                },
                "reason": str(pick.get("reason", "")).strip()[:400],
                "fit": c["score"] if c else None,
                "breakdown": c.get("breakdown") if c else None,
                "matched": {k: v for k, v in (c.get("matched") or {}).items() if v} if c else {},
            }
        )
    if not out:
        return {"ok": False, "error": f"Unknown product ids: {missing}. Use ids from the tools."}
    state[PICKS] = out
    state[SHOWN_IDS] = list(dict.fromkeys((state.get(SHOWN_IDS) or []) + [o["product"]["id"] for o in out]))
    record("slice", "Show picks", ", ".join(o["product"]["name"] for o in out), ms=t.ms, started=t.started)
    return {"ok": True, "shown": [o["product"]["name"] for o in out], "unknown_ids": missing}


# --- summaries for the instruction ----------------------------------------


def profile_summary(profile: dict[str, Any], store: dict[str, Any]) -> dict[str, Any]:
    """The profile as the model should see it: compact, in words, with provenance."""
    if not profile:
        return {}
    tags_by_type: dict[str, list[str]] = {}
    for t in profile.get("tags", []):
        kind = t.get("type", "").split(":")[2] if t.get("type", "").count(":") >= 2 else "tag"
        tags_by_type.setdefault(kind, [])
        if len(tags_by_type[kind]) < 8:
            tags_by_type[kind].append(t["name"])
    brands = []
    for b in profile.get("brands", [])[:12]:
        desc = ", ".join((b.get("personalStyle") or [])[:3])
        brands.append(f"{b['name']}{' (carried here)' if b.get('inStore') else ''}" + (f": {desc}" if desc else ""))
    demo = profile.get("demographics") or {}
    skew = []
    for group in ("age", "gender"):
        vals = demo.get(group) or {}
        if vals:
            k, val = max(vals.items(), key=lambda kv: kv[1])
            if val > 0.1:
                skew.append(k.replace("_", " "))
    hints = profile.get("hints") or {}
    return {
        "city": profile.get("city"),
        "shops_for": {"female": "women's", "male": "men's"}.get(profile.get("gender") or "", None),
        "age_range": (profile.get("age") or "").replace("_", " ") or None,
        "signals": [f"{e['name']} ({e['type'].split(':')[-1].replace('_', ' ')}, {e['source']})" for e in profile.get("entities", [])],
        "qloo_tags": tags_by_type,
        "brand_affinities": brands,
        "audience_skew": skew,
        "style_hints": [f"{s['id']} {int(s['score'] * 100)}% via {', '.join(s['from'][:3])}" for s in hints.get("styles", [])[:5]],
        "brief": profile.get("brief"),
    }
