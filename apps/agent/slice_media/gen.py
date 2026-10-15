"""Generation primitives: bytes in, bytes out. No Convex here (see jobs.py).

- image: Nano Banana (Gemini image models) with optional reference images, so a
  product photo or the merchant's upload keeps its look in a new scene.
- video: Veo 3.1 (Lite / Fast / Standard) from a prompt, a first frame and up to
  three reference images. Long-running: polled until done; bytes come back inline.
- omni: Gemini Omni Flash (Interactions API) edits a clip from an instruction
  ("make the light warmer", "continue the shot for 4 more seconds").
- music: Lyria 3 clip (about 30 s, mp3) through the Interactions API.
- voice: Gemini TTS (wav).
"""

from __future__ import annotations

import asyncio
import base64
import io
import time
import wave
from typing import Any

import httpx
from google.genai import types

from . import models as M

_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
    return _http


async def fetch(url: str, limit: int = 200_000_000) -> tuple[bytes, str]:
    res = await http().get(url)
    res.raise_for_status()
    data = res.content
    if len(data) > limit:
        raise ValueError(f"file too large ({len(data) // 1_000_000} MB)")
    mime = (res.headers.get("content-type") or "").split(";")[0].strip() or "application/octet-stream"
    return data, mime


def _sniff_image(data: bytes, mime: str) -> str:
    if mime.startswith("image/"):
        return mime
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


async def fetch_image(url: str) -> tuple[bytes, str]:
    data, mime = await fetch(url, limit=20_000_000)
    return data, _sniff_image(data, mime)


# --- image ------------------------------------------------------------------------------


async def image(prompt: str, *, model: str, aspect: str, refs: list[tuple[bytes, str]] | None = None) -> tuple[bytes, str]:
    """One image. With refs, the prompt should say what to keep from each ("the bottle in image 1")."""
    contents: list[Any] = []
    for data, mime in (refs or [])[:4]:
        contents.append(types.Part.from_bytes(data=data, mime_type=mime))
    contents.append(prompt)
    res = await M.client().aio.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect)),
    )
    for cand in res.candidates or []:
        for part in (cand.content.parts if cand.content else []) or []:
            if part.inline_data and part.inline_data.data:
                data = part.inline_data.data
                return (data if isinstance(data, bytes) else bytes(data)), part.inline_data.mime_type or "image/png"
    reason = ""
    if res.candidates and res.candidates[0].finish_reason:
        reason = f" ({res.candidates[0].finish_reason})"
    raise RuntimeError(f"the image model returned no image{reason}")


# --- video (Veo) --------------------------------------------------------------------------


async def video(
    prompt: str,
    *,
    model: str,
    aspect: str,
    seconds: int,
    resolution: str = "720p",
    audio: bool = False,
    first_frame: tuple[bytes, str] | None = None,
    refs: list[tuple[bytes, str]] | None = None,
    negative: str | None = None,
    timeout_s: float = 600,
) -> bytes:
    """A Veo clip. Reference images ("asset" references) keep a product or person consistent."""
    c = M.veo_client()
    cfg: dict[str, Any] = {
        "aspect_ratio": aspect,
        "duration_seconds": seconds,
        "resolution": resolution,
        "number_of_videos": 1,
        "generate_audio": audio,
        "person_generation": "allow_adult",
    }
    if negative:
        cfg["negative_prompt"] = negative
    if refs:
        cfg["reference_images"] = [types.VideoGenerationReferenceImage(image=types.Image(image_bytes=d, mime_type=m), reference_type="asset") for d, m in refs[:3]]
    source = types.GenerateVideosSource(prompt=prompt, image=types.Image(image_bytes=first_frame[0], mime_type=first_frame[1]) if first_frame else None)
    op = await c.aio.models.generate_videos(model=model, source=source, config=types.GenerateVideosConfig(**cfg))
    started = time.time()
    while not op.done:
        if time.time() - started > timeout_s:
            raise TimeoutError("the video took too long")
        await asyncio.sleep(6)
        op = await c.aio.operations.get(op)
    if op.error:
        raise RuntimeError(f"Veo: {str(op.error.get('message') if isinstance(op.error, dict) else op.error)[:300]}")
    res = op.response or op.result
    vids = (res.generated_videos if res else None) or []
    if not vids or not vids[0].video:
        filtered = getattr(res, "rai_media_filtered_reasons", None) if res else None
        raise RuntimeError(f"Veo returned no video{(': ' + '; '.join(filtered)) if filtered else ' (it may have been filtered; rephrase the prompt)'}")
    v = vids[0].video
    if v.video_bytes:
        return v.video_bytes
    if v.uri:
        data, _ = await fetch(v.uri)
        return data
    raise RuntimeError("Veo returned a video without bytes or a uri")


