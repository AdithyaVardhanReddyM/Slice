"""HTTP front door for the concierge agent.

    uv run uvicorn server:app --port 8000 --reload

POST /chat streams newline-delimited JSON events the widget renders as they
arrive: status lines, tool spans, text deltas, product picks, the taste brief,
and a final "done" with the whole turn's trace. Completed turns are written to
Convex so the merchant console can replay them.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, AsyncIterator

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from google.adk.agents.run_config import RunConfig, StreamingMode  # noqa: E402
from google.adk.events import Event  # noqa: E402
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from slice_agent import convex_client as convex  # noqa: E402
from slice_agent import tools as T  # noqa: E402
from slice_agent.agent import root_agent  # noqa: E402
from slice_agent.brief import write_brief  # noqa: E402
from slice_agent.tagging import tag_store  # noqa: E402
from slice_agent.trace import Span, record, start_turn  # noqa: E402

APP_NAME = "slice_concierge"

app = FastAPI(title="Slice concierge agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("AGENT_ALLOW_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = InMemorySessionService()
runner = Runner(app_name=APP_NAME, agent=root_agent, session_service=sessions)


class PageContext(BaseModel):
    url: str | None = None
    path: str | None = None
    title: str | None = None
    product: dict[str, Any] | None = None
    category: str | None = None
    query: str | None = None


class ShownProduct(BaseModel):
    id: str
    name: str = ""


class HistoryMessage(BaseModel):
    role: str  # "shopper" | "concierge"
    text: str = ""
    opener: bool = False
    picks: list[ShownProduct] = []


class ChatRequest(BaseModel):
    session_id: str
    store_key: str
    profile_id: str | None = None
    page: PageContext | None = None
    message: str = ""
    # "open": the shopper just opened the concierge; greet and be proactive.
    kind: str = "user"
    # The widget's transcript, replayed when this server has no memory of the
    # session (it restarted, or the session aged out).
    history: list[HistoryMessage] = []
    # What the shopper did on the site this visit: [{type: view|click|cart, id, at, ms}].
    signals: list[dict[str, Any]] = []


class BriefRequest(BaseModel):
    profile_id: str
    store_key: str


class TagRequest(BaseModel):
    store_key: str
    force: bool = False


OPENER = (
    "[The shopper just opened the concierge. Greet them in one short line. If they have a taste "
    "profile, say in one clause what you noticed about their taste and show 3 picks that fit it. "
    "If they are on a product page, speak to that product first. If there is no profile and they are on "
    "a product page, show 3 things in the same spirit as that product and mention taste tuning once. "
    "If there is no profile and no product, ask in one line what they're looking for and mention taste "
    "tuning once.]"
)

OPENER_RANKED = (
    "\n\nAlready done for you: the catalog is ranked below (anchor product first when there is one). "
    "Do not call set_taste_brief, get_product or recommend_products; your first call is present_picks "
    "with 3 of these candidates, from different subcategories unless the page product makes one obvious. "
    "Then one or two sentences."
)


def _event(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode()


STATUS_FOR_TOOL = {
    "set_taste_brief": "Reading your taste in this store's terms",
    "recommend_products": "Ranking the catalog by your taste",
    "search_catalog": "Searching the catalog",
    "get_product": "Looking at this product",
    "add_taste_signal": "Adding that to your taste graph",
    "present_picks": "Picking the best fits",
}


async def _ensure_session(req: ChatRequest) -> tuple[Any, dict[str, Any], dict[str, Any]]:
    """Returns (session, state delta for this run, the merged state as the run will see it)."""
    store = await T.load_store(req.store_key)
    if not store:
        raise ValueError(f"Unknown store key {req.store_key!r}")
    profile, session_layer = await asyncio.gather(
        T.load_profile(req.profile_id), T.load_session(req.store_key, req.signals)
    )
    state = {
        T.STORE_KEY: req.store_key,
        T.STORE: store,
        T.PROFILE_ID: req.profile_id if profile else None,
        T.PROFILE: profile,
        T.BRIEF: (profile or {}).get("brief"),
        T.PAGE: req.page.model_dump() if req.page else None,
        T.SESSION: session_layer,
        T.PICKS: None,
    }
    session = await sessions.get_session(app_name=APP_NAME, user_id=req.session_id, session_id=req.session_id)
    if session is None:
        if req.history:
            state[T.SHOWN_IDS] = list(dict.fromkeys(p.id for m in req.history for p in m.picks))
        session = await sessions.create_session(
            app_name=APP_NAME, user_id=req.session_id, session_id=req.session_id, state=state
        )
        await _replay(session, req.history)
        return session, {}, dict(state)
    # Existing session: refresh what can change between turns, keep the brief we made.
    delta = {k: v for k, v in state.items() if k not in (T.BRIEF,)}
    if session.state.get(T.PROFILE_ID) != state[T.PROFILE_ID]:
        delta[T.BRIEF] = state[T.BRIEF]
    merged = {**session.state, **delta}
    return session, delta, merged


async def _prepare_opener(state: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Do the retrieval before the model speaks: make sure a brief exists, look at
    the page product, rank the catalog. Returns the extra opener text and the
    state keys the run must start with. Spans go to the current turn's trace."""
    extra: dict[str, Any] = {}
    profile = state.get(T.PROFILE)
    store = state.get(T.STORE) or {}
    if profile and not state.get(T.BRIEF):
        # Older profile without a brief: write it now rather than spending a tool round trip.
        brief, span = await write_brief(store, profile, state.get(T.PROFILE_ID))
        record(span["kind"], span["name"], span["result"], ms=span["ms"], started=span.get("started"))
        if brief:
            state[T.BRIEF] = brief
            extra[T.BRIEF] = brief
    page_product = (state.get(T.PAGE) or {}).get("product") or {}
    anchor_id = page_product.get("id") or page_product.get("sku")
    anchor: dict[str, Any] | None = None
    intent: dict[str, Any] = {}
    if anchor_id:
        t0 = time.perf_counter()
        found = await convex.query("catalog:get", {"storeKey": state.get(T.STORE_KEY), "ids": [str(anchor_id)]})
        if found:
            anchor = T._compact_product(found[0], full=True)
            intent["category"] = found[0]["category"]
            record("catalog", f"Look up {found[0]['name']}", f"{found[0]['subcategory']}, ${found[0]['price']:g}", ms=int((time.perf_counter() - t0) * 1000))
    ranked = await T.rank(state, intent, take=8)
    extra[T.LAST_CANDIDATES] = state.get(T.LAST_CANDIDATES) or {}
    parts = [OPENER_RANKED]
    if anchor:
        parts.append("PRODUCT ON PAGE: " + json.dumps(anchor, ensure_ascii=False))
    ranked_note = ranked.get("ranked_by")
    if ranked_note:
        parts.append("RANKED BY: " + ranked_note)
    if ranked.get("taste_used", {}).get("session"):
        parts.append("THIS VISIT: " + json.dumps(ranked["taste_used"]["session"], ensure_ascii=False))
    parts.append("CANDIDATES: " + json.dumps(ranked.get("candidates", []), ensure_ascii=False))
    return "\n".join(parts), extra


