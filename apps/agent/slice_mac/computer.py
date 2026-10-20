"""The operator: does things on the Mac's screen with Gemini computer use.

The worker hands it one job ("on resy.com, book Lilia for 2 on Friday at
8pm"). The loop: screenshot from the Mac, gemini-3.8-flash with the
computer_use tool (desktop environment), the actions it asks for run on the
Mac (apps/mac/Sources/Tools/ComputerTool.swift), a new screenshot, and so on
until the model answers in text.

Coordinates are 0-999 on both axes of the screenshot; the Mac scales them to
its screen. With our own functions beside computer_use, Gemini rejects any
action result without a `url` (400 INVALID_ARGUMENT, checked 2026-10-20), so
every result carries the front browser page's address, or "". Only the last few screenshots stay in the conversation so long
jobs don't grow without bound. Irreversible steps need the user's yes: the
model calls ask_permission first, and Gemini's own safety_decision
(require_confirmation) goes the same way. CAPTCHAs, logins and card details
are never filled in; the operator stops and hands back to the user.
"""

from __future__ import annotations

import asyncio
import base64
import os
from typing import Any

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from .connection import Connection, for_worker, report
from .tasks import Task

OPERATOR_MODEL = os.environ.get("MAC_OPERATOR_MODEL", "gemini-3.8-flash")
# Google lists 3.5 Flash-Lite as computer-use capable; used when 3.8 Flash is rate-limited.
OPERATOR_FALLBACK = os.environ.get("MAC_OPERATOR_FALLBACK", "gemini-3.5-flash-lite")
# A step that takes longer than this is usually stuck behind the shared quota; try the fallback.
STEP_TIMEOUT_S = 25.0
MAX_STEPS = 40
KEEP_SCREENSHOTS = 3

SYSTEM = """\
You operate the user's Mac for them by looking at screenshots and using the
mouse and keyboard (macOS: cmd is the command key). Work step by step and
check each screenshot before the next action.

Rules:
- Before anything that can't be undone (pay, book, reserve, send, post,
  submit, delete), call ask_permission with one short question and wait.
- If you need something only the user knows (a name, a time, a choice),
  call ask_user.
- Never solve a CAPTCHA, never type a password or card number. If a login,
  CAPTCHA or payment form blocks you, stop and say so.
- Prefer opening a web address directly (cmd+L in the browser, type, enter).
- When the job is done or you're blocked, answer in one or two plain
  sentences: what you did, and anything left for the user.
"""

_CUSTOM = [
    types.FunctionDeclaration(
        name="ask_permission",
        description="Ask the user a yes-or-no question before an irreversible step. Returns {approved}.",
        parameters=types.Schema(type="OBJECT", properties={"question": types.Schema(type="STRING")}, required=["question"]),
    ),
    types.FunctionDeclaration(
        name="ask_user",
        description="Ask the user for something only they know. Returns {answer}.",
        parameters=types.Schema(type="OBJECT", properties={"question": types.Schema(type="STRING")}, required=["question"]),
    ),
]

_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def _screenshot(conn: Connection) -> tuple[bytes, str, str] | None:
    """(image, mime type, front browser page address or "")."""
    shot = await conn.bridge.call("screenshot", {"for": "operator"}, timeout=15)
    if shot.get("error") or not shot.get("image"):
        return None
    return base64.b64decode(shot["image"]), shot.get("mime") or "image/jpeg", str(shot.get("url") or "")


async def _generate(contents: list[types.Content], config: types.GenerateContentConfig) -> types.GenerateContentResponse:
    try:
        return await asyncio.wait_for(
            _client().aio.models.generate_content(model=OPERATOR_MODEL, contents=contents, config=config), STEP_TIMEOUT_S
        )
    except Exception as err:
        slow = isinstance(err, TimeoutError) or "RESOURCE_EXHAUSTED" in str(err)
        if not slow or not OPERATOR_FALLBACK:
            raise
        print(f"mac: {OPERATOR_MODEL} {'timed out' if isinstance(err, TimeoutError) else 'is rate-limited'}, operator step on {OPERATOR_FALLBACK}", flush=True)
        return await _client().aio.models.generate_content(model=OPERATOR_FALLBACK, contents=contents, config=config)


def _prune(contents: list[types.Content]) -> None:
    """Drop all but the newest KEEP_SCREENSHOTS images."""
    seen = 0
    for content in reversed(contents):
        for part in content.parts or []:
            if part.inline_data is not None:
                seen += 1
                if seen > KEEP_SCREENSHOTS:
                    part.inline_data = None
                    part.text = "(older screenshot removed)"
            fr = part.function_response
            if fr is not None and fr.parts:
                seen += 1
                if seen > KEEP_SCREENSHOTS:
                    fr.parts = None


