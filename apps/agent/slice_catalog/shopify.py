"""Shopify catalogs through Composio.

Composio's Shopify toolkit has no Composio-managed app, so Slice brings its
own: a Shopify app (Dev Dashboard) whose client id and secret become a custom
OAuth2 auth config in the Composio project, created on first use from
SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET (or named directly with
COMPOSIO_SHOPIFY_AUTH_CONFIG_ID). It asks for read_products and
read_inventory only. The app's allowed redirect URL is Composio's,
https://backend.composio.dev/api/v1/auth-apps/add.

Each widget is its own Composio user (`concierge-widget:<key>`). Connecting
starts a connected account with the shop's subdomain and sends the merchant
to Shopify's consent screen; afterwards every Admin GraphQL call goes through
`tools.proxy` on that account, so Slice never holds the access token.

The Composio SDK is synchronous; every call runs in a worker thread.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
import time
from pathlib import Path
from typing import Any

from .mapping import Draft, money, slugify, text_of

API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2026-04")
SCOPES = "read_products,read_inventory"
AUTH_CONFIG_NAME = "Slice catalog (read-only)"
# Products per page: with 30 variants and 4 images each this stays under
# Shopify's 1,000-point query cost limit.
PAGE = 20
MAX_PRODUCTS = 2500
NEW_DAYS = 30

_HANDLE = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")
_ENV = Path(__file__).resolve().parents[1] / ".env"


class ShopifyError(Exception):
    pass


def shop_handle(raw: str) -> str:
    """"fold", "fold.myshopify.com" or "https://fold.myshopify.com/admin" → "fold"."""
    host = re.sub(r"^https?://", "", (raw or "").strip().lower()).split("/")[0]
    handle = host.removesuffix(".myshopify.com")
    if not _HANDLE.match(handle):
        raise ShopifyError("Enter the shop's myshopify address, like fold.myshopify.com.")
    return handle


def user_id(widget_key: str) -> str:
    return f"concierge-widget:{widget_key}"


# --- Composio client ------------------------------------------------------------

_composio: Any = None
_composio_key = ""
_auth_config = ""


def _key() -> str:
    """The key in .env wins over the process env, so a new key works without a restart (as in crm.py)."""
    from dotenv import dotenv_values

    try:
        from_file = (dotenv_values(_ENV).get("COMPOSIO_API_KEY") or "").strip()
    except OSError:
        from_file = ""
    return from_file or os.environ.get("COMPOSIO_API_KEY", "").strip()


def _client() -> Any:
    global _composio, _composio_key, _auth_config
    key = _key()
    if not key:
        raise ShopifyError("Set COMPOSIO_API_KEY in apps/agent/.env to connect Shopify.")
    if _composio is None or key != _composio_key:
        from composio import Composio

        _composio, _composio_key, _auth_config = Composio(api_key=key), key, ""
    return _composio


def _auth_config_id(c: Any) -> str:
    """Slice's Shopify app in this Composio project, created the first time a widget connects."""
    global _auth_config
    named = os.environ.get("COMPOSIO_SHOPIFY_AUTH_CONFIG_ID", "").strip()
    if named:
        return named
    if _auth_config:
        return _auth_config
    for ac in c.auth_configs.list(toolkit_slug="shopify").items:
        if getattr(ac, "name", "") == AUTH_CONFIG_NAME:
            _auth_config = ac.id
            return _auth_config
    client_id = os.environ.get("SHOPIFY_CLIENT_ID", "").strip()
    secret = os.environ.get("SHOPIFY_CLIENT_SECRET", "").strip()
    if not client_id or not secret:
        raise ShopifyError(
            "Shopify isn't set up for Slice yet: Composio needs Slice's own Shopify app. "
            "Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in apps/agent/.env."
        )
    created = c.auth_configs.create(
        "shopify",
        {
            "type": "use_custom_auth",
            "auth_scheme": "OAUTH2",
            "name": AUTH_CONFIG_NAME,
            "credentials": {"client_id": client_id, "client_secret": secret, "scopes": SCOPES},
        },
    )
    _auth_config = created.id
    return _auth_config


def explain(err: Exception) -> str:
    text = str(err)
    if "APIKey_InsufficientPermissions" in text or "PermissionDenied" in type(err).__name__:
        return "The Composio API key is read-only. Create a key with Write All ticked and put it in apps/agent/.env as COMPOSIO_API_KEY."
    if isinstance(err, ShopifyError):
        return text
    return f"{type(err).__name__}: {text[:300]}"


# --- Connection -------------------------------------------------------------------


async def connect(widget_key: str, shop: str, callback_url: str | None) -> dict[str, str]:
    """Start the OAuth flow for one shop: the console opens `url`, Composio returns to `callback_url`."""
    handle = shop_handle(shop)

    def run() -> dict[str, str]:
        c = _client()
        req = c.connected_accounts.initiate(
            user_id(widget_key),
            _auth_config_id(c),
            callback_url=callback_url,
            # A widget that switches shops gets a new account; the old one is deleted on disconnect.
            allow_multiple=True,
            config={"auth_scheme": "OAUTH2", "val": {"status": "INITIALIZING", "subdomain": handle}},
        )
        return {"url": req.redirect_url, "accountId": req.id, "shop": handle}

    return await asyncio.to_thread(run)


async def account_status(account_id: str) -> str:
    """INITIATED while the merchant is on Shopify's consent screen, then ACTIVE (or FAILED, EXPIRED)."""
    return await asyncio.to_thread(lambda: str(_client().connected_accounts.get(account_id).status))


