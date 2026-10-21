"""The item agent: one poster, video, image or clip, open in its editor, with its own
conversation beside it. It only changes that one thing: a change that keeps the rest, or a
complete redo. Posters and videos change in place (their version history keeps the old
ones). An image or a clip gets a new version beside it on the canvas, linked to the one it
came from (parentId), and the editor shows the versions side by side.

Its sessions are per item (the campaign and the item's thread id), apart from the canvas
conversation. The turn protocol is routes.py's; the poster and video tools are the
builder's, pinned to the open creative by a before-tool callback so the model cannot touch
anything else; the image and clip tools here act on the open version.
"""

from __future__ import annotations

from typing import Any

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import ToolContext
from google.genai import types

from slice_pages import builder as PB

from . import builder as B
from . import docs as D
from . import jobs as J
from . import models as M

ITEM = "md_item"  # {kind: "creative" | "asset", id (the open version), thread (the conversation's id)}


def _item(state: dict[str, Any]) -> dict[str, Any]:
    return state.get(ITEM) or {}


def _family(state: dict[str, Any], asset_id: str) -> list[dict[str, Any]]:
    """Every version of an image or clip, oldest first: its first ancestor and everything made from it."""
    by_id = {a["id"]: a for a in state.get(B.ASSETS) or []}
    root = asset_id
    seen: set[str] = set()
    while root in by_id and by_id[root].get("parent") in by_id and root not in seen:
        seen.add(root)
        root = by_id[root]["parent"]

    def root_of(a: dict[str, Any]) -> str:
        cur, hops = a, 0
        while cur.get("parent") in by_id and hops < 50:
            cur, hops = by_id[cur["parent"]], hops + 1
        return cur["id"]

    fam = [a for a in by_id.values() if root_of(a) == root]
    # The library comes newest first; versions read oldest first.
    return list(reversed(fam))


def _open_asset(state: dict[str, Any], version: str = "") -> dict[str, Any] | None:
    """The version a tool works from: the open one, or another version of it when named."""
    item = _item(state)
    if item.get("kind") != "asset":
        return None
    fam = {a["id"]: a for a in _family(state, item["id"])}
    return fam.get(version or item["id"]) or B._asset_by_id(state, item["id"])


# --- instruction ---------------------------------------------------------------------------


def _audience_line(state: dict[str, Any], key: str | None) -> str:
    a = next((x for x in B._audiences(state) if x["id"] == key), None)
    if not a:
        return f"audience {key or 'all'}"
    brief = a.get("brief") or {}
    summ = a.get("summary") or brief.get("summary") or brief.get("who") or ""
    return f"for {a.get('name')} ({a['id']})" + (f": {str(summ)[:220]}" if summ else "")


def _creative_block(state: dict[str, Any], cid: str) -> str:
    c = (state.get(B.CREATIVES) or {}).get(cid)
    if not c:
        return "(the creative is gone: say so)"
    why = "; ".join(f"{w.get('text')} ({w.get('evidence')})" for w in c.get("why") or [] if isinstance(w, dict))
    lines = [f'{c.get("kind")} "{c.get("name")}" {c.get("format")}, v{c.get("version")}, {_audience_line(state, c.get("audienceKey"))}']
    if why:
        lines.append(f"Why it fits: {why}")
    lines.append(D.outline(c["doc"]))
    return "\n".join(lines)


def _asset_line(a: dict[str, Any]) -> str:
    kind = {"video": "clip", "audio": "track"}.get(str(a.get("kind")), "image")
    bits = [a["id"], kind]
    if a.get("w") and a.get("h"):
        bits.append(f"{a['w']}x{a['h']}")
    if a.get("duration"):
        bits.append(f"{a['duration']}s")
    if a.get("model"):
        bits.append(M.IMAGE_LABEL.get(a["model"]) or M.VIDEO_LABEL.get(a["model"]) or a["model"])
    return ", ".join(str(b) for b in bits) + f" {a.get('url')}" + (f" — {a.get('prompt')}" if a.get("prompt") else "")


def _asset_block(state: dict[str, Any], aid: str) -> str:
    fam = _family(state, aid)
    if not fam:
        return "(it is gone: say so)"
    lines = []
    for i, a in enumerate(fam):
        tag = "original" if i == 0 else f"version {i + 1}"
        lines.append(f"- {tag}: {_asset_line(a)}" + ("  <- OPEN" if a["id"] == aid else ""))
    return "VERSIONS (oldest first)\n" + "\n".join(lines)


def _selection_block(state: dict[str, Any]) -> str:
    sel = state.get(B.SELECTION) or {}
    bits = []
    if sel.get("layerIds"):
        bits.append(f"layers {', '.join(sel['layerIds'])}")
    if sel.get("clipId"):
        bits.append(f"shot {sel['clipId']}")
    if sel.get("time") is not None:
        bits.append(f"playhead at {float(sel['time']):.1f}s")
    if not bits:
        return "Nothing is selected inside it: a request is about the whole thing unless the words say otherwise."
    return "SELECTED INSIDE IT: " + ", ".join(bits) + '. "This", "it", "here" mean the selection.'


