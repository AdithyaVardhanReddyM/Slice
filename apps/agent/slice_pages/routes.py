"""FastAPI routes for the Pages service (registered in server.py).

POST /pages/intake          {brand_id, url}                    NDJSON stream
POST /pages/capture         {brand_id, url?}                   {ok, site}
POST /pages/audience-brief  {audience_id}                      {ok, brief, name?}
POST /pages/name-clusters   {upload_id}                        {ok, names}
POST /pages/plan            {brand_id, prompt, audience_ids?, source_page_id?}  {ok, plan}
POST /pages/build           {page_id, variant_id, kind, message?, history?, mentions?}   NDJSON stream
POST /pages/image           {brand_id, model, prompt?, query?, aspect?}       {images}
POST /pages/insights        {variant_id}                       {ok, insights}
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from slice_agent import convex_client as convex
from slice_agent.trace import Span, record, start_turn

from . import builder as B
from . import capture, images
from .audience_brief import name_clusters, write_audience_brief
from .insights import write_insights
from .intake import run_intake
from .plan import plan_page

router = APIRouter(prefix="/pages", tags=["pages"])

APP_NAME = "slice_pages"
sessions = InMemorySessionService()
# One runner per model over the same sessions, so the merchant can switch models mid-chat.
runners = {m: Runner(app_name=APP_NAME, agent=a, session_service=sessions) for m, a in B.agents.items()}


def _ndjson(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


def _safe(args: Any) -> Any:
    try:
        json.dumps(args)
        return args
    except TypeError:
        return str(args)


# --- intake ------------------------------------------------------------------------------


class IntakeRequest(BaseModel):
    brand_id: str
    url: str


async def _intake_stream(req: IntakeRequest) -> AsyncIterator[bytes]:
    try:
        async for ev in run_intake(req.brand_id, req.url):
            yield _ndjson(ev)
    except Exception as err:
        yield _ndjson({"type": "error", "message": f"{type(err).__name__}: {err}"})


@router.post("/intake")
async def intake(req: IntakeRequest) -> StreamingResponse:
    return StreamingResponse(_intake_stream(req), media_type="application/x-ndjson")


# --- site capture (screenshot, markup, photos, anatomy of the brand's homepage) -----------


class CaptureRequest(BaseModel):
    brand_id: str
    url: str | None = None


@router.post("/capture")
async def capture_route(req: CaptureRequest) -> dict[str, Any]:
    spans = start_turn()
    url = req.url
    if not url:
        brand = await convex.query("pagesBrands:get", {"id": req.brand_id})
        url = (brand or {}).get("url")
    if not url:
        return {"ok": False, "error": "unknown brand", "trace": spans}
    try:
        site = await capture.capture_site(req.brand_id, url)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}
    try:
        await convex.site("/pages/brand", {"brandId": req.brand_id, "patch": {"spans": spans}})
    except Exception:
        pass
    return {"ok": True, "site": site, "trace": spans}


# --- audience brief, cluster names ---------------------------------------------------------


class AudienceBriefRequest(BaseModel):
    audience_id: str


@router.post("/audience-brief")
async def audience_brief(req: AudienceBriefRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        result = await write_audience_brief(req.audience_id)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}
    result["trace"] = spans
    if result.get("ok"):
        try:
            await convex.site("/pages/audience", {"audienceId": req.audience_id, "patch": {"spans": spans}})
        except Exception:
            pass
    return result


class NameClustersRequest(BaseModel):
    upload_id: str


@router.post("/name-clusters")
async def name_clusters_route(req: NameClustersRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        result = await name_clusters(req.upload_id)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}
    result["trace"] = spans
    if result.get("ok"):
        try:
            await convex.site("/pages/upload", {"uploadId": req.upload_id, "patch": {"spans": spans}})
        except Exception:
            pass
    return result


# --- page plan (the builder's first prompt) ----------------------------------------------------


class PlanRequest(BaseModel):
    brand_id: str
    prompt: str
    audience_ids: list[str] = []
    model: str | None = None
    # The page the merchant was editing when they asked for this one (start_new_page).
    source_page_id: str | None = None


@router.post("/plan")
async def plan(req: PlanRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        result = await plan_page(req.brand_id, req.prompt, req.audience_ids, model=req.model if req.model in B.MODELS else B.MODEL, source_page_id=req.source_page_id)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}
    return {"ok": True, "plan": result, "trace": spans}


# --- image picker ----------------------------------------------------------------------------


class ImageRequest(BaseModel):
    brand_id: str
    model: str = "pexels"  # "pexels" | "nano-banana-2" | "nano-banana-pro"
    prompt: str | None = None
    query: str | None = None
    aspect: str | None = None


@router.post("/image")
async def image(req: ImageRequest) -> dict[str, Any]:
    spans = start_turn()
    style = None
    if req.model != "pexels":
        try:
            brand = await convex.query("pagesBrands:get", {"id": req.brand_id})
            im = ((brand or {}).get("kit") or {}).get("imagery") or {}
            style = f"{im.get('style', '')}; {im.get('treatment', '')}".strip("; ") or None
        except Exception:
            style = None
    try:
        out = await images.images_for_console(req.brand_id, model=req.model, prompt=req.prompt, query=req.query, aspect=req.aspect, brand_style=style)
    except Exception as err:
        return {"ok": False, "images": [], "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}
    return {"ok": True, "images": out, "trace": spans}


# --- insights (why the page is built the way it is) --------------------------------------------


class InsightsRequest(BaseModel):
    variant_id: str


@router.post("/insights")
async def insights(req: InsightsRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        return {**(await write_insights(req.variant_id)), "trace": spans}
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {str(err)[:300]}", "trace": spans}


async def _refresh_insights(variant_id: str) -> None:
    """Fallback after a turn that changed the page without explain_page, so the Insights screen opens ready."""
    start_turn()
    try:
        await write_insights(variant_id)
    except Exception as err:
        print(f"[slice-pages] insights failed for {variant_id}: {err}")


# --- builder -----------------------------------------------------------------------------------


class HistoryMessage(BaseModel):
    role: str  # "merchant" | "agent"
    text: str = ""


class Attachment(BaseModel):
    url: str
    name: str = ""
    type: str = "image/png"


class Mention(BaseModel):
    id: str
    name: str = ""


class BuildRequest(BaseModel):
    page_id: str
    variant_id: str
    kind: str = "generate"  # "generate" | "edit"
    message: str | None = None
    history: list[HistoryMessage] = []
    model: str | None = None  # one of builder.MODELS; defaults to builder.MODEL
    attachments: list[Attachment] = []
    # Audiences the merchant @mentioned in the message.
    mentions: list[Mention] = []


async def _image_part(url: str, mime_hint: str = "") -> types.Part | None:
    try:
        data = await capture.site_bytes(url)
    except Exception:
        return None
    mime = mime_hint if mime_hint.startswith("image/") else "image/png"
    if data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    return types.Part.from_bytes(data=data, mime_type=mime)


async def _replay(session: Any, history: list[HistoryMessage]) -> None:
    if not history:
        return
    invocation = f"replay-{uuid.uuid4().hex[:8]}"
    prev: str | None = None
    for m in history:
        text = (m.text or "").strip()
        if not text:
            continue
        if m.role == "merchant":
            await sessions.append_event(session, Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text=text)])))
            prev = "user"
        else:
            if prev != "user":
                await sessions.append_event(session, Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text="[Generate this page.]")])))
            await sessions.append_event(session, Event(invocation_id=invocation, author=B.root_agent.name, content=types.Content(role="model", parts=[types.Part(text=text)])))
            prev = "model"


def _summarise(name: str, args: Any, resp: dict[str, Any]) -> str:
    """One line for the chat's tool step: what came back."""
    if not isinstance(resp, dict):
        return ""
    if resp.get("ok") is False:
        probs = resp.get("problems") or ([resp["error"]] if resp.get("error") else [])
        return ("; ".join(str(p) for p in probs[:2]))[:160] if probs else "failed"
    if name == "review_page":
        n = len(resp.get("issues") or [])
        bm, q = resp.get("brandMatch"), resp.get("quality")
        return f"brand match {bm}/10, quality {q}/10, {n} issue{'s' if n != 1 else ''}" if bm is not None else f"{n} issues from the DOM checks"
    if name in ("write_page", "edit_page"):
        secs = resp.get("sections") or []
        return (f"{resp.get('applied')} change{'s' if resp.get('applied') != 1 else ''}, " if name == "edit_page" else "") + f"{len(secs)} sections" + ("" if resp.get("saved", True) else " (not saved)")
    if name == "search_images":
        return f"{len(resp.get('images') or [])} photos" + (f" for \"{args.get('query')}\"" if isinstance(args, dict) and args.get("query") else "")
    if name == "generate_image":
        return "1 image generated" + (" (Pexels fallback)" if resp.get("fallback") else "")
    if name == "pick_items":
        return ", ".join(i.get("name", "") for i in (resp.get("items") or [])[:4])
    if name == "get_brand_site":
        return f"{len(resp.get('images') or [])} site photos, {len(resp.get('html') or '') // 1024} KB markup"
    if name == "get_audience_detail":
        tags = resp.get("tags") or {}
        return f"{sum(len(v) for v in tags.values())} tags, {len(resp.get('brands') or [])} brands, {sum(len(v) for v in (resp.get('culture') or {}).values())} culture refs"
    if name == "qloo_places":
        return ", ".join(p.get("name", "") for p in (resp.get("places") or [])[:4])
    if name == "qloo_culture":
        return ", ".join(p.get("name", "") for p in (resp.get("items") or [])[:4])
    if name == "fetch_reference":
        return "read" if resp.get("ok") else "could not read"
    if name == "explain_page":
        n = resp.get("explained")
        return f"{n} section{'s' if n != 1 else ''} explained" + (f", {len(resp.get('warnings') or [])} notes" if resp.get("warnings") else "")
    if name == "start_new_page":
        req = (args or {}).get("request") if isinstance(args, dict) else ""
        return str(req or "")[:140]
    return ""