async def disconnect(account_id: str) -> None:
    def run() -> None:
        try:
            _client().connected_accounts.delete(account_id)
        except Exception as err:  # already gone is fine
            if "404" not in str(err) and "NotFound" not in type(err).__name__:
                raise

    await asyncio.to_thread(run)


# --- Admin GraphQL ------------------------------------------------------------------

QUERY = """
query SliceCatalog($cursor: String) {
  shop { name description currencyCode primaryDomain { url } }
  products(first: %d, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId handle title vendor productType tags descriptionHtml createdAt
      category { name fullName }
      options { name optionValues { name } }
      media(first: 4) { nodes { ... on MediaImage { image { url } } } }
      variants(first: 30) {
        nodes { legacyResourceId sku title price compareAtPrice availableForSale }
      }
    }
  }
}
""" % PAGE


def _graphql(account_id: str, handle: str, variables: dict[str, Any]) -> dict[str, Any]:
    endpoint = f"https://{handle}.myshopify.com/admin/api/{API_VERSION}/graphql.json"
    for attempt in range(6):
        res = _client().tools.proxy(
            endpoint=endpoint,
            method="POST",
            body={"query": QUERY, "variables": variables},
            connected_account_id=account_id,
        )
        status, data = int(res.status or 0), res.data or {}
        if status == 429 or _throttled(data):
            time.sleep(2 + attempt * 2)
            continue
        if status >= 400:
            raise ShopifyError(f"Shopify answered {status}: {str(data)[:300]}")
        if isinstance(data, dict) and data.get("errors"):
            raise ShopifyError(f"Shopify rejected the catalog query: {str(data['errors'])[:300]}")
        _pace(data)
        return data.get("data") or {}
    raise ShopifyError("Shopify kept throttling the catalog sync. Try again in a minute.")


def _throttled(data: Any) -> bool:
    errors = data.get("errors") if isinstance(data, dict) else None
    return bool(errors) and any((e.get("extensions") or {}).get("code") == "THROTTLED" for e in errors if isinstance(e, dict))


def _pace(data: dict[str, Any]) -> None:
    """Wait for the query-cost bucket to refill before the next page needs it."""
    cost = ((data.get("extensions") or {}).get("cost")) or {}
    throttle = cost.get("throttleStatus") or {}
    available, rate = throttle.get("currentlyAvailable"), throttle.get("restoreRate") or 50
    need = cost.get("requestedQueryCost") or 0
    if isinstance(available, (int, float)) and available < need:
        time.sleep(min(10.0, (need - available) / rate))


def _draft(node: dict[str, Any], site: str) -> Draft | None:
    variants = (node.get("variants") or {}).get("nodes") or []
    priced = [(money(v.get("price")), v) for v in variants]
    priced = [(p, v) for p, v in priced if p]
    if not priced:
        return None
    base, cheapest = min(priced, key=lambda pv: pv[0])
    description, details = text_of(node.get("descriptionHtml"))
    path = [p.strip() for p in ((node.get("category") or {}).get("fullName") or "").split(">") if p.strip()]
    product_type = (node.get("productType") or "").strip()
    created = node.get("createdAt") or ""
    try:
        is_new = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(created.replace("Z", "+00:00")) < dt.timedelta(days=NEW_DAYS)
    except ValueError:
        is_new = False
    pid = str(node.get("legacyResourceId") or node["handle"])
    return Draft(
        id=pid,
        slug=node.get("handle") or slugify(node.get("title") or pid),
        name=(node.get("title") or "").strip(),
        brand=(node.get("vendor") or "").strip() or None,
        category=(path[1] if len(path) > 1 else path[0] if path else product_type) or None,
        subcategory=product_type or ((node.get("category") or {}).get("name")) or None,
        price=base,
        compare_at=money(cheapest.get("compareAtPrice")),
        description=description,
        details=details,
        images=[m["image"]["url"] for m in (node.get("media") or {}).get("nodes") or [] if (m or {}).get("image")],
        url=f"{site}/products/{node.get('handle')}",
        variants=[
            {
                "id": (v.get("sku") or "").strip() or str(v.get("legacyResourceId")),
                "label": "Default" if v.get("title") == "Default Title" else v.get("title") or "Default",
                "inStock": bool(v.get("availableForSale")),
                **({"priceDelta": round(p - base, 2)} if p != base else {}),
            }
            for p, v in priced
        ],
        tags=list(node.get("tags") or []),
        options={o["name"]: [x["name"] for x in o.get("optionValues") or []] for o in node.get("options") or [] if o.get("name")},
        new=is_new,
    )


async def pull(account_id: str, handle: str) -> tuple[dict[str, Any], list[Draft], int]:
    """Every active product as drafts, plus the shop's profile and how many were skipped."""

    def run() -> tuple[dict[str, Any], list[Draft], int]:
        drafts: list[Draft] = []
        skipped = 0
        shop: dict[str, Any] = {}
        cursor: str | None = None
        while len(drafts) < MAX_PRODUCTS:
            data = _graphql(account_id, handle, {"cursor": cursor})
            if not shop:
                s = data.get("shop") or {}
                shop = {
                    "name": s.get("name"),
                    "description": s.get("description") or "",
                    "currency": s.get("currencyCode"),
                    "siteUrl": ((s.get("primaryDomain") or {}).get("url") or f"https://{handle}.myshopify.com").rstrip("/"),
                }
            page = data.get("products") or {}
            for node in page.get("nodes") or []:
                draft = _draft(node, shop["siteUrl"])
                if draft:
                    drafts.append(draft)
                else:
                    skipped += 1
            info = page.get("pageInfo") or {}
            if not info.get("hasNextPage"):
                break
            cursor = info.get("endCursor")
        return shop, drafts[:MAX_PRODUCTS], skipped

    return await asyncio.to_thread(run)
