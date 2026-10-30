"""Store-platform products → the Slice product shape.

The shape is the one in packages/demo-catalogs/src/types.ts, validated by
`productInput` in packages/backend/convex/catalog.ts. Optional fields are left
out rather than set to None (Convex rejects null for an optional field).

Shopify and WooCommerce have no columns for style, material, use case and the
rest, so they come from tags written as `key:value` (`style:scandi-minimal`,
`material:linen`): the same encoding the Shopify CSV export uses
(packages/demo-catalogs/scripts/export-shopify-csv.ts), so a store imported
from that file round-trips. Product options and WooCommerce attributes named
like an attribute (Colour, Material, Occasion) fill the same fields; a "Style"
option is a variant choice ("Navy trim"), not a taste style, so it doesn't.
Anything still missing is left for the tagging job, which reads the description.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from typing import Any

# Tag keys the CSV export writes, and the attribute each fills.
LIST_KEYS = {
    "style": "style",
    "material": "material",
    "colorfamily": "colorFamily",
    "color": "colors",
    "colour": "colors",
    "usecase": "useCase",
    "occasion": "occasion",
    "room": "room",
    "season": "season",
}
COLOR_FAMILIES = {"neutral", "warm", "cool", "earth", "bold", "pastel", "black", "white"}
FITS = {"relaxed", "regular", "slim", "oversized"}
TIERS = {"budget", "mid", "premium"}
DEPARTMENTS = {"women", "men", "unisex", "kids"}

# Option and attribute names (lower-cased) that carry a Slice attribute.
OPTION_FIELDS = {
    "color": "colors",
    "colour": "colors",
    "material": "material",
    "fabric": "material",
    "occasion": "occasion",
    "room": "room",
    "season": "season",
}

MAX_DETAILS = 12


def text_of(markup: str | None) -> tuple[str, list[str]]:
    """HTML product copy → (description, detail bullets). List items become details."""
    if not markup:
        return "", []
    details = [_clean(m) for m in re.findall(r"<li[^>]*>(.*?)</li>", markup, flags=re.S | re.I)]
    body = re.sub(r"<(ul|ol)[^>]*>.*?</\1>", " ", markup, flags=re.S | re.I)
    return _clean(body), [d for d in details if d][:MAX_DETAILS]


def _clean(fragment: str) -> str:
    no_tags = re.sub(r"<br\s*/?>|</p>", " ", fragment, flags=re.I)
    no_tags = re.sub(r"<[^>]+>", "", no_tags)
    return re.sub(r"\s+", " ", html.unescape(no_tags)).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "product"


def money(value: Any) -> float | None:
    try:
        n = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return round(n, 2) if n > 0 else None


@dataclass
class Draft:
    """A product as read from the platform, before price tiers are known."""

    id: str
    slug: str
    name: str
    price: float
    description: str
    details: list[str]
    images: list[str]
    url: str
    variants: list[dict[str, Any]]
    tags: list[str]
    options: dict[str, list[str]] = field(default_factory=dict)
    brand: str | None = None
    category: str | None = None
    subcategory: str | None = None
    compare_at: float | None = None
    new: bool = False


def _split_tags(tags: list[str]) -> tuple[dict[str, list[str]], list[str]]:
    keyed: dict[str, list[str]] = {}
    free: list[str] = []
    for raw in tags:
        tag = raw.strip()
        if not tag:
            continue
        key, sep, value = tag.partition(":")
        key = key.strip().lower().replace("_", "").replace(" ", "")
        if sep and value.strip() and (key in LIST_KEYS or key in {"category", "subcategory", "department", "fit", "tier"}):
            keyed.setdefault(key, []).append(value.strip())
        else:
            free.append(tag)
    return keyed, free


def _unique(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        v = v.strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def tier_cutoffs(prices: list[float]) -> tuple[float, float]:
    """Thirds of the store's own range: price tiers are relative to the merchant, not absolute."""
    ordered = sorted(prices)
    if not ordered:
        return 0.0, 0.0
    return ordered[len(ordered) // 3], ordered[(2 * len(ordered)) // 3]


def finish(draft: Draft, cutoffs: tuple[float, float]) -> dict[str, Any]:
    """A draft → a Slice product dict, ready for `catalog.replace`."""
    keyed, free = _split_tags(draft.tags)
    lists: dict[str, list[str]] = {attr: [] for attr in set(LIST_KEYS.values())}
    for key, attr in LIST_KEYS.items():
        lists[attr] += keyed.get(key, [])
    for name, values in draft.options.items():
        attr = OPTION_FIELDS.get(name.strip().lower())
        if attr:
            lists[attr] += values

    color_family = [c.lower() for c in lists["colorFamily"] if c.lower() in COLOR_FAMILIES]
    tier = next((t.lower() for t in keyed.get("tier", []) if t.lower() in TIERS), None)
    if not tier:
        low, high = cutoffs
        tier = "budget" if draft.price < low else "premium" if draft.price >= high and high > low else "mid"

    attributes: dict[str, Any] = {
        "style": [slugify(s) for s in _unique(lists["style"])],
        "material": _unique(lists["material"]),
        "colorFamily": _unique(color_family),
        "colors": _unique(lists["colors"])[:8],
        "useCase": _unique(lists["useCase"]),
        "priceTier": tier,
    }
    for attr in ("room", "occasion", "season"):
        if lists[attr]:
            attributes[attr] = _unique(lists[attr])
    fit = next((f.lower() for f in keyed.get("fit", []) if f.lower() in FITS), None)
    if fit:
        attributes["fit"] = fit

    category = (keyed.get("category") or [draft.category or ""])[0].strip() or "Products"
    subcategory = (keyed.get("subcategory") or [draft.subcategory or ""])[0].strip() or category
    department = next((d.lower() for d in keyed.get("department", []) if d.lower() in DEPARTMENTS), None)
    flags = {t.lower() for t in free}

    product: dict[str, Any] = {
        "id": draft.id,
        "slug": draft.slug,
        "name": draft.name,
        "category": category,
        "subcategory": subcategory,
        "price": draft.price,
        "description": draft.description or draft.name,
        "details": draft.details,
        "attributes": attributes,
        "tags": [t for t in free if t.lower() not in {"bestseller", "new"}],
        "variants": draft.variants or [{"id": draft.id, "label": "Default", "inStock": True}],
        "images": draft.images,
        "url": draft.url,
    }
    if draft.brand:
        product["brand"] = draft.brand
    if department:
        product["department"] = department
    if draft.compare_at and draft.compare_at > draft.price:
        product["compareAtPrice"] = draft.compare_at
    if "bestseller" in flags:
        product["bestseller"] = True
    if draft.new or "new" in flags:
        product["new"] = True
    return product


def finish_all(drafts: list[Draft]) -> list[dict[str, Any]]:
    cutoffs = tier_cutoffs([d.price for d in drafts])
    seen: set[str] = set()
    out = []
    for d in drafts:
        # Ids and slugs key the catalog; the first product wins a clash.
        if d.id in seen:
            continue
        seen.add(d.id)
        out.append(finish(d, cutoffs))
    # One vendor across the catalog is a house brand (Shopify fills vendor with the shop name).
    if len({p.get("brand") for p in out}) <= 1:
        for p in out:
            p.pop("brand", None)
    slugs: set[str] = set()
    for p in out:
        base, n = p["slug"], 2
        while p["slug"] in slugs:
            p["slug"] = f"{base}-{n}"
            n += 1
        slugs.add(p["slug"])
    return out


def _label(id_: str) -> str:
    return id_.replace("-", " ").capitalize()


def store_record(
    *,
    store_key: str,
    found: dict[str, Any],
    shop: dict[str, Any],
    products: list[dict[str, Any]],
    source: str,
) -> dict[str, Any]:
    """The `storeInput` for a synced catalog: the widget's profile wins over what the platform says."""
    widget = found.get("widget") or {}
    current = found.get("store") or {}
    styles: dict[str, int] = {}
    nav: dict[str, list[str]] = {}
    brands: list[str] = []
    departments: list[str] = []
    rooms: list[str] = []
    for p in products:
        for s in p["attributes"]["style"]:
            styles[s] = styles.get(s, 0) + 1
        subs = nav.setdefault(p["category"], [])
        if p["subcategory"] not in subs:
            subs.append(p["subcategory"])
        if p.get("brand") and p["brand"] not in brands:
            brands.append(p["brand"])
        if p.get("department") and p["department"] not in departments:
            departments.append(p["department"])
        for r in p["attributes"].get("room") or []:
            if r not in rooms:
                rooms.append(r)

    name = widget.get("name") or shop.get("name") or current.get("name") or "Store"
    record: dict[str, Any] = {
        "key": store_key,
        "name": name,
        "tagline": widget.get("tagline") or shop.get("tagline") or "",
        "description": widget.get("description") or shop.get("description") or "",
        "currency": shop.get("currency") or current.get("currency") or "USD",
        "vertical": current.get("vertical") or "retail",
        "siteUrl": shop.get("siteUrl") or current.get("siteUrl") or "",
        "styles": [
            {"id": s, "label": _label(s), "description": f'Products the merchant tagged "{_label(s)}".'}
            for s, _ in sorted(styles.items(), key=lambda kv: -kv[1])
        ],
        "nav": [{"label": c, "category": c, "subcategories": subs} for c, subs in nav.items()],
        "source": source,
    }
    logo = current.get("logo") or shop.get("logo")
    if logo:
        record["logo"] = logo
    # A single-label store is a house brand; the concierge then doesn't talk about brands.
    if len(brands) > 1:
        record["brands"] = [{"name": b, "slug": slugify(b), "origin": "", "description": ""} for b in brands]
    if departments:
        record["departments"] = departments
    if rooms:
        record["rooms"] = rooms
    return record