async def _build_stream(req: BuildRequest) -> AsyncIterator[bytes]:
    t_start = time.perf_counter()
    spans: list[Span] = start_turn()
    emitted = 0
    message_id = uuid.uuid4().hex[:12]
    yield _ndjson({"type": "start", "messageId": message_id, "variantId": req.variant_id})
    yield _ndjson({"type": "status", "text": "Loading the brand, the page and the audience"})
    try:
        state = await B.load_build_state(req.page_id, req.variant_id)
    except Exception as err:
        yield _ndjson({"type": "error", "message": f"{type(err).__name__}: {err}"})
        return
    kind = "edit" if req.kind == "edit" else "generate"
    state[B.KIND] = kind
    if kind == "edit" and not (req.message or "").strip():
        yield _ndjson({"type": "error", "message": "An edit needs a message"})
        return
    while emitted < len(spans):
        yield _ndjson({"type": "span", "span": spans[emitted]})
        emitted += 1

    sid = f"{req.page_id}:{req.variant_id}"
    session = await sessions.get_session(app_name=APP_NAME, user_id=sid, session_id=sid)
    fresh_session = session is None
    # The brand's homepage, captured once, is what every version must look like.
    brand = state[B.BRAND]
    if not ((brand.get("site") or {}).get("fold")):
        yield _ndjson({"type": "status", "text": "Capturing the brand's homepage"})
        await B.ensure_site(brand)
        while emitted < len(spans):
            yield _ndjson({"type": "span", "span": spans[emitted]})
            emitted += 1
    if session is None:
        session = await sessions.create_session(app_name=APP_NAME, user_id=sid, session_id=sid, state=state)
        await _replay(session, req.history)
        delta: dict[str, Any] = {}
    else:
        delta = dict(state)
    if kind == "generate":
        user_text = B.generate_message(state, req.message)
        # An automatic build (no note from the merchant) gets no merchant bubble in the chat.
        merchant_text = (req.message or "").strip()
    else:
        user_text = (req.message or "").strip()
        merchant_text = user_text
    if req.mentions:
        own = set(state[B.PAGE].get("audienceIds") or [])
        user_text += "\n[Audiences mentioned: " + "; ".join(
            f"@{m.name} (id {m.id}, {'this page is built for it' if m.id in own else 'not this page: a page for it is a new page'})" for m in req.mentions
        ) + "]"
    parts: list[types.Part] = [types.Part(text=user_text)]
    # The homepage screenshots go with the first turn of a session (and every generate), so the model sees the brand.
    if fresh_session or kind == "generate":
        for key in ("fold", "screenshot"):
            u = (brand.get("site") or {}).get(key)
            if not u:
                continue
            try:
                parts.append(types.Part.from_bytes(data=await capture.site_bytes(u), mime_type="image/png"))
            except Exception:
                pass
        if len(parts) > 1:
            parts.insert(1, types.Part(text="The brand's homepage, top of the page and then the whole page:"))
        # Images the merchant attached to the first prompt live on the brief as inspiration.
        inspo = [u for u in ((state[B.PAGE].get("brief") or {}).get("inspiration") or []) if isinstance(u, str) and u.startswith("http")][:4]
        inspo_parts = [p for p in [await _image_part(u) for u in inspo] if p]
        if inspo_parts:
            parts.append(types.Part(text=f"{len(inspo_parts)} image{'s' if len(inspo_parts) != 1 else ''} the merchant attached as inspiration or reference:"))
            parts.extend(inspo_parts)
    # Images attached to this message.
    attached = [p for p in [await _image_part(a.url, a.type) for a in req.attachments[:6]] if p]
    if attached:
        parts.append(types.Part(text=f"{len(attached)} image{'s' if len(attached) != 1 else ''} attached to this message:"))
        parts.extend(attached)
    content = types.Content(role="user", parts=parts)

    doc_version = int(state.get(B.DOC_VERSION) or 0)
    text_parts: list[str] = []
    streamed = ""
    seen_calls: set[str] = set()
    last_doc: Any = state.get(B.DOC)
    # The turn as the chat shows it, persisted with the reply.
    steps: list[dict[str, Any]] = []
    thought_streamed = 0
    call_args: dict[str, Any] = {}

    def add_text(delta: str, kind: str) -> None:
        if steps and steps[-1].get("kind") == kind:
            steps[-1]["text"] += delta
        else:
            steps.append({"kind": kind, "text": delta})
    try:
        runner = runners.get(req.model or "") or runners[B.MODEL]
        async for ev in runner.run_async(
            user_id=sid,
            session_id=session.id,
            new_message=content,
            state_delta=delta or None,
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
        ):
            while emitted < len(spans):
                yield _ndjson({"type": "span", "span": spans[emitted]})
                emitted += 1
            if not ev.content or not ev.content.parts:
                continue
            for part in ev.content.parts:
                if part.function_call:
                    name = part.function_call.name or ""
                    key = part.function_call.id or f"{name}:{json.dumps(_safe(part.function_call.args), sort_keys=True)}"
                    if key in seen_calls:
                        continue
                    seen_calls.add(key)
                    label = B.STATUS_FOR_TOOL.get(name, "Working")
                    yield _ndjson({"type": "status", "text": label})
                    args = _safe(part.function_call.args)
                    if isinstance(args, dict):
                        args = {k: (f"<{len(str(v))} chars>" if k in ("doc", "html", "css", "edits", "sections", "strategy") else v) for k, v in args.items()}
                    call_args[name] = part.function_call.args
                    steps.append({"kind": "tool", "name": name, "label": label, "status": "running"})
                    yield _ndjson({"type": "tool_call", "name": name, "label": label, "args": args})
                    if name == "start_new_page":
                        a = part.function_call.args or {}
                        ids = [i for i in (a.get("audience_ids") or []) if isinstance(i, str)]
                        if str(a.get("request") or "").strip():
                            # The console plans, creates and opens the page once this turn ends.
                            yield _ndjson({"type": "new_page", "request": str(a.get("request")).strip(), "audienceIds": ids})
                elif part.function_response:
                    name = part.function_response.name or ""
                    resp = part.function_response.response or {}
                    ok = bool(resp.get("ok", True))
                    summary = _summarise(name, call_args.get(name), resp)
                    for st in reversed(steps):
                        if st.get("kind") == "tool" and st.get("name") == name and st.get("status") == "running":
                            st["status"] = "done" if ok else "failed"
                            if summary:
                                st["summary"] = summary
                            break
                    yield _ndjson({"type": "tool_result", "name": name, "ok": ok, "summary": summary, "problems": resp.get("problems")})
                    fresh = await sessions.get_session(app_name=APP_NAME, user_id=sid, session_id=session.id)
                    st = fresh.state if fresh else {}
                    v = int(st.get(B.DOC_VERSION) or 0)
                    if v != doc_version and st.get(B.DOC):
                        doc_version = v
                        last_doc = st.get(B.DOC)
                        yield _ndjson({"type": "doc", "doc": last_doc, "version": v, "saved": bool(resp.get("saved", True))})
                elif part.text and part.thought:
                    # Reasoning summaries (include_thoughts): streamed for the chat, never part of the reply.
                    # Partial chunks arrive first; a non-partial copy is skipped if chunks were seen.
                    if ev.partial:
                        thought_streamed += len(part.text)
                        add_text(part.text, "thought")
                        yield _ndjson({"type": "thought", "delta": part.text})
                    elif thought_streamed == 0:
                        add_text(part.text, "thought")
                        yield _ndjson({"type": "thought", "delta": part.text})
                    else:
                        thought_streamed = 0
                elif part.text and not part.thought:
                    if ev.partial:
                        streamed += part.text
                        add_text(part.text, "text")
                        yield _ndjson({"type": "text", "delta": part.text})
                    else:
                        if streamed and part.text.startswith(streamed[: min(len(streamed), 40)]):
                            text_parts.append(part.text)
                            if steps and steps[-1].get("kind") == "text":
                                steps[-1]["text"] = part.text
                            yield _ndjson({"type": "text_done", "text": part.text})
                        elif part.text.strip():
                            text_parts.append(part.text)
                            add_text(part.text, "text")
                            yield _ndjson({"type": "text", "delta": part.text})
                            yield _ndjson({"type": "text_done", "text": part.text})
                        streamed = ""
    except Exception as err:
        yield _ndjson({"type": "error", "message": f"{type(err).__name__}: {err}"})

    while emitted < len(spans):
        yield _ndjson({"type": "span", "span": spans[emitted]})
        emitted += 1
    spans.sort(key=lambda sp: sp.get("started", 0))
    full_text = "\n\n".join(t.strip() for t in text_parts if t.strip())
    total_ms = int((time.perf_counter() - t_start) * 1000)
    if kind == "generate" and last_doc is None:
        yield _ndjson({"type": "error", "message": "The builder finished without writing a page"})
        try:
            await convex.site("/pages/variant", {"variantId": req.variant_id, "patch": {"status": "failed", "error": "The builder finished without writing a page", "spans": spans}})
        except Exception:
            pass
    for st in steps:
        if st.get("kind") == "tool" and st.get("status") == "running":
            st["status"] = "failed"
    yield _ndjson({"type": "done", "messageId": message_id, "variantId": req.variant_id, "text": full_text, "trace": spans, "steps": steps, "totalMs": total_ms, "docVersion": doc_version})
    asyncio.create_task(_persist_build(req, message_id, merchant_text, full_text, spans, steps))
    # The builder explains its own work (explain_page); if this turn changed the page without it, reconstruct the explanation.
    if last_doc is not None and doc_version != int(state.get(B.DOC_VERSION) or 0):
        fresh = await sessions.get_session(app_name=APP_NAME, user_id=sid, session_id=session.id)
        explained = ((fresh.state if fresh else {}).get(B.INSIGHTS) or {}).get("version")
        if explained != doc_version:
            asyncio.create_task(_refresh_insights(req.variant_id))


async def _persist_build(req: BuildRequest, message_id: str, merchant_text: str, reply: str, spans: list[Span], steps: list[dict[str, Any]]) -> None:
    now = int(time.time() * 1000)
    messages = [
        *(
            [{"id": f"{message_id}-m", "role": "merchant", "at": now, "text": merchant_text, "variantId": req.variant_id, **({"attachments": [a.model_dump() for a in req.attachments]} if req.attachments else {})}]
            if merchant_text or req.attachments
            else []
        ),
        {"id": message_id, "role": "agent", "at": now + 1, "text": reply, "variantId": req.variant_id, "trace": spans, "steps": steps},
    ]
    try:
        await convex.site("/pages/build", {"pageId": req.page_id, "messages": messages})
    except Exception as err:
        print(f"[slice-pages] could not persist build turn: {err}")


@router.post("/build")
async def build(req: BuildRequest) -> StreamingResponse:
    return StreamingResponse(_build_stream(req), media_type="application/x-ndjson")
