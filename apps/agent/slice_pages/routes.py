"""FastAPI routes for the Pages service (registered in server.py).

POST /pages/intake          {brand_id, url}                    NDJSON stream
POST /pages/audience-brief  {audience_id}                      {ok, brief, name?}
POST /pages/name-clusters   {upload_id}                        {ok, names}
POST /pages/build           {page_id, variant_id, kind, message?, history?}   NDJSON stream
POST /pages/image           {brand_id, model, prompt?, query?, aspect?}       {images}
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
from . import images
from .audience_brief import name_clusters, write_audience_brief
from .intake import run_intake

router = APIRouter(prefix="/pages", tags=["pages"])

APP_NAME = "slice_pages"
sessions = InMemorySessionService()
runner = Runner(app_name=APP_NAME, agent=B.root_agent, session_service=sessions)


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


# --- builder -----------------------------------------------------------------------------------


class HistoryMessage(BaseModel):
    role: str  # "merchant" | "agent"
    text: str = ""


class BuildRequest(BaseModel):
    page_id: str
    variant_id: str
    kind: str = "generate"  # "generate" | "edit"
    message: str | None = None
    history: list[HistoryMessage] = []


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
                await sessions.append_event(session, Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text="[Generate this version.]")])))
            await sessions.append_event(session, Event(invocation_id=invocation, author=B.root_agent.name, content=types.Content(role="model", parts=[types.Part(text=text)])))
            prev = "model"


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
    if session is None:
        session = await sessions.create_session(app_name=APP_NAME, user_id=sid, session_id=sid, state=state)
        await _replay(session, req.history)
        delta: dict[str, Any] = {}
    else:
        delta = dict(state)
    if kind == "generate":
        user_text = B.generate_message(state, req.message)
        merchant_text = (req.message or "").strip() or f"Generate the {(state.get(B.VARIANT) or {}).get('name', '')} version".strip()
    else:
        user_text = (req.message or "").strip()
        merchant_text = user_text
    content = types.Content(role="user", parts=[types.Part(text=user_text)])

    doc_version = int(state.get(B.DOC_VERSION) or 0)
    text_parts: list[str] = []
    streamed = ""
    seen_calls: set[str] = set()
    last_doc: Any = state.get(B.DOC)
    try:
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
                    yield _ndjson({"type": "status", "text": B.STATUS_FOR_TOOL.get(name, "Working")})
                    args = _safe(part.function_call.args)
                    if isinstance(args, dict) and "doc" in args:
                        args = {**args, "doc": f"<PageDoc, {len(json.dumps(args['doc'], default=str))} chars>"}
                    yield _ndjson({"type": "tool_call", "name": name, "args": args})
                elif part.function_response:
                    name = part.function_response.name or ""
                    resp = part.function_response.response or {}
                    yield _ndjson({"type": "tool_result", "name": name, "ok": bool(resp.get("ok", True)), "problems": resp.get("problems")})
                    fresh = await sessions.get_session(app_name=APP_NAME, user_id=sid, session_id=session.id)
                    st = fresh.state if fresh else {}
                    v = int(st.get(B.DOC_VERSION) or 0)
                    if v != doc_version and st.get(B.DOC):
                        doc_version = v
                        last_doc = st.get(B.DOC)
                        yield _ndjson({"type": "doc", "doc": last_doc, "version": v, "saved": bool(resp.get("saved", True))})
                elif part.text and not part.thought:
                    if ev.partial:
                        streamed += part.text
                        yield _ndjson({"type": "text", "delta": part.text})
                    else:
                        if streamed and part.text.startswith(streamed[: min(len(streamed), 40)]):
                            text_parts.append(part.text)
                            yield _ndjson({"type": "text_done", "text": part.text})
                        elif part.text.strip():
                            text_parts.append(part.text)
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
    yield _ndjson({"type": "done", "messageId": message_id, "variantId": req.variant_id, "text": full_text, "trace": spans, "totalMs": total_ms, "docVersion": doc_version})
    asyncio.create_task(_persist_build(req, message_id, merchant_text, full_text, spans))


async def _persist_build(req: BuildRequest, message_id: str, merchant_text: str, reply: str, spans: list[Span]) -> None:
    now = int(time.time() * 1000)
    messages = [
        {"id": f"{message_id}-m", "role": "merchant", "at": now, "text": merchant_text, "variantId": req.variant_id},
        {"id": message_id, "role": "agent", "at": now + 1, "text": reply, "variantId": req.variant_id, "trace": spans},
    ]
    try:
        await convex.site("/pages/build", {"pageId": req.page_id, "messages": messages})
    except Exception as err:
        print(f"[slice-pages] could not persist build turn: {err}")


@router.post("/build")
async def build(req: BuildRequest) -> StreamingResponse:
    return StreamingResponse(_build_stream(req), media_type="application/x-ndjson")
