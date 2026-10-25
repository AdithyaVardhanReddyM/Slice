"""WooCommerce catalogs over its REST API (wc/v3).

Composio has no WooCommerce toolkit, so Slice talks to the store directly
with a read-only REST key. Two ways to get one:

- WooCommerce's own approval screen (/wc-auth/v1/authorize). The merchant
  signs in to WordPress and approves "Slice, read access"; WooCommerce then
  POSTs the new key to Slice's callback. WooCommerce only posts to https
  addresses, so this needs the console on https (SLICE_PUBLIC_URL in dev).
- Keys the merchant creates in WooCommerce → Settings → Advanced → REST API
  and pastes into the console.

Requests use HTTP Basic auth over https. A plain-http site (a local
WordPress) gets OAuth 1.0a one-legged signing instead, which is what
WooCommerce requires without TLS.
"""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hashlib
import hmac
import re
import secrets
import time
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import httpx

from .mapping import Draft, money, slugify, text_of

APP_NAME = "Slice"
PER_PAGE = 100
MAX_PRODUCTS = 2500
NEW_DAYS = 30
# Variable products need one more call each for their variations.
VARIATION_CONCURRENCY = 4
SKIP_CATEGORIES = {"uncategorized", "uncategorised"}


class WooError(Exception):
    pass


def site_url(raw: str) -> str:
    """"shop.example.com", "https://shop.example.com/" or ".../wp-admin" → "https://shop.example.com"."""
    text = (raw or "").strip()
    if not text:
        raise WooError("Enter the store's address, like shop.example.com.")
    if not re.match(r"^https?://", text, re.I):
        text = f"https://{text}"
    url = urlparse(text)
    if not url.hostname or ("." not in url.hostname and url.hostname != "localhost"):
        raise WooError(f"{raw!r} isn't a website address.")
    # WordPress can live in a subfolder (example.com/shop); keep it, minus admin and API paths.
    path = re.split(r"/(wp-admin|wp-json|wc-auth)\b", url.path)[0].rstrip("/")
    port = f":{url.port}" if url.port else ""
    return f"{url.scheme.lower()}://{url.hostname.lower()}{port}{path}"


def new_state() -> str:
    return secrets.token_urlsafe(24)


def authorize_url(site: str, state: str, return_url: str, callback_url: str) -> str:
    """WooCommerce's key-approval screen. `state` comes back as the callback's user_id."""
    if not callback_url.startswith("https://"):
        raise WooError(
            "WooCommerce only sends keys to an https address, and this console isn't on one. "
            "Paste REST keys instead, or set SLICE_PUBLIC_URL to the console's https address."
        )
    query = urlencode(
        {
            "app_name": APP_NAME,
            "scope": "read",
            "user_id": state,
            "return_url": return_url,
            "callback_url": callback_url,
        }
    )
    return f"{site}/wc-auth/v1/authorize?{query}"


# --- Requests ------------------------------------------------------------------------


def _enc(value: str) -> str:
    return quote(str(value), safe="~")


def _oauth1(method: str, url: str, params: dict[str, Any], ck: str, cs: str) -> dict[str, str]:
    """One-legged OAuth 1.0a, as WooCommerce asks for over plain http."""
    signed = {
        **{k: str(v) for k, v in params.items()},
        "oauth_consumer_key": ck,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA256",
        "oauth_timestamp": str(int(time.time())),
    }
    normalized = "&".join(f"{k}={v}" for k, v in sorted((_enc(k), _enc(v)) for k, v in signed.items()))
    base = "&".join([method.upper(), _enc(url), _enc(normalized)])
    digest = hmac.new(f"{cs}&".encode(), base.encode(), hashlib.sha256).digest()
    return {**signed, "oauth_signature": base64.b64encode(digest).decode()}


class Client:
    def __init__(self, site: str, ck: str, cs: str) -> None:
        self.site, self.ck, self.cs = site, ck, cs
        self.http = httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers={"User-Agent": "Slice catalog sync"})

    async def close(self) -> None:
        await self.http.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> tuple[Any, httpx.Headers]:
        url = f"{self.site}/wp-json/wc/v3{path}"
        params = params or {}
        if url.startswith("https://"):
            res = await self.http.get(url, params=params, auth=(self.ck, self.cs))
        else:
            res = await self.http.get(url, params=_oauth1("GET", url, params, self.ck, self.cs))
        if res.status_code in (401, 403):
            raise WooError("WooCommerce turned the key down. Check it has Read access, or create a new one.")
        if res.status_code == 404:
            raise WooError(f"No WooCommerce REST API at {self.site} (check the address and that permalinks aren't set to Plain).")
        if res.status_code >= 400:
            raise WooError(f"WooCommerce answered {res.status_code} on {path}: {res.text[:200]}")
        try:
            return res.json(), res.headers
        except ValueError as err:
            raise WooError(f"{self.site} didn't answer with JSON; is it a WordPress site with WooCommerce?") from err


