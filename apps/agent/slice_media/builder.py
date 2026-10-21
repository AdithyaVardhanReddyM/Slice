"""The Media builder: an ADK agent that makes a brand's images, posters, video
clips, edited video ads and music on a campaign's canvas.

Most turns come from the canvas prompt bar (kind "prompt"): what to make, on which
models, in what shape, for which audience, and what is selected on the canvas. A
"generate" turn still makes a whole set (every audience × format) when asked.
Generation follows the ADK on-brand-genmedia recipe: the brand's guidelines are in
the instruction, the agent rewrites each request into an on-brand prompt, and
canvas images pass a brand check (check.py) that retries once with the critic's
reasons.

State per session (one session per campaign) is loaded fresh every turn from
/media/read: the campaign (kit, brief, products, audiences, formats, tier,
budget), the source brand, every creative's doc, the asset library. Layouts are
written whole (write_creative) or edited by id (edit_creative); shots, music and
voiceover are generated as background jobs (jobs.py) that land in the doc on
their own, so a turn never waits on video. Qloo grounds each audience's concept;
the Pages builder's Qloo and Pexels tools are reused by import.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models import Gemini
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import ToolContext
from google.genai import types

from slice_agent.trace import record
from slice_pages import builder as PB
from slice_pages.audience_brief import profile_summary
from slice_pages.llm import generate_json
from slice_pages.timing import timer

from . import check as C
from . import docs as D
from . import ff
from . import gen
from . import jobs as J
from . import models as M
from . import render
from . import store
from . import taste

MODEL = PB.MODEL
MODELS = PB.MODELS
MAX_REVIEWS_PER_TURN = 3

log = logging.getLogger("slice.media.builder")

# --- state keys ---------------------------------------------------------------------
CAMPAIGN = "md_campaign"
BRAND = "md_brand"
CREATIVES = "md_creatives"  # {id: {id, name, audienceKey, format, kind, version, status, doc, why}}
ASSETS = "md_assets"
BUDGET = "md_budget"
KIND = "md_kind"  # "generate" | "edit"
SELECTION = "md_selection"  # what the merchant has selected in the studio
MEDIA = "md_media"  # image URLs tools returned this session
REVIEWS = "md_reviews"
WRITES = "md_writes"  # bumps on every write; the stream tells the console
OPTIONS = "md_options"  # the prompt bar's picks: output, models, aspect, count, audience, check
NODES = "md_nodes"  # what is selected on the canvas: [{kind, id}]

_locks: dict[str, asyncio.Lock] = {}


def _lock(key: str) -> asyncio.Lock:
    return _locks.setdefault(key, asyncio.Lock())


# --- loading -----------------------------------------------------------------------


def _creative(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": store.row_id(c),
        "name": c.get("name"),
        "audienceKey": c.get("audienceKey"),
        "format": c.get("format"),
        "kind": c.get("kind"),
        "version": c.get("version"),
        "status": c.get("status"),
        "doc": c.get("doc") or {},
        "why": c.get("why") or [],
        "exported": bool(c.get("export")),
    }


def _asset(a: dict[str, Any]) -> dict[str, Any]:
    out = {"id": store.row_id(a), "kind": a.get("kind"), "source": a.get("source"), "url": a.get("url")}
    for k in ("name", "prompt", "w", "h", "duration", "model"):
        if a.get(k):
            out[k] = a[k] if k != "prompt" else str(a[k])[:120]
    if a.get("parentId"):
        out["parent"] = a["parentId"]
    if a.get("board"):
        out["onCanvas"] = True
    return out


async def load_state(campaign_id: str) -> dict[str, Any]:
    data = await store.load(campaign_id)
    campaign = dict(data["campaign"])
    creatives = {r["id"]: r for r in (_creative(c) for c in data.get("creatives") or [])}
    return {
        CAMPAIGN: campaign,
        BRAND: data.get("brand") or {},
        CREATIVES: creatives,
        ASSETS: [_asset(a) for a in data.get("assets") or [] if a.get("kind") in ("image", "video", "audio")][:300],
        BUDGET: await J.budget(campaign_id, data),
        REVIEWS: 0,
        PB.AUDIENCE: {"name": "Everyone", "profile": {}},
    }


def _cid(state: dict[str, Any]) -> str:
    return store.row_id(state.get(CAMPAIGN) or {})


def _audiences(state: dict[str, Any]) -> list[dict[str, Any]]:
    return list((state.get(CAMPAIGN) or {}).get("audiences") or []) or [{"id": "all", "name": "Everyone", "kind": "everyone"}]


def _known_images(state: dict[str, Any]) -> set[str]:
    camp = state.get(CAMPAIGN) or {}
    kit = camp.get("kit") or {}
    out = set(state.get(MEDIA) or [])
    out |= {a["url"] for a in state.get(ASSETS) or [] if a.get("url")}
    out |= {p.get("image") for p in camp.get("products") or [] if p.get("image")}
    out |= {(kit.get("logo") or {}).get("src")} - {None}
    brand = state.get(BRAND) or {}
    out |= {i.get("src") if isinstance(i, dict) else i for i in brand.get("images") or []} - {None}
    for c in (state.get(CREATIVES) or {}).values():
        for l in c["doc"].get("layers") or []:
            if l.get("src"):
                out.add(l["src"])
        for v in c["doc"].get("video") or []:
            for k in ("src", "poster"):
                if v.get(k):
                    out.add(v[k])
    return {u for u in out if isinstance(u, str)}


# --- instruction -------------------------------------------------------------------


def _about_block(brand: dict[str, Any]) -> str:
    about = brand.get("about") or {}
    if not isinstance(about, dict) or not about.get("summary"):
        return ""
    lines = [f"What it is: {about['summary']}"]
    if about.get("audience"):
        lines.append(f"Who it sells to: {about['audience']}")
    if about.get("categories"):
        lines.append(f"Sells: {', '.join(about['categories'])}")
    if about.get("location"):
        lines.append(f"Where: {about['location']}")
    return "\n".join(lines) + "\n"


def _kit_block(kit: dict[str, Any]) -> str:
    fonts = kit.get("fonts") or {}
    lines = [
        f"Name: {kit.get('name')}",
        f"Colours: {json.dumps(kit.get('colors') or {})}",
        f"Fonts: heading {((fonts.get('heading') or {}).get('family'))}, body {((fonts.get('body') or {}).get('family'))}",
        f"Logo: {(kit.get('logo') or {}).get('src') or 'none (use the wordmark: a logo layer with text)'}" + (" (light, for dark backgrounds)" if (kit.get("logo") or {}).get("onDark") else ""),
    ]
    if kit.get("voice"):
        v = kit["voice"]
        lines.append(f"Voice: {v.get('summary', '')} Do: {'; '.join(v.get('do') or [])}. Avoid: {'; '.join(v.get('avoid') or [])}.")
    if kit.get("imagery"):
        lines.append(f"Imagery: {kit['imagery'].get('style', '')} {kit['imagery'].get('treatment', '')}")
        if kit["imagery"].get("avoid"):
            lines.append(f"Pictures never show: {'; '.join(kit['imagery']['avoid'])}")
    if kit.get("uppercaseLabels"):
        lines.append("Labels and CTAs in uppercase.")
    if kit.get("buttonStyle"):
        lines.append(f"Buttons: {kit['buttonStyle']}")
    if kit.get("url"):
        lines.append(f"Site: {kit['url']}")
    return "\n".join(lines)


def _brief_block(brief: dict[str, Any]) -> str:
    parts = [f"Goal: {brief.get('goal') or '(not given: infer from the brand and products)'}"]
    for k, label in (("offer", "Offer"), ("cta", "Call to action"), ("link", "Link (QR codes and CTAs point here)"), ("notes", "Notes")):
        if brief.get(k):
            parts.append(f"{label}: {brief[k]}")
    if brief.get("duration"):
        parts.append(f"Video length: about {brief['duration']} s")
    parts.append(f"Music: {'yes' if brief.get('music', True) else 'no'}. Voiceover: {'yes' if brief.get('voiceover') else 'no'}.")
    people = {
        "none": "no people on camera (hands at most)",
        "using": "people using the products (sitting on it, wearing it, cooking with it); no talking",
        "talking": "a presenter talks to camera (UGC or testimonial style) in at least one shot per video, plus people using the products",
    }.get(str(brief.get("people") or "auto"))
    parts.append(f"People in videos: {people or 'your call: people using the products where it helps the audience see themselves'}.")
    return "\n".join(parts)


def _audiences_block(state: dict[str, Any]) -> str:
    lines = []
    for a in _audiences(state):
        what = a.get("kind")
        if a.get("kind") == "seed" and a.get("seed"):
            s = a["seed"]
            what = f"taste seeds: {', '.join(s.get('interests') or [])}" + (f"; {s['city']}" if s.get("city") else "") + (f"; age {s['age']}" if s.get("age") else "")
        elif a.get("kind") in ("pages", "email"):
            what = ("Pages audience" if a["kind"] == "pages" else "Email taste group (customers grouped by what they bought)") + (f" ({a.get('status')})" if a.get("status") and a.get("status") != "ready" else "")
        brief = a.get("brief") or {}
        summ = a.get("summary") or brief.get("summary") or brief.get("who") or ""
        lines.append(f"- {a['id']}: {a.get('name')} [{what}]" + (f" {str(summ)[:220]}" if summ else "") + (" (profile ready)" if a.get("profile") else ""))
    return "\n".join(lines)


def _products_block(products: list[dict[str, Any]]) -> str:
    if not products:
        return "(none picked: the campaign is about the brand; use brand photos, uploads or generated scenes)"
    return "\n".join(f"- {p.get('id')}: {p.get('name')}" + (f", {p['price']}" if p.get("price") else "") + (f" image {p['image']}" if p.get("image") else "") + (f" ({str(p['description'])[:120]})" if p.get("description") else "") for p in products[:20])


def _assets_block(assets: list[dict[str, Any]], brand: dict[str, Any]) -> str:
    lines = []
    uploads = [a for a in assets if a.get("source") == "upload"]
    others = [a for a in assets if a.get("source") != "upload"]
    for a in (uploads + others)[:30]:
        bits = [a["id"], a.get("kind"), a.get("source")]
        if a.get("w") and a.get("h"):
            bits.append(f"{a['w']}x{a['h']}")
        if a.get("duration"):
            bits.append(f"{a['duration']}s")
        if a.get("onCanvas"):
            bits.append("on the canvas")
        lines.append(f"- {', '.join(str(b) for b in bits if b)} {a.get('url')}" + (f" — {a.get('name') or a.get('prompt')}" if a.get("name") or a.get("prompt") else ""))
    imgs = [i.get("src") if isinstance(i, dict) else i for i in (brand.get("images") or [])[:10]]
    if imgs:
        lines.append("Photos from the brand's site: " + ", ".join(str(i) for i in imgs if i))
    return "\n".join(lines) or "(empty: no uploads yet)"


def _creatives_block(state: dict[str, Any]) -> str:
    creatives = list((state.get(CREATIVES) or {}).values())
    if not creatives:
        return "(none yet)"
    sel = (state.get(SELECTION) or {}).get("creativeId")
    out = []
    for c in creatives:
        head = f"### {c['id']} \"{c.get('name')}\" audience {c.get('audienceKey')}, {c.get('format')}, {c.get('kind')}, v{c.get('version')}, {c.get('status')}" + (", SELECTED" if c["id"] == sel else "")
        out.append(head + "\n" + D.outline(c["doc"]))
    return "\n\n".join(out)


def _budget_block(state: dict[str, Any]) -> str:
    b = state.get(BUDGET) or {}
    tier = (state.get(CAMPAIGN) or {}).get("tier") or "smart"
    t = M.tier(tier)
    lines = [
        f"Tier: {tier}. Images: {M.IMAGE_LABEL.get(t['image'], t['image'])} (${M.image_cost(t['image']):.3f} each). Video: hero and product shots {M.VIDEO_LABEL.get(t['hero'])} (${M.VIDEO_PRICE[t['hero']][0]:.2f}/s silent, ${M.VIDEO_PRICE[t['hero']][1]:.2f}/s with sound), b-roll {M.VIDEO_LABEL.get(t['broll'])} (${M.VIDEO_PRICE[t['broll']][0]:.2f}/s silent), {t['resolution']}. Stills (an image with a slow move) cost only the image. Omni edit ${M.OMNI_PER_SECOND:.2f}/s. Music ${M.MUSIC_PRICE:.2f}, voiceover ${M.VOICE_PRICE:.2f}.",
        f"Budget ${b.get('budget', 0):.2f}: spent ${b.get('spend', 0):.2f}, running ${b.get('committed', 0):.2f}, left ${max(0.0, b.get('left', 0)):.2f}.",
    ]
    return "\n".join(lines)


def _nodes_block(state: dict[str, Any]) -> str:
    nodes = state.get(NODES) or []
    if not nodes:
        return ""
    assets = {a["id"]: a for a in state.get(ASSETS) or []}
    creatives = state.get(CREATIVES) or {}
    bits = []
    for n in nodes[:8]:
        if n.get("kind") == "creative" and n.get("id") in creatives:
            c = creatives[n["id"]]
            bits.append(f"{c.get('kind')} creative {n['id']} \"{c.get('name')}\" ({c.get('format')})")
        elif n.get("kind") == "asset" and n.get("id") in assets:
            a = assets[n["id"]]
            bits.append(f"{'clip' if a.get('kind') == 'video' else 'track' if a.get('kind') == 'audio' else 'image'} {n['id']} {a.get('url')}" + (f" ({str(a.get('prompt') or '')[:80]})" if a.get("prompt") else ""))
    if not bits:
        return ""
    return "SELECTED ON THE CANVAS: " + "; ".join(bits) + ". \"This\", \"it\", \"these\" mean the selection: change an image with edit_image, a clip with edit_clip, a poster or video with edit_creative."


def _selection_block(state: dict[str, Any]) -> str:
    sel = state.get(SELECTION) or {}
    if not sel.get("creativeId"):
        return _nodes_block(state)
    bits = [f"creative {sel['creativeId']}"]
    if sel.get("layerIds"):
        bits.append(f"layers {', '.join(sel['layerIds'])}")
    if sel.get("clipId"):
        bits.append(f"shot {sel['clipId']}")
    if sel.get("time") is not None:
        bits.append(f"playhead at {float(sel['time']):.1f}s")
    return "SELECTED IN THE STUDIO: " + ", ".join(bits) + ". \"This\", \"it\", \"here\" in the merchant's message mean the selection."


DOCUMENT = """
THE DOCUMENT (MediaDoc). Every creative is one doc:
{kind: "poster"|"video", format, background, layers: [...], video?: [shots], audio?: [tracks]}
- format is one of story 1080x1920, portrait 1080x1350, square 1080x1080, landscape 1920x1080, banner 1200x628, print 1240x1754 (no video). w and h are filled in for you.
- background: a colour or a CSS linear-gradient / radial-gradient (for a video, what shows behind a shot that is still generating).
- Coordinates are pixels in the format's frame, x/y the top-left corner. Layers draw in order: first is at the back.
- Every layer has a "type" field: {type: "text", text: "Shop now", x: 80, y: 900, w: 300, h: 80, ...}.
- Layer types (all take id?, name?, x, y, w, h, rotation?, opacity?, hidden?, and for videos start?/end? seconds and anim: none|fade|rise|pop|slide|wipe):
  - image: {src, fit: cover|contain, focal?: {x,y} 0..1, radius?, shadow?, role: background|product|photo}. src must be a URL you were given (assets, products, brand photos, search_images, generate_image).
  - text: {text, role: headline|subhead|body|cta|caption|price|label, font: heading|body, size (px), weight?, color, align: left|center|right, valign: top|middle|bottom, lineHeight?, tracking? (em), uppercase?, italic?, bg? (colour or gradient behind the text: CTA pills, caption boxes), padX?, padY?, radius?, shadow?}. Text shrinks to fit its box if it would overflow; size the box for the words.
  - logo: {src?} (the kit's logo) or {text} (a wordmark in the heading font) with color?.
  - shape: {fill (colour or gradient), radius?}: scrims over photos, colour panels, rules.
  - qr: {url, color?, bg?}: a scannable code (print and posters, when there is a link).
- Video shots (video: [...]) play one after another; the doc's duration is their sum. A shot is
  {kind: "motion"|"still", role: hero|product|broll|still|talent, prompt, seconds (1.5 to 8), says? (talent only: the words the person speaks on camera), image? (motion: first frame, e.g. the product photo; still: the picture to animate), refs? (up to 3 image URLs whose subject must appear: the product, a texture), sound? (Veo native sound, costs more), transition?: cut|fade (into this shot), kenburns?: in|out|left|right (stills), focal?: {x,y} (what stays in view when the format crops), reuse?: a shot id from another creative whose finished clip to reuse for free}.
  Shots without a finished clip are generated in the background when you write them; they land in the doc on their own.
- Audio tracks (audio: [...]) are added with add_music and add_voiceover, not written by hand.
"""

DESIGN = """
DESIGN RULES
- One idea per creative: a hook, one image that carries it, one call to action. Copy is short: headline 2 to 7 words, subhead at most 14 words, CTA 1 to 3 words. Write in the brand's voice; never invent prices, discounts or claims the brief does not give. No em dashes, no hashtags unless asked.
- Use the kit: its colours (hex values from the kit), heading font for headlines, body font for the rest, the logo on every creative (a logo layer, about 18 to 24% of the frame's width, in a corner or centred at the top or bottom).
- Legibility: text on a photo always gets a scrim (a shape with a gradient from transparent to rgba(0,0,0,0.6) under the text) or a solid panel. Light text on dark, dark text on light. Minimum sizes: story and portrait headlines 96 to 150px, body 36px+; square 80 to 120px; landscape 90 to 140px; banner 44 to 64px; print 110 to 170px.
- Margins: at least 64px from every edge (story: keep text and the CTA out of the top 220px and the bottom 320px, where the apps put their own buttons).
- Layout recipes to start from (adapt, do not copy blindly):
  1. Full-bleed photo: image layer full frame (role background), gradient scrim over the lower half, headline + subhead + CTA pill bottom-left or centred, logo top.
  2. Split: photo in the top 55 to 62%, a kit-colour panel below with the text and CTA.
  3. Product hero: kit background or surface colour, the product image (fit contain, shadow) centred large, headline above, price label and CTA below.
  4. Type-led: a bold headline filling half the frame on a kit colour, a small photo or product, CTA.
- CTA pill: a text layer with role cta, bg the kit's primary colour, color its primaryForeground, padX 40, padY 22, radius (pill: h/2; rounded: 16; square: 0), align center, valign middle.
- QR: on print posters, and on other posters only when there is a link and the poster is for physical places. 200 to 260px, with a quiet "Scan to shop" caption.
- Each audience's creative must look and read differently, in ways its taste profile explains (palette mood within the kit, imagery subject and setting, the hook's cultural reference). Do not name Qloo or the audience in the copy.
- Reasons (why, save_concepts) are read at a glance: each reason at most 12 plain words saying what the creative does and for whom ("Candlelit late tables, because they book after 9pm"), evidence at most 5 words naming the Qloo signal ("Natural wine bars", "Khruangbin fans"). No jargon, no "affinity", no scores.
"""

VIDEO = """
VIDEO RULES
- Length: the brief's duration (default 15 s; 6 to 30 s). 3 to 6 shots. Hook in the first 1.5 s, product by the middle, end card with the logo and CTA for the last 2 to 3 s.
- Shot plan that spends well (stay inside the budget):
  - hero: the opening, the one shot that sells the mood. Motion, 4 to 6 s.
  - product: the product itself. Motion with image = the product photo (the first frame keeps the product true), or a still of the product photo if the budget is tight. 3 to 4 s.
  - broll: texture, place, people using it. Motion on the cheaper model, 3 to 4 s, or stills from photos you already have.
  - still: an image with a slow push-in; free beyond the image. Use for the end card (on a brand photo or a kit-colour background) and wherever motion adds little.
  - talent: a person on camera, on the hero model. Using the product (sitting on the sofa, wrapping the throw) or speaking a line to camera (says).
  Reuse: one audience's product shot can serve every audience (reuse: its shot id). Never generate the same shot twice.
- PEOPLE (follow the brief's "People in videos"):
  - Cast for the audience: age range, style, wardrobe and setting its taste profile suggests. Describe them, never name a real person or look-alike. Adults only.
  - Keep the person and the product true: first generate_image a cast frame (the person in the scene with the product, reference_urls = the product photo, format = the video's format), then use that URL as image (first frame) of every talent shot with that person. The same cast frame keeps the same face across shots.
  - Talking shots: says is one short, natural line in the brand's voice, at most 2.5 words per second of the shot (an 8 s shot: up to 18 words), like a real customer, not an announcer. sound is on automatically. Longer scripts: several talent shots with the same cast frame, or extend_shot. Write the prompt as the visual (who, where, framing such as "medium close-up, eye level, handheld selfie feel", light); the line goes in says, not the prompt.
  - A talking shot replaces the voiceover for its time: do not add_voiceover over it. Add a caption text layer (role caption, bottom third, white on a dark translucent bg) with the spoken words for that shot's start/end, since most feeds play muted. Music is lowered under speech automatically.
  - No claims a person could not truthfully make (no fake reviews of numbers, awards or medical effects).
- Motion prompts describe one continuous shot: subject, action, setting, light, lens and camera move ("slow dolly in", "handheld", "top-down"), mood, in the brand's imagery style. 1 to 3 sentences. No on-screen text, captions, logos or watermarks (the layers carry the words), no real people's names, no other brands.
- sound: false unless a shot's own sound matters (pouring, sea, a city) and there is no voiceover; music comes from add_music.
- Text layers on a video have start/end in seconds and an anim (rise or fade for headlines, pop for the CTA). Keep each line on screen at least 1.5 s. Keep text inside the frame's centre 80% so every crop (story to square) keeps it.
- After writing a video, add music (add_music) if the brief wants music, and a voiceover (add_voiceover) if it wants one: a script of about 2.3 words per second of video.
- Formats: 9:16 shots serve story, portrait and square (cropped around focal). Landscape and banner need 16:9 shots: write those creatives with their own shots, or resize and then regenerate_shot each shot (resize alone crops a tall shot into a thin band).
"""


OUTPUT_HINT = {
    "image": "an image: make_image (a photograph or illustration, no words in it)",
    "poster": "a poster: write_creative with kind poster (a designed ad: picture, headline, logo, button)",
    "video": "a video ad: write_creative with kind video (any moving picture: one shot when that is all they want, else 3 to 6 shots with text layers), then its music and voiceover (add_music, add_voiceover) as they chose",
    "campaign": "the whole set: for every audience, a poster and a video in each campaign format (follow the steps for a full set)",
}

ASPECT_FORMAT = {"9:16": "story", "4:5": "portrait", "1:1": "square", "16:9": "landscape"}


def _prompt_rules(state: dict[str, Any]) -> str:
    o = state.get(OPTIONS) or {}
    out = str(o.get("output") or "auto")
    aspect = str(o.get("aspect") or "")
    lines = ["THIS TURN: the merchant asked from the canvas prompt bar. Their picks:"]
    if out in OUTPUT_HINT:
        lines.append(f"- Make {OUTPUT_HINT[out]}. Make several only when they ask for several.")
    else:
        lines.append("- Make: your call from their words. A scene or photo: make_image. A designed ad with words, logo or a button: a poster (write_creative). Anything that moves, from one shot to an edited ad with text: a video ad (write_creative kind video), with its music and voiceover inside it (add_music, add_voiceover). There is no separate clip or music: music and voice only ever come as part of a video ad. Several things when they ask for several.")
    if aspect:
        lines.append(f"- Shape {aspect}" + (f" (poster and video format {ASPECT_FORMAT[aspect]})" if aspect in ASPECT_FORMAT else "") + ". Video models make 9:16 or 16:9 only: a video asked in another shape uses the nearer of the two.")
    models = []
    if o.get("imageModel"):
        models.append(f"images {M.IMAGE_LABEL.get(o['imageModel'], o['imageModel'])} (model \"{o['imageModel']}\")")
    if o.get("videoModel"):
        models.append(f"video {M.VIDEO_LABEL.get(o['videoModel'], o['videoModel'])} (model \"{o['videoModel']}\"; in a video ad b-roll steps down one model)")
    if o.get("musicModel"):
        models.append(f"music {M.MUSIC_LABEL.get(o['musicModel'], o['musicModel'])} (model \"{o['musicModel']}\")")
    if models:
        lines.append("- Models (pass them as model): " + "; ".join(models) + ".")
    if int(o.get("count") or 1) > 1:
        lines.append(f"- How many: {int(o['count'])} (make_image count, each a different take).")
    aud = next((a for a in _audiences(state) if a["id"] == o.get("audienceId")), None) if o.get("audienceId") not in (None, "", "all") else None
    if aud:
        lines.append(f"- For the audience {aud['id']} ({aud.get('name')}): call get_audience first, ground the idea in its taste, and save_concepts one short concept for it.")
    if state.get(NODES):
        lines.append("- Something is selected on the canvas: when the words ask to change it, change it (edit_image, edit_clip, edit_creative) instead of making something new; when they ask for something new from it, use it (its URL as a reference or first frame, near its id).")
    lines.append(QUESTIONS_FIRST)
    lines.append(
        """HOW
1. Write every generation prompt on brand (you are the prompt writer): restate the request as subject, setting, light, lens, composition and mood in the brand's imagery style; write the "never show" list in as plain negatives; keep the merchant's products true by passing their photos in reference_urls (or image, for a clip's first frame); never ask for text, captions or logos inside a picture or shot (posters carry words and the logo as layers).
2. Images and video shots generate in the background and appear on the canvas by themselves, each next to what it came from (near). Start them and finish the turn: never wait, never start the same thing twice.
3. Posters and videos: write_creative (near the image it builds on, when there is one). A poster's format comes from the shape; without one, story.
4. If the campaign is still called "Untitled campaign", rename_campaign it (2 to 4 words about what it is for).
5. Reply in one or two short sentences: what is coming, on which model, about what it costs. No lists, no markdown."""
    )
    return "\n".join(lines)


QUESTIONS_FIRST = """ASK FIRST, like a good studio checking the brief, then make it.
- Before you make a new poster or video ad, ask with ask_questions: one call, 1 to 3 questions, then stop. Ask only what changes the result and what their words, the picks and the brief do not already settle.
  - A video ad: the music (two or three styles that suit this brand and audience, and "No music"), the voiceover (no voiceover, or two or three voice and tone choices), and, only when unclear, the length (6, 15 or 30 seconds) or whether people appear on camera.
  - A poster: what it pushes (the offer or the one message) and the call to action, when the brief does not give them.
  - An image: only when the request is too vague to picture; usually just make it.
- Options are concrete and specific to this brand, audience and request, never generic ("Warm acoustic guitar, unhurried" beats "Upbeat"). Each has a short detail line. They can always type their own answer.
- Do not ask when they are changing something selected, when they say to just make it, or when their message answers your questions (lines like "Music: Warm acoustic guitar"): then make it now with those choices, and never ask the same thing twice. "Your call" means you choose."""


def _turn_rules(kind: str, campaign: dict[str, Any], state: dict[str, Any] | None = None) -> str:
    formats = ", ".join(campaign.get("formats") or ["story"])
    what = campaign.get("kind") or "poster"
    make = {"poster": "a poster", "video": "a video", "both": "a poster and a video"}.get(what, "a poster")
    if kind == "prompt" and state is not None and (state.get(OPTIONS) or {}).get("output") != "campaign":
        return _prompt_rules(state)
    if kind == "edit":
        return """THIS TURN: the merchant asks for a change. Do exactly that, on the creatives it concerns (the selection if there is one).
- Layout and copy: edit_creative with ops on ids from CREATIVES. Several ops in one call.
- A shot: regenerate_shot (new prompt or model), edit_shot (Omni Flash: change light, objects, style, keep the rest), extend_shot (continue it). Music and voice: add_music, add_voiceover (they replace the old track).
- New formats: resize_creative. A different audience: write_creative.
- Say what it costs before spending more than $2 in one turn, and ask first if it would pass the budget.
Reply in one to three sentences: what changed, what is generating, the cost."""
    return f"""THIS TURN: make the campaign's creatives. For every audience, {make} in each format: {formats}.
1. For each audience call get_audience (its Qloo taste). Then save_concepts: one concept per audience, its hook and visual drawn from that taste, with 2 to 4 reasons, each citing the Qloo evidence (a tag, a brand affinity, a cultural reference).
2. Pictures: prefer the merchant's uploads and product photos, then the brand's photos, then search_images; generate_image only for a scene nothing else gives you (with the product photo in reference_urls so the product stays true).
3. For each audience write the lead format first (the first format listed) with write_creative, with the concept's reasons as `why`.
4. Then resize_creative to the other formats and fix what the resize warns about with edit_creative (one call per creative).
5. review_creative each audience's lead poster once and fix the high-severity issues. (Videos: review after their shots finish, in a later turn.)
6. Videos: plan shots per VIDEO RULES and the budget, then add_music / add_voiceover as the brief asks.
Reply in two to four sentences: what each audience got and why (one cultural reason each), what is still generating, the estimated spend."""


async def build_instruction(ctx: ReadonlyContext) -> str:
    s = ctx.state
    campaign = s.get(CAMPAIGN) or {}
    kind = s.get(KIND) or "generate"
    sel = _selection_block(s)
    brand = s.get(BRAND) or {}
    return f"""You are the creative director of Slice Media. On one campaign's canvas you make a brand's images, posters, video clips, edited video ads (Reels, TikTok, Stories, feed and display, print) and music, true to the brand's guidelines and, when an audience is chosen, shaped by its cultural taste (Qloo). You work like a top studio: a sharp idea, real photography where it exists, clean typography, one call to action, and money spent only where it shows.

CAMPAIGN: "{campaign.get('name')}", formats {', '.join(campaign.get('formats') or [])}

BRAND GUIDELINES (every picture, word and shot follows these)
{_about_block(brand)}{_kit_block(campaign.get('kit') or {})}

BRIEF
{_brief_block(campaign.get('brief') or {})}

AUDIENCES (creatives point at an audience by id)
{_audiences_block(s)}

PRODUCTS
{_products_block(campaign.get('products') or [])}

LIBRARY (uploads first; use by URL)
{_assets_block(s.get(ASSETS) or [], s.get(BRAND) or {})}

COST
{_budget_block(s)}

CREATIVES
{_creatives_block(s)}

{sel}

{_turn_rules(kind, campaign, s)}
{DOCUMENT}
{DESIGN}
{VIDEO}
Tools return ok: false with problems when something was not saved; fix and call again. Never claim something is done that a tool did not confirm. Plain text replies, no markdown."""


# --- tools: reading ------------------------------------------------------------------


async def get_audience(audience_id: str, tool_context: ToolContext) -> dict:
    """An audience's Qloo taste profile: its signals, style and value tags, brand affinities
    with their style words, cultural references with images, places and demographic skew.
    It also makes this audience the one qloo_insights works from. Call once per audience
    before designing for it.

    Args:
        audience_id: An id from AUDIENCES.
    """
    state = tool_context.state
    auds = _audiences(state)
    with timer() as t:
        aud = await taste.ensure_profile(_cid(state), auds, audience_id)
    if not aud:
        return {"ok": False, "error": f"no audience {audience_id!r}; use an id from AUDIENCES"}
    camp = dict(state.get(CAMPAIGN) or {})
    camp["audiences"] = auds
    state[CAMPAIGN] = camp
    profile = aud.get("profile") or {}
    if not profile:
        # "Everyone": the brand's own taste stands in (a Pages brand's Qloo read), else nothing to ground on.
        brand_q = (state.get(BRAND) or {}).get("qloo") or {}
        profile = brand_q if isinstance(brand_q, dict) and brand_q.get("tags") else {}
    state[PB.AUDIENCE] = {"name": aud.get("name"), "kind": aud.get("kind"), "profile": profile, "brief": aud.get("brief")}
    detail = await PB.get_audience_detail(tool_context)
    record("slice", f"Read {aud.get('name')}'s taste", f"{len(profile.get('tags') or [])} tags", ms=t.ms, started=t.started)
    return {"ok": True, "id": audience_id, **detail, "summary": profile_summary(profile) if profile else {}, "brief": aud.get("brief") or aud.get("summary")}


async def save_concepts(concepts: list, tool_context: ToolContext) -> dict:
    """Record the concept for each audience (shown to the merchant as the "why" of each creative).

    Args:
        concepts: [{audienceKey, title, hook, visual, why: [{text, evidence}]}]: title 2 to 5 words; hook the headline idea in at most 10 words; visual the picture or shot in at most 20 words; 2 or 3 why, each text at most 12 words and evidence at most 5 words (the Qloo tag, brand or place it rests on).
    """
    state = tool_context.state
    raw = _coerce(concepts)
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list) or not raw:
        return {"ok": False, "error": "concepts must be a list"}
    keys = {a["id"] for a in _audiences(state)}
    clean = []
    for c in raw:
        if not isinstance(c, dict) or c.get("audienceKey") not in keys:
            return {"ok": False, "error": f"each concept needs an audienceKey from AUDIENCES ({', '.join(sorted(keys))})"}
        why = [{"text": str(w.get("text"))[:300], "evidence": str(w.get("evidence"))[:300]} for w in c.get("why") or [] if isinstance(w, dict) and w.get("text")][:4]
        clean.append({"audienceKey": c["audienceKey"], "title": str(c.get("title") or "")[:120], "hook": str(c.get("hook") or "")[:300], "visual": str(c.get("visual") or "")[:500], "why": why})
    camp = state.get(CAMPAIGN) or {}
    merged = {c["audienceKey"]: c for c in camp.get("concepts") or []}
    merged.update({c["audienceKey"]: c for c in clean})
    await store.post("/media/campaign", {"campaignId": _cid(state), "patch": {"concepts": list(merged.values())}})
    state[CAMPAIGN] = {**camp, "concepts": list(merged.values())}
    _bump(state)
    return {"ok": True, "saved": len(clean)}


# --- tools: images -------------------------------------------------------------------


async def _charge(campaign_id: str, kind: str, model: str, cost: float, prompt: str, asset_id: str | None = None) -> None:
    job_id = await store.job(campaign_id, kind=kind, model=model, prompt=prompt[:2000], estimate=cost, status="running")
    await store.job(campaign_id, jobId=job_id, status="done", cost=cost, **({"assetId": asset_id} if asset_id else {}))


async def generate_image(prompt: str, tool_context: ToolContext, format: str = "story", reference_urls: list[str] | None = None, quality: str = "auto") -> dict:
    """Make a photograph-quality image with Nano Banana for a layer or a still shot, saved to the
    library. With reference_urls (a product photo, an upload) the result keeps those subjects
    true: say in the prompt what to keep from each ("the bottle from image 1 on a stone ledge").
    Only when uploads, product photos, brand photos and search_images have nothing that works.

    Args:
        prompt: The scene: subject, setting, light, lens, mood, in the brand's imagery style. No text or logos in the image.
        format: The format it is for (sets the aspect): story, portrait, square, landscape, banner, print.
        reference_urls: Up to 4 image URLs whose subjects must appear.
        quality: "auto" (the tier's model), "draft" (cheapest), "standard", "premium".
    """
    state = tool_context.state
    cid = _cid(state)
    spec = D.FORMATS.get(format) or D.FORMATS["story"]
    model = M.image_model((state.get(CAMPAIGN) or {}).get("tier"), quality)
    cost = M.image_cost(model)
    try:
        await J.ensure_budget(cid, cost)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    known = _known_images(state)
    refs_urls = [u for u in (reference_urls or []) if isinstance(u, str) and u.startswith("http")][:4]
    unknown = [u for u in refs_urls if u not in known]
    if unknown:
        return {"ok": False, "error": f"reference_urls must be images you were given: {', '.join(unknown[:2])}"}
    with timer() as t:
        try:
            refs = [r for r in await asyncio.gather(*[gen.fetch_image(u) for u in refs_urls], return_exceptions=True) if isinstance(r, tuple)]
            data, mime = await gen.image(prompt + " No text, letters, logos or watermarks in the image.", model=model, aspect=spec["image"], refs=refs)
            asset = await store.add_asset(cid, data=data, mime=mime, kind="image", source="generated", prompt=prompt[:2000], model=model, cost=cost)
            await _charge(cid, "image", model, cost, prompt, asset["id"])
        except Exception as err:
            record("slice", "Generate an image", f"failed: {str(err)[:140]}", ms=t.ms, started=t.started)
            return {"ok": False, "error": str(err)[:300]}
    record("slice", "Generate an image", f"{M.IMAGE_LABEL.get(model, model)}, ${cost:.3f}", ms=t.ms, started=t.started)
    state[MEDIA] = list(state.get(MEDIA) or []) + [asset["url"]]
    state[ASSETS] = [{"id": asset["id"], "kind": "image", "source": "generated", "url": asset["url"], "prompt": prompt[:120]}] + list(state.get(ASSETS) or [])
    return {"ok": True, "url": asset["url"], "assetId": asset["id"], "model": M.IMAGE_LABEL.get(model, model), "cost": cost}


# --- tools: canvas generations --------------------------------------------------------------
# Each starts a background job that holds a spot on the canvas (next to `near`) and lands there.

ASPECTS = ("9:16", "4:5", "1:1", "16:9", "3:4", "4:3", "2:3", "3:2")


def _option(state: dict[str, Any], key: str) -> str:
    return str((state.get(OPTIONS) or {}).get(key) or "")


def _for_audience(state: dict[str, Any]) -> str | None:
    """The audience picked in the prompt bar (not Everyone), which what is made keeps for its Why."""
    aid = _option(state, "audienceId")
    return aid if aid and aid != "all" and any(a["id"] == aid for a in _audiences(state)) else None


def _video_aspect(aspect: str) -> str:
    """Veo makes 9:16 or 16:9: anything taller than square is 9:16."""
    try:
        a, b = (float(x) for x in aspect.split(":"))
        return "9:16" if a < b else "16:9"
    except Exception:
        return "9:16"


def _check_rules(state: dict[str, Any], refs: bool) -> list[dict[str, Any]] | None:
    """The brand's guidelines as rules for the brand check, unless the merchant turned it off."""
    if (state.get(OPTIONS) or {}).get("check") is False:
        return None
    kit = (state.get(CAMPAIGN) or {}).get("kit") or {}
    return C.rules_for(kit, (state.get(BRAND) or {}).get("about"), refs=refs)


def _asset_by_id(state: dict[str, Any], asset_id: str) -> dict[str, Any] | None:
    return next((a for a in state.get(ASSETS) or [] if a.get("id") == asset_id), None)


async def make_image(prompt: str, tool_context: ToolContext, aspect: str = "1:1", count: int = 1, reference_urls: list[str] | None = None, model: str = "", near: str = "") -> dict:
    """Make images for the canvas (a deliverable the merchant sees, not a picture for a poster
    layer: use generate_image for that). Runs in the background; each lands on the canvas after
    a brand check against the guidelines (one automatic retry if it fails).

    Args:
        prompt: The on-brand scene: subject, setting, light, lens, composition, mood. No text or logos.
        aspect: 9:16, 4:5, 1:1, 16:9, 3:4, 4:3, 2:3 or 3:2.
        count: 1 to 4 takes, each its own image.
        reference_urls: Up to 4 image URLs you were given whose subjects must appear (the product photo).
        model: An image model id from the prompt bar ("" uses the merchant's pick or the default).
        near: An id on the canvas (image, clip, creative) to place them beside, e.g. the image being varied.
    """
    state = tool_context.state
    cid = _cid(state)
    aspect = aspect if aspect in ASPECTS else "1:1"
    count = max(1, min(4, int(count or 1)))
    m = M.chosen(model, M.IMAGE_CHOICES) or M.chosen(_option(state, "imageModel"), M.IMAGE_CHOICES) or M.IMAGE
    refs = [u for u in (reference_urls or []) if isinstance(u, str) and u.startswith("http")][:4]
    unknown = [u for u in refs if u not in _known_images(state)]
    if unknown:
        return {"ok": False, "error": f"reference_urls must be images you were given: {', '.join(unknown[:2])}"}
    estimate = round(M.image_cost(m) * count, 3)
    try:
        await J.ensure_budget(cid, estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    rules = _check_rules(state, bool(refs))
    # The first take fills the spot held for this turn (a toolbar maker's), and every take keeps its conversation.
    spot = take_spot(state)
    thread = state.get(THREAD) or None
    jobs: list[str] = []
    for i in range(count):
        take = prompt if count == 1 else f"{prompt} (Take {i + 1} of {count}: vary the framing and moment.)"
        jobs.append(await J.start_asset(cid, kind="image", model=m, prompt=take, estimate=M.image_cost(m), work=J.image_asset_work(prompt=take + _style_suffix(state), model=m, aspect=aspect, refs=refs, rules=rules), aspect=aspect, near=near or (jobs[-1] if jobs else None), lane="image", job_id=spot if i == 0 else None, thread=thread, audience=_for_audience(state)))
    _bump(state)
    record("slice", "Make images", f"{count} on {M.IMAGE_LABEL.get(m, m)}, ~${estimate:.2f}", ms=0)
    return {"ok": True, "jobs": jobs, "model": M.IMAGE_LABEL.get(m, m), "estimate": estimate, "brandCheck": bool(rules)}


async def make_clip(prompt: str, tool_context: ToolContext, aspect: str = "9:16", seconds: int = 6, image: str = "", model: str = "", sound: bool = False, near: str = "") -> dict:
    """Make one video clip for the canvas with Veo (4, 6 or 8 seconds). Runs in the background.
    With image, the clip starts on that picture (animate an image on the canvas, keep a product true).

    Args:
        prompt: One continuous shot: subject, action, setting, light, lens, camera move, mood. No on-screen text.
        aspect: 9:16 or 16:9.
        seconds: 4, 6 or 8.
        image: A first-frame image URL you were given ("" for none).
        model: A video model id from the prompt bar ("" uses the merchant's pick or the default).
        sound: Veo's own sound (costs more).
        near: An id on the canvas to place it beside (the image it animates).
    """
    state = tool_context.state
    cid = _cid(state)
    aspect = _video_aspect(aspect)
    m = M.chosen(model, M.VIDEO_CHOICES) or M.chosen(_option(state, "videoModel"), M.VIDEO_CHOICES) or M.VEO_FAST
    if image and image not in _known_images(state):
        return {"ok": False, "error": "image must be a URL you were given"}
    res = "1080p" if m == M.VEO_STANDARD else "720p"
    secs = M.veo_duration(float(seconds or 6), resolution=res)
    estimate = M.video_cost(m, secs, bool(sound))
    try:
        await J.ensure_budget(cid, estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    full = prompt + _style_suffix(state) + " No on-screen text, captions, logos or watermarks."
    job = await J.start_asset(cid, kind="video", model=m, prompt=prompt, estimate=estimate, work=J.clip_asset_work(prompt=full, model=m, aspect=aspect, seconds=secs, resolution=res, audio=bool(sound), first_frame=image or None, refs=[]), aspect=aspect, near=near or None, lane="video", audience=_for_audience(state))
    _bump(state)
    return {"ok": True, "job": job, "model": M.VIDEO_LABEL.get(m, m), "seconds": secs, "estimate": estimate}


async def make_music(prompt: str, tool_context: ToolContext, model: str = "", near: str = "") -> dict:
    """Make an instrumental track for the canvas with Lyria. Runs in the background.

    Args:
        prompt: Genre, mood, tempo (BPM), instruments, energy curve, fitted to the brand and the audience.
        model: A music model id from the prompt bar ("" uses the merchant's pick or the default).
        near: An id on the canvas to place it beside (the video it scores).
    """
    state = tool_context.state
    cid = _cid(state)
    m = M.chosen(model, M.MUSIC_CHOICES) or M.chosen(_option(state, "musicModel"), M.MUSIC_CHOICES) or M.LYRIA
    estimate = M.music_cost(m)
    try:
        await J.ensure_budget(cid, estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    full = f"{prompt}. Instrumental only, no vocals." + (" About 60 to 90 seconds with a clean ending." if m == M.LYRIA_PRO else "")
    job = await J.start_asset(cid, kind="music", model=m, prompt=prompt, estimate=estimate, work=J.music_asset_work(prompt=full, model=m), aspect=None, near=near or None, lane="audio")
    _bump(state)
    return {"ok": True, "job": job, "model": M.MUSIC_LABEL.get(m, m), "estimate": estimate}


def _nearest_aspect(w: int, h: int) -> str:
    return min(ASPECTS, key=lambda a: abs(float(a.split(":")[0]) / float(a.split(":")[1]) - w / max(1, h)))


async def edit_image(asset_id: str, instruction: str, tool_context: ToolContext, model: str = "") -> dict:
    """Change an image on the canvas (light, colour, background, an object added or removed,
    the product swapped in) with Nano Banana, keeping the rest. The result is a new image beside
    the original; the original stays.

    Args:
        asset_id: The image's id (from the selection or LIBRARY).
        instruction: What to change, concretely ("warmer evening light", "put the bottle from image 2 on the table").
        model: An image model id ("" uses the merchant's pick or the default).
    """
    state = tool_context.state
    cid = _cid(state)
    src = _asset_by_id(state, asset_id)
    if not src or src.get("kind") != "image":
        return {"ok": False, "error": f"no image {asset_id!r}; use an image id from the selection or LIBRARY"}
    m = M.chosen(model, M.IMAGE_CHOICES) or M.chosen(_option(state, "imageModel"), M.IMAGE_CHOICES) or M.IMAGE
    estimate = M.image_cost(m)
    try:
        await J.ensure_budget(cid, estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = _nearest_aspect(int(src.get("w") or 1), int(src.get("h") or 1))
    prompt = f"Edit image 1: {instruction}. Keep everything else exactly as it is: subject, composition, framing."
    job = await J.start_asset(cid, kind="image", model=m, prompt=instruction, estimate=estimate, work=J.image_asset_work(prompt=prompt, model=m, aspect=aspect, refs=[src["url"]], rules=_check_rules(state, False)), aspect=aspect, near=asset_id, lane="image", parent=asset_id)
    _bump(state)
    return {"ok": True, "job": job, "model": M.IMAGE_LABEL.get(m, m), "estimate": estimate}


async def edit_clip(asset_id: str, instruction: str, tool_context: ToolContext, reference_urls: list[str] | None = None) -> dict:
    """Change a clip on the canvas with Omni Flash (light, weather, an object, style, camera feel),
    keeping the rest. The result is a new clip beside the original.

    Args:
        asset_id: The clip's id.
        instruction: What to change, concretely.
        reference_urls: Up to 3 images the edit should use.
    """
    state = tool_context.state
    cid = _cid(state)
    src = _asset_by_id(state, asset_id)
    if not src or src.get("kind") != "video":
        return {"ok": False, "error": f"no clip {asset_id!r}"}
    refs = [u for u in reference_urls or [] if u in _known_images(state)][:3]
    estimate = round(M.OMNI_PER_SECOND * max(4.0, float(src.get("duration") or 6)), 3)
    try:
        await J.ensure_budget(cid, estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    aspect = "16:9" if int(src.get("w") or 9) > int(src.get("h") or 16) else "9:16"
    job = await J.start_asset(cid, kind="edit", model=M.OMNI, prompt=instruction, estimate=estimate, work=J.omni_asset_work(instruction=instruction + " Keep everything else the same. No on-screen text.", src=src["url"], aspect=aspect, images=refs), aspect=aspect, near=asset_id, lane="edit", parent=asset_id)
    _bump(state)
    return {"ok": True, "job": job, "model": "Omni Flash", "estimate": estimate}


async def extend_clip(asset_id: str, tool_context: ToolContext, seconds: int = 6, prompt: str = "", model: str = "") -> dict:
    """Continue a clip on the canvas: a new clip that starts on its last frame, beside it.

    Args:
        asset_id: The clip's id.
        seconds: 4, 6 or 8.
        prompt: What happens next ("" carries the same move on).
        model: A video model id ("" uses the merchant's pick or the default).
    """
    state = tool_context.state
    src = _asset_by_id(state, asset_id)
    if not src or src.get("kind") != "video":
        return {"ok": False, "error": f"no clip {asset_id!r}"}
    try:
        data, _ = await gen.fetch(src["url"])
        frame_url = await J.storage_url(await ff.last_frame_bytes(data), "image/jpeg")
    except Exception as err:
        return {"ok": False, "error": f"could not read the clip's last frame: {str(err)[:160]}"}
    state[MEDIA] = list(state.get(MEDIA) or []) + [frame_url]
    aspect = "16:9" if int(src.get("w") or 9) > int(src.get("h") or 16) else "9:16"
    return await make_clip(prompt or f"Continue the same shot seamlessly: {src.get('prompt') or ''}", tool_context, aspect=aspect, seconds=seconds, image=frame_url, model=model, near=asset_id)


async def ask_questions(questions: list, tool_context: ToolContext, intro: str = "") -> dict:
    """Ask the merchant a few quick questions before you make something, the way a studio checks
    the brief. Each question has 2 to 4 concrete options; they can always type their own answer.
    They answer them all at once, and the answers arrive as the next message, one line per
    question ("Music: Warm acoustic guitar"). Call it alone, write nothing after it, end the turn.

    Args:
        questions: 1 to 4 questions, each {header, question, options, multi}. header: 1 or 2 words
            naming the topic ("Music", "Voiceover", "Length", "Offer"). question: one short sentence
            ending with a question mark. options: 2 to 4 {label, detail}, label 1 to 5 words naming
            a concrete choice that suits this brand and audience, detail one short line on what it
            means. multi: true when several options can be picked together.
        intro: One short sentence before the questions ("A few quick choices before I make it."), or "".
    """
    raw = _coerce(questions)
    if isinstance(raw, dict):
        raw = [raw]
    out: list[dict[str, Any]] = []
    for q in raw if isinstance(raw, list) else []:
        if not isinstance(q, dict):
            continue
        opts = _coerce(q.get("options"))
        options = [
            {"label": str(o.get("label") or "").strip()[:60], "detail": str(o.get("detail") or "").strip()[:120]}
            for o in (opts if isinstance(opts, list) else [])
            if isinstance(o, dict) and str(o.get("label") or "").strip()
        ][:4]
        text = str(q.get("question") or "").strip()
        if not text or len(options) < 2:
            continue
        header = str(q.get("header") or "").strip()[:20] or text.split()[0]
        out.append({"header": header, "question": text[:160], "options": options, "multi": bool(q.get("multi"))})
    if not out:
        return {"ok": False, "error": "ask 1 to 4 questions, each with a question and at least 2 options"}
    # The answers are the merchant's next message: end the turn here.
    tool_context.actions.skip_summarization = True
    record("slice", "Ask the merchant", "; ".join(q["header"] for q in out[:4]), ms=0)
    return {"ok": True, "intro": " ".join(str(intro or "").split())[:160], "questions": out[:4]}


async def rename_campaign(name: str, tool_context: ToolContext) -> dict:
    """Name the campaign (2 to 4 words about what it is for), when it is still "Untitled campaign".

    Args:
        name: The new name.
    """
    state = tool_context.state
    name = " ".join(str(name).split())[:60]
    if not name:
        return {"ok": False, "error": "empty name"}
    await store.post("/media/campaign", {"campaignId": _cid(state), "patch": {"name": name}})
    state[CAMPAIGN] = {**(state.get(CAMPAIGN) or {}), "name": name}
    return {"ok": True, "name": name}

# --- tools: writing --------------------------------------------------------------------


def _coerce(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _bump(state: Any) -> None:
    state[WRITES] = int(state.get(WRITES) or 0) + 1


def _check_images(state: dict[str, Any], doc: dict[str, Any]) -> list[str]:
    known = _known_images(state)
    bad = []
    for l in doc.get("layers") or []:
        if l.get("type") in ("image", "logo") and l.get("src") and l["src"] not in known:
            bad.append(f"{l.get('id')}: {str(l['src'])[:80]} is not an image you were given")
    for c in doc.get("video") or []:
        for k in ("image", "poster"):
            if c.get(k) and c[k] not in known:
                bad.append(f"shot {c.get('id')}: {k} {str(c[k])[:80]} is not an image you were given")
    return bad


def _style_suffix(state: dict[str, Any]) -> str:
    img = ((state.get(CAMPAIGN) or {}).get("kit") or {}).get("imagery") or {}
    s = " ".join(x for x in (img.get("style"), img.get("treatment")) if x)
    return f" Look: {s}." if s else ""


def _find_clip(state: dict[str, Any], clip_id: str) -> dict[str, Any] | None:
    for c in (state.get(CREATIVES) or {}).values():
        for v in c["doc"].get("video") or []:
            if v.get("id") == clip_id:
                return v
    return None


def _shot_to_clip(state: dict[str, Any], s: dict[str, Any]) -> dict[str, Any]:
    """A shot spec as written by the model → a Clip (pending unless it already has media)."""
    role = s.get("role") if s.get("role") in ("hero", "product", "broll", "still", "talent") else "broll"
    kind = "still" if s.get("kind") == "still" or role == "still" else "motion"
    says = " ".join(str(s.get("says") or "").split())[:400] if kind == "motion" else ""
    secs = max(1.5, min(8.0, float(s.get("seconds") or (s.get("out", 0) - s.get("in", 0)) or 4)))
    if says:
        role = "talent"
        # Room to say it (about 2.5 words a second plus a beat), kept whole: Veo paces the line to
        # the length it makes (4, 6 or 8 s), so trimming would cut the last words.
        need = max(secs, len(says.split()) / 2.5 + 1.0)
        secs = next(v for v in (4.0, 6.0, 8.0) if v >= min(8.0, need))
    clip: dict[str, Any] = {"id": s.get("id") or D.new_id("c"), "kind": kind, "role": role, "in": 0, "out": round(secs, 2), "prompt": str(s.get("prompt") or "")[:2000]}
    if says:
        clip["says"] = says
    for k in ("transition", "kenburns", "focal", "muted", "volume"):
        if s.get(k) is not None:
            clip[k] = s[k]
    reuse = _find_clip(state, str(s.get("reuse") or "")) if s.get("reuse") else None
    if reuse and reuse.get("status") == "ready":
        for k in ("kind", "src", "poster", "model", "assetId"):
            if reuse.get(k):
                clip[k] = reuse[k]
        clip["in"] = reuse.get("in", 0)
        clip["out"] = round(min(reuse.get("out", secs), clip["in"] + secs), 2)
        clip["status"] = "ready"
        return clip
    if s.get("src"):
        clip.update(src=s["src"], status="ready")
    elif kind == "still" and (s.get("image") or s.get("poster")):
        clip.update(poster=s.get("image") or s.get("poster"), status="ready")
        clip.setdefault("kenburns", "in")
    else:
        clip["status"] = "pending"
        if kind == "still":
            clip.setdefault("kenburns", "in")
        # What the job needs, kept out of the doc.
        clip["_gen"] = {"image": s.get("image"), "refs": [u for u in s.get("refs") or [] if isinstance(u, str)][:3], "sound": bool(s.get("sound")) or bool(says), "quality": s.get("quality") or "auto"}
    return clip


def _plan_jobs(state: dict[str, Any], doc: dict[str, Any], clips: list[dict[str, Any]], creative_id: str | None) -> list[dict[str, Any]]:
    """Jobs for pending clips: what each will run on and cost."""
    tier_name = (state.get(CAMPAIGN) or {}).get("tier")
    t = M.tier(tier_name)
    spec = D.FORMATS[doc["format"]]
    out = []
    for c in clips:
        g = c.get("_gen")
        if g is None:
            continue
        if c["kind"] == "still":
            model = M.image_model(tier_name, g.get("quality", "auto"))
            out.append({"clip": c, "kind": "image", "model": model, "estimate": M.image_cost(model), "work": J.still_work(prompt=c["prompt"] + _style_suffix(state) + " No text or logos.", model=model, aspect=spec["image"], refs=g["refs"])})
            continue
        model = M.video_model(tier_name, c.get("role") or "broll", g.get("quality", "auto"))
        res = "1080p" if model == M.VEO_STANDARD and t["resolution"] == "1080p" else "720p"
        refs = g["refs"] if model != M.VEO_LITE else []
        secs = M.veo_duration(D.clip_len(c), with_refs=bool(refs), resolution=res)
        prompt = c["prompt"] + _style_suffix(state) + " No on-screen text, captions, logos or watermarks."
        negative = "text, captions, subtitles, watermark, logo"
        if c.get("says"):
            line = c["says"].replace('"', "'")
            prompt += f' The person looks into the camera and says, in a natural, warm, conversational voice: "{line}" Clear speech, accurate lip sync, no background music.'
            negative += ", background music, other voices"
        out.append(
            {
                "clip": c,
                "kind": "video",
                "model": model,
                "estimate": M.video_cost(model, secs, g["sound"]),
                "work": J.shot_work(prompt=prompt, model=model, aspect=spec["video"], seconds=secs, resolution=res, audio=g["sound"], first_frame=g.get("image"), refs=refs, negative=negative, keep=D.clip_len(c)),
            }
        )
    return out


async def _start_jobs(state: dict[str, Any], creative_id: str, plan: list[dict[str, Any]]) -> list[str]:
    cid = _cid(state)
    ids = []
    for p in plan:
        c = p["clip"]
        ids.append(await J.start(cid, creative_id=creative_id, target_id=c["id"], kind=p["kind"], model=p["model"], prompt=c.get("prompt") or "", estimate=p["estimate"], work=p["work"], lane="image" if p["kind"] == "image" else "video"))
    return ids


# --- design spots ---------------------------------------------------------------------
# While the agent works on a new poster or video ad, a placeholder (a "design" job) holds
# its spot on the canvas so the merchant sees it coming; the next new creative written (or
# the first image made) takes the spot. routes.py opens them and, when the turn ends, drops
# the ones nothing took, or parks a spot the merchant placed with a toolbar maker until its
# conversation carries on. Spots are per conversation (SPOT_KEY), so two threads working at
# once never take each other's.

THREAD = "md_thread"  # a toolbar maker's conversation: what the turn makes keeps it
SPOT_KEY = "md_spot_key"  # whose spots this turn's tools take (the session's id)

_spots: dict[str, list[str]] = {}  # spot key -> open placeholder job ids, oldest first


def _spot_key(state: dict[str, Any]) -> str:
    return str(state.get(SPOT_KEY) or _cid(state))


def take_spot(state: dict[str, Any]) -> str | None:
    spots = _spots.get(_spot_key(state)) or []
    return spots.pop(0) if spots else None


def put_back(state: dict[str, Any], spot: str) -> None:
    _spots.setdefault(_spot_key(state), []).insert(0, spot)


def design_shape(state: dict[str, Any], *, video: bool | None = None, format: str = "") -> dict[str, Any] | None:
    """What a turn is designing ({kind: poster, video or None when unsure, format}), or None
    when it is not making a poster or video ad."""
    o = state.get(OPTIONS) or {}
    out = str(o.get("output") or "auto")
    if state.get(KIND) == "generate" or (state.get(KIND) == "prompt" and out == "campaign"):
        camp = state.get(CAMPAIGN) or {}
        fmt = format if format in D.FORMATS else next((f for f in camp.get("formats") or [] if f in D.FORMATS), "story")
        return {"kind": "video" if camp.get("kind") == "video" else "poster", "format": fmt}
    if state.get(KIND) != "prompt" or out == "image":
        return None
    kind = "video" if out == "video" or (out == "auto" and video) else "poster" if out == "poster" else None
    return {"kind": kind, "format": format if format in D.FORMATS else ASPECT_FORMAT.get(str(o.get("aspect") or ""), "story")}


async def open_spot(state: dict[str, Any], shape: dict[str, Any], *, board: dict[str, float] | None = None, thread: str | None = None) -> str | None:
    """Hold a spot on the canvas for what is being made: the one given (a toolbar maker's,
    reused for its thread), else beside what is selected."""
    cid = _cid(state)
    spec = D.FORMATS.get(shape["format"]) or D.FORMATS["story"]
    near = next((n.get("id") for n in state.get(NODES) or [] if n.get("id")), None)
    name = {"poster": "New poster", "video": "New video ad", "image": "New image"}.get(shape["kind"], "New design")
    where: dict[str, Any] = {"board": board} if board else {"place": True, "nearId": near}
    try:
        job = await store.job(cid, kind={"video": "design-video", "image": "design-image"}.get(shape["kind"], "design"), model="", prompt=name, status="running", estimate=0, aspect=shape.get("aspect") or f"{spec['w']}:{spec['h']}", thread=thread, **where)
    except Exception as err:
        log.warning("design spot not held: %s", err)
        return None
    spots = _spots.setdefault(_spot_key(state), [])
    if job not in spots:
        spots.append(job)
    return job


def spot_open(key: str, held: list[str]) -> bool:
    return any(j in (_spots.get(key) or []) for j in held)


async def release_spots(cid: str, key: str, held: list[str], *, park: bool = False) -> None:
    """The turn's spots nothing took (it asked a question, failed or was stopped): dropped, or
    parked as drafts when the merchant placed them (they wait for the conversation to go on)."""
    for job in held:
        spots = _spots.get(key) or []
        if job not in spots:
            continue
        spots.remove(job)
        try:
            await store.job(cid, jobId=job, **({"status": "draft"} if park else {"drop": True}))
        except Exception as err:
            log.warning("design spot %s not released: %s", job, err)


async def _save(state: Any, *, doc: dict[str, Any], creative_id: str | None, audience: str | None, name: str | None, why: list | None, note: str, near: str | None = None, spot: str | None = None) -> dict[str, Any]:
    cid = _cid(state)
    res = await store.write_creative(cid, doc, creativeId=creative_id, name=name, audienceKey=audience, why=why, note=note, nearId=near, designJobId=spot, thread=(state.get(THREAD) or None) if not creative_id else None)
    new_id = str(res["id"])
    # Read back the stored (validated) doc so ids and outlines match what the console shows.
    data = await store.load(cid)
    fresh = next((c for c in data.get("creatives") or [] if store.row_id(c) == new_id), None)
    creatives = dict(state.get(CREATIVES) or {})
    if fresh:
        creatives[new_id] = _creative(fresh)
    state[CREATIVES] = creatives
    state[BUDGET] = await J.budget(cid, data)
    _bump(state)
    return {"id": new_id, "version": res.get("version"), "doc": creatives.get(new_id, {}).get("doc", doc)}


async def write_creative(audience_id: str, format: str, doc: dict, tool_context: ToolContext, name: str = "", why: list | None = None, creative_id: str = "", near: str = "") -> dict:
    """Write a whole creative (a new one, or replace creative_id's doc). Shots without a
    finished clip start generating in the background and land on their own. Returns the
    saved outline, layout warnings and what the shots cost.

    Args:
        audience_id: An id from AUDIENCES.
        format: story, portrait, square, landscape, banner or print.
        doc: The MediaDoc: {kind, background, layers, video?} (see THE DOCUMENT).
        name: Short name for the idea, e.g. "Night swimmers". The format shows beside it, so leave it out.
        why: 2 or 3 short reasons [{text, evidence}] this creative fits the audience (text at most 12 words, evidence at most 5 words naming the Qloo signal). Empty for "all" when no taste was read.
        creative_id: To replace an existing creative's doc; "" for a new one.
        near: An image, clip or creative id on the canvas to place the new creative beside ("" places it after the last thing made).
    """
    state = tool_context.state
    raw = _coerce(doc)
    if not isinstance(raw, dict) or not isinstance(raw.get("layers"), list):
        return {"ok": False, "problems": ["doc must be an object with layers (see THE DOCUMENT)"]}
    if format not in D.FORMATS:
        return {"ok": False, "problems": [f"format must be one of {', '.join(D.FORMATS)}"]}
    if audience_id not in {a["id"] for a in _audiences(state)}:
        return {"ok": False, "problems": [f"no audience {audience_id!r}"]}
    if creative_id and creative_id not in (state.get(CREATIVES) or {}):
        return {"ok": False, "problems": [f"no creative {creative_id!r}"]}
    raw = {**raw, "format": format}
    if raw.get("kind") == "video" and not D.FORMATS[format]["motion"]:
        return {"ok": False, "problems": ["print has no video; make a poster"]}
    clips = [_shot_to_clip(state, s) for s in raw.get("video") or [] if isinstance(s, dict)]
    norm = D.normalize({**raw, "video": [{k: v for k, v in c.items() if k != "_gen"} for c in clips]})
    dropped = len(raw["layers"]) - len(norm["layers"])
    if dropped or not norm["layers"]:
        return {"ok": False, "problems": [f"{dropped} layer(s) had no readable type" if dropped else "the doc has no layers"], "hint": "nothing was saved; give every layer a type: image, text, logo, shape or qr"}
    problems = _check_images(state, {**norm, "video": [{**c, "image": (c.get("_gen") or {}).get("image")} for c in clips]})
    if problems:
        return {"ok": False, "problems": problems, "hint": "nothing was saved; use URLs from LIBRARY, PRODUCTS, search_images or generate_image"}
    plan = _plan_jobs(state, norm, clips, creative_id or None) if norm["kind"] == "video" else []
    estimate = round(sum(p["estimate"] for p in plan), 3)
    if estimate:
        try:
            await J.ensure_budget(_cid(state), estimate)
        except J.BudgetError as e:
            return {"ok": False, "problems": [str(e)], "hint": "nothing was saved; use stills, fewer or shorter shots, reuse, or ask the merchant"}
    async with _lock(creative_id or f"new:{audience_id}:{format}"):
        # A new creative lands in the spot held for it while it was designed.
        spot = None if creative_id else take_spot(state)
        try:
            saved = await _save(state, doc=norm, creative_id=creative_id or None, audience=audience_id, name=name or None, why=[w for w in (_coerce(why) or []) if isinstance(w, dict)] or None, note="Written by the agent", near=near or None, spot=spot)
        except Exception as err:
            if spot:
                put_back(state, spot)
            return {"ok": False, "problems": [f"not saved: {str(err)[:300]}"]}
        jobs = await _start_jobs(state, saved["id"], plan) if plan else []
    out: dict[str, Any] = {"ok": True, "creativeId": saved["id"], "version": saved["version"], "outline": D.outline(saved["doc"])}
    warnings = D.text_warnings(saved["doc"])
    if warnings:
        out["warnings"] = warnings
    if jobs:
        out["generating"] = [f"{p['clip']['id']} on {M.VIDEO_LABEL.get(p['model']) or M.IMAGE_LABEL.get(p['model'], p['model'])} ~${p['estimate']:.2f}" for p in plan]
        out["estimate"] = estimate
    return out


async def edit_creative(creative_id: str, ops: list, tool_context: ToolContext) -> dict:
    """Change a creative by ids from CREATIVES. Ops:
    {op: "update", id, props} (change fields; null removes one), {op: "remove", id},
    {op: "move", id, index} (layer order: 0 is the back), {op: "duplicate", id, props?},
    {op: "add_layer", layer, index?}, {op: "set", props: {background}}.
    Works on layers, shots (trim with in/out, transition, focal, kenburns, muted) and audio
    (volume, start, duration). New shots: add_shots.

    Args:
        creative_id: A creative id from CREATIVES.
        ops: The list of ops.
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre:
        return {"ok": False, "problems": [f"no creative {creative_id!r}"]}
    raw = _coerce(ops)
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list) or not raw:
        return {"ok": False, "problems": ["no ops given"]}
    async with _lock(creative_id):
        cre = (state.get(CREATIVES) or {}).get(creative_id)
        doc, problems = D.apply_ops(cre["doc"], raw)
        if problems:
            return {"ok": False, "problems": problems, "hint": "nothing was changed"}
        bad = _check_images(state, doc)
        if bad:
            return {"ok": False, "problems": bad}
        try:
            saved = await _save(state, doc=D.normalize(doc), creative_id=creative_id, audience=None, name=None, why=None, note=f"{len(raw)} edit{'s' if len(raw) != 1 else ''} by the agent")
        except Exception as err:
            return {"ok": False, "problems": [f"not saved: {str(err)[:300]}"]}
    out: dict[str, Any] = {"ok": True, "applied": len(raw), "version": saved["version"], "outline": D.outline(saved["doc"])}
    warnings = D.text_warnings(saved["doc"])
    if warnings:
        out["warnings"] = warnings
    return out


async def resize_creative(creative_id: str, formats: list[str], tool_context: ToolContext) -> dict:
    """Copy a creative into other formats (free): full-bleed layers stay full-bleed, the rest
    keep their place, text scales. Video shots are reused and cropped. Check each copy's
    warnings and fix them with edit_creative.

    Args:
        creative_id: The creative to copy.
        formats: Target formats (story, portrait, square, landscape, banner, print).
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre:
        return {"ok": False, "error": f"no creative {creative_id!r}"}
    made = []
    existing = {(c.get("audienceKey"), c.get("format"), c.get("kind")) for c in (state.get(CREATIVES) or {}).values()}
    for f in [x for x in formats or [] if x in D.FORMATS and x != cre["format"]][:6]:
        doc = D.resize(cre["doc"], f)
        if (cre.get("audienceKey"), f, doc["kind"]) in existing:
            made.append({"format": f, "skipped": "this audience already has one in that format; edit it instead"})
            continue
        try:
            saved = await _save(state, doc=doc, creative_id=None, audience=cre.get("audienceKey"), name=str(cre.get("name") or "") or D.FORMATS[f]["label"], why=cre.get("why") or None, note=f"Resized from {cre['format']}")
        except Exception as err:
            made.append({"format": f, "error": str(err)[:200]})
            continue
        item: dict[str, Any] = {"format": f, "creativeId": saved["id"], "outline": D.outline(saved["doc"])}
        w = D.text_warnings(saved["doc"])
        if doc["kind"] == "video" and D.FORMATS[f]["video"] != D.FORMATS[cre["format"]]["video"]:
            w.append(f"the shots are {D.FORMATS[cre['format']]['video']} and get cropped to {D.FORMATS[f]['video']}; regenerate_shot the ones that matter")
        if cre["doc"].get("kind") == "video" and doc["kind"] != "video":
            w.append("print has no video: this copy is a poster (check its layer timing fields are irrelevant)")
        if w:
            item["warnings"] = w
        made.append(item)
    return {"ok": True, "made": made}


# --- tools: shots and sound ---------------------------------------------------------------


async def add_shots(creative_id: str, shots: list, tool_context: ToolContext, after: str = "") -> dict:
    """Add shots to a video (after the shot id in `after`, "start", or "" for the end). They
    generate in the background. Each shot as in THE DOCUMENT: {kind, role, prompt, seconds,
    image?, refs?, sound?, transition?, kenburns?, focal?, reuse?}.

    Args:
        creative_id: A video creative.
        shots: The shots to add.
        after: A shot id, "start" or "".
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre or cre["doc"].get("kind") != "video":
        return {"ok": False, "error": "add_shots needs a video creative id"}
    raw = _coerce(shots)
    raw = [raw] if isinstance(raw, dict) else raw
    clips = [_shot_to_clip(state, s) for s in raw or [] if isinstance(s, dict)]
    if not clips:
        return {"ok": False, "error": "no shots given"}
    bad = _check_images(state, {"video": [{"id": c["id"], "image": (c.get("_gen") or {}).get("image"), "poster": c.get("poster")} for c in clips]})
    if bad:
        return {"ok": False, "error": "; ".join(bad)}
    plan = _plan_jobs(state, cre["doc"], clips, creative_id)
    estimate = round(sum(p["estimate"] for p in plan), 3)
    try:
        await J.ensure_budget(_cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    async with _lock(creative_id):
        cre = (state.get(CREATIVES) or {}).get(creative_id)
        video = list(cre["doc"].get("video") or [])
        at = len(video) if not after else 0 if after == "start" else next((i + 1 for i, c in enumerate(video) if c["id"] == after), len(video))
        video[at:at] = [{k: v for k, v in c.items() if k != "_gen"} for c in clips]
        saved = await _save(state, doc={**cre["doc"], "video": video}, creative_id=creative_id, audience=None, name=None, why=None, note=f"Added {len(clips)} shot{'s' if len(clips) != 1 else ''}")
        await _start_jobs(state, creative_id, plan)
    return {"ok": True, "added": [c["id"] for c in clips], "estimate": estimate, "outline": D.outline(saved["doc"])}


async def regenerate_shot(creative_id: str, shot_id: str, tool_context: ToolContext, prompt: str = "", quality: str = "auto", image: str = "", sound: bool = False, says: str | None = None) -> dict:
    """Make a shot again: a new prompt, a better model ("fast", "premium") or a cheaper one
    ("draft"), or turn it into motion from an image. Same place and length on the timeline.

    Args:
        creative_id: The video creative.
        shot_id: The shot's id.
        prompt: The new prompt ("" keeps the old one).
        quality: "auto" (by role and tier), "draft", "fast", "premium".
        image: A first frame (motion) or picture (still) URL; "" keeps the shot's own.
        sound: Veo native sound.
        says: A new spoken line for a talent shot (omit to keep the old one; "" removes it).
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    clip = J.find(cre["doc"], shot_id) if cre else None
    if not cre or not clip or "kind" not in clip or clip.get("kind") not in ("motion", "still"):
        return {"ok": False, "error": "no such shot in that creative"}
    if image and image not in _known_images(state):
        return {"ok": False, "error": "image must be a URL you were given"}
    spec = {"id": shot_id, "kind": clip["kind"], "role": clip.get("role"), "prompt": prompt or clip.get("prompt") or "", "seconds": D.clip_len(clip), "transition": clip.get("transition"), "kenburns": clip.get("kenburns"), "focal": clip.get("focal"), "sound": sound, "quality": quality, "says": clip.get("says") if says is None else says}
    if says == "" and spec["role"] == "talent":
        spec["role"] = "hero"
    if clip["kind"] == "motion":
        spec["image"] = image or None
    elif image:
        spec["image"] = image
    new = _shot_to_clip(state, spec)
    if new.get("status") == "ready":  # a still given a picture: no generation
        await store.set_clip(creative_id, shot_id, {"poster": new["poster"], "status": "ready", "prompt": new["prompt"]})
        _bump(state)
        return {"ok": True, "shot": shot_id, "estimate": 0}
    plan = _plan_jobs(state, cre["doc"], [new], creative_id)
    estimate = round(sum(p["estimate"] for p in plan), 3)
    try:
        await J.ensure_budget(_cid(state), estimate)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    await store.set_clip(creative_id, shot_id, {"prompt": new["prompt"], "role": new.get("role"), "says": new.get("says") or None, "out": new["out"]})
    await _start_jobs(state, creative_id, plan)
    _bump(state)
    return {"ok": True, "shot": shot_id, "model": M.VIDEO_LABEL.get(plan[0]["model"]) or M.IMAGE_LABEL.get(plan[0]["model"]), "estimate": estimate}


async def edit_shot(creative_id: str, shot_id: str, instruction: str, tool_context: ToolContext, reference_urls: list[str] | None = None) -> dict:
    """Change a finished motion shot with Gemini Omni Flash, keeping the rest of it: light,
    colour grade, weather, an object added or removed, style, camera feel. Cheaper and truer
    than regenerating when the shot is mostly right.

    Args:
        creative_id: The video creative.
        shot_id: A ready motion shot.
        instruction: What to change, concretely ("make it golden hour", "replace the mug with the bottle in image 1").
        reference_urls: Up to 3 images the edit should use.
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    clip = J.find(cre["doc"], shot_id) if cre else None
    if not clip or clip.get("kind") != "motion" or clip.get("status") != "ready" or not clip.get("src"):
        return {"ok": False, "error": "edit_shot needs a finished motion shot"}
    known = _known_images(state)
    refs = [u for u in reference_urls or [] if u in known][:3]
    est = round(M.OMNI_PER_SECOND * max(4.0, float(clip.get("out", 4))), 3)
    try:
        await J.ensure_budget(_cid(state), est)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    spec = D.FORMATS[cre["doc"]["format"]]
    work = J.edit_work(instruction=instruction + " Keep everything else the same. No on-screen text.", src=clip["src"], aspect=spec["video"], keep_in=float(clip.get("in", 0)), keep_out=float(clip.get("out", 4)), images=refs)
    await J.start(_cid(state), creative_id=creative_id, target_id=shot_id, kind="edit", model=M.OMNI, prompt=instruction, estimate=est, work=work, lane="edit")
    _bump(state)
    return {"ok": True, "shot": shot_id, "model": "Omni Flash", "estimate": est}


async def extend_shot(creative_id: str, shot_id: str, seconds: float, tool_context: ToolContext, prompt: str = "") -> dict:
    """Continue a finished motion shot: a new shot right after it that starts on its last
    frame, so the move carries on seamlessly.

    Args:
        creative_id: The video creative.
        shot_id: A ready motion shot.
        seconds: 2 to 8.
        prompt: What happens next ("" continues the same action).
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    clip = J.find(cre["doc"], shot_id) if cre else None
    if not clip or clip.get("kind") != "motion" or clip.get("status") != "ready" or not clip.get("src"):
        return {"ok": False, "error": "extend_shot needs a finished motion shot"}

    try:
        data, _ = await gen.fetch(clip["src"])
        last = await ff.last_frame_bytes(data)
        frame_url = await J.storage_url(last, "image/jpeg")
    except Exception as err:
        return {"ok": False, "error": f"could not read the shot's last frame: {str(err)[:160]}"}
    state[MEDIA] = list(state.get(MEDIA) or []) + [frame_url]
    spec = {"kind": "motion", "role": clip.get("role") or "broll", "seconds": max(2.0, min(8.0, float(seconds))), "image": frame_url, "prompt": (prompt or f"Continue the same shot seamlessly: {clip.get('prompt') or ''}"), "transition": "cut", "focal": clip.get("focal")}
    return await add_shots(creative_id, [spec], tool_context, after=shot_id)


def _video_seconds(doc: dict[str, Any]) -> float:
    return max(1.0, D.duration(doc))


async def add_music(creative_id: str, prompt: str, tool_context: ToolContext, volume: float = 0.5) -> dict:
    """Score a video with Lyria 3: an instrumental clip (about 30 s, trimmed to the video and
    faded out). Replaces the video's music track.

    Args:
        creative_id: The video creative.
        prompt: Genre, mood, tempo (BPM), instruments, energy curve, drawn from the audience's taste and the brand ("warm lo-fi house, 112 BPM, soft Rhodes, builds at 8 s").
        volume: 0 to 1 (0.5 default; it is lowered under a voiceover automatically).
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre or cre["doc"].get("kind") != "video":
        return {"ok": False, "error": "add_music needs a video creative"}
    try:
        await J.ensure_budget(_cid(state), M.MUSIC_PRICE)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    length = _video_seconds(cre["doc"])
    track = {"id": D.new_id("a"), "kind": "music", "start": 0, "duration": round(length, 2), "volume": max(0.0, min(1.0, float(volume))), "prompt": prompt[:2000], "status": "pending"}
    async with _lock(creative_id):
        cre = (state.get(CREATIVES) or {}).get(creative_id)
        audio = [a for a in cre["doc"].get("audio") or [] if a.get("kind") != "music"] + [track]
        await _save(state, doc={**cre["doc"], "audio": audio}, creative_id=creative_id, audience=None, name=None, why=None, note="Music")
    full = f"{prompt}. Instrumental only, no vocals. For a {round(length)}-second ad: strong start, clean ending."
    await J.start(_cid(state), creative_id=creative_id, target_id=track["id"], kind="music", model=M.LYRIA, prompt=full, estimate=M.MUSIC_PRICE, work=J.music_work(prompt=full, length=length), lane="audio")
    return {"ok": True, "track": track["id"], "estimate": M.MUSIC_PRICE}


async def add_voiceover(creative_id: str, script: str, tool_context: ToolContext, voice: str = "Kore", style: str = "", start: float = 0.3) -> dict:
    """A voiceover with Gemini TTS. Replaces the video's voice track.

    Args:
        creative_id: The video creative.
        script: The words, about 2.3 per second of video, in the brand's voice.
        voice: Kore (firm, warm), Puck (upbeat), Charon (deep, calm), Aoede (breezy), Leda (youthful), Orus (firm), Zephyr (bright), Fenrir (excited), Sulafat (warm), Achird (friendly).
        style: How to say it ("Say warmly and unhurried", "Say with quiet excitement").
        start: Seconds into the video.
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre or cre["doc"].get("kind") != "video":
        return {"ok": False, "error": "add_voiceover needs a video creative"}
    length = _video_seconds(cre["doc"])
    words = len(script.split())
    warnings = []
    if words > length * 2.6:
        warnings.append(f"{words} words for {length:.0f} s will run long; aim for {int(length * 2.3)}")
    try:
        await J.ensure_budget(_cid(state), M.VOICE_PRICE)
    except J.BudgetError as e:
        return {"ok": False, "error": str(e)}
    voice = voice if voice in gen.VOICES else "Kore"
    track = {"id": D.new_id("a"), "kind": "voice", "start": max(0.0, float(start)), "duration": round(max(1.0, words / 2.4), 2), "volume": 1, "text": script[:4000], "prompt": f"{voice}: {style}"[:2000], "status": "pending"}
    async with _lock(creative_id):
        cre = (state.get(CREATIVES) or {}).get(creative_id)
        audio = [a for a in cre["doc"].get("audio") or [] if a.get("kind") != "voice"] + [track]
        await _save(state, doc={**cre["doc"], "audio": audio}, creative_id=creative_id, audience=None, name=None, why=None, note="Voiceover")
    await J.start(_cid(state), creative_id=creative_id, target_id=track["id"], kind="voice", model=M.TTS, prompt=script, estimate=M.VOICE_PRICE, work=J.voice_work(text=script, voice=voice, style=style, start=track["start"]), lane="audio")
    return {"ok": True, "track": track["id"], "estimate": M.VOICE_PRICE, **({"warnings": warnings} if warnings else {})}


# --- tools: review and export ------------------------------------------------------------

REVIEW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "quality": {"type": "integer"},
        "verdict": {"type": "string"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "layer": {"type": "string"},
                    "what": {"type": "string"},
                    "fix": {"type": "string"},
                },
                "required": ["severity", "layer", "what", "fix"],
            },
        },
        "keep": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["quality", "verdict", "issues", "keep"],
}


async def review_creative(creative_id: str, tool_context: ToolContext, focus: str = "") -> dict:
    """See the creative as it will be published (the poster rendered, or frames across the
    rendered video) and have an art director judge it: legibility, hierarchy, the CTA, brand
    fit, crop and safe zones, whether the picture carries the hook. Issues name layer ids.

    Args:
        creative_id: The creative.
        focus: Optional: what to look at in particular.
    """
    state = tool_context.state
    done = int(state.get(REVIEWS) or 0)
    if done >= MAX_REVIEWS_PER_TURN:
        return {"ok": False, "error": f"{MAX_REVIEWS_PER_TURN} reviews per turn; finish and say what you would still change"}
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre:
        return {"ok": False, "error": f"no creative {creative_id!r}"}
    if cre["doc"].get("kind") == "video" and any(c.get("status") == "pending" for c in cre["doc"].get("video") or []):
        return {"ok": False, "error": "shots are still generating; review the video in a later turn"}
    state[REVIEWS] = done + 1
    kit = (state.get(CAMPAIGN) or {}).get("kit") or {}
    with timer() as t:
        try:
            frames = await render.review_frames(cre, kit)
        except Exception as err:
            record("slice", "Render the creative", f"failed: {str(err)[:140]}", ms=t.ms, started=t.started)
            return {"ok": False, "error": f"could not render it ({str(err)[:160]}); is the web app running at {PB.web_url()}?"}
    record("slice", "Render the creative", f"{len(frames)} frame{'s' if len(frames) != 1 else ''}", ms=t.ms, started=t.started)
    aud = next((a for a in _audiences(state) if a["id"] == cre.get("audienceKey")), {})
    labels = ", ".join(f"image {i + 1} = {f[2]}" for i, f in enumerate(frames))
    prompt = (
        f"You are the art director at {kit.get('name')}. These are renders of a {cre['doc'].get('kind')} for {D.FORMATS[cre['format']]['label']} ({cre['doc']['w']}x{cre['doc']['h']}), {labels}, made for the audience \"{aud.get('name', 'everyone')}\".\n"
        f"Brand colours {json.dumps(kit.get('colors'))}, heading font {((kit.get('fonts') or {}).get('heading') or {}).get('family')}. Voice: {(kit.get('voice') or {}).get('summary', '')}\n"
        f"Its layers:\n{D.outline(cre['doc'])}\n"
        + (f"Focus: {focus}\n" if focus else "")
        + "First the defects anyone would notice (high severity): text hard to read (contrast, text over a busy part of the photo), text cut off or touching the edge, overlapping elements, a missing or broken picture, the CTA not reading as a button, the product cropped badly, empty dead space, a frame that looks like a template. Then judge: does it stop the scroll in the first glance, one clear message, hierarchy, brand fit, does the picture carry the hook, safe zones for the format.\n"
        "quality 1 to 10. At most 6 issues, most important first, each naming the layer id (or \"frame\") and a concrete fix in terms of the layers (move, resize, change colour or size, add a scrim, swap the picture). keep: 2 or 3 things that work. verdict: two sentences. No markdown, no em dashes."
    )
    try:
        critique = await generate_json([prompt, *[types.Part.from_bytes(data=f[0], mime_type=f[1]) for f in frames]], REVIEW_SCHEMA, name="Art director's review", temperature=0.1, thinking=True, result=lambda r: f"quality {r.get('quality')}/10, {len(r.get('issues') or [])} issues")
    except Exception as err:
        return {"ok": True, "quality": None, "verdict": f"the visual review failed ({type(err).__name__})", "issues": [{"severity": "low", "layer": "frame", "what": w, "fix": "see the warning"} for w in D.text_warnings(cre["doc"])]}
    issues = [i for i in critique.get("issues") or [] if isinstance(i, dict)]
    issues += [{"severity": "medium", "layer": w.split(" ")[0], "what": w, "fix": "resize the box or shorten the text"} for w in D.text_warnings(cre["doc"])]
    shot = None
    try:
        shot = await J.storage_url(frames[0][0], frames[0][1])
    except Exception:
        pass
    return {"ok": True, "quality": critique.get("quality"), "verdict": critique.get("verdict"), "issues": issues[:8], "keep": critique.get("keep") or [], **({"screenshot": shot} if shot else {})}


_exports: set[asyncio.Task] = set()


async def export_creative(creative_id: str, tool_context: ToolContext) -> dict:
    """Render the creative to its final file (JPEG/PNG poster, or MP4 with music and voice) in
    the background; the studio shows the download when it is ready. Only when the merchant asks
    or the creative is finished; shots must be done.

    Args:
        creative_id: The creative.
    """
    state = tool_context.state
    cre = (state.get(CREATIVES) or {}).get(creative_id)
    if not cre:
        return {"ok": False, "error": f"no creative {creative_id!r}"}
    if any(c.get("status") == "pending" for c in (cre["doc"].get("video") or []) + (cre["doc"].get("audio") or [])):
        return {"ok": False, "error": "shots or audio are still generating; export when they finish"}
    task = asyncio.create_task(_export_quietly(creative_id, _cid(state)))
    _exports.add(task)
    task.add_done_callback(_exports.discard)
    return {"ok": True, "rendering": creative_id}


async def _export_quietly(creative_id: str, campaign_id: str) -> None:
    try:
        await render.export(creative_id, campaign_id)
    except Exception as err:
        record("slice", "Export", f"failed: {str(err)[:160]}", ms=0)
        print(f"[slice-media] export {creative_id} failed: {err}")


# --- callbacks, agents -------------------------------------------------------------------


def _media(value: Any, out: list[str], depth: int = 0) -> None:
    if depth > 5 or len(out) > 80:
        return
    if isinstance(value, dict):
        for k, v in value.items():
            if k in ("src", "image", "thumbnail", "url") and isinstance(v, str) and v.startswith("http"):
                out.append(v)
            else:
                _media(v, out, depth + 1)
    elif isinstance(value, list):
        for v in value:
            _media(v, out, depth + 1)


async def _collect_media(tool: Any, args: dict[str, Any], tool_context: ToolContext, tool_response: Any) -> None:
    """after_tool_callback: pictures a tool returned (Pexels, Qloo) become usable."""
    if getattr(tool, "name", "") not in ("search_images", "qloo_search", "qloo_insights", "get_audience"):
        return None
    found: list[str] = []
    _media(tool_response, found)
    if found:
        known = list(tool_context.state.get(MEDIA) or [])
        fresh = [u for u in dict.fromkeys(found) if u not in known]
        if fresh:
            tool_context.state[MEDIA] = (known + fresh)[-400:]
    return None


TOOLS = [
    get_audience,
    save_concepts,
    PB.qloo_search,
    PB.qloo_insights,
    PB.search_images,
    generate_image,
    make_image,
    edit_image,
    edit_clip,
    extend_clip,
    rename_campaign,
    write_creative,
    edit_creative,
    resize_creative,
    add_shots,
    regenerate_shot,
    edit_shot,
    extend_shot,
    add_music,
    add_voiceover,
    review_creative,
    export_creative,
    ask_questions,
]

STATUS_FOR_TOOL = {
    "get_audience": "Reading the audience's taste",
    "save_concepts": "Writing the concepts",
    "qloo_search": "Looking up on Qloo",
    "qloo_insights": "Asking Qloo",
    "search_images": "Finding photographs",
    "generate_image": "Generating an image",
    "make_image": "Making images",
    "make_clip": "Shooting a clip",
    "make_music": "Composing music",
    "edit_image": "Editing the image",
    "edit_clip": "Editing the clip with Omni",
    "extend_clip": "Continuing the clip",
    "rename_campaign": "Naming the campaign",
    "write_creative": "Designing a creative",
    "edit_creative": "Editing a creative",
    "resize_creative": "Adapting to more formats",
    "add_shots": "Adding shots",
    "regenerate_shot": "Regenerating a shot",
    "edit_shot": "Editing a shot with Omni",
    "extend_shot": "Extending a shot",
    "add_music": "Scoring the video",
    "add_voiceover": "Recording the voiceover",
    "review_creative": "Reviewing the render",
    "export_creative": "Rendering the file",
    "ask_merchant": "Asking you a question",
    "ask_questions": "Asking you a few questions",
}

THINKING = {
    "build": os.environ.get("MEDIA_THINKING_BUILD", "MEDIUM"),
    "edit": os.environ.get("MEDIA_THINKING_EDIT", "LOW"),
}
RUNNER_FOR_KIND = {"generate": "build", "edit": "edit", "prompt": "edit"}


# Vertex now and then leaves a streamed answer open after its last part; ADK then waits on it
# before the next call. A read timeout turns that into an error the turn recovers from
# (routes.py carries on), and failed requests are retried.
MODEL_TIMEOUT_MS = int(os.environ.get("MEDIA_MODEL_TIMEOUT_MS", "60000"))


def _model(name: str) -> Gemini:
    return Gemini(model=name, client_kwargs={"http_options": types.HttpOptions(timeout=MODEL_TIMEOUT_MS)}, retry_options=types.HttpRetryOptions(attempts=3, initial_delay=1))


def _make_agent(model: str, thinking: str) -> LlmAgent:
    return LlmAgent(
        name="slice_media_builder",
        model=_model(model),
        description="Designs posters and short videos per audience and format from a brand kit, a brief and Qloo taste profiles.",
        instruction=build_instruction,
        generate_content_config=types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_level=thinking, include_thoughts=True), temperature=0.7),
        tools=TOOLS,
        after_tool_callback=_collect_media,
    )


agents = {(m, mode): _make_agent(m, level) for m in MODELS for mode, level in THINKING.items()}
root_agent = agents[(MODEL, "build")]


def prompt_message(state: dict[str, Any], message: str) -> str:
    """A prompt-bar turn: the merchant's words, with what they picked restated so the model cannot miss it."""
    o = state.get(OPTIONS) or {}
    if o.get("output") == "campaign":
        return turn_message(state, message)
    picks = [f"make: {o.get('output') or 'auto'}"]
    if o.get("aspect"):
        picks.append(f"shape {o['aspect']}")
    if int(o.get("count") or 1) > 1:
        picks.append(f"{int(o['count'])} takes")
    if o.get("audienceId") and o.get("audienceId") != "all":
        picks.append(f"for audience {o['audienceId']}")
    return f"{message}\n[Prompt bar: {', '.join(picks)}. Follow THIS TURN.]"


def turn_message(state: dict[str, Any], note: str | None) -> str:
    camp = state.get(CAMPAIGN) or {}
    n = len(_audiences(state))
    text = f"[Make this campaign's creatives now: {n} audience{'s' if n != 1 else ''}, formats {', '.join(camp.get('formats') or ['story'])}. Follow THIS TURN.]"
    if note and note.strip():
        text += "\nThe merchant's message: " + note.strip()
    return text
