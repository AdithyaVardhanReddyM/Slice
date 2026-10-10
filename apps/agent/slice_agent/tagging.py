"""Describe a catalog in Qloo's tag vocabulary, once.

    uv run python -m slice_agent.tagging fold          # tag what changed
    uv run python -m slice_agent.tagging fold --force  # re-tag everything

Each product gets Qloo tags from two sources: its brand's Qloo entity (pure
Qloo, no model involved) and its own copy read against Qloo's brand-domain tag
vocabulary by Gemini, constrained to real tag ids. The ranker then scores a
shopper's Qloo tags against each product's by id (catalog:recommend), which is
what makes Qloo load-bearing instead of a substring match on merchant prose.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Any

from google.genai import types

from . import convex_client as convex
from .brief import MODEL, client

BATCH = 12
# Gemini calls in flight at once; each batch is one call with the whole vocabulary in the prompt.
CONCURRENCY = 4
BRAND_WEIGHT = 0.6

TAG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "products": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "tags": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"id": {"type": "string"}, "weight": {"type": "number"}},
                            "required": ["id", "weight"],
                        },
                    },
                },
                "required": ["id", "tags"],
            },
        }
    },
    "required": ["products"],
}


def _vocab_block(vocab: list[dict[str, Any]]) -> str:
    by_type: dict[str, list[str]] = {}
    for t in vocab:
        kind = t["type"].split(":")[2] if t["type"].count(":") >= 2 else t["type"]
        by_type.setdefault(kind, []).append(f"{t['id']} = {t['name']}")
    return "\n".join(f"{kind}:\n  " + "\n  ".join(items) for kind, items in by_type.items())


def _product_block(p: dict[str, Any]) -> dict[str, Any]:
    a = p.get("attributes", {})
    return {
        "id": p["id"],
        "name": p["name"],
        "brand": p.get("brand"),
        "category": f"{p['category']} / {p['subcategory']}",
        "description": p.get("description", "")[:600],
        "details": p.get("details", [])[:5],
        "styles": a.get("style", []),
        "materials": a.get("material", []),
        "colors": a.get("colors", []) + a.get("colorFamily", []),
        "use": (a.get("useCase") or []) + (a.get("occasion") or []) + (a.get("room") or []),
        "merchant_tags": p.get("tags", []),
    }


def _prompt(store: dict[str, Any], vocab: list[dict[str, Any]], batch: list[dict[str, Any]]) -> str:
    return f"""You describe products in Qloo's tag vocabulary. Qloo is a cultural taste graph; its brand-domain tags describe the aesthetics, lifestyle and emotional tone of what people buy. Shoppers' taste profiles are made of these same tags, so a product's tags decide who it is recommended to.

STORE: {store.get('name')} ({store.get('vertical', 'retail')}). {store.get('description', '')}

VOCABULARY (use these exact ids; nothing else):
{_vocab_block(vocab)}

For each product below, choose 5 to 9 tags with a weight from 0.3 to 1.0:
- Read the copy, materials, colours, cut and use; tag what the product actually is, not what the category usually is.
- Always include one or two tags from the lifestyle or emotional_tone groups for the mood or the life the product belongs to: "Nostalgic" for a 70s lamp, "Weekend Hiking" for a trail shoe, "Relaxing" for linen bedding, "Bohemian" for a woven throw. Shoppers' taste profiles are full of these words, so a product without them is invisible to that side of the match.
- Prefer specific over generic. "Earthy Color Palette" beats "Casual" when the colours are olive and brown; "Utility-Focused Design" when there are pockets and hardware; "Romantic" when there are florals and soft drape.
- Weight 1.0 is the defining quality; 0.3 is a faint note. At most two tags at 1.0.
- Skip tags about price, retail channel or fandom unless the copy says so.

