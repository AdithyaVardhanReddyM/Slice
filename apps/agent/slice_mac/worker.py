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

from google.adk.agents import Agent, LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext, google_search
from google.adk.tools.google_search_agent_tool import GoogleSearchAgentTool
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import Gemini, LlmRequest, LlmResponse
from google.genai import types

from . import accounts, learning, lens, mac_tools, plans, playbooks, taste
from .connection import Connection, for_worker, register_worker, report
from .computer import operate_computer, play_on, shop_for
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
- Use the user's own data when the task needs it: calendar, reminders,
  notes, contacts, mail, Slack, Notion, Drive. Don't go through notes,
  reminders or the screen looking for something the user just told you or
  that a tool planned earlier in this conversation. Ask the user (ask_user)
  only for what no tool can tell you, one question at a time, and never
  guess a date, a place or who's going.
- The web (search_the_web): opening hours, whether something is out or on
  yet, dates, prices, addresses, who's playing, news, anything that
  changes. One clear question per call. Picks still come from `recommend`;
  the web checks a pick's details, it never chooses it.
- Their apps: Calendar, Reminders and Notes are on the Mac (no sign-in);
  "put it in my calendar" means the Mac's Calendar (add_this_plan_to_calendar
  for a plan, add_calendar_event for one event), Google Calendar only when
  they say so. For a place's rating, price, opening hours or the way there,
  use google_maps_places / google_maps_route; if Google Maps isn't
  connected, find_on_map / travel_time. Picks still come from `recommend`.
  Put a plan or list into a reminder, note, Google Doc or Sheet only when
  asked.
- Do what the task asks and no more: don't book, buy, send or post unless
  the task asks for it; offer it in your answer instead.
- Tools that send, book, post or change something ask the user themselves;
  don't ask again first.