async def operate(conn: Connection, task: Task, job: str) -> str:
    assert conn.tasks
    shot = await _screenshot(conn)
    if shot is None:
        return "I can't see the screen. Slice needs Screen Recording permission (Settings > Permissions)."
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        tools=[
            types.Tool(computer_use=types.ComputerUse(environment="ENVIRONMENT_DESKTOP")),
            types.Tool(function_declarations=_CUSTOM),
        ],
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=job), types.Part.from_bytes(data=shot[0], mime_type=shot[1])])
    ]
    await conn.bridge.send_json({"type": "operator", "active": True, "task_id": task.id})
    # The step the user last said yes on: Gemini's own safety check on the very next step
    # is about the same action, so it isn't asked twice.
    state = {"step": 0, "approved_at": -10}
    try:
        for step in range(MAX_STEPS):
            state["step"] = step
            res = await _generate(contents, config)
            reply = res.candidates[0].content if res.candidates else None
            if reply is None:
                return "The computer-use model returned nothing."
            contents.append(reply)
            calls = [p.function_call for p in reply.parts or [] if p.function_call]
            if not calls:
                return "".join(p.text or "" for p in reply.parts or [] if not p.thought).strip() or "Done."

            results: list[tuple[types.FunctionCall, dict[str, Any]]] = []
            for call in calls:
                outcome = await _act(conn, task, call, state)
                if outcome is None:
                    return "Stopped: you said no."
                results.append((call, outcome))

            shot = await _screenshot(conn)
            parts = []
            for i, (call, outcome) in enumerate(results):
                outcome.setdefault("url", shot[2] if shot else "")
                image = None
                if shot is not None and i == len(results) - 1:
                    image = [types.FunctionResponsePart(inline_data=types.FunctionResponseBlob(mime_type=shot[1], data=shot[0]))]
                parts.append(types.Part(function_response=types.FunctionResponse(id=call.id, name=call.name, response=outcome, parts=image)))
            contents.append(types.Content(role="user", parts=parts))
            _prune(contents)
        return f"I stopped after {MAX_STEPS} steps without finishing."
    finally:
        await conn.bridge.send_json({"type": "operator", "active": False, "task_id": task.id})


async def _act(conn: Connection, task: Task, call: types.FunctionCall, state: dict[str, int]) -> dict[str, Any] | None:
    """Run one action. None means the user said no to it."""
    assert conn.tasks
    args = dict(call.args or {})
    safety = args.pop("safety_decision", None)
    intent = str(args.pop("intent", "") or "")
    acknowledged = False
    if isinstance(safety, dict) and safety.get("decision") == "require_confirmation":
        if state["step"] - state["approved_at"] > 1:
            question = f"Okay to {intent[0].lower() + intent[1:]}?" if intent else "Okay to take the next step on screen?"
            if not await conn.tasks.confirm_action(task, question, str(safety.get("explanation") or "")):
                return None
            state["approved_at"] = state["step"]
        acknowledged = True

    name = call.name or ""
    if name == "ask_permission":
        approved = await conn.tasks.confirm_action(task, str(args.get("question") or "Go ahead?"))
        if approved:
            state["approved_at"] = state["step"]
        outcome: dict[str, Any] = {"approved": approved}
    elif name == "ask_user":
        outcome = {"answer": await conn.tasks.ask(task, str(args.get("question") or ""))}
    elif name == "take_screenshot":
        outcome = {"ok": True}
    elif name == "wait":
        await asyncio.sleep(min(int(args.get("seconds") or 1), 5))
        outcome = {"ok": True}
    else:
        outcome = await conn.bridge.call("computer", {"action": name, "intent": intent, **args}, timeout=15)
        await report(conn, task, "mac", intent or name.replace("_", " ").capitalize())
        # Let the screen settle before the next screenshot.
        await asyncio.sleep(0.6)
    if acknowledged:
        outcome["safety_acknowledgement"] = True
    return outcome


async def operate_computer(job: str, tool_context: ToolContext) -> dict[str, Any]:
    """Do something on the user's screen with the mouse and keyboard: book a table on a website,
    fill in a form, find something in an app. Use it only when no other tool can do it.
    Asks the user before anything irreversible.

    Args:
        job: One clear job with every detail it needs ("In Safari, go to resy.com and book Lilia
            in Brooklyn for 2 people this Friday at 8 pm; name Sam Lee").
    """
    conn, task = for_worker(tool_context)
    await report(conn, task, "mac", "Working on your screen", job[:80])
    return {"outcome": await operate(conn, task, job)}


async def shop_for(item: str, tool_context: ToolContext, store_url: str = "", options: str = "", needed_by: str = "",
                   budget_usd: int = 0) -> dict[str, Any]:
    """Put a gift or purchase in the cart on the shop's own website, with the operator, and check
    when it would arrive. Stops before payment: the user pays themselves.

    Args:
        item: What to buy, specific ("Polaroid Now+ Gen 2 instant camera").
        store_url: The shop's site (a brand's `url` from gift_ideas), or empty to find it.
        options: Choices to make ("colour: sage green", "size M").
        needed_by: The date it must arrive by ("October 28").
        budget_usd: Don't pick anything above this (0 = no limit).
    """
    conn, task = for_worker(tool_context)
    where = f"go to {store_url}" if store_url else "find the brand's own online shop"
    job = (
        f"In the web browser, {where} and find {item}."
        + (f" Choose {options}." if options else "")
        + (f" Don't choose anything over ${budget_usd}." if budget_usd else "")
        + " Add it to the cart and open the cart."
        + (f" Find the delivery estimate (the cart, the product page or the shipping info) and check whether it arrives by {needed_by}." if needed_by else "")
        + " Don't sign in, don't type an address or any payment details, and stop before checkout or payment."
        " Finish by saying the product, the price and the delivery date you saw."
    )
    await report(conn, task, "mac", f"Shopping for {item}", store_url or None)
    outcome = await operate(conn, task, job)
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "note", "key": "cart", "title": "In your cart", "text": outcome,
                                    "detail": "Slice stopped before payment. Check out when you're ready."})
    return {"outcome": outcome, "next": "Tell the user it's in the cart and they pay themselves."}
