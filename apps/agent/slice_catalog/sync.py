"""Connect, sync and disconnect a widget's store, for Shopify and WooCommerce alike.

The connection lives in Convex (catalogConnections.ts) and the console
subscribes to it, so a sync reports through its status: syncing, then
connected with a product count, or error with a sentence the merchant can act
on. A sync replaces the widget's own catalog wholesale and then queues the
Qloo tagging job for the new products.
"""

from __future__ import annotations

import asyncio
from typing import Any, Coroutine

from slice_agent import convex_client as convex
from slice_agent.tagging import tag_store

from . import mapping, shopify, vault, woocommerce

LABELS = {"shopify": "Shopify", "woocommerce": "WooCommerce"}


class CatalogError(Exception):
    pass


def explain(err: Exception) -> str:
    if isinstance(err, (CatalogError, woocommerce.WooError, vault.SecretError)):
        return str(err)
    return shopify.explain(err)


_tasks: set[asyncio.Task[Any]] = set()
_syncing: set[str] = set()


def _background(coro: Coroutine[Any, Any, Any]) -> None:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _found(widget_key: str | None = None, state: str | None = None) -> dict[str, Any]:
    body, _ = await convex.site("/catalog/connection", {"widgetKey": widget_key} if widget_key else {"state": state})
    found = body.get("found")
    if not found:
        raise CatalogError("Unknown widget." if widget_key else "This approval has expired. Connect WooCommerce again.")
    return found


async def _save(widget_key: str, platform: str, **patch: Any) -> None:
    await convex.site("/catalog/connection/save", {"widgetKey": widget_key, "platform": platform, **patch})


# --- Connecting ----------------------------------------------------------------------


async def connect(widget_key: str, platform: str, shop: str, callback_url: str, return_url: str) -> dict[str, str]:
    """The page the merchant approves Slice on: Shopify's consent screen or WooCommerce's key screen."""
    await _found(widget_key)
    if platform == "shopify":
        res = await shopify.connect(widget_key, shop, return_url)
        await _save(widget_key, "shopify", shop=res["shop"], accountId=res["accountId"], status="pending", error=None)
        return {"url": res["url"]}
    if platform == "woocommerce":
        site = woocommerce.site_url(shop)
        state = woocommerce.new_state()
        url = woocommerce.authorize_url(site, state, return_url, callback_url)
        await _save(widget_key, "woocommerce", shop=site, status="pending", state=state, error=None)
        return {"url": url}
    raise CatalogError(f"Unknown platform {platform!r}")


async def woo_keys(widget_key: str, site: str, consumer_key: str, consumer_secret: str) -> None:
    """Keys the merchant pasted: checked against the store, stored sealed, then the first sync starts."""
    await _found(widget_key)
    site = woocommerce.site_url(site)
    ck, cs = consumer_key.strip(), consumer_secret.strip()
    await woocommerce.check(site, ck, cs)
    await _save(widget_key, "woocommerce", shop=site, secret=vault.seal(ck, cs), status="connected", state=None, error=None)
    _background(_quiet_sync(widget_key))


async def woo_callback(payload: dict[str, Any]) -> None:
    """WooCommerce posting the key the merchant just approved. `user_id` is the state from `connect`."""
    state = str(payload.get("user_id") or "")
    if not state:
        raise CatalogError("The WooCommerce callback had no state.")
    found = await _found(state=state)
    conn = found.get("connection") or {}
    if conn.get("platform") != "woocommerce" or conn.get("status") != "pending":
        raise CatalogError("This approval has already been used.")
    ck, cs = str(payload.get("consumer_key") or ""), str(payload.get("consumer_secret") or "")
    if payload.get("key_permissions") not in ("read", "read_write") or not ck or not cs:
        raise CatalogError("WooCommerce sent a key without read access.")
    widget_key = found["widget"]["key"]
    await _save(widget_key, "woocommerce", secret=vault.seal(ck, cs), status="connected", state=None, error=None)
    _background(_quiet_sync(widget_key))


async def status(widget_key: str) -> str | None:
    """Moves a Shopify connection on once the merchant has approved it (Composio doesn't call back)."""
    conn = (await _found(widget_key)).get("connection")
    if not conn:
        return None
    if conn["platform"] == "shopify" and conn["status"] == "pending" and conn.get("accountId"):
        state = await shopify.account_status(conn["accountId"])
        if state == "ACTIVE":
            await _save(widget_key, "shopify", status="connected", error=None)
            _background(_quiet_sync(widget_key))
            return "connected"
        if state in ("FAILED", "EXPIRED", "INACTIVE"):
            await _save(widget_key, "shopify", status="error", error="Shopify didn't finish connecting. Try again.")
            return "error"
    return conn["status"]


async def disconnect(widget_key: str) -> None:
    body, _ = await convex.site("/catalog/connection/remove", {"widgetKey": widget_key})
    removed = body.get("removed") or {}
    if removed.get("platform") == "shopify" and removed.get("accountId"):
        try:
            await shopify.disconnect(removed["accountId"])
        except Exception as err:
            print(f"[catalog] {widget_key}: could not delete the Composio account: {err}", flush=True)


# --- Syncing -------------------------------------------------------------------------


async def sync(widget_key: str) -> dict[str, Any]:
    """Pull every product, write the widget's catalog, queue tagging. One sync per widget at a time."""
    if widget_key in _syncing:
        return {"running": True}
    _syncing.add(widget_key)
    try:
        found = await _found(widget_key)
        conn = found.get("connection")
        if not conn or conn["status"] == "pending":
            raise CatalogError("Connect a store first.")
        platform = conn["platform"]
        await _save(widget_key, platform, status="syncing", error=None)
        try:
            if platform == "shopify":
                shop, drafts, skipped = await shopify.pull(conn["accountId"], conn["shop"])
            else:
                ck, cs = vault.unseal(conn.get("secret") or "")
                shop, drafts, skipped = await woocommerce.pull(conn["shop"], ck, cs)
            if not drafts:
                raise CatalogError(f"{LABELS[platform]} has no published products with a price yet.")
            products = mapping.finish_all(drafts)
            store = mapping.store_record(store_key=widget_key, found=found, shop=shop, products=products, source=platform)
            res, _ = await convex.site(
                "/catalog/sync", {"widgetKey": widget_key, "store": store, "products": products, "skipped": skipped}
            )
        except Exception as err:
            await _save(widget_key, platform, status="error", error=explain(err))
            raise
        print(f"[catalog] {widget_key}: {res['products']} products from {LABELS[platform]} ({skipped} skipped)", flush=True)
        _background(_tag(res["storeKey"]))
        return {"products": res["products"], "skipped": skipped}
    finally:
        _syncing.discard(widget_key)


async def _quiet_sync(widget_key: str) -> None:
    """A sync nobody is waiting on; its error is already on the connection."""
    try:
        await sync(widget_key)
    except Exception as err:
        print(f"[catalog] {widget_key}: sync failed: {explain(err)}", flush=True)


async def _tag(store_key: str) -> None:
    try:
        await tag_store(store_key)
    except Exception as err:
        print(f"[catalog] {store_key}: tagging failed: {err}", flush=True)
