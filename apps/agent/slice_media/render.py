"""Rendering creatives to files.

Posters: the web app's /render/media page draws the doc (the same React stage
the studio uses), Playwright screenshots it at full size.

Videos: ffmpeg does the timeline. Each shot becomes a normalised segment
(cropped around its focal point, 30 fps, with an audio track; stills get a
Ken Burns move); the segments are concatenated; every group of overlay layers
is rendered once as a transparent PNG and laid over its time range with its
entrance animation; music and voiceover are mixed under the shots' own sound.
Headless Chromium can't decode H.264, which is why frames never go through
the browser.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from pathlib import Path
from typing import Any

from slice_pages.browser import UA, browser
from slice_pages.builder import web_url

from . import docs as D
from . import ff
from . import gen
from . import store

log = logging.getLogger("slice.media.render")

FPS = 30
FADE = 0.35


async def _page(doc: dict[str, Any], kit: dict[str, Any], mode: str, scale: float = 1.0):
    b = await browser()
    ctx = await b.new_context(viewport={"width": int(doc["w"]), "height": int(doc["h"])}, device_scale_factor=scale, user_agent=UA)
    payload = json.dumps({"doc": doc, "kit": kit, "mode": mode})
    await ctx.add_init_script(script=f"window.__MEDIA__ = {payload};")
    page = await ctx.new_page()
    await page.goto(f"{web_url()}/render/media", wait_until="domcontentloaded", timeout=45_000)
    await page.wait_for_function("window.__MEDIA_READY__ === true", timeout=45_000)
    return ctx, page


async def poster(doc: dict[str, Any], kit: dict[str, Any], *, image_type: str = "png", scale: float = 1.0) -> tuple[bytes, str]:
    """The whole frame (for a video: the first frame's layers over the background, used as a cover)."""
    ctx, page = await _page(doc, kit, "poster", scale)
    try:
        opts: dict[str, Any] = {"type": image_type, "clip": {"x": 0, "y": 0, "width": doc["w"], "height": doc["h"]}}
        if image_type == "jpeg":
            opts["quality"] = 92
        data = await page.screenshot(**opts)
        return data, f"image/{image_type}"
    finally:
        await ctx.close()


async def layer_pngs(doc: dict[str, Any], kit: dict[str, Any], groups: list[list[str]]) -> list[bytes]:
    """One transparent PNG per group of layer ids."""
    ctx, page = await _page(doc, kit, "layers")
    try:
        out = []
        for ids in groups:
            await page.evaluate("ids => window.__mediaShow(ids)", ids)
            out.append(await page.screenshot(type="png", omit_background=True, clip={"x": 0, "y": 0, "width": doc["w"], "height": doc["h"]}))
        return out
    finally:
        await ctx.close()


# --- video ------------------------------------------------------------------------------


def _even(n: float) -> int:
    return int(round(n / 2) * 2)


def _hex(color: str) -> str:
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", (color or "").strip())
    return f"0x{m.group(1)}" if m else "black"


def _burns(kind: str | None, n: int, W: int, H: int) -> str:
    n = max(1, n)
    p = f"(on/{n})"
    center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    if kind == "in":
        z, xy = f"'1+0.12*{p}'", center
    elif kind == "out":
        z, xy = f"'1.12-0.12*{p}'", center
    elif kind == "left":
        z, xy = "'1.12'", f"x='(iw-iw/zoom)*(1-{p})':y='ih/2-(ih/zoom/2)'"
    elif kind == "right":
        z, xy = "'1.12'", f"x='(iw-iw/zoom)*{p}':y='ih/2-(ih/zoom/2)'"
    else:
        z, xy = "'1'", center
    return f"zoompan=z={z}:{xy}:d=1:s={W}x{H}:fps={FPS}"


async def _download(url: str, tmp: Path, cache: dict[str, Path], suffix: str) -> Path:
    if url in cache:
        return cache[url]
    data, _ = await gen.fetch(url)
    p = tmp / f"src{len(cache)}{suffix}"
    p.write_bytes(data)
    cache[url] = p
    return p


async def _segment(i: int, clip: dict[str, Any], *, W: int, H: int, fade_in: bool, fade_out: bool, bg: str, tmp: Path, cache: dict[str, Path]) -> Path:
    length = max(0.2, D.clip_len(clip))
    out = tmp / f"seg{i:03d}.mp4"
    fx, fy = (clip.get("focal") or {}).get("x", 0.5), (clip.get("focal") or {}).get("y", 0.5)
    fades = []
    if fade_in:
        fades.append(f"fade=t=in:st=0:d={FADE}")
    if fade_out:
        fades.append(f"fade=t=out:st={max(0.0, length - FADE):.3f}:d={FADE}")
    tail = ",".join(["setsar=1", f"fps={FPS}", "format=yuv420p", *fades])
    silent = ["-f", "lavfi", "-t", f"{length:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", f"{length:.3f}", str(out)]

    if clip.get("kind") == "motion" and clip.get("src") and clip.get("status") == "ready":
        src = await _download(clip["src"], tmp, cache, ".mp4")
        info = await ff.probe(src)
        crop = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}:(iw-ow)*{fx}:(ih-oh)*{fy}"
        vf = f"[0:v]{crop},tpad=stop_mode=clone:stop_duration=3,{tail}[v]"
        args = ["-ss", f"{float(clip.get('in', 0)):.3f}", "-t", f"{length:.3f}", "-i", str(src)]
        if info.has_audio and not clip.get("muted"):
            vol = float(clip.get("volume", 1) if clip.get("volume") is not None else 1)
            af = f"[0:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},apad[a]"
            await ff.run([*args, "-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]", *enc])
        else:
            await ff.run([*args, *silent, "-filter_complex", vf, "-map", "[v]", "-map", "1:a", *enc])
        return out

    image = clip.get("poster")
    n = int(round(length * FPS))
    if image:
        src = await _download(image, tmp, cache, ".img")
        W2, H2 = _even(W * 1.5), _even(H * 1.5)
        vf = f"[0:v]scale={W2}:{H2}:force_original_aspect_ratio=increase,crop={W2}:{H2}:(iw-ow)*{fx}:(ih-oh)*{fy},{_burns(clip.get('kenburns') or 'in', n, W, H)},{tail}[v]"
        await ff.run(["-loop", "1", "-framerate", str(FPS), "-t", f"{length:.3f}", "-i", str(src), *silent, "-filter_complex", vf, "-map", "[v]", "-map", "1:a", *enc])
        return out
    # A shot still generating or failed: hold the background colour so timing stays right.
    await ff.run(["-f", "lavfi", "-t", f"{length:.3f}", "-i", f"color=c={_hex(bg)}:s={W}x{H}:r={FPS}", *silent, "-filter_complex", f"[0:v]{tail}[v]", "-map", "[v]", "-map", "1:a", *enc])
    return out


