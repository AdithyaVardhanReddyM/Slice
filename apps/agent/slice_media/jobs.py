"""Long-running generation as jobs.

A job is a row in Convex (mediaJobs) plus an asyncio task here. The clip it
fills is marked pending in the doc right away, so the studio shows the slot
while the model works; when the bytes land they go to Convex storage, the
clip is patched in place (/media/clip) and the job's cost is added to the
campaign's spend. The agent's turn does not wait for video: it plans, starts
jobs and finishes; the console follows the jobs live.

Budget: a job starts only if spend + running estimates + its own estimate
stay within the campaign's budget.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import ff
from . import gen
from . import models as M
from . import store

log = logging.getLogger("slice.media.jobs")

_limits = {"video": asyncio.Semaphore(4), "edit": asyncio.Semaphore(2), "audio": asyncio.Semaphore(3), "image": asyncio.Semaphore(4), "export": asyncio.Semaphore(2)}
_tasks: set[asyncio.Task] = set()


class BudgetError(RuntimeError):
    pass


@dataclass
class Landed:
    data: bytes
    mime: str
    asset_kind: str  # video | image | audio
    cost: float
    patch: dict[str, Any] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)


async def budget(campaign_id: str, data: dict[str, Any] | None = None) -> dict[str, float]:
    data = data or await store.load(campaign_id)
    c = data["campaign"]
    b, spend, committed = float(c.get("budget") or 0), float(c.get("spend") or 0), float(data.get("committed") or 0)
    return {"budget": b, "spend": round(spend, 3), "committed": round(committed, 3), "left": round(b - spend - committed, 3)}


async def ensure_budget(campaign_id: str, estimate: float, data: dict[str, Any] | None = None) -> dict[str, float]:
    b = await budget(campaign_id, data)
    if estimate > b["left"] + 1e-6:
        raise BudgetError(f"over budget: this needs about ${estimate:.2f} but ${max(0.0, b['left']):.2f} is left of ${b['budget']:.2f} (spent ${b['spend']:.2f}, ${b['committed']:.2f} running). Raise the budget, use the draft tier, or use stills.")
    return b


async def storage_url(data: bytes, mime: str) -> str:
    up = await store.upload(data, mime)
    res = await store.post("/media/storage-url", {"storageId": up["storageId"]})
    return str(res["url"])


async def start(
    campaign_id: str,
    *,
    creative_id: str,
    target_id: str,
    kind: str,
    model: str,
    prompt: str,
    estimate: float,
    work: Callable[[], Awaitable[Landed]],
    lane: str = "video",
) -> str:
    """Record the job, mark its clip pending, and run `work` in the background. Returns the job id."""
    job_id = await store.job(campaign_id, creativeId=creative_id, targetId=target_id, kind=kind, model=model, prompt=prompt[:2000], estimate=round(estimate, 3), status="running")
    await store.set_clip(creative_id, target_id, {"status": "pending", "jobId": job_id, "error": ""})
    task = asyncio.create_task(_run(campaign_id, job_id, creative_id, target_id, kind, model, prompt, work, lane))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return job_id


async def _run(campaign_id: str, job_id: str, creative_id: str, target_id: str, kind: str, model: str, prompt: str, work: Callable[[], Awaitable[Landed]], lane: str) -> None:
    try:
        async with _limits.get(lane, _limits["video"]):
            out = await work()
        asset = await store.add_asset(campaign_id, data=out.data, mime=out.mime, kind=out.asset_kind, source="generated", prompt=prompt[:2000], model=model, cost=out.cost, **out.meta)
        patch = {**out.patch, "status": "ready", "assetId": asset["id"], "error": ""}
        if out.asset_kind in ("video", "audio"):
            patch["src"] = asset["url"]
        if out.asset_kind == "video" and "poster" not in patch:
            try:
                patch["poster"] = await storage_url(await ff.frame_bytes(out.data, at=0.3), "image/jpeg")
            except Exception as e:  # a missing thumbnail is not worth failing the shot
                log.warning("poster frame failed: %s", e)
        found = await store.set_clip(creative_id, target_id, patch)
        await store.job(campaign_id, jobId=job_id, status="done", cost=round(out.cost, 3), assetId=asset["id"])
        if not found:
            log.info("job %s landed but %s is gone from the creative", job_id, target_id)
    except Exception as e:
        msg = _friendly(e)
        log.warning("job %s (%s %s) failed: %s", job_id, kind, model, e)
        try:
            await store.set_clip(creative_id, target_id, {"status": "failed", "error": msg})
            await store.job(campaign_id, jobId=job_id, status="failed", error=msg, cost=0)
        except Exception:
            log.exception("could not record the failure of job %s", job_id)


async def start_asset(
    campaign_id: str,
    *,
    kind: str,
    model: str,
    prompt: str,
    estimate: float,
    work: Callable[[], Awaitable[Landed]],
    aspect: str | None,
    near: str | None = None,
    lane: str = "image",
    source: str = "generated",
    parent: str | None = None,
    target: str | None = None,
    job_id: str | None = None,
    thread: str | None = None,
    audience: str | None = None,
) -> str:
    """A standalone generation (an image, a clip, a track): the job holds a spot on the canvas
    while it runs, and the file takes that spot when it lands. `target` marks the job as a new
    version of that item (its editor shows it coming). With `job_id`, a design spot already on
    the canvas becomes this generation. `thread` is the conversation it was asked for in, and
    `audience` the audience it was made for (the asset keeps it, for its Why).
    Returns the job id."""
    if job_id:
        await store.job(campaign_id, jobId=job_id, kind=kind, model=model, prompt=prompt[:2000], estimate=round(estimate, 3), status="running", aspect=aspect, **({"thread": thread} if thread else {}))
    else:
        job_id = await store.job(campaign_id, kind=kind, model=model, prompt=prompt[:2000], estimate=round(estimate, 3), status="running", place=True, aspect=aspect, **({"nearId": near} if near else {}), **({"targetId": target} if target else {}), **({"thread": thread} if thread else {}))
    task = asyncio.create_task(_run_asset(campaign_id, job_id, kind, model, prompt, work, lane, source, parent, audience))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return job_id


async def _run_asset(campaign_id: str, job_id: str, kind: str, model: str, prompt: str, work: Callable[[], Awaitable[Landed]], lane: str, source: str, parent: str | None, audience: str | None = None) -> None:
    try:
        async with _limits.get(lane, _limits["image"]):
            out = await work()
        asset = await store.add_asset(campaign_id, data=out.data, mime=out.mime, kind=out.asset_kind, source=source, prompt=prompt[:2000], model=out.patch.get("model") or model, cost=out.cost, **({"parentId": parent} if parent else {}), **({"audienceKey": audience} if audience else {}), **out.meta)
        await store.job(campaign_id, jobId=job_id, status="done", cost=round(out.cost, 3), assetId=asset["id"])
    except Exception as e:
        msg = _friendly(e)
        log.warning("job %s (%s %s) failed: %s", job_id, kind, model, e)
        try:
            await store.job(campaign_id, jobId=job_id, status="failed", error=msg, cost=0)
        except Exception:
            log.exception("could not record the failure of job %s", job_id)


def _friendly(e: Exception) -> str:
    s = str(e) or e.__class__.__name__
    low = s.lower()
    if "safety" in low or "filtered" in low or "responsible ai" in low or "rai" in low.split():
        return "The model declined this prompt (safety filter). Rephrase it: describe the scene, avoid real people's names and brands."
    if "quota" in low or "429" in low or "resource_exhausted" in low:
        return "The model is busy (quota). Try again in a minute."
    return s[:400]


# --- work builders --------------------------------------------------------------------------


async def _maybe_image(url: str | None) -> tuple[bytes, str] | None:
    if not url:
        return None
    return await gen.fetch_image(url)


def shot_work(*, prompt: str, model: str, aspect: str, seconds: int, resolution: str, audio: bool, first_frame: str | None, refs: list[str], negative: str | None, keep: float) -> Callable[[], Awaitable[Landed]]:
    """A Veo shot. `keep` is how much of it the timeline uses (the clip's out point)."""

    async def work() -> Landed:
        ff_img = await _maybe_image(first_frame)
        ref_imgs = [r for r in await asyncio.gather(*[_maybe_image(u) for u in refs[:3]], return_exceptions=True) if isinstance(r, tuple)]
        secs = M.veo_duration(seconds, with_refs=bool(ref_imgs), resolution=resolution)
        try:
            data = await gen.video(prompt, model=model, aspect=aspect, seconds=secs, resolution=resolution, audio=audio, first_frame=ff_img, refs=ref_imgs or None, negative=negative)
        except Exception as e:
            if not ref_imgs:
                raise
            # Not every model takes reference images; the first frame and the words carry the look instead.
            log.info("retrying without reference images: %s", e)
            secs = M.veo_duration(seconds, resolution=resolution)
            data = await gen.video(prompt, model=model, aspect=aspect, seconds=secs, resolution=resolution, audio=audio, first_frame=ff_img or ref_imgs[0], negative=negative)
        info = await ff.probe_bytes(data)
        dur = info.duration or float(secs)
        return Landed(data, "video/mp4", "video", M.video_cost(model, secs, audio), patch={"in": 0, "out": round(min(max(keep, 1.0), dur), 2), "model": model, "muted": not audio}, meta={"w": info.width or None, "h": info.height or None, "duration": round(dur, 2)})

    return work


def edit_work(*, instruction: str, src: str, aspect: str, keep_in: float, keep_out: float, images: list[str]) -> Callable[[], Awaitable[Landed]]:
    """Omni Flash rewrites the shot (lighting, objects, style, camera) and keeps the rest."""

    async def work() -> Landed:
        clip, _ = await gen.fetch(src)
        imgs = [r for r in await asyncio.gather(*[_maybe_image(u) for u in images[:3]], return_exceptions=True) if isinstance(r, tuple)]
        data = await gen.omni(instruction, aspect=aspect, clip=clip, images=imgs or None)
        info = await ff.probe_bytes(data)
        dur = info.duration or (keep_out - keep_in)
        start = min(keep_in, max(0.0, dur - 0.5))
        return Landed(data, "video/mp4", "video", round(M.OMNI_PER_SECOND * dur, 3), patch={"in": round(start, 2), "out": round(min(dur, max(start + 0.5, keep_out)), 2), "model": M.OMNI}, meta={"duration": round(dur, 2), "w": info.width or None, "h": info.height or None})

    return work


def still_work(*, prompt: str, model: str, aspect: str, refs: list[str]) -> Callable[[], Awaitable[Landed]]:
    async def work() -> Landed:
        ref_imgs = [r for r in await asyncio.gather(*[_maybe_image(u) for u in refs[:4]], return_exceptions=True) if isinstance(r, tuple)]
        data, mime = await gen.image(prompt, model=model, aspect=aspect, refs=ref_imgs)
        url = await storage_url(data, mime)
        return Landed(data, mime, "image", M.image_cost(model), patch={"poster": url, "model": model})

    return work


def music_work(*, prompt: str, length: float) -> Callable[[], Awaitable[Landed]]:
    async def work() -> Landed:
        data, mime = await gen.music(prompt)
        info = await ff.probe_bytes(data, ".mp3")
        dur = info.duration or 30.0
        return Landed(data, mime, "audio", M.MUSIC_PRICE, patch={"duration": round(min(dur, length) if length > 0 else dur, 2)}, meta={"duration": round(dur, 2)})

    return work


def voice_work(*, text: str, voice: str, style: str, start: float) -> Callable[[], Awaitable[Landed]]:
    async def work() -> Landed:
        data, mime = await gen.voice(text, voice_name=voice, style=style)
        dur = gen.wav_seconds(data)
        return Landed(data, mime, "audio", M.VOICE_PRICE, patch={"duration": round(dur, 2), "start": start}, meta={"duration": round(dur, 2)})

    return work


# --- standalone work (canvas assets) ------------------------------------------------------


def image_asset_work(*, prompt: str, model: str, aspect: str, refs: list[str], rules: list[dict[str, Any]] | None) -> Callable[[], Awaitable[Landed]]:
    """An image for the canvas. With `rules` (the brand's guidelines), a critic checks it and a
    picture that fails is made once more with the critic's reasons in the prompt."""

    async def work() -> Landed:
        from . import check

        ref_imgs = [r for r in await asyncio.gather(*[_maybe_image(u) for u in refs[:4]], return_exceptions=True) if isinstance(r, tuple)]
        ask = prompt + " No text, letters, logos or watermarks in the image."
        cost = 0.0
        best: tuple[bytes, str, dict[str, Any]] | None = None
        tries = 0
        for tries in range(1, (check.MAX_TRIES if rules else 1) + 1):
            data, mime = await gen.image(ask, model=model, aspect=aspect, refs=ref_imgs)
            cost += M.image_cost(model)
            if not rules:
                best = (data, mime, {})
                break
            verdict = await check.review(data, mime, prompt, rules, ref_imgs)
            if best is None or verdict.get("score", 0) > best[2].get("score", 0):
                best = (data, mime, verdict)
            if verdict.get("passed") or verdict.get("error"):
                break
            ask = f"{prompt} No text, letters, logos or watermarks in the image. Fix from the last attempt: {verdict.get('fix') or '; '.join(x['reason'] for x in verdict.get('rules') or [] if not x['pass'])}"
        assert best is not None
        data, mime, verdict = best
        meta: dict[str, Any] = {}
        w, h = _image_size(data)
        if w and h:
            meta.update(w=w, h=h)
        if verdict:
            meta["review"] = check.summary(verdict, tries)
        return Landed(data, mime, "image", round(cost, 3), patch={"model": model}, meta=meta)

    return work


def clip_asset_work(*, prompt: str, model: str, aspect: str, seconds: int, resolution: str, audio: bool, first_frame: str | None, refs: list[str]) -> Callable[[], Awaitable[Landed]]:
    """A single Veo clip for the canvas."""
    shot = shot_work(prompt=prompt, model=model, aspect=aspect, seconds=seconds, resolution=resolution, audio=audio, first_frame=first_frame, refs=refs, negative="text, captions, subtitles, watermark, logo", keep=float(seconds))

    async def work() -> Landed:
        out = await shot()
        return Landed(out.data, out.mime, "video", out.cost, patch={"model": model}, meta=out.meta)

    return work


def omni_asset_work(*, instruction: str, src: str, aspect: str, images: list[str]) -> Callable[[], Awaitable[Landed]]:
    """A finished clip changed (or continued) by Omni Flash, as a new clip beside it."""

    async def work() -> Landed:
        clip, _ = await gen.fetch(src)
        imgs = [r for r in await asyncio.gather(*[_maybe_image(u) for u in images[:3]], return_exceptions=True) if isinstance(r, tuple)]
        data = await gen.omni(instruction, aspect=aspect, clip=clip, images=imgs or None)
        info = await ff.probe_bytes(data)
        dur = info.duration or 6.0
        return Landed(data, "video/mp4", "video", round(M.OMNI_PER_SECOND * dur, 3), patch={"model": M.OMNI}, meta={"duration": round(dur, 2), "w": info.width or None, "h": info.height or None})

    return work


def music_asset_work(*, prompt: str, model: str) -> Callable[[], Awaitable[Landed]]:
    async def work() -> Landed:
        data, mime = await gen.music(prompt, model=model)
        info = await ff.probe_bytes(data, ".mp3")
        return Landed(data, mime, "audio", M.music_cost(model), patch={"model": model}, meta={"duration": round(info.duration or 30.0, 2)})

    return work


def _image_size(data: bytes) -> tuple[int, int]:
    """Width and height of a PNG or JPEG from its header (no image library needed)."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):
                    return int.from_bytes(data[i + 7 : i + 9], "big"), int.from_bytes(data[i + 5 : i + 7], "big")
                i += 2 + int.from_bytes(data[i + 2 : i + 4], "big")
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and data[12:16] == b"VP8 ":
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    except Exception:
        pass
    return 0, 0


# --- helpers for callers ----------------------------------------------------------------


def shot_estimate(model: str, seconds: float, audio: bool, refs: bool, resolution: str) -> float:
    return M.video_cost(model, M.veo_duration(seconds, with_refs=refs, resolution=resolution), audio)


def find(doc: dict[str, Any], clip_id: str) -> dict[str, Any] | None:
    for lst in (doc.get("video") or [], doc.get("audio") or [], doc.get("layers") or []):
        for x in lst:
            if x.get("id") == clip_id:
                return x
    return None


def running() -> int:
    return len(_tasks)


__all__ = ["BudgetError", "Landed", "budget", "ensure_budget", "start", "start_asset", "shot_work", "edit_work", "still_work", "music_work", "voice_work", "image_asset_work", "clip_asset_work", "omni_asset_work", "music_asset_work", "shot_estimate", "find", "storage_url"]