- Doing it, not just suggesting it. "Open Netflix and play something I'd
  like", "put on a film", "play me some music": choose one title with
  `recommend` (steer by what's on their screen or what they named; "other
  than this" means not what's in front of them), then play_on with the
  service and that exact title, and say what's playing and why it fits.
  "Take me there", "directions to": open_directions. "Open Spotify":
  open_app. The job isn't done until the thing is playing or open.
- For a website or app with no tool (Resy, OpenTable, a shop), use
  operate_computer with one precise job that includes every detail
  (open_app first when the app isn't open).
- An app isn't connected? If the user asked for that app by name ("put it
  in a Google Doc"), connect_app, then carry on. Otherwise don't make them
  sign in mid-task: use what's on the Mac (Calendar, Reminders, Notes, a
  file in Documents/Slice) or ask them for the detail instead, and say
  which app would have done it.
- When you recommend things, show them with show_cards (tools that say they
  show a card already did). Card text is plain words with commas; never
  "·" or "|" between words.
- Never pay for anything: shop_for and operate_computer stop before payment.
- Learn as you go: when the user picks one of your suggestions for
  themselves, says they loved something, or turns one down, note_feedback;
  plain facts about them or a saved person ("doesn't drink"), remember_fact.
  Follow what "Who the user is" says to remember (diet, getting around,
  things that aren't for them).
- Finish with one to three short sentences that will be read aloud: what
  you did or found, and what's next. No lists, links, ids or markdown.
  Offer one next step at a time, as a question; the next one comes after
  the user's yes, not all at once.

Playbooks: one call does the whole job and shows the cards (use the one that
fits; skip what the user already told you). Call it as your first step with
everything the user gave you, then answer from its result and make its offers.
Ask (ask_user) only when it can't run without an answer.
- A trip ("plan my Paris trip, 12 to 19 November, just me, staying in the
  Marais"): plan_trip with the city, the dates, who's going (party), where
  they stay and arrival/departure times if given. The dates come from the
  user: if the task doesn't say them, ask_user ("Which dates?") first, or
  find_trip_emails when Gmail is connected; never guess them. plan_trip
  maps their taste in the city, checks the weather, plans every day as a
  walk and ranks shows. Then say the shape of the week with one or two real
  names from the plan, and offer to put it in a doc (write_this_plan) or
  the days in their calendar (add_this_plan_to_calendar); after that, offer
  to book the dinner (book_this_table). Follow-ups on this plan, in this
  task or a later one ("put it in a doc", "add it to my calendar", "book
  the dinner"), use those three tools: they already know the plan, so
  never re-plan it, search for it or ask for its details again.
- Someone's weekend or day out with a friend ("my dad Frank is 73, lives in
  Lincoln Park, likes a proper table and nothing loud, loves The Godfather
  and Bob Dylan; his friend Walter is into Miles Davis; plan their
  weekend"): plan_weekend_for with both names, each one's likes (exact
  titles and names, as said), his age, home, his needs in the user's words,
  relation, and the days and meal if they said. Don't ask what the task
  already says, and never search Notes or Contacts for his taste. Then say
  the two days' shape with real names and whose love drives a pick, and make
  its offers ONE AT A TIME, each behind a yes: send him the pages
  (send_this_plan), the days in the user's calendar
  (add_this_plan_to_calendar), book the table (book_this_table), do it every
  week (repeat_weekly). Follow-ups ("send it to dad", "put it in my
  calendar", "book the table", "every week") use those tools; they know the
  plan, so never re-plan or ask for his details again. "Plan dad's weekend"
  for someone already saved: plan_weekend_for with just the names.
- Someone else's week of things to watch, hear and lunch ("my dad Ray is 74,
  uses a walker, loves…, put together his week"): plan_for_someone with
  likes, age, home, needs and relation (printout=true if they asked for it
  on paper). Offer the large-print page (print_this_plan), sending it
  (send_this_plan) and repeat_weekly.
- A gift ("Maya's birthday is on the 29th"): gift_for (from_screen=true if
  her profile is open, else likes), with budget and occasion. When the user
  picks one, shop_for it on the brand's site with the date it must arrive
  by; offer a card written around one thing they love (show_note) and a
  reminder to wrap it (add_calendar_event).
- A day out ("plan my Saturday, Sam joins after 2"): plan_day_out with the
  date, the friend and when they join. It reads the calendar and weather,
  plans the morning, the afternoon and evening for both, the best show with
  dinner near the venue, and shows one timeline. Offer to message the friend
  (in words that suit friend_loves), book dinner, open the ticket page and
  add_this_plan_to_calendar.
- To change one part afterwards, use the single tools (plan_walkable_day,
  recommend, show_day_plan, shows_for_me).
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


async def show_cards(cards_json: str, tool_context: ToolContext, for_person: str = "") -> dict[str, Any]:
    """Show results as cards in the island (up to 6). The user can thumb their own picks up or
    down, which teaches their taste.

    Args:
        cards_json: A JSON list of {"title", "subtitle", "image", "url", "reason", "tag"}; image is a
            URL from the tool results, reason is one short line on why it fits, tag is a one-word
            label ("Watch", "Listen", "Lunch").
        for_person: When the picks are for someone else (gifts, Dad's week), their name.
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
    if for_person.strip() and for_person.strip().lower() not in ("me", "you", "us"):
        clean = [{**c, "for": for_person.strip()} for c in clean]
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
STEP_TIMEOUT_S = 15.0
# Measured 2026-10-27 over two trip runs: a step that answers takes 2 to 9 s; one that's stuck
# behind the quota never answers before the 15 s timeout, which made every stuck step 17 to 19 s.
# So after HEDGE_S the next model is asked too, and the first answer wins.
HEDGE_S = 7.0


def _rate_limited(err: Exception) -> bool:
    return isinstance(err, TimeoutError) or "RESOURCE_EXHAUSTED" in str(err) or getattr(err, "code", None) == 429


class FallbackGemini(Gemini):
    """Gemini that moves to the next model when one is rate-limited, instead of waiting: a model
    that hasn't answered after HEDGE_S gets the next one started beside it (hedged), and a 429
    moves on at once."""

    fallbacks: list[str] = []

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):  # type: ignore[override]
        models = [llm_request.model or self.model, *self.fallbacks]
        running: dict[asyncio.Task[list[LlmResponse]], str] = {}
        failed: Exception | None = None
        started = time.monotonic()
        try:
            next_model = 0
            while True:
                if next_model < len(models) and (not running or time.monotonic() - started >= HEDGE_S * next_model):
                    name = models[next_model]
                    # A shallow copy: the two requests share their contents and tools (a deep copy
                    # hits a thread lock inside the tool declarations) and differ only in the model.
                    request = llm_request.model_copy(update={"model": name})
                    if next_model:
                        print(f"mac: {models[next_model - 1]} hasn't answered in {HEDGE_S:.0f}s, asking {name} too", flush=True)
                    running[asyncio.create_task(_collect(super().generate_content_async(request, stream)))] = name
                    next_model += 1
                if not running:
                    raise failed or TimeoutError("no model answered")
                wait = HEDGE_S * next_model - (time.monotonic() - started) if next_model < len(models) else STEP_TIMEOUT_S
                done, _ = await asyncio.wait(running, timeout=max(0.1, wait), return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    name = running.pop(task)
                    try:
                        responses = task.result()
                    except Exception as err:
                        failed = err
                        if not _rate_limited(err):
                            raise
                        print(f"mac: {name} is rate-limited", flush=True)
                        continue
                    for response in responses:
                        yield response
                    return
                if not done and not running and next_model >= len(models):
                    raise failed or TimeoutError("no model answered")
                if time.monotonic() - started > STEP_TIMEOUT_S + HEDGE_S * len(models):
                    raise failed or TimeoutError("no model answered in time")
        finally:
            for task in running:
                task.cancel()


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


_model = FallbackGemini(
    model=WORKER_MODEL,
    fallbacks=FALLBACKS,
    retry_options=types.HttpRetryOptions(attempts=1),
)

# Google Search is a model built-in tool that can't share a request with function tools, so it
# lives in a sub-agent the worker calls like any other tool (ADK's own workaround, with a name,
# an answer style and a thinking level of ours).
_searcher = LlmAgent(
    name="search_the_web",
    model=_model,
    description=(
        "Look something up on the web with Google Search: opening hours, whether a film, album or show "
        "is out yet, dates, times, prices, addresses, news, anything current. Give one clear question "
        "with the names and place in it."
    ),
    instruction="""\
You answer one question with Google Search. Reply in two or three plain sentences with the facts
you found (names, dates, times, prices, addresses) and say in words which site they came from.
No lists, links or markdown. If the web doesn't settle it, say what you did find and what's unclear.
""",
    tools=[google_search],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(THINKING.upper())),
    ),
)
search_the_web = GoogleSearchAgentTool(_searcher)

worker_agent = Agent(
    name="slice_worker",
    model=_model,
    before_model_callback=_before_model,
    after_model_callback=_after_model,
    on_tool_error_callback=tool_failed,
    instruction=_instruction,
    tools=[
        ask_user, show_cards, show_note, *playbooks.TOOLS, *taste.TOOLS, *plans.TOOLS, *lens.WORKER_TOOLS, *mac_tools.TOOLS,
        *accounts.TOOLS, *learning.WORKER_TOOLS, operate_computer, play_on, shop_for, search_the_web,
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
                "profile_summary": taste.summary_for_talker(conn.profile, conn.taste_off),
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
            if event.grounding_metadata and event.grounding_metadata.web_search_queries:
                print(f"mac: task {task.id} searched {event.grounding_metadata.web_search_queries}", flush=True)
        if event.is_final_response() and event.content and event.content.parts:
            final = "".join(p.text or "" for p in event.content.parts if not p.thought)
    return final.strip() or "Done."