CREATIVE_HOW = """HOW
- A change: edit_creative with ops on the ids above, several ops in one call. Copy, colours, sizes, positions, a different photo in an image layer (src from LIBRARY, PRODUCTS, search_images or generate_image), layers added or removed.
- A redo: write_creative with a whole new doc (same kind, same format: they are fixed for you). A new idea, layout and copy, on brand. Keep the logo and the call to action.
- Videos: regenerate_shot (new prompt or model), edit_shot (Omni Flash: change light, objects or style and keep the rest of the shot), extend_shot, add_shots, add_music and add_voiceover (they replace the old track). Shots and tracks generate in the background and land by themselves.
- review_creative when you redid a poster or the merchant asks whether it works; fix the high-severity issues.
- Say what it costs before spending more than $1, and ask first if it would pass the budget."""

ASSET_HOW = """HOW
- Images: change_image keeps the picture and changes what they ask (light, colour, background, an object added, removed or swapped, a closer crop). remake_image makes a completely new take of the same shape from your on-brand prompt (subject, setting, light, lens, composition, mood; no text or logos); pass the product photo in reference_urls when the product must stay true.
- Clips: change_clip (Omni Flash) keeps the shot and changes what they ask. remake_clip shoots it again with Veo from your prompt (one continuous shot: subject, action, setting, light, lens, camera move; no on-screen text), starting on a picture when first_frame is given (the open image of a still, a product photo).
- Each makes a new version beside the open one; the old ones stay. They work from the open version unless the merchant names another (from_version).
- One version per request unless they ask for more. Never start the same thing twice."""


async def build_instruction(ctx: ReadonlyContext) -> str:
    s = ctx.state
    item = _item(s)
    campaign = s.get(B.CAMPAIGN) or {}
    brand = s.get(B.BRAND) or {}
    creative = item.get("kind") == "creative"
    if creative:
        c = (s.get(B.CREATIVES) or {}).get(item.get("id")) or {}
        thing = "video ad" if c.get("kind") == "video" else "poster"
        body = _creative_block(s, item.get("id", ""))
    else:
        a = B._asset_by_id(s, item.get("id", "")) or {}
        thing = "clip" if a.get("kind") == "video" else "image"
        body = _asset_block(s, item.get("id", ""))
    return f"""You are Slice's editor for one {thing} the merchant has open in its editor. You work on it and nothing else. A request is one of two kinds:
- A change ("warmer light", "a shorter headline", "swap the photo", "slower"): change exactly that and keep everything else as it is.
- A redo ("start over", "a completely different take", "a new idea"): make it again from scratch in the same shape, on brand, for the same audience.
You never make other things for the canvas (another poster, other images, clips or music beyond this {thing}'s own versions); when asked, say in one sentence that the canvas prompt bar does that.

THE {thing.upper()} (OPEN)
{body}

{_selection_block(s)}

BRAND GUIDELINES (every picture, word and shot follows these)
{B._about_block(brand)}{B._kit_block(campaign.get('kit') or {})}

BRIEF
{B._brief_block(campaign.get('brief') or {})}

PRODUCTS
{B._products_block(campaign.get('products') or [])}

LIBRARY (use by URL)
{B._assets_block(s.get(B.ASSETS) or [], brand)}

COST
{B._budget_block(s)}

{CREATIVE_HOW if creative else ASSET_HOW}
{(B.DOCUMENT + B.DESIGN + (B.VIDEO if thing == "video ad" else "")) if creative else ""}
Reply in one or two short sentences: what changed or what is coming, on which model, about what it costs. Tools return ok: false with problems when nothing was saved; fix and call again. Never claim something is done that a tool did not confirm. Plain text, no markdown, no lists."""


# --- tools: images and clips ---------------------------------------------------------------


def _refs(state: dict[str, Any], urls: list[str] | None, n: int) -> tuple[list[str], str | None]:
    refs = [u for u in (urls or []) if isinstance(u, str) and u.startswith("http")][:n]
    unknown = [u for u in refs if u not in B._known_images(state)]
    return refs, (f"reference_urls must be images you were given: {', '.join(unknown[:2])}" if unknown else None)


async def _version_of(state: dict[str, Any], src: dict[str, Any], *, kind: str, model: str, prompt: str, estimate: float, work: Any, aspect: str, lane: str) -> str:
    return await J.start_asset(B._cid(state), kind=kind, model=model, prompt=prompt, estimate=estimate, work=work, aspect=aspect, near=src["id"], lane=lane, parent=src["id"], target=_item(state).get("thread") or src["id"])


