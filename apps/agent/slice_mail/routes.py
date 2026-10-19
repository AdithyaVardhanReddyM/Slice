"""FastAPI routes for the Email service (registered in server.py).

POST /email/setup        {brandId, url}                                           {ok, error?}
POST /email/build        {campaignId, kind, message?, history?, attachments?, blocks?, model?}   NDJSON stream
POST /email/personalise  {campaignId, contactIds?, audienceIds?}                  {ok, total}
POST /email/subjects     {campaignId}                                             {options}
POST /email/name-groups  {listId}                                                 {names}

The build stream speaks the /pages/build protocol (start, status, span, thought,
text, text_done, tool_call, tool_result, question, doc, error, done) so the console
reuses lib/pages/stream.ts and the Pages build steps. `doc` carries only the version:
the console reads the doc from Convex.
"""

from __future__ import annotations

import asyncio
import json
import re
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

from slice_agent.trace import Span, start_turn
from slice_pages.routes import CARRY_ON, FIRST_S, STALL_S, Stalled, _image_part, _ndjson, _preview as pages_preview, _safe, _timed_out, _within

from . import builder as B
from . import doc as D
from . import store
from .groups import name_groups
from .personalise import start_personalise
from .setup import run_setup
from .subjects import suggest_subjects

router = APIRouter(prefix="/email", tags=["email"])

APP_NAME = "slice_email"
sessions = InMemorySessionService()
# One runner per model and thinking level over the same sessions, so the merchant can switch
# models mid-chat and edits run lighter than new emails.
runners = {key: Runner(app_name=APP_NAME, agent=a, session_service=sessions) for key, a in B.agents.items()}
# The doc version each campaign's conversation last saw, to notice the merchant's hand edits.
_seen_version: dict[str, int] = {}
# The reply each campaign's conversation last gave, to notice a saved chat rewritten outside it.
_last_reply: dict[str, str] = {}


def _error(err: Exception) -> str:
    return f"{type(err).__name__}: {str(err)[:300]}"


# --- setup, personalise, subjects, group names ---------------------------------------


class SetupRequest(BaseModel):
    brandId: str
    url: str


@router.post("/setup")
async def setup(req: SetupRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        return {**(await run_setup(req.brandId, req.url)), "trace": spans}
    except Exception as err:
        return {"ok": False, "error": _error(err), "trace": spans}


class PersonaliseRequest(BaseModel):
    """Every group and person ticked, or only the ones named."""

    campaignId: str
    contactIds: list[str] | None = None
    audienceIds: list[str] | None = None


@router.post("/personalise")
async def personalise(req: PersonaliseRequest) -> dict[str, Any]:
    start_turn()
    try:
        return await start_personalise(req.campaignId, req.contactIds, req.audienceIds)
    except Exception as err:
        return {"ok": False, "error": _error(err)}


class CampaignRequest(BaseModel):
    campaignId: str


@router.post("/subjects")
async def subjects(req: CampaignRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        return {**(await suggest_subjects(req.campaignId)), "trace": spans}
    except Exception as err:
        return {"ok": False, "options": [], "error": _error(err), "trace": spans}


class NameGroupsRequest(BaseModel):
    listId: str


@router.post("/name-groups")
async def name_groups_route(req: NameGroupsRequest) -> dict[str, Any]:
    spans = start_turn()
    try:
        return {**(await name_groups(req.listId)), "trace": spans}
    except Exception as err:
        return {"ok": False, "names": [], "error": _error(err), "trace": spans}


# --- builder -----------------------------------------------------------------------


class HistoryMessage(BaseModel):
    role: str  # "merchant" | "agent"
    text: str = ""


class Attachment(BaseModel):
    url: str
    name: str = ""
    type: str = "image/png"


class PickedBlock(BaseModel):
    """A block the merchant picked in the editor; the message refers to it as "[label]"."""

    id: str
    label: str = ""
    type: str = ""
    text: str = ""


class BuildRequest(BaseModel):
    campaignId: str
    kind: str = "generate"  # "generate" | "edit"
    message: str | None = None
    history: list[HistoryMessage] = []
    attachments: list[Attachment] = []
    blocks: list[PickedBlock] = []
    model: str | None = None  # one of builder.MODELS; defaults to builder.MODEL


def _blocks_note(blocks: list[PickedBlock], doc: dict[str, Any]) -> str:
    lines = ["[The merchant picked these blocks in the editor; the message refers to each by its [label]:"]
    for i, b in enumerate(blocks[:8], 1):
        found = D.find_block(doc, b.id)
        where = f' in the "{found[2].get("label") or found[2].get("id")}" section' if found else " (no longer in the email)"
        text = f', text "{b.text[:240]}"' if b.text.strip() else ""
        lines.append(f"{i}. [{b.label or b.type}]: {b.type or (found[0].get('type') if found else 'block')} block {b.id}{where}{text}")
    lines.append("Work on exactly these blocks (or answer about them), with edit_email ops on those ids.]")
    return "\n".join(lines)


async def _replay(session: Any, history: list[HistoryMessage]) -> None:
    """Seed a fresh session with the saved chat as plain user/model turns."""
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
                await sessions.append_event(session, Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text="[Write this email.]")])))
            await sessions.append_event(session, Event(invocation_id=invocation, author=B.root_agent.name, content=types.Content(role="model", parts=[types.Part(text=text)])))
            prev = "model"