def _groups(doc: dict[str, Any], total: float) -> list[tuple[list[str], float, float, str]]:
    """Adjacent visible layers that share timing and animation render as one overlay."""
    out: list[tuple[list[str], float, float, str]] = []
    for l in doc.get("layers") or []:
        if l.get("hidden"):
            continue
        a = float(l.get("start") or 0)
        b = float(l["end"]) if l.get("end") is not None else total
        b = min(b, total)
        if b - a < 0.05:
            continue
        anim = l.get("anim") or "none"
        if out and out[-1][1] == a and out[-1][2] == b and out[-1][3] == anim:
            out[-1][0].append(l["id"])
        else:
            out.append(([l["id"]], a, b, anim))
    return out


def _overlay_filters(groups: list[tuple[list[str], float, float, str]], total: float, first_input: int) -> tuple[list[str], str]:
    parts: list[str] = []
    cur = "0:v"
    for k, (_, a, b, anim) in enumerate(groups):
        idx = first_input + k
        chain = ["format=rgba"]
        if anim != "none":
            chain.append(f"fade=t=in:st={a:.3f}:d=0.45:alpha=1")
        if anim != "none" and b < total - 0.05:
            chain.append(f"fade=t=out:st={max(a, b - 0.3):.3f}:d=0.3:alpha=1")
        parts.append(f"[{idx}:v]{','.join(chain)}[o{k}]")
        ease = f"pow(1-min(1,max(0,(t-{a:.3f})/0.55)),3)"
        x, y = "0", "0"
        if anim == "rise":
            y = f"'70*{ease}'"
        elif anim == "slide":
            x = f"'-110*{ease}'"
        nxt = f"v{k}"
        parts.append(f"[{cur}][o{k}]overlay=x={x}:y={y}:eval=frame:enable='between(t,{a:.3f},{b:.3f})'[{nxt}]")
        cur = nxt
    return parts, cur


