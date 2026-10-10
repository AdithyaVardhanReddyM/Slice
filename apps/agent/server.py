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
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from slice_agent import convex_client as convex  # noqa: E402
from slice_agent import tools as T  # noqa: E402
from slice_agent.agent import root_agent  # noqa: E402
from slice_agent.trace import Span, start_turn  # noqa: E402

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


class ChatRequest(BaseModel):
    session_id: str
    store_key: str
    profile_id: str | None = None
    page: PageContext | None = None
    message: str = ""
    # "open": the shopper just opened the concierge; greet and be proactive.
    kind: str = "user"


OPENER = (
    "[The shopper just opened the concierge. Greet them in one short line. If they have a taste "
    "profile, say in one clause what you noticed about their taste and show 3 picks that fit it. "
    "If they are on a product page, speak to that product first. If there is no profile, ask in one "
    "line what they're looking for and mention taste tuning once.]"
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


async def _ensure_session(req: ChatRequest) -> Any:
    store = await T.load_store(req.store_key)
    if not store:
        raise ValueError(f"Unknown store key {req.store_key!r}")
    profile = await T.load_profile(req.profile_id)
    state = {
        T.STORE_KEY: req.store_key,
        T.STORE: store,
        T.PROFILE_ID: req.profile_id if profile else None,
        T.PROFILE: profile,
        T.BRIEF: (profile or {}).get("brief"),
        T.PAGE: req.page.model_dump() if req.page else None,
        T.PICKS: None,
    }
    session = await sessions.get_session(app_name=APP_NAME, user_id=req.session_id, session_id=req.session_id)
    if session is None:
        session = await sessions.create_session(
            app_name=APP_NAME, user_id=req.session_id, session_id=req.session_id, state=state
        )
        return session, {}
    # Existing session: refresh what can change between turns, keep the brief we made.
    delta = {k: v for k, v in state.items() if k not in (T.BRIEF,)}
    if session.state.get(T.PROFILE_ID) != state[T.PROFILE_ID]:
        delta[T.BRIEF] = state[T.BRIEF]
    return session, delta


async def _stream(req: ChatRequest) -> AsyncIterator[bytes]:
    t_start = time.perf_counter()
    try:
        session, delta = await _ensure_session(req)
    except Exception as err:
        yield _event({"type": "error", "message": str(err)})
        return

    spans: list[Span] = start_turn()
    emitted = 0
    text_parts: list[str] = []
    streamed = ""
    picks_sent: list[Any] = []
    brief_sent = None
    message_id = uuid.uuid4().hex[:12]
    seen_calls: set[str] = set()

    user_text = OPENER if req.kind == "open" else req.message.strip()
    if not user_text:
        yield _event({"type": "error", "message": "Empty message"})
        return

    content = types.Content(role="user", parts=[types.Part(text=user_text)])
    yield _event({"type": "start", "messageId": message_id})

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


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "model": root_agent.model}