async def _replay(session: Any, history: list[HistoryMessage]) -> None:
    """Seed a fresh session with the widget's transcript as plain user/model turns.
    Openers had no shopper message, so each gets a stand-in so turns alternate."""
    if not history:
        return
    invocation = f"replay-{uuid.uuid4().hex[:8]}"
    prev_role: str | None = None
    for m in history:
        if m.role == "shopper":
            text = m.text.strip()
            if not text:
                continue
            await sessions.append_event(
                session,
                Event(invocation_id=invocation, author="user", content=types.Content(role="user", parts=[types.Part(text=text)])),
            )
            prev_role = "user"
            continue
        if prev_role != "user":
            await sessions.append_event(
                session,
                Event(
                    invocation_id=invocation,
                    author="user",
                    content=types.Content(role="user", parts=[types.Part(text="[The shopper opened the concierge.]")]),
                ),
            )
        text = m.text.strip()
        if m.picks:
            text += "\n[Showed: " + ", ".join(f"{p.name} ({p.id})" for p in m.picks) + "]"
        if not text.strip():
            continue
        await sessions.append_event(
            session,
            Event(
                invocation_id=invocation,
                author=root_agent.name,
                content=types.Content(role="model", parts=[types.Part(text=text)]),
            ),
        )
        prev_role = "model"