PRODUCTS:
{json.dumps([_product_block(p) for p in batch], ensure_ascii=False)}"""


async def _tag_batch(store: dict[str, Any], vocab: list[dict[str, Any]], batch: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    res = await client().aio.models.generate_content(
        model=MODEL,
        contents=_prompt(store, vocab, batch),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TAG_SCHEMA,
            temperature=0.2,
        ),
    )
    raw = json.loads(res.text or "{}")
    return {str(p.get("id")): list(p.get("tags") or []) for p in raw.get("products", [])}


async def tag_store(store_key: str, force: bool = False, log=print) -> dict[str, Any]:
    t0 = time.perf_counter()
    store = await convex.query("catalog:store", {"key": store_key})
    if not store:
        raise ValueError(f"Unknown store {store_key!r}")
    products = await convex.query("catalogTaste:forTagging", {"storeKey": store_key})
    todo = [p for p in products if force or p.get("fingerprint") != p.get("taggedFingerprint")]
    log(f"[tag] {store['name']}: {len(products)} products, {len(todo)} to tag")
    if not todo:
        return {"products": len(products), "tagged": 0, "ms": 0}

    vocab: list[dict[str, Any]] = await convex.action("catalogTaste:vocabulary")
    brand_tags: dict[str, list[dict[str, Any]]] = await convex.action("catalogTaste:brandTags", {"storeKey": store_key})
    log(f"[tag] vocabulary {len(vocab)} tags; {len(brand_tags)} brands resolved in Qloo")
    # Brand tags join the vocabulary so the model may also pick them for other products.
    by_id = {t["id"]: t for t in vocab}
    for tags in brand_tags.values():
        for t in tags:
            by_id.setdefault(t["id"], t)
    vocab_full = list(by_id.values())

    tagged = 0
    failures: list[str] = []
    batches = [todo[i : i + BATCH] for i in range(0, len(todo), BATCH)]
    limit = asyncio.Semaphore(CONCURRENCY)

    async def one(index: int, batch: list[dict[str, Any]]) -> None:
        nonlocal tagged
        async with limit:
            try:
                chosen = await _tag_batch(store, vocab_full, batch)
            except Exception as err:
                failures.append(f"batch {index}: {err}")
                log(f"[tag] batch {index} failed: {err}")
                return
        items = []
        for p in batch:
            merged: dict[str, dict[str, Any]] = {}
            for t in chosen.get(p["id"], []):
                tid = str(t.get("id", ""))
                v = by_id.get(tid)
                if not v:
                    continue
                w = max(0.3, min(1.0, float(t.get("weight", 0.5))))
                merged[tid] = {"id": tid, "name": v["name"], "type": v["type"], "weight": round(w, 2), "source": "llm"}
            for t in brand_tags.get(p.get("brand") or "", []):
                cur = merged.get(t["id"])
                if cur:
                    cur["weight"] = round(min(1.0, max(cur["weight"], BRAND_WEIGHT) + 0.1), 2)
                    cur["source"] = "llm+brand"
                else:
                    merged[t["id"]] = {**t, "weight": BRAND_WEIGHT, "source": "brand"}
            tags = sorted(merged.values(), key=lambda t: -t["weight"])[:14]
            items.append({"productId": p["id"], "fingerprint": p["fingerprint"], "tags": tags})
        await convex.site("/agent/product-tags", {"storeKey": store_key, "items": items})
        tagged += len(items)
        sample = items[0]
        log(f"[tag] {tagged}/{len(todo)}  e.g. {sample['productId']}: " + ", ".join(t["name"] for t in sample["tags"][:5]))

    await asyncio.gather(*(one(i, b) for i, b in enumerate(batches)))
    ms = int((time.perf_counter() - t0) * 1000)
    return {"products": len(products), "tagged": tagged, "failures": failures, "ms": ms}


if __name__ == "__main__":
    from dotenv import load_dotenv
    import os

    sys.stdout.reconfigure(line_buffering=True)  # progress shows up when piped to a file

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    summary = asyncio.run(tag_store(args[0], force="--force" in sys.argv))
    print(json.dumps(summary))
