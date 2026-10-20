"""The worker: the agent that does the real work of a task.

gemini-3.8-flash with low thinking, in its own ADK session per task (a
follow-up on the same task reuses it, so it remembers what it did). It has
every heavy tool: Qloo taste tools (taste.py), the Mac's data and actions
(mac_tools.py), the user's cloud accounts (accounts.py) and the operator for
anything on screen (computer.py).

Measured 2026-10-20: a step takes 2-3 s on gemini-3.8-flash, but the project's
shared quota sometimes answers 429, and the default retries turned that into
20-60 s waits. So a rate-limited call fails fast and moves to the next model
in FALLBACKS. ADK's ModelConsultTool (a stronger advisor, Gemini 4 Argon)
added ~50 s per consult, too slow for a voice assistant, so it isn't used.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
import time
from typing import Any
from zoneinfo import ZoneInfo

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import Gemini, LlmRequest, LlmResponse
from google.genai import types

from . import accounts, lens, mac_tools, plans, taste
from .connection import Connection, for_worker, register_worker, report
from .computer import operate_computer, shop_for
from .tasks import Task

WORKER_MODEL = os.environ.get("MAC_WORKER_MODEL", "gemini-3.8-flash")
FALLBACKS = [m for m in os.environ.get("MAC_WORKER_FALLBACKS", "gemini-3.6-flash,gemini-3.7-flash").split(",") if m]
# Low keeps each step to a few seconds (MINIMAL isn't supported on 3.8 Flash).
THINKING = os.environ.get("MAC_WORKER_THINKING", "LOW")
APP_NAME = "slice_mac_worker"
DEBUG = bool(os.environ.get("MAC_DEBUG"))


def _instruction(ctx: ReadonlyContext) -> str:
    s = ctx.state
    return f"""\
You are Slice's worker. The voice assistant handed you a task from the user;
do it fully, then report back in a few spoken words. Today is {s.get('now')}
({s.get('timezone') or 'local time'}).

Who the user is: {s.get('profile_summary')}
Saved people (their tastes are known): {s.get('people') or 'none yet'}.
What's in front of them: {s.get('front') or 'unknown'}.

How to work:
- Taste first. Every recommendation (film, music, book, place, gift…) comes
  from `recommend`, ranked by Qloo for this user's taste; never suggest
  something from your own knowledge. Explain a pick from its Qloo details
  and what the user loves. For two people, use compare_tastes and
  recommend(for_person="Name and me").
- Use the user's own data before asking: calendar, contacts, mail, Slack.
  Ask the user (ask_user) only for what no tool can tell you, one question
  at a time.
- Do what the task asks and no more: don't book, buy, send or post unless
  the task asks for it; offer it in your answer instead.
- Tools that send, book, post or change something ask the user themselves;
  don't ask again first.
- For a website or app with no tool (Resy, OpenTable, a shop), use
  operate_computer with one precise job that includes every detail.
- An app isn't connected? Call connect_app, then carry on.
- When you recommend things, show them with show_cards (tools that say they
  show a card already did). Card text is plain words with commas; never
  "·" or "|" between words.
- Never pay for anything: shop_for and operate_computer stop before payment.
- Finish with one to three short sentences that will be read aloud: what
  you did or found, and what's next. No lists, links, ids or markdown.

Playbooks (use the one that fits; skip what the user already told you):
- A trip ("plan my Lisbon trip"): find_trip_emails for the flight and hotel
  (or ask the dates and where they stay); taste_map for the city; weather;
  plan_walkable_day for each day from the hotel (indoor stops if it rains);
  shows_for_me on those dates; offer to book one dinner on the restaurant's
  own page (operate_computer), add_plan_to_calendar, and message the plan to
  a friend with a dinner from recommend(for_person="Sam and me").
