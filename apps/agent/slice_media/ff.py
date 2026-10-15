"""ffmpeg (bundled by imageio-ffmpeg): probe, frames, and the commands render.py composes."""

from __future__ import annotations

import asyncio
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

import imageio_ffmpeg

EXE = imageio_ffmpeg.get_ffmpeg_exe()


class FfmpegError(RuntimeError):
    pass


async def run(args: list[str], timeout: float = 600) -> str:
    """Run ffmpeg; returns stderr (where ffmpeg logs). Raises with the tail of the log on failure."""
    proc = await asyncio.create_subprocess_exec(EXE, "-hide_banner", "-nostdin", "-y", *args, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    try:
        _, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise FfmpegError("ffmpeg timed out")
    log = err.decode(errors="replace")
    if proc.returncode != 0:
        raise FfmpegError(log[-1500:])
    return log


@dataclass
class Probe:
    duration: float
    width: int
    height: int
    has_audio: bool


async def probe(path: str | Path) -> Probe:
    proc = await asyncio.create_subprocess_exec(EXE, "-hide_banner", "-i", str(path), stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    log = err.decode(errors="replace")
    dur = 0.0
    m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", log)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    w = h = 0
    m = re.search(r"Stream #.*Video:.*?(\d{2,5})x(\d{2,5})", log)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
    return Probe(duration=dur, width=w, height=h, has_audio=bool(re.search(r"Stream #.*Audio:", log)))


async def probe_bytes(data: bytes, suffix: str = ".mp4") -> Probe:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / f"in{suffix}"
        p.write_bytes(data)
        return await probe(p)


async def frame(src: str | Path, at: float = 0.0, width: int = 720) -> bytes:
    """One JPEG frame."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "f.jpg"
        await run(["-ss", f"{max(0.0, at):.3f}", "-i", str(src), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", str(out)], timeout=60)
        return out.read_bytes()


async def frame_bytes(data: bytes, at: float = 0.0, width: int = 720) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "in.mp4"
        p.write_bytes(data)
        return await frame(p, at, width)


async def last_frame_bytes(data: bytes, width: int = 1280) -> bytes:
    """The final frame (to continue a shot from where it ends)."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "in.mp4"
        p.write_bytes(data)
        info = await probe(p)
        return await frame(p, max(0.0, info.duration - 0.06), width)
