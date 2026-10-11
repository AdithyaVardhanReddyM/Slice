"""Imagery for pages: Pexels search, Nano Banana generation on Vertex, uploads to Convex.

Every function returns ImageRef dicts (`src, alt, source, credit?, prompt?, ref?`)
as defined in pagesTypes.ts. Generation failures fall back to Pexels and say so
in a span, so a page never ends up without a hero image.

Model ids come from the environment (see .env.example): NANO_BANANA_2_MODEL
(default gemini-3.1-flash-image) and NANO_BANANA_PRO_MODEL (default
gemini-3-pro-image).
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx
from google.genai import types

from slice_agent import convex_client as convex
from slice_agent.brief import client
from slice_agent.trace import record
from .timing import timer

PEXELS_URL = "https://api.pexels.com/v1/search"
MODEL_KEYS = {"nano-banana-2": "NANO_BANANA_2_MODEL", "nano-banana-pro": "NANO_BANANA_PRO_MODEL"}
MODEL_DEFAULTS = {"nano-banana-2": "gemini-3.1-flash-image", "nano-banana-pro": "gemini-3-pro-image"}
# Aspect ratios Gemini image models accept; anything else is mapped to the nearest.
ASPECTS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}
ORIENTATION_FOR = {"16:9": "landscape", "21:9": "landscape", "3:2": "landscape", "4:3": "landscape", "5:4": "landscape", "4:5": "portrait", "2:3": "portrait", "3:4": "portrait", "9:16": "portrait", "1:1": "square"}

_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=30.0)
    return _http


def model_id(key: str) -> str:
    key = key if key in MODEL_KEYS else "nano-banana-2"
    return os.environ.get(MODEL_KEYS[key]) or MODEL_DEFAULTS[key]


def normalize_aspect(aspect: str | None) -> str:
    a = (aspect or "16:9").strip()
    if a in ASPECTS:
        return a
    return {"landscape": "16:9", "portrait": "4:5", "square": "1:1", "wide": "16:9"}.get(a.lower(), "16:9")


async def pexels_search(query: str, orientation: str | None = None, take: int = 4) -> list[dict[str, Any]]:
    """Photos from Pexels as ImageRef[] (source "pexels", credit = photographer, large2x src)."""
    key = os.environ.get("PEXELS_API_KEY")
    query = " ".join(query.split())[:100]
    if not key:
        record("slice", f'Pexels search "{query}"', "skipped: PEXELS_API_KEY is not set", ms=0)
        return []
    params: dict[str, Any] = {"query": query, "per_page": max(1, min(20, int(take)))}
    if orientation in ("landscape", "portrait", "square"):
        params["orientation"] = orientation
    with timer() as t:
        try:
            res = await _client().get(PEXELS_URL, params=params, headers={"Authorization": key})
            res.raise_for_status()
            photos = (res.json() or {}).get("photos") or []
        except Exception as err:
            record("slice", f'Pexels search "{query}"', f"failed: {type(err).__name__}: {str(err)[:120]}", ms=t.ms, started=t.started)
            return []
    out: list[dict[str, Any]] = []
    for p in photos:
        src = (p.get("src") or {}).get("large2x") or (p.get("src") or {}).get("large")
        if not src:
            continue
        out.append(
            {
                "src": src,
                "alt": (p.get("alt") or query).strip()[:160],
                "source": "pexels",
                "credit": f"{p.get('photographer') or 'Pexels'} on Pexels",
                "ref": str(p.get("id")),
                "url": p.get("url"),
                "photographerUrl": p.get("photographer_url"),
            }
        )
    record("slice", f'Pexels search "{query}"', f"{len(out)} photos" + (f", {orientation}" if orientation else ""), ms=t.ms, started=t.started, params=params)
    return out


async def upload_image(brand_id: str, data: bytes, mime: str = "image/png") -> dict[str, Any]:
    """POST raw bytes to Convex storage; returns {url, storageId?}."""
    res = await _client().post(
        f"{convex._env('CONVEX_SITE_URL')}/pages/file",
        params={"brandId": brand_id},
        content=data,
        headers={"Content-Type": mime, "Authorization": f"Bearer {convex._env('QLOO_PROXY_SECRET')}"},
        timeout=60.0,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"/pages/file -> {res.status_code}: {res.text[:200]}")
    body = res.json()
    if not body.get("url"):
        raise RuntimeError(f"/pages/file returned no url: {str(body)[:200]}")
    return body


def _query_from_prompt(prompt: str) -> str:
    words = re.findall(r"[A-Za-z][A-Za-z'-]+", prompt)
    stop = {"a", "an", "the", "of", "with", "and", "in", "on", "for", "to", "at", "by", "from", "photo", "photograph", "image", "shot", "style", "no", "text", "high", "quality", "realistic"}
    keep = [w for w in words if w.lower() not in stop]
    return " ".join(keep[:6]) or "brand lifestyle"


async def generate_image(
    brand_id: str,
    prompt: str,
    *,
    aspect: str = "16:9",
    model: str = "nano-banana-2",
    brand_style: str | None = None,
    alt: str | None = None,
) -> dict[str, Any]:
    """Nano Banana on Vertex -> Convex storage -> ImageRef (source "generated"). Falls back
    to a Pexels photo (and records why) when generation or the upload fails."""
    aspect = normalize_aspect(aspect)
    mid = model_id(model)
    full_prompt = prompt.strip()
    if brand_style:
        full_prompt += f"\n\nPhotographic direction from the brand kit: {brand_style}. No text, no logos, no watermarks."
    with timer() as t:
        try:
            res = await client().aio.models.generate_content(
                model=mid,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect),
                ),
            )
            blob = None
            for cand in res.candidates or []:
                for part in (cand.content.parts if cand.content else []) or []:
                    if part.inline_data and part.inline_data.data:
                        blob = part.inline_data
                        break
                if blob:
                    break
            if not blob:
                raise RuntimeError("the model returned no image part")
            mime = blob.mime_type or "image/png"
            data = blob.data if isinstance(blob.data, (bytes, bytearray)) else bytes(blob.data)
            uploaded = await upload_image(brand_id, bytes(data), mime)
        except Exception as err:
            reason = f"{type(err).__name__}: {str(err)[:160]}"
            record("llm", f"Generate image with {mid}", f"failed ({reason}); falling back to Pexels", ms=t.ms, started=t.started, params={"aspect": aspect})
            photos = await pexels_search(_query_from_prompt(prompt), ORIENTATION_FOR.get(aspect, "landscape"), take=1)
            if not photos:
                raise RuntimeError(f"image generation failed ({reason}) and Pexels had nothing") from err
            photo = photos[0]
            photo["prompt"] = prompt
            photo["fallbackFrom"] = model
            return photo
    record("llm", f"Generate image with {mid}", f"{aspect}, {len(data) // 1024} KB uploaded", ms=t.ms, started=t.started, params={"aspect": aspect, "prompt": prompt[:120]})
    return {
        "src": uploaded["url"],
        "alt": (alt or prompt).strip()[:160],
        "source": "generated",
        "prompt": prompt,
        "ref": str(uploaded.get("storageId") or uploaded.get("id") or ""),
        "model": mid,
    }


async def images_for_console(brand_id: str, *, model: str, prompt: str | None, query: str | None, aspect: str | None, brand_style: str | None = None) -> list[dict[str, Any]]:
    """The /pages/image route: a Pexels page for the picker, or one generated image."""
    if model == "pexels" or (not prompt and query):
        return await pexels_search(query or prompt or "", ORIENTATION_FOR.get(normalize_aspect(aspect), None) if aspect else None, take=8)
    if not prompt:
        raise ValueError("prompt is required for generation")
    return [await generate_image(brand_id, prompt, aspect=aspect or "16:9", model=model, brand_style=brand_style)]