def _label(name: str, args: Any) -> str:
    if name == "add_section" and isinstance(args, dict):
        sec = args.get("section")
        if isinstance(sec, str):
            try:
                sec = json.loads(sec)
            except Exception:
                sec = None
        if isinstance(sec, dict) and sec.get("label"):
            return f"Adding the {str(sec['label']).lower()} section"
    return B.STATUS_FOR_TOOL.get(name, "Working")


def _compact_args(name: str, args: Any) -> Any:
    """Tool arguments small enough for the chat step: sections and ops are summarised."""
    args = _safe(args)
    if not isinstance(args, dict):
        return args
    out = dict(args)
    if name == "add_section" and isinstance(out.get("section"), dict):
        sec = out["section"]
        out["section"] = {"label": sec.get("label"), "blocks": sum(len(c.get("blocks") or []) for c in sec.get("columns") or [] if isinstance(c, dict))}
    if name == "edit_email" and isinstance(out.get("ops"), list):
        out["ops"] = [o.get("op") for o in out["ops"] if isinstance(o, dict)]
    return out


def _summarise(name: str, args: Any, resp: dict[str, Any]) -> str:
    """One line for the chat's tool step: what came back."""
    if not isinstance(resp, dict):
        return ""
    if resp.get("ok") is False:
        probs = resp.get("problems") or ([resp["error"]] if resp.get("error") else [])
        return ("; ".join(str(p) for p in probs[:2]))[:160] if probs else "failed"
    a = args if isinstance(args, dict) else {}
    if name == "start_email":
        return str(a.get("subject") or "")[:120]
    if name == "add_section":
        return (str(resp.get("section") or "").strip().split("\n")[-1])[:160]
    if name == "edit_email":
        n = resp.get("applied") or 0
        return f"{n} change{'s' if n != 1 else ''}"
    if name == "pick_items":
        return ", ".join(i.get("name", "") for i in (resp.get("items") or [])[:4])
    if name == "list_items":
        return f"{resp.get('total', 0)} items"
    if name == "search_images":
        return f"{len(resp.get('images') or [])} photos" + (f" for \"{a.get('query')}\"" if a.get("query") else "")
    if name == "get_audience" and resp.get("kind") == "versions":
        return f"{len(resp.get('groups') or [])} taste groups, {len(resp.get('people') or [])} people"
    if name == "get_audience":
        tags = resp.get("tags") or {}
        return f"{sum(len(v) for v in tags.values())} tags, {len(resp.get('brands') or [])} brands, {sum(len(v) for v in (resp.get('culture') or {}).values())} culture refs" + (f", {len(resp['people'])} people" if resp.get("people") else "")
    if name == "review_email":
        n = len(resp.get("issues") or [])
        return (f"quality {resp.get('quality')}/10, " if resp.get("quality") is not None else "") + f"{n} issue{'s' if n != 1 else ''}"
    if name in ("qloo_search", "qloo_insights"):
        return ", ".join(str(i.get("name")) for i in (resp.get("results") or resp.get("items") or [])[:4] if isinstance(i, dict))
    return ""