- Someone else ("my dad Ray is 74, uses a walker, loves…"): remember_person
  with age, home, needs and relation first; then recommend(for_person=...)
  for what to watch (movie or tv_show), listen to (podcast) and where to go
  (a place near their home; step-free follows their needs); show_cards; if
  they'd like it on paper, make_printout (large print), then offer to send
  it (send_file_imessage, draft_email_in_mail) and to repeat_weekly.
- A gift ("Maya's birthday is on the 29th"): learn_taste_from_screen if her
  profile is open, else remember_person; gift_ideas; when the user picks one,
  shop_for it on the brand's site with the date it must arrive by; offer a
  card written around one thing they love (show_note) and a reminder to wrap
  it (add_plan_to_calendar).
- A day out ("plan my Saturday, Sam joins after 2"): calendar_events for the
  day; weather; the morning with plan_walkable_day near home for the user;
  compare_tastes, then the afternoon for "Sam and me"; shows_for_me that
  evening for "Sam and me"; dinner near the venue with recommend(near=<venue
  address>, genre=restaurant, also_like=<the act>, for_person="Sam and me");
  show_day_plan with everything in order; offer to message the friend (in
  words that suit their taste), add it to the calendar, book dinner and open
  the ticket page.
- "Which of these would I love?" about the screen: rank_screen.
"""


async def ask_user(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Ask the user one question and wait for the answer (the voice assistant asks it out loud).

    Args:
        question: A short, specific question.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    return {"answer": await conn.tasks.ask(task, question)}


async def show_cards(cards_json: str, tool_context: ToolContext) -> dict[str, Any]:
    """Show results as cards in the island (up to 6).

    Args:
        cards_json: A JSON list of {"title", "subtitle", "image", "url", "reason", "tag"}; image is a
            URL from the tool results, reason is one short line on why it fits, tag is a one-word
            label ("Watch", "Listen", "Lunch").
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    try:
        cards = json.loads(cards_json)
    except json.JSONDecodeError as err:
        return {"error": f"cards_json isn't valid JSON: {err}"}
    # Card copy reads as plain words: "1985, film", never "1985 · Film".
    clean = [
        {k: re.sub(r"\s*[·•|]\s*", ", ", str(c[k]))[:200] if k not in ("image", "url") else str(c[k])[:300]
         for k in ("title", "subtitle", "image", "url", "reason", "tag") if isinstance(c, dict) and c.get(k)}
        for c in cards if isinstance(c, dict) and c.get("title")
    ]
    conn.tasks.show_cards(task, clean)
    await report(conn, task, "slice", f"Showed {len(clean)} picks")
    return {"shown": len(clean)}


