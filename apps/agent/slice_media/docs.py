"""MediaDoc helpers mirrored from packages/backend/convex/mediaTypes.ts (Convex re-validates every write)."""

from __future__ import annotations

import copy
import secrets
from typing import Any

FORMATS: dict[str, dict[str, Any]] = {
    "story": {"label": "Story", "w": 1080, "h": 1920, "image": "9:16", "video": "9:16", "motion": True},
    "portrait": {"label": "Feed 4:5", "w": 1080, "h": 1350, "image": "4:5", "video": "9:16", "motion": True},
    "square": {"label": "Square", "w": 1080, "h": 1080, "image": "1:1", "video": "9:16", "motion": True},
    "landscape": {"label": "Landscape", "w": 1920, "h": 1080, "image": "16:9", "video": "16:9", "motion": True},
    "banner": {"label": "Banner", "w": 1200, "h": 628, "image": "16:9", "video": "16:9", "motion": True},
    "print": {"label": "Print A-size", "w": 1240, "h": 1754, "image": "3:4", "video": "9:16", "motion": False},
}

LAYER_TYPES = ("image", "text", "logo", "shape", "qr")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def clip_len(c: dict[str, Any]) -> float:
    return max(0.0, float(c.get("out", 0)) - float(c.get("in", 0)))


def timeline(doc: dict[str, Any]) -> list[tuple[dict[str, Any], float, float]]:
    t = 0.0
    out = []
    for c in doc.get("video") or []:
        start = t
        t += clip_len(c)
        out.append((c, start, t))
    return out


def duration(doc: dict[str, Any]) -> float:
    return sum(clip_len(c) for c in doc.get("video") or []) if doc.get("kind") == "video" else 0.0


def layer_type(l: dict[str, Any]) -> str | None:
    """The layer's type; models often leave it out, so read it from the fields when missing."""
    t = str(l.get("type") or l.get("kind") or "").lower()
    if t in LAYER_TYPES:
        return t
    tag = f"{l.get('id', '')} {l.get('name', '')} {l.get('role', '')}".lower()
    if l.get("text") is not None:
        return "text"
    if l.get("src"):
        return "logo" if "logo" in tag else "image"
    if l.get("url"):
        return "qr"
    if l.get("fill"):
        return "shape"
    return "logo" if "logo" in tag else None


def normalize(doc: dict[str, Any]) -> dict[str, Any]:
    """Fill what the agent may leave out: frame size, ids, layer types, clip defaults."""
    d = copy.deepcopy(doc)
    fmt = d.get("format") if d.get("format") in FORMATS else "story"
    spec = FORMATS[fmt]
    d["format"] = fmt
    d["w"], d["h"] = spec["w"], spec["h"]
    d["kind"] = "video" if d.get("kind") == "video" and spec["motion"] else "poster"
    d.setdefault("background", "#111111")
    layers = []
    for l in d.get("layers") or []:
        t = layer_type(l) if isinstance(l, dict) else None
        if t:
            layers.append({**l, "type": t})
    d["layers"] = layers
    for l in d["layers"]:
        l.setdefault("id", new_id("l"))
        for k, v in (("x", 0), ("y", 0), ("w", spec["w"]), ("h", 100)):
            l.setdefault(k, v)
        # A background photo a few pixels short of the frame leaves a hairline of background showing.
        if l["type"] == "image" and l.get("role") == "background":
            try:
                x, y, w, h = (float(l[k]) for k in ("x", "y", "w", "h"))
            except (TypeError, ValueError):
                continue
            if abs(x) <= 24 and abs(y) <= 24 and abs(x + w - spec["w"]) <= 24 and abs(y + h - spec["h"]) <= 24:
                l.update(x=0, y=0, w=spec["w"], h=spec["h"])
    if d["kind"] == "video":
        for c in d.setdefault("video", []):
            c.setdefault("id", new_id("c"))
            c.setdefault("kind", "motion")
            c.setdefault("in", 0)
            c.setdefault("out", c["in"] + 4)
            c.setdefault("status", "ready" if c.get("src") or (c["kind"] == "still" and c.get("poster")) else "pending")
        for a in d.setdefault("audio", []):
            a.setdefault("id", new_id("a"))
            a.setdefault("start", 0)
            a.setdefault("status", "ready" if a.get("src") else "pending")
    else:
        d.pop("video", None)
        d.pop("audio", None)
    return d


