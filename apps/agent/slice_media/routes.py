"""FastAPI routes for the Media service (registered in server.py).

POST /media/agent   {campaignId, kind, message?, history?, attachments?, selection?, model?}  NDJSON stream
POST /media/action  {campaignId, action, args}                                                {ok, ...}
POST /media/export  {campaignId, creativeId}                                                  {ok, url, mime}

The agent stream speaks the /pages/build protocol (start, status, span, thought,
text, text_done, tool_call, tool_result, question, doc, error, done), so the
studio reuses lib/pages/stream.ts. `doc` only says something was written; the
studio reads creatives live from Convex. /media/action runs one studio button
(regenerate a shot, edit it with Omni, add music...) through the same tool code
without a model turn, so those clicks cost only the generation.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from types import SimpleNamespace
from typing import Any, AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from slice_agent.trace import Span, start_turn
from slice_pages.routes import _image_part, _ndjson, _preview as pages_preview, _safe

from . import builder as B
from . import insights as I
from . import render
from . import store

router = APIRouter(prefix="/media", tags=["media"])

APP_NAME = "slice_media"
sessions = InMemorySessionService()
runners = {key: Runner(app_name=APP_NAME, agent=a, session_service=sessions) for key, a in B.agents.items()}


def _error(err: Exception) -> str:
    return f"{type(err).__name__}: {str(err)[:300]}"


class HistoryMessage(BaseModel):
    role: str
    text: str = ""


class Attachment(BaseModel):
    url: str
    name: str = ""
    type: str = "image/png"


class Selection(BaseModel):
    creativeId: str | None = None
    layerIds: list[str] = []
    clipId: str | None = None
    time: float | None = None


class AgentRequest(BaseModel):
    campaignId: str
    kind: str = "generate"  # "generate" | "edit"
    message: str | None = None
    history: list[HistoryMessage] = []
    attachments: list[Attachment] = []
    selection: Selection | None = None
    model: str | None = None


async def _replay(session: Any, history: list[HistoryMessage]) -> None:
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
                await sessions.append_event(session, Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text="[Make the creatives.]")])))
            await sessions.append_event(session, Event(invocation_id=invocation, author=B.root_agent.name, content=types.Content(role="model", parts=[types.Part(text=text)])))
            prev = "model"


def _compact_args(name: str, args: Any) -> Any:
    args = _safe(args)
    if not isinstance(args, dict):
        return args
    out = dict(args)
    if isinstance(out.get("doc"), dict):
        d = out["doc"]
        out["doc"] = {"kind": d.get("kind"), "layers": len(d.get("layers") or []), "shots": len(d.get("video") or [])}
    if isinstance(out.get("ops"), list):
        out["ops"] = [o.get("op") for o in out["ops"] if isinstance(o, dict)]
    if isinstance(out.get("shots"), list):
        out["shots"] = len(out["shots"])
    if isinstance(out.get("concepts"), list):
        out["concepts"] = [c.get("title") for c in out["concepts"] if isinstance(c, dict)]
    return out


def _label(name: str, args: Any) -> str:
    a = args if isinstance(args, dict) else {}
    if name == "write_creative" and a.get("name"):
        return f"Designing {a['name']}"
    if name == "get_audience" and a.get("audience_id"):
        return f"Reading the taste of {a['audience_id']}"
    return B.STATUS_FOR_TOOL.get(name, "Working")


def _summarise(name: str, args: Any, resp: dict[str, Any]) -> str:
    if not isinstance(resp, dict):
        return ""
    if resp.get("ok") is False:
        probs = resp.get("problems") or ([resp["error"]] if resp.get("error") else [])
        return ("; ".join(str(p) for p in probs[:2]))[:160] if probs else "failed"
    a = args if isinstance(args, dict) else {}
    if name == "write_creative":
        extra = f", {len(resp.get('generating') or [])} shots generating ~${resp.get('estimate', 0):.2f}" if resp.get("generating") else ""
        return f"{a.get('format')} for {a.get('audience_id')}{extra}"
    if name == "edit_creative":
        return f"{resp.get('applied', 0)} changes"
    if name == "resize_creative":
        return ", ".join(m.get("format", "") for m in resp.get("made") or [] if m.get("creativeId"))
    if name in ("add_shots", "regenerate_shot", "edit_shot", "extend_shot", "add_music", "add_voiceover", "generate_image"):
        cost = resp.get("estimate", resp.get("cost"))
        return (f"~${cost:.2f}" if isinstance(cost, (int, float)) else "") + (f" on {resp['model']}" if resp.get("model") else "")
    if name == "review_creative":
        return (f"quality {resp.get('quality')}/10, " if resp.get("quality") is not None else "") + f"{len(resp.get('issues') or [])} issues"
    if name == "get_audience":
        tags = resp.get("tags") or {}
        return f"{sum(len(v) for v in tags.values())} tags, {len(resp.get('brands') or [])} brands"
    if name == "search_images":
        return f"{len(resp.get('images') or [])} photos"
    if name in ("qloo_search", "qloo_insights"):
        return ", ".join(str(i.get("name")) for i in (resp.get("results") or resp.get("items") or [])[:4] if isinstance(i, dict))
    if name == "save_concepts":
        return f"{resp.get('saved', 0)} concepts"
    return ""


def _preview(name: str, resp: Any) -> dict[str, Any] | None:
    if not isinstance(resp, dict) or resp.get("ok") is False:
        return None
    if name == "get_audience":
        return pages_preview("get_audience_detail", resp)
    if name in ("search_images", "qloo_search", "qloo_insights"):
        return pages_preview(name, resp)
    if name == "generate_image" and resp.get("url"):
        return {"images": [resp["url"]]}
    if name == "review_creative":
        out = {"notes": [str(i.get("what"))[:160] for i in resp.get("issues") or [] if isinstance(i, dict) and i.get("what")][:3], "images": [resp["screenshot"]] if resp.get("screenshot") else []}
        return {k: v for k, v in out.items() if v} or None
    return None


async def _stream(req: AgentRequest) -> AsyncIterator[bytes]:
    t_start = time.perf_counter()
    spans: list[Span] = start_turn()
    emitted = 0
    message_id = uuid.uuid4().hex[:12]
    cid = req.campaignId
    yield _ndjson({"type": "start", "messageId": message_id})
    yield _ndjson({"type": "status", "text": "Loading the campaign"})
    try:
        state = await B.load_state(cid)
    except Exception as err:
        yield _ndjson({"type": "error", "message": _error(err)})
        return
    message = (req.message or "").strip()
    kind = "edit" if req.kind == "edit" else "generate"
    if kind == "edit" and not message:
        yield _ndjson({"type": "error", "message": "An edit needs a message"})
        return
    state[B.KIND] = kind
    state[B.SELECTION] = req.selection.model_dump() if req.selection else {}
    state[B.WRITES] = 0

    session = await sessions.get_session(app_name=APP_NAME, user_id=cid, session_id=cid)
    attached_urls = [a.url for a in req.attachments]
    if session is None:
        state[B.MEDIA] = attached_urls
        session = await sessions.create_session(app_name=APP_NAME, user_id=cid, session_id=cid, state=state)
        await _replay(session, req.history)
        delta: dict[str, Any] = {}
    else:
        media = list(session.state.get(B.MEDIA) or [])
        delta = {**state, B.MEDIA: media + [u for u in attached_urls if u not in media]}

    user_text = message if kind == "edit" else B.turn_message(state, message)
    parts: list[types.Part] = [types.Part(text=user_text)]
    attached = [p for p in [await _image_part(a.url, a.type) for a in req.attachments[:6]] if p]
    if attached:
        parts.append(types.Part(text=f"{len(attached)} image{'s' if len(attached) != 1 else ''} attached (usable in creatives by URL: {', '.join(attached_urls[:6])}):"))
        parts.extend(attached)

    text_parts: list[str] = []
    streamed = ""
    seen_calls: set[str] = set()
    steps: list[dict[str, Any]] = []
    thought_streamed = 0
    call_args: dict[str, Any] = {}
    question: dict[str, Any] | None = None
    writes = 0

    def at() -> int:
        return int((time.perf_counter() - t_start) * 1000)

    def push(step: dict[str, Any]) -> None:
        if steps and steps[-1].get("kind") in ("thought", "text") and "ms" not in steps[-1]:
            steps[-1]["ms"] = max(0, at() - steps[-1].get("t", at()))
        steps.append({**step, "t": at()})

    def add_text(delta_text: str, kind_: str) -> None:
        if steps and steps[-1].get("kind") == kind_:
            steps[-1]["text"] += delta_text
        else:
            push({"kind": kind_, "text": delta_text})

    try:
        model = req.model if req.model in B.MODELS else B.MODEL
        runner = runners[(model, B.RUNNER_FOR_KIND[kind])]
        async for ev in runner.run_async(user_id=cid, session_id=session.id, new_message=types.Content(role="user", parts=parts), state_delta=delta or None, run_config=RunConfig(streaming_mode=StreamingMode.SSE)):
            while emitted < len(spans):
                yield _ndjson({"type": "span", "span": spans[emitted]})
                emitted += 1
            if not ev.content or not ev.content.parts:
                continue
            for part in ev.content.parts:
                if part.function_call and ev.partial:
                    continue
                if part.function_call:
                    name = part.function_call.name or ""
                    key = part.function_call.id or f"{name}:{json.dumps(_safe(part.function_call.args), sort_keys=True)}"
                    if key in seen_calls:
                        continue
                    seen_calls.add(key)
                    call_args[name] = part.function_call.args
                    if name == "ask_merchant":
                        continue
                    label = _label(name, part.function_call.args)
                    yield _ndjson({"type": "status", "text": label})
                    push({"kind": "tool", "name": name, "label": label, "status": "running"})
                    yield _ndjson({"type": "tool_call", "name": name, "label": label, "args": _compact_args(name, part.function_call.args)})
                elif part.function_response:
                    name = part.function_response.name or ""
                    resp = part.function_response.response or {}
                    ok = bool(resp.get("ok", True))
                    if name == "ask_merchant":
                        if ok:
                            question = {"text": resp.get("question"), "options": resp.get("options") or [], "other": resp.get("other") or ""}
                            push({"kind": "question", "question": question})
                            yield _ndjson({"type": "question", "question": question})
                        continue
                    summary = _summarise(name, call_args.get(name), resp)
                    preview = _preview(name, resp)
                    for st in reversed(steps):
                        if st.get("kind") == "tool" and st.get("name") == name and st.get("status") == "running":
                            st["status"] = "done" if ok else "failed"
                            st["ms"] = max(0, at() - st.get("t", at()))
                            if summary:
                                st["summary"] = summary
                            if preview:
                                st["preview"] = preview
                            break
                    yield _ndjson({"type": "tool_result", "name": name, "ok": ok, "summary": summary, "problems": resp.get("problems"), **({"preview": preview} if preview else {})})
                    fresh = await sessions.get_session(app_name=APP_NAME, user_id=cid, session_id=session.id)
                    w = int(((fresh.state if fresh else {}) or {}).get(B.WRITES) or 0)
                    if w != writes:
                        writes = w
                        yield _ndjson({"type": "doc", "version": w})
                elif part.text and part.thought:
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
        yield _ndjson({"type": "error", "message": _error(err)})

    while emitted < len(spans):
        yield _ndjson({"type": "span", "span": spans[emitted]})
        emitted += 1
    spans.sort(key=lambda sp: sp.get("started", 0))
    full_text = re.sub(r"(\*\*|\*|__)(\S(?:.*?\S)?)\1", r"\2", "\n\n".join(t.strip() for t in text_parts if t.strip()))
    if question and not full_text:
        full_text = str(question.get("text") or "")
    total_ms = at()
    for st in steps:
        if st.get("kind") == "tool" and st.get("status") == "running":
            st["status"] = "failed"
        if "ms" not in st:
            st["ms"] = max(0, total_ms - st.get("t", total_ms))
    yield _ndjson({"type": "done", "messageId": message_id, "text": full_text, "trace": spans, "steps": steps, "totalMs": total_ms, "docVersion": writes})
    asyncio.create_task(_persist(req, message_id, message, full_text, spans, steps))


async def _persist(req: AgentRequest, message_id: str, merchant_text: str, reply: str, spans: list[Span], steps: list[dict[str, Any]]) -> None:
    now = int(time.time() * 1000)
    messages: list[dict[str, Any]] = []
    if merchant_text or req.attachments:
        messages.append({"id": f"{message_id}-m", "role": "merchant", "at": now, "text": merchant_text, **({"attachments": [a.model_dump() for a in req.attachments]} if req.attachments else {})})
    messages.append({"id": message_id, "role": "agent", "at": now + 1, "text": reply, "trace": spans, "steps": steps})
    try:
        await store.post("/media/chat", {"campaignId": req.campaignId, "messages": messages})
    except Exception as err:
        print(f"[slice-media] could not persist the turn: {err}")


@router.post("/agent")
async def agent(req: AgentRequest) -> StreamingResponse:
    return StreamingResponse(_stream(req), media_type="application/x-ndjson")


# --- direct studio actions ------------------------------------------------------------------

# Each action is a builder tool run without a model turn; only these arguments pass through.
ACTIONS: dict[str, tuple[Any, tuple[str, ...]]] = {
    "regenerate_shot": (B.regenerate_shot, ("creative_id", "shot_id", "prompt", "quality", "image", "sound", "says")),
    "edit_shot": (B.edit_shot, ("creative_id", "shot_id", "instruction", "reference_urls")),
    "extend_shot": (B.extend_shot, ("creative_id", "shot_id", "seconds", "prompt")),
    "add_shots": (B.add_shots, ("creative_id", "shots", "after")),
    "add_music": (B.add_music, ("creative_id", "prompt", "volume")),
    "add_voiceover": (B.add_voiceover, ("creative_id", "script", "voice", "style", "start")),
    "generate_image": (B.generate_image, ("prompt", "format", "reference_urls", "quality")),
    "resize_creative": (B.resize_creative, ("creative_id", "formats")),
    "pretest": (I.pretest, ("creative_id", "audience_id")),
    "taste_map": (I.taste_map, ("audience_id", "region")),
}


class ActionRequest(BaseModel):
    campaignId: str
    action: str
    args: dict[str, Any] = {}


@router.post("/action")
async def action(req: ActionRequest) -> dict[str, Any]:
    start_turn()
    entry = ACTIONS.get(req.action)
    if not entry:
        return {"ok": False, "error": f"unknown action {req.action!r}"}
    fn, allowed = entry
    try:
        state = await B.load_state(req.campaignId)
        # Images the merchant can see in the studio (library, products, brand) are fair game.
        state[B.MEDIA] = sorted(B._known_images(state))
        ctx = SimpleNamespace(state=state)
        kwargs = {k: v for k, v in (req.args or {}).items() if k in allowed and v is not None}
        return await fn(tool_context=ctx, **kwargs)
    except TypeError as err:
        return {"ok": False, "error": f"bad arguments: {str(err)[:200]}"}
    except Exception as err:
        return {"ok": False, "error": _error(err)}


class ExportRequest(BaseModel):
    campaignId: str
    creativeId: str


@router.post("/export")
async def export(req: ExportRequest) -> dict[str, Any]:
    start_turn()
    try:
        return {"ok": True, **(await render.export(req.creativeId, req.campaignId))}
    except Exception as err:
        return {"ok": False, "error": _error(err)}
