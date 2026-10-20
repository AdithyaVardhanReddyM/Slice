"""The user's cloud accounts (Gmail, Google Calendar, Slack, Notion, Drive, …) through Composio.

Composio holds the OAuth with its own approved apps, so Slice needs no Google,
Slack or Notion developer app, and never sees a token: every call goes through
the user's Composio session. Each Mac user is their own Composio user
(`mac-user:<id>`), the same pattern as Pages' CRM (slice_pages/crm.py).

The worker gets a hand-picked tool for each action the demos rely on, plus
find_app_action / run_app_action for the long tail of each app. Anything that
sends, posts or changes data asks the user first.

The Composio SDK is synchronous; every call runs in a worker thread.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
from typing import Any

from google.adk.tools import ToolContext

from .connection import for_worker, report

APPS = {
    "gmail": "Gmail",
    "googlecalendar": "Google Calendar",
    "slack": "Slack",
    "notion": "Notion",
    "googledrive": "Google Drive",
    "ticketmaster": "Ticketmaster",
    "outlook": "Outlook",
    "whatsapp": "WhatsApp",
    "youtube": "YouTube",
    "discord": "Discord",
}
# Actions whose slug says they only read; anything else asks before it runs.
_READ = re.compile(r"_(GET|LIST|FIND|SEARCH|FETCH|READ|RETRIEVE|LOOKUP|QUERY)(_|$)")
RESULT_CHARS = 6000
CONNECT_WAIT_S = 150

_composio: Any = None
_sessions: dict[str, Any] = {}


class NotConnected(Exception):
    pass


def _client() -> Any:
    global _composio
    if _composio is None:
        key = os.environ.get("COMPOSIO_API_KEY", "").strip()
        if not key:
            raise RuntimeError("Set COMPOSIO_API_KEY in apps/agent/.env to connect accounts.")
        from composio import Composio

        _composio = Composio(api_key=key)
    return _composio


def composio_user(user_id: str) -> str:
    return f"mac-user:{user_id}"


def _session(user_id: str, fresh: bool = False) -> Any:
    if fresh or user_id not in _sessions:
        _sessions[user_id] = _client().create(user_id=composio_user(user_id), toolkits=list(APPS), manage_connections=False)
    return _sessions[user_id]


def _with_session(user_id: str, fn: Any) -> Any:
    try:
        return fn(_session(user_id))
    except Exception as err:
        # Sessions expire; one retry on a fresh one.
        if "session" in str(err).lower() and "not found" in str(err).lower():
            return fn(_session(user_id, fresh=True))
        raise


async def status(user_id: str) -> dict[str, bool]:
    def run(s: Any) -> dict[str, bool]:
        out = {app: False for app in APPS}
        for item in s.toolkits(toolkits=list(APPS)).items:
            if item.slug in out and item.connection:
                out[item.slug] = bool(item.connection.is_active)
        return out

    return await asyncio.to_thread(_with_session, user_id, run)


async def connect_link(user_id: str, app: str, callback_url: str | None = None) -> str:
    if app not in APPS:
        raise ValueError(f"Unknown app {app}; one of {', '.join(APPS)}")
    req = await asyncio.to_thread(_with_session, user_id, lambda s: s.authorize(app, callback_url=callback_url))
    return req.redirect_url


async def execute(user_id: str, slug: str, arguments: dict[str, Any]) -> Any:
    res = await asyncio.to_thread(_with_session, user_id, lambda s: s.execute(slug, arguments=arguments))
    if res.error:
        text = str(res.error)
        if "connect" in text.lower() and ("no " in text.lower() or "not" in text.lower()):
            raise NotConnected(text)
        raise RuntimeError(text[:400])
    return res.data


def _trim(data: Any) -> Any:
    text = json.dumps(data, ensure_ascii=False, default=str)
    return data if len(text) <= RESULT_CHARS else {"truncated": True, "data": text[:RESULT_CHARS]}


def _app_of(slug: str) -> str:
    head = slug.split("_", 1)[0].lower()
    return {"googlecalendar": "googlecalendar", "googledrive": "googledrive"}.get(head, head)


async def _run(tool_context: ToolContext, slug: str, args: dict[str, Any], label: str, *, confirm: str | None = None, detail: str = "") -> dict[str, Any]:
    conn, task = for_worker(tool_context)
    if confirm:
        assert conn.tasks
        if not await conn.tasks.confirm_action(task, confirm, detail):
            return {"cancelled": True}
    try:
        data = await execute(conn.user_id, slug, args)
    except NotConnected:
        app = _app_of(slug)
        return {"not_connected": app, "next": f"Call connect_app('{app}') to have the user sign in, then try again."}
    except Exception as err:
        await report(conn, task, "app", label, "failed")
        return {"error": str(err)[:400]}
    await report(conn, task, "app", label)
    return {"result": _trim(data)}


# --- worker tools --------------------------------------------------------------------


async def connected_apps(tool_context: ToolContext) -> dict[str, Any]:
    """Which of the user's accounts are connected (gmail, googlecalendar, slack, notion, googledrive, …)."""
    conn, _ = for_worker(tool_context)
    return {"connected": await status(conn.user_id)}