def resize(doc: dict[str, Any], to: str) -> dict[str, Any]:
    """Same rules as resizeDoc in mediaTypes.ts."""
    spec = FORMATS[to]
    sx, sy = spec["w"] / doc["w"], spec["h"] / doc["h"]
    s = min(sx, sy)

    def near(a: float, b: float) -> bool:
        return abs(a - b) <= max(4, b * 0.02)

    layers = []
    for l in doc.get("layers") or []:
        l = dict(l)
        if near(l["x"], 0) and near(l["y"], 0) and near(l["w"], doc["w"]) and near(l["h"], doc["h"]):
            l.update(x=0, y=0, w=spec["w"], h=spec["h"])
            layers.append(l)
            continue
        cx, cy = (l["x"] + l["w"] / 2) * sx, (l["y"] + l["h"] / 2) * sy
        stretch = l["type"] in ("text", "shape")
        w = min(spec["w"], max(l["w"] * s, min(l["w"] * sx, spec["w"] * 0.92)) if stretch else l["w"] * s)
        h = l["h"] * sy if l["type"] == "shape" else l["h"] * s
        l.update(x=round(min(max(0, cx - w / 2), spec["w"] - w)), y=round(min(max(0, cy - h / 2), spec["h"] - h)), w=round(w), h=round(h))
        if l["type"] == "text":
            l["size"] = round(l.get("size", 48) * s)
            for k in ("padX", "padY"):
                if l.get(k):
                    l[k] = round(l[k] * s)
        layers.append(l)
    kind = "video" if doc.get("kind") == "video" and spec["motion"] else "poster"
    out = {**doc, "kind": kind, "format": to, "w": spec["w"], "h": spec["h"], "layers": layers}
    if kind != "video":
        out.pop("video", None)
        out.pop("audio", None)
    return out


def _short(s: Any, n: int = 70) -> str:
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def outline(doc: dict[str, Any]) -> str:
    """A compact view of a doc for the model: every id it may edit."""
    lines = [f"{doc.get('kind')} {doc.get('format')} {doc.get('w')}x{doc.get('h')} background {_short(doc.get('background'), 40)}"]
    if doc.get("kind") == "video":
        lines.append(f"duration {duration(doc):.1f}s")
        for c, a, b in timeline(doc):
            bits = [c["id"], c.get("kind", "motion"), f"{a:.1f}-{b:.1f}s", c.get("role") or "", c.get("status", "")]
            if c.get("model"):
                bits.append(c["model"])
            if c.get("transition") == "fade":
                bits.append("fade-in")
            if c.get("error"):
                bits.append(f"error: {_short(c['error'], 80)}")
            lines.append(f"  shot {', '.join(x for x in bits if x)} — {_short(c.get('prompt'), 90)}" + (f' — says "{_short(c["says"], 80)}"' if c.get("says") else ""))
        for au in doc.get("audio") or []:
            lines.append(f"  audio {au['id']} {au['kind']} {au.get('start', 0):.1f}s +{au.get('duration', 0):.1f}s vol {au.get('volume', 1)} {au.get('status', '')} — {_short(au.get('text') or au.get('prompt'), 70)}")
    for l in doc.get("layers") or []:
        box = f"({round(l['x'])},{round(l['y'])} {round(l['w'])}x{round(l['h'])})"
        timing = f" t {l.get('start', 0)}-{l['end'] if l.get('end') is not None else 'end'}" if doc.get("kind") == "video" and (l.get("start") is not None or l.get("end") is not None) else ""
        anim = f" anim {l['anim']}" if l.get("anim") and l["anim"] != "none" else ""
        hidden = " hidden" if l.get("hidden") else ""
        t = l["type"]
        if t == "text":
            what = f'{l.get("role") or "text"} "{_short(l.get("text"), 60)}" {l.get("font", "body")} {l.get("size")}px {l.get("color")}' + (f" on {_short(l['bg'], 30)}" if l.get("bg") else "")
        elif t == "image":
            what = f"image {l.get('role') or ''} {l.get('fit', 'cover')} {_short(l.get('src'), 60)}"
        elif t == "shape":
            what = f"shape {_short(l.get('fill'), 50)}"
        elif t == "logo":
            what = f"logo {'image' if l.get('src') else repr(l.get('text') or '')}"
        else:
            what = f"qr {_short(l.get('url'), 50)}"
        lines.append(f"  layer {l['id']} {what} {box}{timing}{anim}{hidden}")
    return "\n".join(lines)


