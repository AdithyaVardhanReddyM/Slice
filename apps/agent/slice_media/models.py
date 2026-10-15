"""Which model makes what, at what price.

Three tiers trade cost for quality; within a tier each shot's role picks its
model, so a "smart" video spends on the hero and product shots and saves on
b-roll, and stills (an image with a Ken Burns move) cost only the image.
Prices are list prices in USD (estimates, used for the budget and the meter);
mediaTypes.ts TIERS shows the same numbers in the console. Every model id can
be overridden from the environment.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from google import genai

from slice_agent.brief import client as default_client


def _env(name: str, default: str) -> str:
    return os.environ.get(name) or default


# Model ids (Vertex). Veo lives in regional endpoints only (us-central1); Omni, Lyria and TTS in global.
VEO_LITE = _env("MEDIA_VEO_LITE_MODEL", "veo-3.1-lite-generate-001")
VEO_FAST = _env("MEDIA_VEO_FAST_MODEL", "veo-3.1-fast-generate-001")
VEO_STANDARD = _env("MEDIA_VEO_MODEL", "veo-3.1-generate-001")
OMNI = _env("MEDIA_OMNI_MODEL", "gemini-omni-1.1-flash-preview")
LYRIA = _env("MEDIA_MUSIC_MODEL", "lyria-3-clip-preview")
TTS = _env("MEDIA_TTS_MODEL", "gemini-3.8-flash-tts")
IMAGE_LITE = _env("MEDIA_IMAGE_LITE_MODEL", "gemini-3.1-flash-lite-image")
IMAGE = _env("MEDIA_IMAGE_MODEL", "gemini-3.1-flash-image")
IMAGE_PRO = _env("MEDIA_IMAGE_PRO_MODEL", "gemini-3-pro-image")
VEO_LOCATION = _env("MEDIA_VEO_LOCATION", "us-central1")

# USD per second of output: (silent, with native audio).
VIDEO_PRICE: dict[str, tuple[float, float]] = {
    VEO_LITE: (0.03, 0.05),
    VEO_FAST: (0.10, 0.15),
    VEO_STANDARD: (0.20, 0.40),
}
OMNI_PER_SECOND = 0.10
IMAGE_PRICE = {IMAGE_LITE: 0.02, IMAGE: 0.067, IMAGE_PRO: 0.134}
MUSIC_PRICE = 0.04
VOICE_PRICE = 0.01

TIERS: dict[str, dict[str, Any]] = {
    "draft": {"image": IMAGE_LITE, "hero": VEO_LITE, "broll": VEO_LITE, "resolution": "720p"},
    "smart": {"image": IMAGE, "hero": VEO_FAST, "broll": VEO_LITE, "resolution": "720p"},
    "premium": {"image": IMAGE_PRO, "hero": VEO_STANDARD, "broll": VEO_FAST, "resolution": "1080p"},
}

VIDEO_LABEL = {VEO_LITE: "Veo 3.1 Lite", VEO_FAST: "Veo 3.1 Fast", VEO_STANDARD: "Veo 3.1", OMNI: "Omni Flash"}
IMAGE_LABEL = {IMAGE_LITE: "Nano Banana Lite", IMAGE: "Nano Banana 2", IMAGE_PRO: "Nano Banana Pro"}


def tier(name: str | None) -> dict[str, Any]:
    return TIERS.get(name or "smart") or TIERS["smart"]


def video_model(tier_name: str | None, role: str, quality: str = "auto") -> str:
    """Hero and product shots get the tier's better model; b-roll the cheaper one. `quality` overrides."""
    if quality == "draft":
        return VEO_LITE
    if quality == "premium":
        return VEO_STANDARD
    if quality == "fast":
        return VEO_FAST
    t = tier(tier_name)
    return t["hero"] if role in ("hero", "product", "talent") else t["broll"]


def image_model(tier_name: str | None, quality: str = "auto") -> str:
    if quality == "draft":
        return IMAGE_LITE
    if quality == "premium":
        return IMAGE_PRO
    if quality == "standard":
        return IMAGE
    return tier(tier_name)["image"]


def video_cost(model: str, seconds: float, audio: bool) -> float:
    silent, voiced = VIDEO_PRICE.get(model, (0.15, 0.15))
    return round((voiced if audio else silent) * seconds, 3)


def image_cost(model: str) -> float:
    return IMAGE_PRICE.get(model, 0.067)


def veo_duration(seconds: float, *, with_refs: bool = False, resolution: str = "720p") -> int:
    """Veo makes 4, 6 or 8 seconds; reference images and 1080p need 8."""
    if with_refs or resolution != "720p":
        return 8
    s = float(seconds or 6)
    return 4 if s <= 4.5 else 6 if s <= 6.5 else 8


@lru_cache(maxsize=1)
def veo_client() -> genai.Client:
    """Veo on Vertex is regional; the default client points at `global`."""
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if project and (os.environ.get("GOOGLE_GENAI_USE_ENTERPRISE") or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") or "").lower() in ("1", "true"):
        return genai.Client(vertexai=True, project=project, location=VEO_LOCATION)
    return default_client()


def client() -> genai.Client:
    return default_client()