def _preview(name: str, resp: Any) -> dict[str, Any] | None:
    """Photos, faces and words for the chat step and the building canvas."""
    if not isinstance(resp, dict) or resp.get("ok") is False:
        return None
    if name == "get_audience":
        return pages_preview("get_audience_detail", resp)
    if name in ("pick_items", "search_images", "qloo_search", "qloo_insights"):
        return pages_preview(name, resp)
    if name == "review_email":
        out = {"notes": [str(i.get("what"))[:160] for i in resp.get("issues") or [] if isinstance(i, dict) and i.get("what")][:3], "images": [resp["screenshot"]] if resp.get("screenshot") else []}
        return {k: v for k, v in out.items() if v} or None
    if name == "add_section" and resp.get("section"):
        return {"chips": [str(resp["section"]).strip().split("\n")[0][:80]]}
    return None


async def _build_stream(req: BuildRequest) -> AsyncIterator[bytes]:
    t_start = time.perf_counter()
    spans: list[Span] = start_turn()
    emitted = 0
    message_id = uuid.uuid4().hex[:12]
    cid = req.campaignId
    yield _ndjson({"type": "start", "messageId": message_id})
    yield _ndjson({"type": "status", "text": "Loading the brand, the email and the audience"})
    try:
        state = await B.load_state(cid)
    except Exception as err:
        yield _ndjson({"type": "error", "message": _error(err)})
        return
    message = (req.message or "").strip()
    if req.kind == "edit":
        if not message:
            yield _ndjson({"type": "error", "message": "An edit needs a message"})
            return
        kind = "edit"
    else:
        # A designed template's first turn adapts it rather than starting over.
        first = not any(m.role == "agent" and m.text.strip() for m in req.history)
        kind = "adapt" if first and B.has_template_content(state) else "generate"
    state[B.KIND] = kind
    while emitted < len(spans):
        yield _ndjson({"type": "span", "span": spans[emitted]})
        emitted += 1

    session = await sessions.get_session(app_name=APP_NAME, user_id=cid, session_id=cid)
    saved_reply = next((m.text.strip() for m in reversed(req.history) if m.role == "agent" and m.text.strip()), "")
    if session is not None and _last_reply.get(cid, "") != saved_reply:
        # The saved chat isn't the one this session lived (rewritten or replaced outside it): what the
        # session remembers doing is no longer true, so start again from the saved chat and the email as it is.
        await sessions.delete_session(app_name=APP_NAME, user_id=cid, session_id=cid)
        session = None
    fresh_session = session is None
    version = int(state.get(B.DOC_VERSION) or 0)
    # Links the merchant gave (brief, messages) are real links the email may use.
    given_links = set(state.get(B.LINKS) or []) | set(D.urls_in(message))
    for m in req.history:
        if m.role == "merchant":
            given_links |= set(D.urls_in(m.text))
    # What the merchant said this conversation: offers and policies in the copy must rest on it.
    state[B.SAID] = "\n".join([m.text for m in req.history if m.role == "merchant"] + [message])[-8000:]
    # Pictures the merchant attached may go into the email.
    attached_urls = [a.url for a in req.attachments]
    if session is None:
        state[B.LINKS] = sorted(given_links)
        state[B.MEDIA] = attached_urls
        session = await sessions.create_session(app_name=APP_NAME, user_id=cid, session_id=cid, state=state)
        await _replay(session, req.history)
        delta: dict[str, Any] = {}
    else:
        media = list(session.state.get(B.MEDIA) or [])
        delta = {**state, B.LINKS: sorted(given_links | set(session.state.get(B.LINKS) or [])), B.MEDIA: media + [u for u in attached_urls if u not in media]}

    if kind == "edit":
        user_text = message
        merchant_text = message
    else:
        user_text = B.turn_message(state, kind, message)
        # An automatic first build (no note from the merchant) gets no merchant bubble in the chat.
        merchant_text = message
    if not fresh_session and _seen_version.get(cid) not in (None, version):
        user_text += "\n\n[The email changed in the editor since your last turn (the merchant's own edits). CURRENT EMAIL is up to date: use its ids, and keep their changes.]"
    if req.blocks:
        user_text += "\n\n" + _blocks_note(req.blocks, state.get(B.DOC) or {})
    parts: list[types.Part] = [types.Part(text=user_text)]
    attached = [p for p in [await _image_part(a.url, a.type) for a in req.attachments[:6]] if p]
    if attached:
        parts.append(types.Part(text=f"{len(attached)} image{'s' if len(attached) != 1 else ''} attached to this message (each can go into the email by its URL: {', '.join(a.url for a in req.attachments[:6])}):"))
        parts.extend(attached)
    content = types.Content(role="user", parts=parts)

    doc_version = version
    text_parts: list[str] = []
    streamed = ""
    seen_calls: set[str] = set()
    steps: list[dict[str, Any]] = []
    thought_streamed = 0
    call_args: dict[str, Any] = {}
    question: dict[str, Any] | None = None
    wrote = False

    def at() -> int:
        return int((time.perf_counter() - t_start) * 1000)

    def push(step: dict[str, Any]) -> None:
        # A thought or reply ends where the next step begins.
        if steps and steps[-1].get("kind") in ("thought", "text") and "ms" not in steps[-1]:
            steps[-1]["ms"] = max(0, at() - steps[-1].get("t", at()))
        steps.append({**step, "t": at()})

    def add_text(delta_text: str, kind_: str) -> None:
        if steps and steps[-1].get("kind") == kind_:
            steps[-1]["text"] += delta_text
        else:
            push({"kind": kind_, "text": delta_text})

    model = req.model if req.model in B.MODELS else B.MODEL
    runner = runners[(model, B.RUNNER_FOR_KIND[kind])]

    async def events() -> AsyncIterator[Any]:
        """The turn's events; None marks a retry. A model call that hangs or times out is tried
        again once: from the start when nothing came back, else asked to carry on from its last step."""
        nonlocal delta
        message_in = content
        # The session as it should be, should the turn start over in a new one.
        restart = {**state, **delta}
        for attempt in (1, 2):
            got = False
            try:
                async for ev in _within(runner.run_async(user_id=cid, session_id=cid, new_message=message_in, state_delta=delta or None, run_config=RunConfig(streaming_mode=StreamingMode.SSE)), STALL_S, first=FIRST_S):
                    got = True
                    yield ev
                return
            except Exception as err:
                if attempt == 2 or not (isinstance(err, Stalled) or _timed_out(err)):
                    raise
            yield None
            if got:
                # The work so far is in the session; ask for the rest.
                message_in = types.Content(role="user", parts=[types.Part(text=CARRY_ON)])
                delta = {}
                continue
            # Nothing came back: a fresh session, so the message is not in the conversation twice.
            await sessions.delete_session(app_name=APP_NAME, user_id=cid, session_id=cid)
            fresh = await sessions.create_session(app_name=APP_NAME, user_id=cid, session_id=cid, state=restart)
            await _replay(fresh, req.history)
            delta = {}

    try:
        async for ev in events():
            if ev is None:
                # A retry: what was in flight is over, and the next answer starts afresh.
                for st in steps:
                    if st.get("kind") == "tool" and st.get("status") == "running":
                        st["status"] = "failed"
                        st["ms"] = max(0, at() - st.get("t", at()))
                        yield _ndjson({"type": "tool_result", "name": st.get("name"), "ok": False, "summary": "the connection dropped"})
                streamed, thought_streamed = "", 0
                yield _ndjson({"type": "status", "text": "The model was slow to answer, carrying on"})
                continue
            while emitted < len(spans):
                yield _ndjson({"type": "span", "span": spans[emitted]})
                emitted += 1
            if not ev.content or not ev.content.parts:
                continue
            for part in ev.content.parts:
                if part.function_call and ev.partial:
                    continue  # the complete call follows
                if part.function_call:
                    name = part.function_call.name or ""
                    key = part.function_call.id or f"{name}:{json.dumps(_safe(part.function_call.args), sort_keys=True)}"
                    if key in seen_calls:
                        continue
                    seen_calls.add(key)
                    call_args[name] = part.function_call.args
                    if name == "ask_merchant":
                        continue  # shown as the question once it returns
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
                    v = int(((fresh.state if fresh else {}) or {}).get(B.DOC_VERSION) or 0)
                    if v != doc_version:
                        doc_version = v
                        wrote = True
                        yield _ndjson({"type": "doc", "version": v})
                elif part.text and part.thought:
                    # Reasoning summaries (include_thoughts): streamed for the chat, never part of the reply.
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
        if isinstance(err, Stalled) or _timed_out(err):
            yield _ndjson({"type": "error", "message": "The model stopped answering, so this turn was stopped. What it saved is in the email; ask again to carry on."})
        else:
            yield _ndjson({"type": "error", "message": _error(err)})

    while emitted < len(spans):
        yield _ndjson({"type": "span", "span": spans[emitted]})
        emitted += 1
    spans.sort(key=lambda sp: sp.get("started", 0))
    # Replies are plain text in the chat; markdown emphasis slips through now and then.
    full_text = re.sub(r"(\*\*|\*|__)(\S(?:.*?\S)?)\1", r"\2", "\n\n".join(t.strip() for t in text_parts if t.strip()))
    # A turn that ends on a question: the question is the reply (and what the history replays).
    if question and not full_text:
        full_text = str(question.get("text") or "")
    total_ms = int((time.perf_counter() - t_start) * 1000)
    if kind != "edit" and not wrote and not question:
        yield _ndjson({"type": "error", "message": "The builder finished without writing the email"})
    for st in steps:
        if st.get("kind") == "tool" and st.get("status") == "running":
            st["status"] = "failed"
        if "ms" not in st:
            st["ms"] = max(0, total_ms - st.get("t", total_ms))
    _seen_version[cid] = doc_version
    _last_reply[cid] = full_text.strip()
    yield _ndjson({"type": "done", "messageId": message_id, "text": full_text, "trace": spans, "steps": steps, "totalMs": total_ms, "docVersion": doc_version})
    asyncio.create_task(_persist(req, message_id, merchant_text, full_text, spans, steps))


async def _persist(req: BuildRequest, message_id: str, merchant_text: str, reply: str, spans: list[Span], steps: list[dict[str, Any]]) -> None:
    now = int(time.time() * 1000)
    messages: list[dict[str, Any]] = []
    if merchant_text or req.attachments:
        messages.append(
            {
                "id": f"{message_id}-m",
                "role": "merchant",
                "at": now,
                "text": merchant_text,
                **({"attachments": [a.model_dump() for a in req.attachments]} if req.attachments else {}),
                **({"blocks": [{"id": b.id, "label": b.label, "type": b.type} for b in req.blocks[:8]]} if req.blocks else {}),
            }
        )
    messages.append({"id": message_id, "role": "agent", "at": now + 1, "text": reply, "trace": spans, "steps": steps})
    try:
        await store.post("/email/chat", {"campaignId": req.campaignId, "messages": messages})
    except Exception as err:
        print(f"[slice-email] could not persist build turn: {err}")


@router.post("/build")
async def build(req: BuildRequest) -> StreamingResponse:
    return StreamingResponse(_build_stream(req), media_type="application/x-ndjson")