async def video(doc: dict[str, Any], kit: dict[str, Any]) -> bytes:
    clips = doc.get("video") or []
    if not clips:
        raise ValueError("this video has no shots yet")
    W, H = _even(doc["w"]), _even(doc["h"])
    total = D.duration(doc)
    with tempfile.TemporaryDirectory(prefix="slice-media-") as d:
        tmp = Path(d)
        cache: dict[str, Path] = {}
        segs = []
        for i, c in enumerate(clips):
            nxt = clips[i + 1] if i + 1 < len(clips) else None
            segs.append(await _segment(i, c, W=W, H=H, fade_in=i > 0 and c.get("transition") == "fade", fade_out=bool(nxt and nxt.get("transition") == "fade"), bg=str(doc.get("background") or ""), tmp=tmp, cache=cache))
        listing = tmp / "list.txt"
        listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in segs))

        groups = _groups(doc, total)
        pngs = await layer_pngs(doc, kit, [g[0] for g in groups]) if groups else []
        inputs = ["-f", "concat", "-safe", "0", "-i", str(listing)]
        for k, png in enumerate(pngs):
            p = tmp / f"ov{k:02d}.png"
            p.write_bytes(png)
            inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", str(p)]
        filters, vout = _overlay_filters(groups, total, 1)

        audio_tracks = [a for a in doc.get("audio") or [] if a.get("src") and a.get("status") == "ready"]
        has_voice = any(a["kind"] == "voice" for a in audio_tracks)
        mix = ["[0:a]aresample=48000[a0]"]
        labels = ["[a0]"]
        next_input = 1 + len(pngs)
        for j, a in enumerate(audio_tracks):
            src = await _download(a["src"], tmp, cache, ".mp3" if a["kind"] == "music" else ".wav")
            inputs += ["-i", str(src)]
            start = max(0.0, float(a.get("start", 0)))
            dur = max(0.2, min(float(a.get("duration") or total), total - start))
            vol = float(a.get("volume", 0.5 if a["kind"] == "music" else 1))
            if a["kind"] == "music" and has_voice:
                vol *= 0.45
            chain = [f"atrim=0:{dur:.3f}", "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=channel_layouts=stereo", f"volume={vol:.3f}"]
            if a["kind"] == "music":
                # Duck under people speaking on camera (times relative to the track's start).
                spoken = [(s - start, e - start) for c, s, e in D.timeline(doc) if c.get("says") and not c.get("muted") and e > start and s < start + dur]
                if spoken:
                    cond = "+".join(f"between(t,{max(0.0, s - 0.2):.2f},{e + 0.2:.2f})" for s, e in spoken)
                    chain.append(f"volume='if({cond},0.3,1)':eval=frame")
                chain += ["afade=t=in:d=0.4", f"afade=t=out:st={max(0.0, dur - 1.2):.3f}:d=1.2"]
            ms = int(start * 1000)
            if ms:
                chain.append(f"adelay={ms}|{ms}")
            mix.append(f"[{next_input}:a]{','.join(chain)}[m{j}]")
            labels.append(f"[m{j}]")
            next_input += 1
        mix.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0,alimiter=limit=0.95[aout]" if len(labels) > 1 else "[a0]anull[aout]")

        graph = ";".join([*filters, *mix]) if filters else ";".join([f"[0:v]null[vbase]", *mix])
        vmap = f"[{vout}]" if filters else "[vbase]"
        out = tmp / "out.mp4"
        await ff.run([*inputs, "-filter_complex", graph, "-map", vmap, "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", str(out)], timeout=900)
        return out.read_bytes()


# --- export -----------------------------------------------------------------------------


async def export(creative_id: str, campaign_id: str) -> dict[str, Any]:
    """Render the creative's current version, store it and record it as the creative's export."""
    data = await store.load(campaign_id)
    creative = next((c for c in data["creatives"] if store.row_id(c) == creative_id), None)
    if not creative:
        raise ValueError(f"creative {creative_id} not found")
    doc, kit = creative["doc"], data["campaign"].get("kit") or {}
    await store.post("/media/creative-status", {"creativeId": creative_id, "status": "rendering"})
    try:
        if doc.get("kind") == "video":
            pending = [c["id"] for c in doc.get("video") or [] if c.get("status") == "pending"]
            if pending:
                raise ValueError(f"shots still generating: {', '.join(pending)}. Export when they finish.")
            body, mime = await video(doc, kit), "video/mp4"
        else:
            body, mime = await poster(doc, kit, image_type="png" if doc.get("format") == "print" else "jpeg")
        up = await store.upload(body, mime)
        url = (await store.post("/media/storage-url", {"storageId": up["storageId"]}))["url"]
        await store.post("/media/export", {"creativeId": creative_id, "url": url, "mime": mime, "version": int(creative.get("version") or 1), "storageId": up["storageId"]})
        return {"url": url, "mime": mime, "bytes": len(body), "version": creative.get("version")}
    except Exception:
        await store.post("/media/creative-status", {"creativeId": creative_id, "status": "draft"})
        raise


async def review_frames(creative: dict[str, Any], kit: dict[str, Any], *, max_frames: int = 4) -> list[tuple[bytes, str, str]]:
    """Images to look at: the poster itself, or frames across a rendered video. (bytes, mime, label)."""
    doc = creative["doc"]
    if doc.get("kind") != "video":
        data, mime = await poster(doc, kit, image_type="jpeg", scale=0.6)
        return [(data, mime, "poster")]
    body = await video(doc, kit)
    total = D.duration(doc)
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "v.mp4"
        p.write_bytes(body)
        times = [total * f for f in (0.08, 0.35, 0.65, 0.95)][:max_frames]
        frames = await asyncio.gather(*[ff.frame(p, t, 540) for t in times])
    return [(f, "image/jpeg", f"t={t:.1f}s") for f, t in zip(frames, times)]