async def connect_app(app: str, tool_context: ToolContext) -> dict[str, Any]:
    """Have the user sign in to an app: opens its sign-in page on the Mac and waits until they're done.

    Args:
        app: gmail, googlecalendar, slack, notion, googledrive, ticketmaster, outlook, whatsapp, youtube or discord.
    """
    conn, task = for_worker(tool_context)
    url = await connect_link(conn.user_id, app)
    await conn.bridge.call("open_url", {"url": url})
    await report(conn, task, "app", f"Waiting for you to connect {APPS.get(app, app)}")
    for _ in range(CONNECT_WAIT_S // 3):
        await asyncio.sleep(3)
        if (await status(conn.user_id)).get(app):
            await report(conn, task, "app", f"{APPS.get(app, app)} connected")
            return {"connected": app}
    return {"error": f"{APPS.get(app, app)} wasn't connected within {CONNECT_WAIT_S // 60} minutes."}


async def gmail_search(query: str, tool_context: ToolContext, count: int = 5) -> dict[str, Any]:
    """Search the user's Gmail (Gmail search syntax: from:, subject:, newer_than:7d, …).

    Args:
        query: e.g. "from:sam newer_than:30d" or "flight confirmation".
        count: How many messages (1-10).
    """
    return await _run(tool_context, "GMAIL_FETCH_EMAILS", {"query": query, "max_results": max(1, min(count, 10))}, f'Searched Gmail for "{query}"')


async def gmail_draft(to: str, subject: str, body: str, tool_context: ToolContext) -> dict[str, Any]:
    """Save an email draft in Gmail (nothing is sent).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain-text body.
    """
    return await _run(tool_context, "GMAIL_CREATE_EMAIL_DRAFT", {"recipient_email": to, "subject": subject, "body": body}, f"Drafted an email to {to}")


async def gmail_send(to: str, subject: str, body: str, tool_context: ToolContext) -> dict[str, Any]:
    """Send an email from the user's Gmail (asks the user first).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain-text body.
    """
    return await _run(tool_context, "GMAIL_SEND_EMAIL", {"recipient_email": to, "subject": subject, "body": body},
                      f"Emailed {to}", confirm=f"Send this email to {to}?", detail=f"{subject}\n\n{body}")


async def google_calendar_events(tool_context: ToolContext, days_ahead: int = 7, search: str = "") -> dict[str, Any]:
    """Events across the user's Google calendars.

    Args:
        days_ahead: How many days from now (1-60).
        search: Optional free-text filter.
    """
    now = dt.datetime.now(dt.UTC)
    args: dict[str, Any] = {"time_min": now.isoformat(), "time_max": (now + dt.timedelta(days=max(1, min(days_ahead, 60)))).isoformat()}
    if search:
        args["q"] = search
    return await _run(tool_context, "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS", args, "Checked your Google Calendar")


async def slack_search(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Search the user's Slack messages (Slack syntax: in:#channel, from:@name, …).

    Args:
        query: What to look for.
    """
    return await _run(tool_context, "SLACK_SEARCH_MESSAGES", {"query": query, "count": 8}, f'Searched Slack for "{query}"')


async def slack_send(channel: str, text: str, tool_context: ToolContext) -> dict[str, Any]:
    """Post a Slack message (asks the user first).

    Args:
        channel: Channel name ("#weekend") or id, or a user id for a DM.
        text: The message, in Markdown.
    """
    return await _run(tool_context, "SLACK_SEND_MESSAGE", {"channel": channel, "markdown_text": text},
                      f"Posted in {channel}", confirm=f"Post this in {channel}?", detail=text)


async def notion_search(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find pages and databases in the user's Notion by title.

    Args:
        query: Words from the title.
    """
    return await _run(tool_context, "NOTION_SEARCH_NOTION_PAGE", {"query": query, "page_size": 8}, f'Searched Notion for "{query}"')


async def notion_create_page(title: str, markdown: str, parent_page_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Create a Notion page under an existing page (find the parent with notion_search; asks first).

    Args:
        title: Page title.
        markdown: Page content in Markdown.
        parent_page_id: The parent page's id (dashed UUID).
    """
    return await _run(tool_context, "NOTION_CREATE_NOTION_PAGE", {"title": title, "markdown": markdown, "parent_id": parent_page_id},
                      f"Created “{title}” in Notion", confirm=f"Create the Notion page “{title}”?", detail=markdown[:600])


async def drive_search(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find files in the user's Google Drive.

    Args:
        query: Words in the file name or text.
    """
    return await _run(tool_context, "GOOGLEDRIVE_FIND_FILE", {"q": query, "pageSize": 8}, f'Searched Drive for "{query}"')


async def events_near(city: str, tool_context: ToolContext, keyword: str = "", days_ahead: int = 30) -> dict[str, Any]:
    """Upcoming concerts and shows from Ticketmaster.

    Args:
        city: City name ("New York").
        keyword: Artist, genre or show ("Beach House", "jazz").
        days_ahead: How far ahead (1-120).
    """
    now = dt.datetime.now(dt.UTC).replace(microsecond=0)
    args: dict[str, Any] = {"city": city, "size": 10,
                            "startDateTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "endDateTime": (now + dt.timedelta(days=max(1, min(days_ahead, 120)))).strftime("%Y-%m-%dT%H:%M:%SZ")}
    if keyword:
        args["keyword"] = keyword
    return await _run(tool_context, "TICKETMASTER_GET_EVENTS", args, f"Looked for shows in {city}")


async def find_app_action(app: str, need: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find the right action in one of the user's apps when no other tool covers it
    (e.g. WhatsApp send, YouTube search, Outlook calendar). Then call run_app_action.

    Args:
        app: The app (gmail, googlecalendar, slack, notion, googledrive, ticketmaster, outlook, whatsapp, youtube, discord).
        need: What you want to do, in a few words.
    """

    def run() -> list[dict[str, Any]]:
        tools = _client().tools.get_raw_composio_tools(toolkits=[app], search=need, limit=6)
        out = []
        for t in tools:
            d = t.model_dump()
            params = (d.get("input_parameters") or {})
            out.append({"slug": d.get("slug"), "description": str(d.get("description") or "")[:200],
                        "required": params.get("required") or [], "params": list((params.get("properties") or {}))[:12]})
        return out

    return {"actions": await asyncio.to_thread(run)}


async def run_app_action(slug: str, arguments_json: str, tool_context: ToolContext) -> dict[str, Any]:
    """Run an action found with find_app_action. Actions that send or change something ask the user first.

    Args:
        slug: The action's slug, e.g. "WHATSAPP_SEND_MESSAGE".
        arguments_json: Its arguments as a JSON object.
    """
    try:
        args = json.loads(arguments_json or "{}")
    except json.JSONDecodeError as err:
        return {"error": f"arguments_json isn't valid JSON: {err}"}
    readable = slug.replace("_", " ").title()
    confirm = None if _READ.search(slug) else f"Run “{readable}”?"
    return await _run(tool_context, slug, args, readable, confirm=confirm, detail=json.dumps(args, ensure_ascii=False)[:600])


TOOLS = [
    connected_apps, connect_app, gmail_search, gmail_draft, gmail_send, google_calendar_events,
    slack_search, slack_send, notion_search, notion_create_page, drive_search, events_near,
    find_app_action, run_app_action,
]
