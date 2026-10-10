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
SESSION = "session"  # [{productId, weight, name, styles, kinds}] from this visit's browsing

_store_cache: dict[str, tuple[float, dict[str, Any]]] = {}

# What one browsing event says about taste. Summed per product, capped at 1,
# newest first with a little decay so an hour-old glance doesn't outweigh now.
SIGNAL_WEIGHT = {"view": 0.25, "dwell": 0.25, "click": 0.5, "cart": 1.0}
DWELL_MS = 15_000


async def load_session(store_key: str, signals: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Turn slice.js's raw events ({type, id, at, ms}) into weighted products with names."""
    if not signals:
        return []
    weights: dict[str, float] = {}
    kinds: dict[str, set[str]] = {}
    ordered = sorted(signals, key=lambda s: -float(s.get("at") or 0))
    seen_products: list[str] = []
    for s in ordered:
        pid = str(s.get("id") or "").strip()
        kind = str(s.get("type") or "")
        if not pid or kind not in SIGNAL_WEIGHT:
            continue
        if pid not in seen_products:
            seen_products.append(pid)
        decay = 0.85 ** seen_products.index(pid)
        w = SIGNAL_WEIGHT[kind]
        if kind == "view" and float(s.get("ms") or 0) >= DWELL_MS:
            w += SIGNAL_WEIGHT["dwell"]
        weights[pid] = min(1.0, weights.get(pid, 0.0) + w * decay)
        kinds.setdefault(pid, set()).add(kind)
    if not weights:
        return []
    try:
        products = await convex.query("catalog:get", {"storeKey": store_key, "ids": list(weights)[:12]})
    except Exception:
        products = []
    by_id = {p["id"]: p for p in products}
    out = []
    for pid, w in sorted(weights.items(), key=lambda kv: -kv[1])[:12]:
        p = by_id.get(pid)
        if not p:
            continue
        out.append(
            {
                "productId": pid,
                "weight": round(w, 3),
                "name": p["name"],
                "styles": p.get("attributes", {}).get("style", []),
                "kinds": sorted(kinds.get(pid, ())),
            }
        )
    return out


def clean_brief(
    store: dict[str, Any],
    *,
    summary: str,
    styles: list[dict],
    palette: list[str],
    materials: list[str],
    avoid: list[str],
) -> dict[str, Any] | None:
    """Validate a brief against the store's style vocabulary. None when no style id is usable."""
    valid = {s["id"] for s in store.get("styles", [])}
    cleaned = []
    for s in styles:
        sid = str(s.get("id", "")).strip()
        if sid not in valid:
            continue
        w = max(0.0, min(1.0, float(s.get("weight", 0.5))))
        cleaned.append({"id": sid, "weight": w, "because": str(s.get("because", ""))[:300]})
    if not cleaned:
        return None
    cleaned.sort(key=lambda s: -s["weight"])
    return {
        "summary": summary.strip()[:400],
        "styles": cleaned[:4],
        "palette": [str(p).strip() for p in palette if str(p).strip()][:6],
        "materials": [str(m).strip() for m in materials if str(m).strip()][:6],
        "avoid": [str(a).strip() for a in avoid if str(a).strip()][:4],
    }


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


def _compact_product(p: dict[str, Any], full: bool = False) -> dict[str, Any]:
    """A product as the model reads it. Candidates carry everything get_product
    would add, so the model never has to look a candidate up again."""
    a = p.get("attributes", {})
    variants = p.get("variants", [])
    out: dict[str, Any] = {
        "id": p["id"],
        "name": p["name"],
        "brand": p.get("brand"),
        "price": p["price"],
        "category": p["category"],
        "subcategory": p["subcategory"],
        "department": p.get("department"),
        "in_stock": any(v.get("inStock") for v in variants),
        "styles": a.get("style", []),
        "materials": a.get("material", []),
        "colors": a.get("colors", []),
        "description": _short(p.get("description", ""), 420 if full else 220),
    }
    if p.get("compareAtPrice"):
        out["was"] = p["compareAtPrice"]
    if full:
        out["details"] = [_short(d, 120) for d in p.get("details", [])[:4]]
        for key, attr in (("use_case", "useCase"), ("occasion", "occasion"), ("room", "room")):
            if a.get(attr):
                out[key] = a[attr]
        if a.get("fit"):
            out["fit"] = a["fit"]
        out["available"] = [v["label"] for v in variants if v.get("inStock")][:12]
    return out


def _taste_from_state(state: Any) -> dict[str, Any]:
    """The taste vector the ranker uses: the brief (or the deterministic hints) for
    styles, the profile's Qloo tags by id, store-brand affinities, and the
    session layer from this visit's browsing."""
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
    tags = [
        {"id": t["id"], "type": t.get("type", ""), "affinity": float(t.get("affinity", 0))}
        for t in profile.get("tags", [])
        if t.get("id")
    ][:100]
    taste: dict[str, Any] = {"styles": styles, "terms": terms, "brands": brands, "tags": tags}
    if brief:
        taste["palette"] = brief.get("palette", [])
        taste["materials"] = brief.get("materials", [])
        taste["avoid"] = brief.get("avoid", [])
    session = state.get(SESSION) or []
    if session:
        taste["session"] = [{"productId": s["productId"], "weight": float(s["weight"])} for s in session]
    return taste


def _fallback_reason(c: dict[str, Any] | None, store: dict[str, Any]) -> str:
    """A plain reason from the ranker's evidence, for when the model gives none."""
    if not c:
        return ""
    m = c.get("matched") or {}
    labels = {s["id"]: s["label"] for s in store.get("styles", [])}
    parts: list[str] = []
    if m.get("tags"):
        parts.append("Qloo links your taste to " + " and ".join(str(t).lower() for t in m["tags"][:2]))
    elif m.get("styles"):
        parts.append("sits in your " + labels.get(m["styles"][0], m["styles"][0]).lower() + " lean")
    if m.get("brand"):
        parts.append(f"{m['brand']} is one of your brand affinities")
    detail = (m.get("materials") or []) + (m.get("palette") or [])
    if detail:
        parts.append("in " + " and ".join(str(d).lower() for d in detail[:2]))
    text = "; ".join(parts).strip()
    return (text[0].upper() + text[1:] + ".") if text else ""


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
    brief = clean_brief(store, summary=summary, styles=styles, palette=palette, materials=materials, avoid=avoid)
    if not brief:
        valid = sorted(s["id"] for s in store.get("styles", []))
        return {"ok": False, "error": f"No valid style ids. Use ids from: {valid}"}
    cleaned = brief["styles"]
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
    if exclude_ids:
        intent["excludeIds"] = list(exclude_ids)
    return await rank(tool_context.state, intent, take=take)


async def rank(state: Any, intent: dict[str, Any], *, take: int = 10) -> dict[str, Any]:
    """The ranking step behind recommend_products, also run by the server before an
    opener so the model's first call can be present_picks. `state` is any mapping
    with the session keys (a ToolContext state or the plain dict the server builds)."""
    taste = _taste_from_state(state)
    intent = dict(intent)
    shown = list(state.get(SHOWN_IDS) or [])
    # What's already in the bag is evidence, not a recommendation.
    carted = [s["productId"] for s in (state.get(SESSION) or []) if "cart" in (s.get("kinds") or [])]
    excl = list(dict.fromkeys(list(intent.get("excludeIds") or []) + shown + carted))
    if excl:
        intent["excludeIds"] = excl
    # The product on the page is never its own alternative, and it seeds the
    # ranking when the shopper has no profile.
    page_product = (state.get(PAGE) or {}).get("product") or {}
    anchor = page_product.get("id") or page_product.get("sku")
    if anchor:
        intent["anchorId"] = str(anchor)

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
    hidden = ("excludeIds", "anchorId")
    ask = ", ".join(f"{k}={v}" for k, v in intent.items() if k not in hidden) or "whole store"
    seeded = result.get("seededFrom")
    unranked = bool(result.get("unranked"))
    session = result.get("session")
    if seeded:
        by = f"likeness to {seeded}" + (" and this visit" if session else "")
    elif unranked:
        by = "the ask only (no taste yet)"
    elif not (state.get(PROFILE)) and session:
        by = "what you've looked at"
    else:
        by = "taste" + (" and this visit" if session else "")
    params = {
        "styles": ", ".join(f"{s['id']}:{s['weight']:.2f}" for s in taste["styles"][:4]),
        "qloo tags": f"{len(taste.get('tags') or [])} from the profile, {int(result.get('taggedProducts') or 0)} products tagged",
        "brands": ", ".join(b["name"] for b in taste["brands"][:6]) or "none in store",
        **{k: str(v) for k, v in intent.items() if k not in hidden},
    }
    if session:
        params["session"] = ", ".join(session.get("products", [])[:4])
    record(
        "catalog",
        f"Rank {int(result.get('pool') or 0)} of {int(result.get('catalogSize') or 0)} products by {by}",
        f"{ask}; top: " + ", ".join(c["product"]["name"] for c in cands[:3]),
        ms=t.ms,
        started=t.started,
        params=params,
    )
    out: dict[str, Any] = {
        "catalog_size": result.get("catalogSize"),
        "pool_after_filters": result.get("pool"),
        "taste_used": {
            "styles": taste["styles"][:4],
            "brands_in_store": [b["name"] for b in taste["brands"][:6]],
            **({"session": session} if session else {}),
        },
    }
    if seeded:
        out["ranked_by"] = f"likeness to {seeded} (the product on the page), since there is no taste profile"
    elif unranked:
        out["ranked_by"] = (
            "nothing: no taste profile, nothing browsed and no product on the page, so these are only "
            "filtered by the ask. Read the descriptions and choose by fit to what the shopper said; the fit "
            "scores mean nothing here."
        )
    out["candidates"] = [
        {
            **_compact_product(c["product"], full=True),
            "fit": c["score"],
            "rank": f"{c['rank']['position']} of {c['rank']['pool']}" if c.get("rank") else None,
            "matched": {k: v for k, v in c["matched"].items() if v},
        }
        for c in cands
    ]
    return out


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
    # Matches come back scored by taste too, so a searched product can be shown
    # with the same fit and evidence as a recommended one.
    args["taste"] = _taste_from_state(state)
    with timer() as t:
        result = await convex.query("catalog:search", args)
    products = result.get("products", [])
    cands = {c["product"]["id"]: c for c in result.get("candidates", [])}
    state[LAST_CANDIDATES] = {**(state.get(LAST_CANDIDATES) or {}), **cands}
    record(
        "catalog",
        f'Search catalog for "{query}"',
        f"{int(result.get('matches') or 0)} matches of {int(result.get('total') or 0)}",
        ms=t.ms,
        started=t.started,
        params={k: str(v) for k, v in args.items() if k not in ("storeKey", "taste")},
    )
    out_products = []
    for p in products:
        item = _compact_product(p, full=True)
        c = cands.get(p["id"])
        if c:
            item["fit"] = c["score"]
            item["rank"] = f"{c['rank']['position']} of {c['rank']['pool']}" if c.get("rank") else None
            item["matched"] = {k: v for k, v in (c.get("matched") or {}).items() if v}
        out_products.append(item)
    return {"matches": result.get("matches"), "products": out_products}


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
            thing they said that this product answers>}. If you leave a reason out, the
            card shows the ranker's own evidence instead.
    """
    state = tool_context.state
    store = state.get(STORE) or {}
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
        reason = str(pick.get("reason", "") or "").strip()[:400] or _fallback_reason(c, store)
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
                "reason": reason,
                "fit": c["score"] if c else None,
                "rank": c.get("rank") if c else None,
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
