"""HTTP routes for store connections. The console reaches them through the web
app's /api/concierge/catalog proxy, which checks the signed-in merchant owns
the widget; the WooCommerce callback comes from the merchant's store.

POST /concierge/catalog/status        {widget_key}                                        {ok, status}
POST /concierge/catalog/connect       {widget_key, platform, shop, callback_url, return_url} {ok, url}
POST /concierge/catalog/woo-keys      {widget_key, site, consumer_key, consumer_secret}   {ok}
POST /concierge/catalog/woo-callback  WooCommerce's key payload                           {ok}
POST /concierge/catalog/sync          {widget_key}                                        {ok, products, skipped}
POST /concierge/catalog/disconnect    {widget_key}                                        {ok}
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

from . import sync

router = APIRouter(prefix="/concierge/catalog")


class WidgetRequest(BaseModel):
    widget_key: str


class ConnectRequest(WidgetRequest):
    platform: Literal["shopify", "woocommerce"]
    shop: str
    callback_url: str = ""
    return_url: str = ""


class WooKeysRequest(WidgetRequest):
    site: str
    consumer_key: str
    consumer_secret: str


def _error(err: Exception) -> dict[str, Any]:
    return {"ok": False, "error": sync.explain(err)}


@router.post("/status")
async def status(req: WidgetRequest) -> dict[str, Any]:
    try:
        return {"ok": True, "status": await sync.status(req.widget_key)}
    except Exception as err:
        return _error(err)


@router.post("/connect")
async def connect(req: ConnectRequest) -> dict[str, Any]:
    try:
        return {"ok": True, **(await sync.connect(req.widget_key, req.platform, req.shop, req.callback_url, req.return_url))}
    except Exception as err:
        return _error(err)


@router.post("/woo-keys")
async def woo_keys(req: WooKeysRequest) -> dict[str, Any]:
    try:
        await sync.woo_keys(req.widget_key, req.site, req.consumer_key, req.consumer_secret)
        return {"ok": True}
    except Exception as err:
        return _error(err)


@router.post("/woo-callback")
async def woo_callback(request: Request) -> dict[str, Any]:
    try:
        await sync.woo_callback(await request.json())
        return {"ok": True}
    except Exception as err:
        return _error(err)


@router.post("/sync")
async def run_sync(req: WidgetRequest) -> dict[str, Any]:
    try:
        return {"ok": True, **(await sync.sync(req.widget_key))}
    except Exception as err:
        return _error(err)


@router.post("/disconnect")
async def disconnect(req: WidgetRequest) -> dict[str, Any]:
    try:
        await sync.disconnect(req.widget_key)
        return {"ok": True}
    except Exception as err:
        return _error(err)