async def check(site: str, ck: str, cs: str) -> None:
    """Fails with a readable WooError unless the key can list products."""
    if not ck.startswith("ck_") or not cs.startswith("cs_"):
        raise WooError("WooCommerce keys start with ck_ (consumer key) and cs_ (consumer secret).")
    client = Client(site, ck, cs)
    try:
        await client.get("/products", {"per_page": 1})
    finally:
        await client.close()


# --- Catalog -------------------------------------------------------------------------


async def _profile(client: Client) -> dict[str, Any]:
    shop: dict[str, Any] = {"siteUrl": client.site}
    try:
        res = await client.http.get(f"{client.site}/wp-json")
        root = res.json() if res.status_code == 200 else {}
        shop["name"] = root.get("name") or None
        shop["description"] = root.get("description") or ""
    except (httpx.HTTPError, ValueError):
        pass
    try:
        currency, _ = await client.get("/data/currencies/current")
        shop["currency"] = currency.get("code")
    except WooError:
        pass
    return shop


async def _variants(client: Client, product: dict[str, Any], base: float) -> list[dict[str, Any]]:
    if product.get("type") != "variable" or not product.get("variations"):
        return [
            {
                "id": (product.get("sku") or "").strip() or str(product["id"]),
                "label": "Default",
                "inStock": product.get("stock_status") != "outofstock",
            }
        ]
    rows, _ = await client.get(f"/products/{product['id']}/variations", {"per_page": PER_PAGE})
    out = []
    for v in rows or []:
        if v.get("status") not in (None, "publish"):
            continue
        price = money(v.get("price")) or base
        label = " / ".join(a.get("option") for a in v.get("attributes") or [] if a.get("option")) or "Default"
        out.append(
            {
                "id": (v.get("sku") or "").strip() or str(v["id"]),
                "label": label,
                "inStock": v.get("stock_status") != "outofstock",
                **({"priceDelta": round(price - base, 2)} if price != base else {}),
            }
        )
    return out


async def _draft(client: Client, p: dict[str, Any]) -> Draft | None:
    if p.get("status") != "publish" or p.get("type") not in ("simple", "variable"):
        return None
    base = money(p.get("price"))
    if not base:
        return None
    description, details = text_of(p.get("description"))
    if not description:
        description, _ = text_of(p.get("short_description"))
    categories = [c["name"] for c in p.get("categories") or [] if c.get("name", "").lower() not in SKIP_CATEGORIES]
    brands = [b.get("name") for b in p.get("brands") or [] if b.get("name")]
    try:
        created = dt.datetime.fromisoformat(p.get("date_created_gmt") or p.get("date_created") or "")
        is_new = dt.datetime.now() - created.replace(tzinfo=None) < dt.timedelta(days=NEW_DAYS)
    except ValueError:
        is_new = False
    on_sale = bool(p.get("on_sale"))
    return Draft(
        id=(p.get("sku") or "").strip() or str(p["id"]),
        slug=p.get("slug") or slugify(p.get("name") or str(p["id"])),
        name=(p.get("name") or "").strip(),
        brand=brands[0] if brands else None,
        category=categories[0] if categories else None,
        subcategory=categories[1] if len(categories) > 1 else None,
        price=base,
        compare_at=money(p.get("regular_price")) if on_sale else None,
        description=description,
        details=details,
        images=[i["src"] for i in p.get("images") or [] if i.get("src")][:6],
        url=p.get("permalink") or f"{client.site}/product/{p.get('slug')}",
        variants=await _variants(client, p, base),
        tags=[t["name"] for t in p.get("tags") or [] if t.get("name")],
        options={a["name"]: list(a.get("options") or []) for a in p.get("attributes") or [] if a.get("name")},
        new=is_new,
    )


async def pull(site: str, ck: str, cs: str) -> tuple[dict[str, Any], list[Draft], int]:
    """Every published product as drafts, plus the store's profile and how many were skipped."""
    client = Client(site, ck, cs)
    try:
        shop = await _profile(client)
        raw: list[dict[str, Any]] = []
        page = 1
        while len(raw) < MAX_PRODUCTS:
            rows, headers = await client.get("/products", {"per_page": PER_PAGE, "page": page, "status": "publish"})
            raw += rows or []
            if page >= int(headers.get("X-WP-TotalPages") or 1) or not rows:
                break
            page += 1
        limit = asyncio.Semaphore(VARIATION_CONCURRENCY)

        async def one(p: dict[str, Any]) -> Draft | None:
            async with limit:
                return await _draft(client, p)

        drafts = await asyncio.gather(*(one(p) for p in raw[:MAX_PRODUCTS]))
        kept = [d for d in drafts if d]
        return shop, kept, len(drafts) - len(kept)
    finally:
        await client.close()
