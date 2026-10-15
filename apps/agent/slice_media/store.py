"""Media data in Convex: reads and writes through the /media/* agent routes (http.ts)."""

from __future__ import annotations

from typing import Any

from slice_agent import convex_client as convex
from slice_mail.store import post, row_id

from .gen import http

__all__ = ["load", "post", "row_id", "upload", "add_asset", "job", "set_clip", "write_creative"]


async def load(campaign_id: str) -> dict[str, Any]:
    """{campaign, brand, creatives, assets, jobs, committed}."""
    data = await post("/media/read", {"campaignId": campaign_id})
    if not isinstance(data, dict) or not data.get("campaign"):
        raise ValueError(f"campaign {campaign_id} not found")
    return data


async def upload(data: bytes, mime: str) -> dict[str, Any]:
    """Bytes into Convex storage through a one-time upload URL (no size limit an action would impose)."""
    target = await post("/media/upload-url", {})
    res = await http().post(target["url"], content=data, headers={"Content-Type": mime}, timeout=300.0)
    if res.status_code >= 400:
        raise RuntimeError(f"upload -> {res.status_code}: {res.text[:200]}")
    storage_id = res.json().get("storageId")
    if not storage_id:
        raise RuntimeError("upload returned no storageId")
    return {"storageId": storage_id}


async def add_asset(campaign_id: str, *, data: bytes | None = None, url: str | None = None, mime: str, kind: str, source: str, **meta: Any) -> dict[str, Any]:
    """A file in the campaign's library: {id, url}."""
    asset: dict[str, Any] = {"kind": kind, "source": source, "mime": mime, **{k: v for k, v in meta.items() if v not in (None, "")}}
    if data is not None:
        asset["storageId"] = (await upload(data, mime))["storageId"]
    elif url:
        asset["url"] = url
    else:
        raise ValueError("add_asset needs data or a url")
    return await post("/media/asset", {"campaignId": campaign_id, "asset": asset})


async def job(campaign_id: str, **fields: Any) -> str:
    res = await post("/media/job", {"campaignId": campaign_id, **fields})
    return str(res.get("id"))


async def set_clip(creative_id: str, clip_id: str, patch: dict[str, Any]) -> bool:
    res = await post("/media/clip", {"creativeId": creative_id, "clipId": clip_id, "patch": patch})
    return bool((res or {}).get("found"))


async def write_creative(campaign_id: str, doc: dict[str, Any], **fields: Any) -> dict[str, Any]:
    return await post("/media/creative", {"campaignId": campaign_id, "doc": doc, **fields})


async def qloo(path: str, params: dict[str, Any]) -> Any:
    body, _ = await convex.qloo(path, params)
    return body