async def _stream(req: ChatRequest) -> AsyncIterator[bytes]:
    t_start = time.perf_counter()
    spans: list[Span] = start_turn()
    try:
        session, delta, state = await _ensure_session(req)
    except Exception as err:
        yield _event({"type": "error", "message": str(err)})
        return

    emitted = 0
    text_parts: list[str] = []
    streamed = ""
    picks_sent: list[Any] = []
    brief_sent = None
    message_id = uuid.uuid4().hex[:12]
    seen_calls: set[str] = set()
    yield _event({"type": "start", "messageId": message_id})

    user_text = OPENER if req.kind == "open" else req.message.strip()
    if not user_text:
        yield _event({"type": "error", "message": "Empty message"})
        return
    if req.kind == "open":
        # Retrieval before generation: the model's first call can be present_picks.
        yield _event({"type": "status", "text": "Ranking the catalog by your taste"})
        try:
            opener_extra, extra_state = await _prepare_opener(state)
            user_text += opener_extra
            delta.update(extra_state)
            if extra_state.get(T.BRIEF):
                brief_sent = extra_state[T.BRIEF]
                yield _event({"type": "brief", "brief": brief_sent})
        except Exception as err:
            # Fall back to the tool-driven opener.
            record("slice", "Pre-rank for the opener", f"skipped: {err}", ms=0)
        while emitted < len(spans):
            yield _event({"type": "span", "span": spans[emitted]})
            emitted += 1

    content = types.Content(role="user", parts=[types.Part(text=user_text)])

    try:
        async for ev in runner.run_async(
            user_id=req.session_id,
            session_id=session.id,
            new_message=content,
            state_delta=delta or None,
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
        ):
            # Tool spans recorded since the last event.
            while emitted < len(spans):
                yield _event({"type": "span", "span": spans[emitted]})
                emitted += 1

            if not ev.content or not ev.content.parts:
                continue
            for part in ev.content.parts:
                if part.function_call:
                    name = part.function_call.name or ""
                    call_key = part.function_call.id or f"{name}:{json.dumps(_safe(part.function_call.args), sort_keys=True)}"
                    if call_key in seen_calls:
                        continue
                    seen_calls.add(call_key)
                    yield _event({"type": "status", "text": STATUS_FOR_TOOL.get(name, "Working")})
                    yield _event({"type": "tool_call", "name": name, "args": _safe(part.function_call.args)})
                elif part.function_response:
                    name = part.function_response.name or ""
                    resp = part.function_response.response or {}
                    yield _event({"type": "tool_result", "name": name, "ok": bool(resp.get("ok", True))})
                    fresh = await sessions.get_session(
                        app_name=APP_NAME, user_id=req.session_id, session_id=session.id
                    )
                    st = fresh.state if fresh else {}
                    if name == "present_picks" and st.get(T.PICKS):
                        picks_sent = st.get(T.PICKS)
                        yield _event({"type": "picks", "picks": picks_sent})
                    if name == "set_taste_brief" and st.get(T.BRIEF):
                        brief_sent = st.get(T.BRIEF)
                        yield _event({"type": "brief", "brief": brief_sent})
                    if name == "add_taste_signal" and resp.get("ok"):
                        yield _event({"type": "profile_changed", "added": resp.get("added")})
                elif part.text and not part.thought:
                    if ev.partial:
                        streamed += part.text
                        yield _event({"type": "text", "delta": part.text})
                    else:
                        # Final (aggregated) text for this model turn.
                        if streamed and part.text.startswith(streamed[: min(len(streamed), 40)]):
                            text_parts.append(part.text)
                            yield _event({"type": "text_done", "text": part.text})
                        elif part.text.strip():
                            text_parts.append(part.text)
                            yield _event({"type": "text", "delta": part.text})
                            yield _event({"type": "text_done", "text": part.text})
                        streamed = ""
    except Exception as err:  # surface model/tool failures to the widget
        yield _event({"type": "error", "message": f"{type(err).__name__}: {err}"})

    while emitted < len(spans):
        yield _event({"type": "span", "span": spans[emitted]})
        emitted += 1

    total_ms = int((time.perf_counter() - t_start) * 1000)
    spans.sort(key=lambda sp: sp.get("started", 0))
    full_text = "\n\n".join(t.strip() for t in text_parts if t.strip())
    yield _event({"type": "done", "messageId": message_id, "text": full_text, "trace": spans, "totalMs": total_ms})

    asyncio.create_task(_persist(req, message_id, user_text, full_text, picks_sent, spans))


def _safe(args: Any) -> Any:
    try:
        json.dumps(args)
        return args
    except TypeError:
        return str(args)


async def _persist(
    req: ChatRequest, message_id: str, user_text: str, reply: str, picks: list[Any], spans: list[Span]
) -> None:
    now = int(time.time() * 1000)
    page = (req.page.path or req.page.url) if req.page else None
    messages: list[dict[str, Any]] = []
    if req.kind != "open":
        messages.append({"id": f"{message_id}-u", "role": "shopper", "at": now, "text": user_text, "page": page})
    messages.append(
        {
            "id": message_id,
            "role": "concierge",
            "at": now + 1,
            "text": reply,
            "page": page,
            "picks": picks or None,
            "trace": spans,
        }
    )
    try:
        await convex.site(
            "/agent/messages",
            {
                "sessionId": req.session_id,
                "storeKey": req.store_key,
                "profileId": req.profile_id,
                "messages": messages,
            },
        )
    except Exception as err:
        print(f"[slice] could not persist turn: {err}")


@app.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(_stream(req), media_type="application/x-ndjson")


@app.post("/brief")
async def brief(req: BriefRequest) -> dict[str, Any]:
    """Write the taste brief for a freshly built profile, so the first chat turn
    doesn't pay for it. Called by the web app from the build screen."""
    store = await T.load_store(req.store_key)
    profile = await T.load_profile(req.profile_id)
    if not store or not profile:
        return {"ok": False, "error": "unknown store or profile"}
    brief, span = await write_brief(store, profile, req.profile_id)
    return {"ok": bool(brief), "brief": brief, "span": span}


@app.post("/catalog/tag")
async def catalog_tag(req: TagRequest) -> dict[str, Any]:
    """Describe a store's products in Qloo's tag vocabulary (see slice_agent/tagging.py)."""
    return await tag_store(req.store_key, force=req.force)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "model": root_agent.model}