async def show_note(title: str, text: str, tool_context: ToolContext) -> dict[str, Any]:
    """Show a piece of writing in the island with a Copy button: a birthday card, a message to
    send, a toast.

    Args:
        title: "Card for Maya".
        text: The words, as they'd be written.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    conn.tasks.show_view(task, {"type": "note", "key": title, "title": title, "text": text})
    await report(conn, task, "slice", f"Wrote {title}")
    return {"shown": True}


# A step slower than this is usually stuck behind the shared quota; try the next model.
STEP_TIMEOUT_S = 25.0


def _rate_limited(err: Exception) -> bool:
    return isinstance(err, TimeoutError) or "RESOURCE_EXHAUSTED" in str(err) or getattr(err, "code", None) == 429


class FallbackGemini(Gemini):
    """Gemini that moves to the next model when one is rate-limited, instead of waiting."""

    fallbacks: list[str] = []

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):  # type: ignore[override]
        models = [llm_request.model or self.model, *self.fallbacks]
        for i, name in enumerate(models):
            llm_request.model = name
            try:
                # Not streamed, so the whole answer arrives at once and can be timed out as one.
                responses = await asyncio.wait_for(_collect(super().generate_content_async(llm_request, stream)), STEP_TIMEOUT_S)
                for response in responses:
                    yield response
                return
            except Exception as err:
                if i == len(models) - 1 or not _rate_limited(err):
                    raise
                print(f"mac: {name} is rate-limited, trying {models[i + 1]}", flush=True)


async def _collect(gen: Any) -> list[LlmResponse]:
    return [response async for response in gen]


def tool_failed(tool: Any, args: dict[str, Any], tool_context: ToolContext, error: Exception) -> dict[str, Any]:
    """A tool that raises would end the whole task (or the talker's Live session); hand the error
    to the model instead so it can carry on or say what didn't work."""
    print(f"mac: tool {getattr(tool, 'name', tool)} failed: {type(error).__name__}: {error}", flush=True)
    busy = "429" in str(error) or "Rate limit" in str(error)
    return {"error": "Qloo is busy right now; try again in a moment." if busy else f"{type(error).__name__}: {str(error)[:300]}"}


def _before_model(callback_context: CallbackContext, llm_request: LlmRequest) -> None:
    callback_context.state["temp:model_started"] = time.monotonic()


def _after_model(callback_context: CallbackContext, llm_response: LlmResponse) -> None:
    if DEBUG:
        took = time.monotonic() - (callback_context.state.get("temp:model_started") or time.monotonic())
        usage = llm_response.usage_metadata
        tokens = f"{usage.prompt_token_count} in, {usage.candidates_token_count} out" if usage else ""
        print(f"mac: worker model call {took:4.1f}s {tokens}", flush=True)


worker_agent = Agent(
    name="slice_worker",
    model=FallbackGemini(
        model=WORKER_MODEL,
        fallbacks=FALLBACKS,
        retry_options=types.HttpRetryOptions(attempts=1),
    ),
    before_model_callback=_before_model,
    after_model_callback=_after_model,
    on_tool_error_callback=tool_failed,
    instruction=_instruction,
    tools=[
        ask_user, show_cards, show_note, *taste.TOOLS, *plans.TOOLS, *lens.WORKER_TOOLS, *mac_tools.TOOLS,
        *accounts.TOOLS, operate_computer, shop_for,
    ],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(THINKING.upper())),
    ),
)
_sessions = InMemorySessionService()
_runner = Runner(app_name=APP_NAME, agent=worker_agent, session_service=_sessions)


def _now(timezone: str | None) -> str:
    try:
        now = dt.datetime.now(ZoneInfo(timezone)) if timezone else dt.datetime.now()
    except Exception:
        now = dt.datetime.now()
    return now.strftime("%A %d %B %Y, %H:%M")


def _describe_front(front: dict[str, Any]) -> str | None:
    if front.get("error") or not front.get("app"):
        return None
    bits = [front["app"], front.get("windowTitle"), front.get("url")]
    return ", ".join(str(b) for b in bits if b)


async def run_worker(conn: Connection, task: Task, message: str) -> str:
    """Run the worker on a task until it answers; returns what to say."""
    if task.worker_session_id is None:
        people = taste.people_line(conn.profile)
        session = await _sessions.create_session(
            app_name=APP_NAME,
            user_id=conn.user_id,
            state={
                "now": _now(conn.timezone),
                "timezone": conn.timezone,
                "profile_summary": taste.summary_for_talker(conn.profile),
                "people": people,
                "front": _describe_front(await conn.bridge.call("frontmost_app", timeout=4)),
            },
        )
        task.worker_session_id = session.id
        register_worker(session.id, conn, task)
    await report(conn, task, "slice", "Started", task.title)
    final = ""
    started = time.monotonic()
    async for event in _runner.run_async(
        user_id=conn.user_id,
        session_id=task.worker_session_id,
        new_message=types.Content(role="user", parts=[types.Part(text=message)]),
    ):
        if DEBUG:
            for call in event.get_function_calls():
                print(f"mac: task {task.id} +{time.monotonic() - started:5.1f}s {call.name}({json.dumps(call.args, default=str)[:160]})", flush=True)
        if event.is_final_response() and event.content and event.content.parts:
            final = "".join(p.text or "" for p in event.content.parts if not p.thought)
    return final.strip() or "Done."