# --- Omni (edit, extend, generate) ------------------------------------------------------


def _interaction_output(it: Any, kind: str) -> tuple[bytes, str]:
    d = it.model_dump(exclude_none=True) if hasattr(it, "model_dump") else dict(it)
    out = d.get(f"output_{kind}")
    if isinstance(out, dict) and out.get("data"):
        return base64.b64decode(out["data"]), str(out.get("mime_type") or "")
    for step in reversed(d.get("steps") or []):
        if step.get("type") != "model_output":
            continue
        for c in step.get("content") or []:
            if c.get("type") == kind and c.get("data"):
                return base64.b64decode(c["data"]), str(c.get("mime_type") or "")
    raise RuntimeError(f"no {kind} in the model's answer")


async def _interact(timeout_s: float = 600, background: bool = True, **body: Any) -> Any:
    c = M.client()
    # Lyria rejects background interactions; those run as one blocking call in a thread.
    it = await asyncio.to_thread(lambda: c.interactions.create(background=True, **body) if background else c.interactions.create(**body))
    started = time.time()
    while getattr(it, "status", None) in ("in_progress", None, "queued"):
        if time.time() - started > timeout_s:
            raise TimeoutError("the model took too long")
        await asyncio.sleep(6)
        it = await asyncio.to_thread(lambda: c.interactions.get(id=it.id))
    if it.status != "completed":
        raise RuntimeError(f"{body.get('model')}: {it.status}")
    return it


async def omni(instruction: str, *, aspect: str, clip: bytes | None = None, images: list[tuple[bytes, str]] | None = None, resolution: str = "720p") -> bytes:
    """Edit a clip from an instruction, or (no clip) make one from images and text."""
    parts: list[dict[str, Any]] = [{"type": "text", "text": instruction}]
    if clip:
        parts.append({"type": "video", "data": base64.b64encode(clip).decode(), "mime_type": "video/mp4"})
    for d, m in (images or [])[:3]:
        parts.append({"type": "image", "data": base64.b64encode(d).decode(), "mime_type": m})
    it = await _interact(model=M.OMNI, input=parts, response_format={"type": "video", "aspect_ratio": aspect, "resolution": resolution, "delivery": "inline"})
    data, _ = _interaction_output(it, "video")
    return data


# --- music, voice -------------------------------------------------------------------------


async def music(prompt: str) -> tuple[bytes, str]:
    it = await _interact(timeout_s=300, background=False, model=M.LYRIA, input=prompt)
    data, mime = _interaction_output(it, "audio")
    return data, mime or "audio/mpeg"


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def voice(text: str, *, voice_name: str = "Kore", style: str = "") -> tuple[bytes, str]:
    prompt = f"{style.strip()}: {text}" if style.strip() else text
    res = await M.client().aio.models.generate_content(
        model=M.TTS,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name))),
        ),
    )
    part = res.candidates[0].content.parts[0] if res.candidates and res.candidates[0].content and res.candidates[0].content.parts else None
    if not part or not part.inline_data or not part.inline_data.data:
        raise RuntimeError("the speech model returned no audio")
    data = part.inline_data.data
    mime = (part.inline_data.mime_type or "").lower()
    if "wav" in mime and data[:4] == b"RIFF":
        return data, "audio/wav"
    rate = 24000
    if "rate=" in mime:
        try:
            rate = int(mime.split("rate=")[1].split(";")[0])
        except ValueError:
            pass
    return _pcm_to_wav(data, rate), "audio/wav"


def wav_seconds(data: bytes) -> float:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        # A RIFF header with a bad length: estimate from 16-bit mono 24 kHz.
        return max(0.5, (len(data) - 44) / 48000)


VOICES = ("Kore", "Puck", "Charon", "Aoede", "Leda", "Orus", "Zephyr", "Fenrir", "Sulafat", "Achird")