def apply_ops(doc: dict[str, Any], ops: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    """Small edits by id. Returns the new doc and one note per op that could not apply."""
    d = copy.deepcopy(doc)
    problems: list[str] = []
    for i, op in enumerate(ops or []):
        kind = str(op.get("op") or "")
        target = str(op.get("id") or "")
        props = op.get("props") if isinstance(op.get("props"), dict) else {}
        lists = [("layers", d.get("layers") or []), ("video", d.get("video") or []), ("audio", d.get("audio") or [])]
        found = next(((name, lst, j) for name, lst in lists for j, x in enumerate(lst) if x.get("id") == target), None)
        if kind == "set":
            for k in ("background",):
                if k in props:
                    d[k] = props[k]
            continue
        if kind == "add_layer":
            layer = op.get("layer") if isinstance(op.get("layer"), dict) else props
            t = layer_type(layer) if layer else None
            if not t:
                problems.append(f"op {i}: add_layer needs a layer with a type")
                continue
            layer = {**layer, "type": t, "id": layer.get("id") or new_id("l")}
            at = op.get("index")
            d.setdefault("layers", [])
            if isinstance(at, int):
                d["layers"].insert(max(0, min(len(d["layers"]), at)), layer)
            else:
                d["layers"].append(layer)
            continue
        if not found:
            problems.append(f"op {i}: no layer, shot or audio with id {target!r}")
            continue
        name, lst, j = found
        if kind == "update":
            lst[j] = {**lst[j], **{k: v for k, v in props.items() if k not in ("id", "type")}}
            for k, v in props.items():
                if v is None:
                    lst[j].pop(k, None)
        elif kind == "remove":
            lst.pop(j)
        elif kind == "move":
            item = lst.pop(j)
            at = op.get("index")
            lst.insert(max(0, min(len(lst), int(at))) if isinstance(at, int) else len(lst), item)
        elif kind == "duplicate":
            item = {**copy.deepcopy(lst[j]), "id": new_id(target.split("_")[0] or "l"), **props}
            lst.insert(j + 1, item)
        else:
            problems.append(f"op {i}: unknown op {kind!r} (use update, remove, move, duplicate, add_layer, set)")
        d[name] = lst
    return d, problems


def text_warnings(doc: dict[str, Any]) -> list[str]:
    """Cheap layout checks before a render: text that will likely overflow or sit off-frame."""
    out = []
    W, H = doc.get("w", 1080), doc.get("h", 1920)
    for l in doc.get("layers") or []:
        if l.get("hidden"):
            continue
        if l["x"] < -2 or l["y"] < -2 or l["x"] + l["w"] > W + 2 or l["y"] + l["h"] > H + 2:
            if not (l["type"] in ("image", "shape") and l["w"] >= W * 0.9):
                out.append(f"{l['id']} extends past the frame")
        if l["type"] == "text" and l.get("text"):
            size = float(l.get("size", 48))
            lh = float(l.get("lineHeight") or (1.05 if l.get("font") == "heading" else 1.3))
            usable = max(1.0, l["w"] - 2 * float(l.get("padX") or 0))
            chars_per_line = max(1.0, usable / (size * (0.6 if l.get("uppercase") else 0.52)))
            words = str(l["text"]).split()
            lines, cur = 1, 0
            for wd in words:
                if cur and cur + 1 + len(wd) > chars_per_line:
                    lines += 1
                    cur = len(wd)
                else:
                    cur += (1 if cur else 0) + len(wd)
            lines += str(l["text"]).count("\n")
            need = lines * size * lh + 2 * float(l.get("padY") or 0)
            if need > l["h"] * 1.15:
                out.append(f"{l['id']} text needs about {round(need)}px of height but its box is {round(l['h'])}px (it will shrink to fit; enlarge the box or cut words)")
    return out