async def change_image(instruction: str, tool_context: ToolContext, reference_urls: list[str] | None = None, model: str = "", from_version: str = "") -> dict:
    """Change the open image and keep the rest of it (Nano Banana): light, colour, background,
    an object added, removed or swapped (the product from a reference photo), a tighter crop.
    The result is a new version beside it; the old one stays.

    Args:
        instruction: What to change, concretely ("warmer evening light", "put the bottle from image 2 on the table").
        reference_urls: Up to 3 image URLs you were given that the change uses (a product photo).
        model: An image model id ("" keeps the model it was made with, else the default).
        from_version: Another version's id to work from ("" for the open one).
    """
    state = tool_context.state
    src = _open_asset(state, from_version)
    if not src or src.get("kind") != "image":
        return {"ok": False, "error": "the open item is not an image"}
    refs, bad = _refs(state, reference_urls, 3)
    if bad:
        return {"ok": False, "error": bad}
    m = M.chosen(model, M.IMAGE_CHOICES) or M.chosen(src.get("model"), M.IMAGE_CHOICES) or M.IMAGE
    estimate = M.image_cost(m)
    try:
        await J.ensure_budget(B._cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = B._nearest_aspect(int(src.get("w") or 1), int(src.get("h") or 1))
    extra = f" Use image{'s' if len(refs) > 1 else ''} {', '.join(str(i + 2) for i in range(len(refs)))} for what the change brings in." if refs else ""
    prompt = f"Edit image 1: {instruction}.{extra} Keep everything else exactly as it is: subject, composition, framing."
    job = await _version_of(state, src, kind="image", model=m, prompt=instruction, estimate=estimate, work=J.image_asset_work(prompt=prompt, model=m, aspect=aspect, refs=[src["url"], *refs], rules=B._check_rules(state, bool(refs))), aspect=aspect, lane="image")
    B._bump(state)
    return {"ok": True, "job": job, "model": M.IMAGE_LABEL.get(m, m), "estimate": estimate}


async def remake_image(prompt: str, tool_context: ToolContext, reference_urls: list[str] | None = None, model: str = "") -> dict:
    """Make the open image again from scratch, the same shape: a completely new take. A new
    version beside it, after the brand check; the old one stays.

    Args:
        prompt: The on-brand scene: subject, setting, light, lens, composition, mood. No text or logos.
        reference_urls: Up to 4 image URLs you were given whose subjects must appear (the product photo).
        model: An image model id ("" keeps the model it was made with, else the default).
    """
    state = tool_context.state
    src = _open_asset(state)
    if not src or src.get("kind") != "image":
        return {"ok": False, "error": "the open item is not an image"}
    refs, bad = _refs(state, reference_urls, 4)
    if bad:
        return {"ok": False, "error": bad}
    m = M.chosen(model, M.IMAGE_CHOICES) or M.chosen(src.get("model"), M.IMAGE_CHOICES) or M.IMAGE
    estimate = M.image_cost(m)
    try:
        await J.ensure_budget(B._cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = B._nearest_aspect(int(src.get("w") or 1), int(src.get("h") or 1))
    job = await _version_of(state, src, kind="image", model=m, prompt=prompt, estimate=estimate, work=J.image_asset_work(prompt=prompt + B._style_suffix(state), model=m, aspect=aspect, refs=refs, rules=B._check_rules(state, bool(refs))), aspect=aspect, lane="image")
    B._bump(state)
    return {"ok": True, "job": job, "model": M.IMAGE_LABEL.get(m, m), "estimate": estimate}


async def change_clip(instruction: str, tool_context: ToolContext, reference_urls: list[str] | None = None, from_version: str = "") -> dict:
    """Change the open clip with Omni Flash and keep the rest of the shot: light, weather, an
    object, style, camera feel. A new version beside it; the old one stays.

    Args:
        instruction: What to change, concretely.
        reference_urls: Up to 3 image URLs you were given that the change uses.
        from_version: Another version's id to work from ("" for the open one).
    """
    state = tool_context.state
    src = _open_asset(state, from_version)
    if not src or src.get("kind") != "video":
        return {"ok": False, "error": "the open item is not a clip"}
    refs, bad = _refs(state, reference_urls, 3)
    if bad:
        return {"ok": False, "error": bad}
    estimate = round(M.OMNI_PER_SECOND * max(4.0, float(src.get("duration") or 6)), 3)
    try:
        await J.ensure_budget(B._cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = "16:9" if int(src.get("w") or 9) > int(src.get("h") or 16) else "9:16"
    job = await _version_of(state, src, kind="edit", model=M.OMNI, prompt=instruction, estimate=estimate, work=J.omni_asset_work(instruction=instruction + " Keep everything else the same. No on-screen text.", src=src["url"], aspect=aspect, images=refs), aspect=aspect, lane="edit")
    B._bump(state)
    return {"ok": True, "job": job, "model": "Omni Flash", "estimate": estimate}


async def remake_clip(prompt: str, tool_context: ToolContext, seconds: int = 0, first_frame: str = "", model: str = "", sound: bool = False) -> dict:
    """Shoot the open clip again with Veo from scratch, the same shape: a completely new take.
    A new version beside it; the old one stays.

    Args:
        prompt: One continuous shot: subject, action, setting, light, lens, camera move, mood. No on-screen text.
        seconds: 4, 6 or 8 (0 keeps its length).
        first_frame: An image URL you were given to start on ("" for none).
        model: A video model id ("" keeps the model it was made with, else the default).
        sound: Veo's own sound (costs more).
    """
    state = tool_context.state
    src = _open_asset(state)
    if not src or src.get("kind") != "video":
        return {"ok": False, "error": "the open item is not a clip"}
    if first_frame and first_frame not in B._known_images(state):
        return {"ok": False, "error": "first_frame must be an image URL you were given"}
    m = M.chosen(model, M.VIDEO_CHOICES) or M.chosen(src.get("model"), M.VIDEO_CHOICES) or M.VEO_FAST
    res = "1080p" if m == M.VEO_STANDARD else "720p"
    secs = M.veo_duration(float(seconds or src.get("duration") or 6), resolution=res)
    estimate = M.video_cost(m, secs, bool(sound))
    try:
        await J.ensure_budget(B._cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = "16:9" if int(src.get("w") or 9) > int(src.get("h") or 16) else "9:16"
    full = prompt + B._style_suffix(state) + " No on-screen text, captions, logos or watermarks."
    job = await _version_of(state, src, kind="video", model=m, prompt=prompt, estimate=estimate, work=J.clip_asset_work(prompt=full, model=m, aspect=aspect, seconds=secs, resolution=res, audio=bool(sound), first_frame=first_frame or None, refs=[]), aspect=aspect, lane="video")
    B._bump(state)
    return {"ok": True, "job": job, "model": M.VIDEO_LABEL.get(m, m), "seconds": secs, "estimate": estimate}


# --- tools: posters and videos (the builder's, pinned to the open creative) -------------------

CREATIVE_TOOLS = [
    B.edit_creative,
    B.write_creative,
    B.generate_image,
    PB.search_images,
    B.add_shots,
    B.regenerate_shot,
    B.edit_shot,
    B.extend_shot,
    B.add_music,
    B.add_voiceover,
    B.review_creative,
    B.ask_questions,
]
ASSET_TOOLS = [change_image, remake_image, change_clip, remake_clip, B.ask_questions]

_PINNED = {"edit_creative", "write_creative", "add_shots", "regenerate_shot", "edit_shot", "extend_shot", "add_music", "add_voiceover", "review_creative"}


def _pin(tool: Any, args: dict[str, Any], tool_context: ToolContext) -> dict | None:
    """before_tool_callback: every creative tool works on the open creative, and a redo keeps
    its kind, format and audience."""
    item = _item(tool_context.state)
    name = getattr(tool, "name", "")
    if item.get("kind") != "creative" or name not in _PINNED:
        return None
    args["creative_id"] = item["id"]
    if name == "write_creative":
        c = (tool_context.state.get(B.CREATIVES) or {}).get(item["id"]) or {}
        doc = B._coerce(args.get("doc"))
        if isinstance(doc, dict) and doc.get("kind") and c.get("kind") and doc["kind"] != c["kind"]:
            return {"ok": False, "problems": [f"this is a {c['kind']}: keep kind {c['kind']!r} (the canvas prompt bar makes other things)"]}
        args["audience_id"] = c.get("audienceKey") or "all"
        if c.get("format"):
            args["format"] = c["format"]
        args["near"] = ""
    return None


STATUS_FOR_TOOL = {
    "change_image": "Changing the image",
    "remake_image": "Making a new take",
    "change_clip": "Changing the clip with Omni",
    "remake_clip": "Shooting a new take",
}

THINKING = {"creative": "MEDIUM", "asset": "LOW"}


def _make_agent(model: str, kind: str) -> LlmAgent:
    return LlmAgent(
        name="slice_media_item",
        model=B._model(model),
        description="Changes or redoes the one poster, video, image or clip open in its editor.",
        instruction=build_instruction,
        generate_content_config=types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_level=THINKING[kind], include_thoughts=True), temperature=0.7),
        tools=CREATIVE_TOOLS if kind == "creative" else ASSET_TOOLS,
        before_tool_callback=_pin,
        after_tool_callback=B._collect_media,
    )


agents = {(m, kind): _make_agent(m, kind) for m in B.MODELS for kind in THINKING}
AGENT_NAME = "slice_media_item"
