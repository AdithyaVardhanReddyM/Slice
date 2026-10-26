"""The user's apps: Gmail, Google Calendar, Drive, Docs, Sheets, Maps, Slack and Notion through
Composio, and Calendar, Contacts, Reminders and Notes on the Mac itself (their tools are in
mac_tools.py).

Composio holds the OAuth with its own approved apps, so Slice needs no Google,
Slack or Notion developer app, and never sees a token: every call goes through
the user's Composio session. Each Mac user is their own Composio user
(`mac-user:<id>`), the same pattern as Pages' CRM (slice_pages/crm.py). The Mac
app has its own Composio project: COMPOSIO_MAC_API_KEY in apps/agent/.env.

CATALOG is what Settings > Integrations shows (GET /mac/accounts). The worker
gets a hand-picked tool for each thing the demos rely on, plus find_app_action /
run_app_action for the long tail of each app. Anything that sends, posts or
changes data asks the user first.

The Composio SDK is synchronous; every call runs in a worker thread.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from google.adk.tools import ToolContext

from .connection import for_worker, report

KEY = "COMPOSIO_MAC_API_KEY"
_ENV = Path(__file__).resolve().parents[1] / ".env"


@dataclass(frozen=True)
class App:
    slug: str
    name: str
    group: str
    blurb: str
    # What Slice does with it, in plain words; True when it asks the user first.
    can: tuple[tuple[str, bool], ...]
    # Something to try saying, shown in Settings.
    say: str = ""
    # Calendar, Contacts, Reminders and Notes live on the Mac: the Mac app knows whether Slice may use them.
    on_mac: bool = False


GROUPS = (("plans", "Plans and places"), ("messages", "Mail and messages"), ("files", "Notes and files"))

CATALOG: tuple[App, ...] = (
    App("googlecalendar", "Google Calendar", "plans", "Your events, free time and invites",
        (("Reads your events to plan around them", False), ("Finds the free time in your day", False),
         ("Adds events and invites people", True)), "Am I free on Saturday afternoon?"),
    App("calendar", "Calendar", "plans", "Every calendar on this Mac",
        (("Reads your events to plan around them", False), ("Adds an event", True)), "What's on this weekend?", on_mac=True),
    App("reminders", "Reminders", "plans", "Your to-dos and lists on this Mac",
        (("Reads what's on your lists", False), ("Adds a reminder, with a time if you give one", True),
         ("Ticks off what you've done", True)), "Remind me to book the table at five", on_mac=True),
    App("google_maps", "Google Maps", "plans", "Places, ratings, opening hours and routes",
        (("Checks a place's rating, price and opening hours", False), ("Works out how long it takes to get there", False)), "Is Lilia open on Sunday, and how long to get there?"),
    App("ticketmaster", "Ticketmaster", "plans", "Concerts and shows near you",
        (("Finds shows near you, ranked by your taste", False),), "Any shows I'd love this month?"),
    App("gmail", "Gmail", "messages", "Search, read, draft and send email",
        (("Searches your mail, like trip and booking confirmations", False), ("Saves drafts for you to send", False),
         ("Sends an email", True)), "When does my Lisbon flight land?"),
    App("slack", "Slack", "messages", "Channels, threads and messages",
        (("Searches your messages", False), ("Posts a message", True)), "What did Sam say about the weekend?"),
    App("contacts", "Contacts", "messages", "The people you know, and their birthdays",
        (("Finds the people you mention", False), ("Reads birthdays and addresses for plans and gifts", False)),
        "When is Maya's birthday?", on_mac=True),
    App("notes", "Notes", "files", "Your notes on this Mac",
        (("Finds and reads your notes", False), ("Writes a new note", True)), "Put the packing list in my notes", on_mac=True),
    App("notion", "Notion", "files", "Pages and databases",
        (("Finds and reads your pages", False), ("Creates a page", True)), "Read my Lisbon page in Notion"),
    App("googledrive", "Google Drive", "files", "Find any file in your Drive",
        (("Finds files by name or what's in them", False),), "Find the lease in my Drive"),
    App("googledocs", "Google Docs", "files", "Read and write documents",
        (("Finds and reads your docs", False), ("Writes a new doc", True)), "Write my trip plan up as a doc"),
    App("googlesheets", "Google Sheets", "files", "Read and update spreadsheets",
        (("Finds and reads your spreadsheets", False), ("Adds rows or makes a new sheet", True)), "Put my trip budget in a sheet"),
)
CLOUD = [a.slug for a in CATALOG if not a.on_mac]
APPS = {a.slug: a.name for a in CATALOG}

# Actions whose slug says they only read; anything else asks before it runs.
_READ = re.compile(r"_(GET|LIST|FIND|SEARCH|FETCH|READ|RETRIEVE|LOOKUP|QUERY)(_|$)")
RESULT_CHARS = 6000
CONNECT_WAIT_S = 150

_composio: Any = None
_composio_key = ""
_sessions: dict[str, Any] = {}


class NotConnected(Exception):
    pass


def _key() -> str:
    """The key in .env wins over the process env, so a new key works without restarting the server."""
    from dotenv import dotenv_values

    try:
        from_file = (dotenv_values(_ENV).get(KEY) or "").strip()
    except OSError:
        from_file = ""
    return from_file or os.environ.get(KEY, "").strip()


def configured() -> bool:
    return bool(_key())


def _client() -> Any:
    global _composio, _composio_key
    key = _key()
    if not key:
        raise RuntimeError(f"Set {KEY} in apps/agent/.env to connect apps.")
    if _composio is None or key != _composio_key:
        from composio import Composio

        _composio, _composio_key = Composio(api_key=key), key
        _sessions.clear()  # sessions belong to the old key's project
    return _composio


def composio_user(user_id: str) -> str:
    return f"mac-user:{user_id}"


def _session(user_id: str, fresh: bool = False) -> Any:
    client = _client()
    if fresh or user_id not in _sessions:
        _sessions[user_id] = client.create(user_id=composio_user(user_id), toolkits=CLOUD, manage_connections=False)
    return _sessions[user_id]


def _with_session(user_id: str, fn: Any) -> Any:
    try:
        return fn(_session(user_id))
    except Exception as err:
        # Sessions expire; one retry on a fresh one.
        if "session" in str(err).lower() and "not found" in str(err).lower():
            return fn(_session(user_id, fresh=True))
        raise


def _accounts(user_id: str, slugs: list[str], statuses: list[str] | None = None) -> list[Any]:
    kwargs: dict[str, Any] = {"user_ids": [composio_user(user_id)], "toolkit_slugs": slugs, "limit": 100}
    if statuses:
        kwargs["statuses"] = statuses
    return list(_client().connected_accounts.list(**kwargs).items)


async def states(user_id: str) -> dict[str, dict[str, Any]]:
    """Each cloud app the user has signed in to: {"state": "connected" | "expired", "since": ISO}.
    An active account wins over an expired one."""

    def run() -> dict[str, dict[str, Any]]:
        found: dict[str, dict[str, Any]] = {}
        for item in _accounts(user_id, CLOUD, ["ACTIVE", "EXPIRED"]):
            slug = item.toolkit.slug
            state = "connected" if item.status == "ACTIVE" else "expired"
            if found.get(slug, {}).get("state") == "connected":
                continue
            found[slug] = {"state": state, "since": str(getattr(item, "created_at", "") or "")}
        return found

    return await asyncio.to_thread(run)


async def status(user_id: str) -> dict[str, bool]:
    found = await states(user_id)
    return {slug: found.get(slug, {}).get("state") == "connected" for slug in CLOUD}


async def catalog(user_id: str) -> dict[str, Any]:
    """Settings > Integrations: every app, its group, what Slice does with it and whether it's connected.
    The Mac fills in Calendar, Contacts, Reminders and Notes from its own permissions."""
    out: dict[str, Any] = {"configured": configured(), "key": KEY,
                           "groups": [{"id": g, "label": label} for g, label in GROUPS]}
    found: dict[str, dict[str, Any]] = {}
    if out["configured"]:
        try:
            found = await states(user_id)
        except Exception as err:
            out["error"] = explain(err)
    out["apps"] = [{
        "slug": a.slug, "name": a.name, "group": a.group, "blurb": a.blurb, "say": a.say, "on_mac": a.on_mac,
        "can": [{"text": text, "asks": asks} for text, asks in a.can],
        "state": "mac" if a.on_mac else found.get(a.slug, {}).get("state", "available"),
        "since": found.get(a.slug, {}).get("since"),
    } for a in CATALOG]
    return out


def explain(err: Exception) -> str:
    """Composio failures in a sentence the user can act on."""
    text = str(err)
    if "APIKey_InsufficientPermissions" in text or "PermissionDenied" in type(err).__name__:
        return f"The Composio key in {KEY} is read-only. Make one with write access to sessions and connected accounts."
    if "401" in text or "Unauthorized" in text or "invalid api key" in text.lower():
        return f"Composio didn't accept the key in {KEY}."
    return text[:300]


async def connect_link(user_id: str, app: str, callback_url: str | None = None) -> str:
    if app not in CLOUD:
        raise ValueError(f"Unknown app {app}; one of {', '.join(CLOUD)}")
    req = await asyncio.to_thread(_with_session, user_id, lambda s: s.authorize(app, callback_url=callback_url))
    if not req.redirect_url:
        raise RuntimeError("Composio didn't return a sign-in link.")
    return req.redirect_url


async def disconnect(user_id: str, app: str) -> None:
    """Remove every account of the app, sign-ins that were started and never finished included."""
    if app not in CLOUD:
        raise ValueError(f"Unknown app {app}")

    def run() -> None:
        for item in _accounts(user_id, [app]):
            _client().connected_accounts.delete(item.id)

    await asyncio.to_thread(run)


def _not_connected(text: str) -> bool:
    low = text.lower()
    return "noactiveconnection" in low or ("connect" in low and ("no " in low or "not" in low))


async def execute(user_id: str, slug: str, arguments: dict[str, Any]) -> Any:
    try:
        res = await asyncio.to_thread(_with_session, user_id, lambda s: s.execute(slug, arguments=arguments))
    except Exception as err:
        # The SDK raises (400 ToolRouterV2_NoActiveConnection) when the app was never connected.
        if _not_connected(str(err)):
            raise NotConnected(str(err)) from err
        raise
    if res.error:
        text = str(res.error)
        if _not_connected(text):
            raise NotConnected(text)
        raise RuntimeError(text[:400])
    return res.data


def _trim(data: Any) -> Any:
    text = json.dumps(data, ensure_ascii=False, default=str)
    return data if len(text) <= RESULT_CHARS else {"truncated": True, "data": text[:RESULT_CHARS]}


def _find(data: Any, *keys: str) -> Any:
    """The first value under any of `keys`, however deep (Composio wraps provider answers differently)."""
    if isinstance(data, dict):
        for key in keys:
            if data.get(key) not in (None, "", []):
                return data[key]
        for value in data.values():
            if (hit := _find(value, *keys)) is not None:
                return hit
    elif isinstance(data, list):
        for value in data:
            if (hit := _find(value, *keys)) is not None:
                return hit
    return None


def _app_of(slug: str) -> str:
    head = slug.split("_", 1)[0].lower()
    return "google_maps" if head == "google" and slug.startswith("GOOGLE_MAPS") else head


async def _call(tool_context: ToolContext, slug: str, args: dict[str, Any], label: str, *,
                confirm: str | None = None, detail: str = "") -> tuple[Any, dict[str, Any] | None]:
    """Run one action; (data, None) on success, (None, what to tell the worker) otherwise."""
    conn, task = for_worker(tool_context)
    if confirm:
        assert conn.tasks
        if not await conn.tasks.confirm_action(task, confirm, detail):
            return None, {"cancelled": True}
    try:
        data = await execute(conn.user_id, slug, args)
    except NotConnected:
        app = _app_of(slug)
        return None, {"not_connected": app, "next": f"Call connect_app('{app}') to have the user sign in, then try again."}
    except Exception as err:
        await report(conn, task, "app", label, "failed")
        return None, {"error": str(err)[:400]}
    await report(conn, task, "app", label)
    return data, None


async def _run(tool_context: ToolContext, slug: str, args: dict[str, Any], label: str, *,
               confirm: str | None = None, detail: str = "") -> dict[str, Any]:
    data, problem = await _call(tool_context, slug, args, label, confirm=confirm, detail=detail)
    return problem or {"result": _trim(data)}


def _rows(rows_json: str) -> list[list[Any]] | str:
    try:
        rows = json.loads(rows_json or "[]")
    except json.JSONDecodeError as err:
        return f"rows_json isn't valid JSON: {err}"
    if not isinstance(rows, list) or not all(isinstance(r, list) for r in rows):
        return "rows_json must be a list of rows, each a list of cells."
    return rows


def _preview(rows: list[list[Any]]) -> str:
    lines = [", ".join(str(c) for c in row) for row in rows[:6]]
    return "\n".join(lines) + (f"\n…and {len(rows) - 6} more rows" if len(rows) > 6 else "")


# --- worker tools: connecting --------------------------------------------------------------


async def connected_apps(tool_context: ToolContext) -> dict[str, Any]:
    """Which of the user's cloud apps are connected (googlecalendar, gmail, slack, notion, googledrive,
    googledocs, googlesheets, google_maps, ticketmaster). Reminders and Notes are on the Mac and need no sign-in."""
    conn, _ = for_worker(tool_context)
    return {"connected": await status(conn.user_id)}


async def connect_app(app: str, tool_context: ToolContext) -> dict[str, Any]:
    """Have the user sign in to an app: opens its sign-in page on the Mac and waits until they're done.

    Args:
        app: googlecalendar, gmail, slack, notion, googledrive, googledocs, googlesheets, google_maps or ticketmaster.
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


# --- Gmail ---------------------------------------------------------------------------------


async def gmail_search(query: str, tool_context: ToolContext, count: int = 5) -> dict[str, Any]:
    """Search the user's Gmail (Gmail search syntax: from:, subject:, newer_than:7d, …).

    Args:
        query: e.g. "from:sam newer_than:30d" or "flight confirmation".
        count: How many messages (1-10).
    """
    return await _run(tool_context, "GMAIL_FETCH_EMAILS", {"query": query, "max_results": max(1, min(count, 10))}, f'Searched Gmail for "{query}"')


async def find_trip_emails(tool_context: ToolContext, destination: str = "") -> dict[str, Any]:
    """Flight, train and hotel confirmations in the user's Gmail (the last 90 days and upcoming),
    to find when they arrive, leave and where they stay.

    Args:
        destination: The city, to narrow it ("Lisbon").
    """
    words = "(flight OR booking OR reservation OR itinerary OR \"check-in\" OR hotel OR boarding)"
    query = f"{words} newer_than:90d" + (f" {destination}" if destination else "")
    return await _run(tool_context, "GMAIL_FETCH_EMAILS", {"query": query, "max_results": 8}, f"Looked for trip emails{' about ' + destination if destination else ''}")


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


# --- Google Calendar -----------------------------------------------------------------------


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


async def google_calendar_free_time(day: str, tool_context: ToolContext, from_time: str = "08:00", to_time: str = "22:00") -> dict[str, Any]:
    """The free and busy stretches of one day in the user's Google Calendar.

    Args:
        day: The date, "2026-10-31".
        from_time: Start of the window, "09:00".
        to_time: End of the window, "18:00".
    """
    conn, _ = for_worker(tool_context)
    args = {"items": ["primary"], "time_min": f"{day}T{from_time}:00", "time_max": f"{day}T{to_time}:00",
            "timezone": conn.timezone or "UTC"}
    return await _run(tool_context, "GOOGLECALENDAR_FIND_FREE_SLOTS", args, f"Found your free time on {day}")


async def google_calendar_add(title: str, start: str, end: str, tool_context: ToolContext, location: str = "",
                              description: str = "", invite: str = "") -> dict[str, Any]:
    """Add an event to the user's Google Calendar, inviting people if asked (asks the user first).
    For the Mac's own calendar use add_calendar_event.

    Args:
        title: Event title.
        start: Local start, "2026-10-31T19:30:00".
        end: Local end, "2026-10-31T22:00:00".
        location: Optional place or address.
        description: Optional notes.
        invite: Optional comma-separated emails to invite (they get Google's invite email).
    """
    conn, _ = for_worker(tool_context)
    guests = [e.strip() for e in invite.split(",") if "@" in e]
    args: dict[str, Any] = {"summary": title, "start_datetime": start, "end_datetime": end, "timezone": conn.timezone or "UTC",
                            "send_updates": "all" if guests else "none", "create_meeting_room": False}
    if location:
        args["location"] = location
    if description:
        args["description"] = description
    if guests:
        args["attendees"] = guests
    who = f", inviting {', '.join(guests)}" if guests else ""
    return await _run(tool_context, "GOOGLECALENDAR_CREATE_EVENT", args, f"Added {title} to Google Calendar",
                      confirm=f"Add “{title}” to your Google Calendar{who}?", detail=f"{start} to {end} {location}".strip())


# --- Google Maps ---------------------------------------------------------------------------

_PLACE_FIELDS = ",".join(f"places.{f}" for f in (
    "id", "displayName", "formattedAddress", "rating", "userRatingCount", "priceLevel", "businessStatus",
    "primaryTypeDisplayName", "currentOpeningHours.openNow", "regularOpeningHours.weekdayDescriptions",
    "googleMapsUri", "websiteUri", "location"))
_MODES = {"driving": "DRIVE", "walking": "WALK", "transit": "TRANSIT", "cycling": "BICYCLE"}


def _place(p: dict[str, Any]) -> dict[str, Any]:
    name = p.get("displayName")
    hours = p.get("regularOpeningHours") or {}
    out = {
        "name": name.get("text") if isinstance(name, dict) else name,
        "address": p.get("formattedAddress"),
        "rating": p.get("rating"),
        "ratings": p.get("userRatingCount"),
        "price": str(p.get("priceLevel") or "").replace("PRICE_LEVEL_", "").lower() or None,
        "open_now": (p.get("currentOpeningHours") or {}).get("openNow"),
        "hours": hours.get("weekdayDescriptions"),
        "closed": p.get("businessStatus") not in (None, "OPERATIONAL"),
        "maps": p.get("googleMapsUri"),
        "website": p.get("websiteUri"),
        "location": p.get("location"),
    }
    return {k: v for k, v in out.items() if v not in (None, [], "", False)}


async def google_maps_places(query: str, tool_context: ToolContext, near: str = "", count: int = 5) -> dict[str, Any]:
    """Google Maps search with ratings, price, opening hours and links. Use it to check places
    the user named or that `recommend` picked (is it open on Sunday? how well rated?).
    Recommendations themselves always come from `recommend`.

    Args:
        query: A place or kind of place ("Lilia Brooklyn", "late-night ramen").
        near: The area; defaults to the user's home city.
        count: How many places (1-10).
    """
    conn, _ = for_worker(tool_context)
    area = near or conn.city or ""
    text = f"{query} in {area}" if area and area.lower() not in query.lower() else query
    data, problem = await _call(tool_context, "GOOGLE_MAPS_TEXT_SEARCH",
                                {"textQuery": text, "fieldMask": _PLACE_FIELDS, "maxResultCount": max(1, min(count, 10))},
                                f'Looked up "{query}" on Google Maps')
    if problem:
        return problem
    places = _find(data, "places") or []
    return {"places": [_place(p) for p in places if isinstance(p, dict)]} if places else {"result": _trim(data)}


async def google_maps_route(destination: str, tool_context: ToolContext, origin: str = "", mode: str = "driving") -> dict[str, Any]:
    """How long it takes to get somewhere and how far it is, from Google Maps.

    Args:
        destination: Address or place name.
        origin: Start address; defaults to the user's home city.
        mode: driving, walking, transit or cycling.
    """
    conn, _ = for_worker(tool_context)
    args = {"origin_address": origin or conn.city or "", "destination_address": destination,
            "travel_mode": _MODES.get(mode, "DRIVE"), "field_mask": "routes.duration,routes.distanceMeters,routes.description"}
    data, problem = await _call(tool_context, "GOOGLE_MAPS_GET_ROUTE", args, f"Checked the way to {destination}")
    if problem:
        return problem
    route = (_find(data, "routes") or [{}])[0]
    seconds = str(route.get("duration") or "").rstrip("s")
    if not seconds.isdigit():
        return {"result": _trim(data)}
    meters = int(route.get("distanceMeters") or 0)
    return {"minutes": round(int(seconds) / 60), "km": round(meters / 1000, 1), "miles": round(meters / 1609.34, 1),
            "via": route.get("description"), "mode": mode}


# --- Slack ---------------------------------------------------------------------------------


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


# --- Notion --------------------------------------------------------------------------------


async def notion_search(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find pages and databases in the user's Notion by title.

    Args:
        query: Words from the title.
    """
    return await _run(tool_context, "NOTION_SEARCH_NOTION_PAGE", {"query": query, "page_size": 8}, f'Searched Notion for "{query}"')


async def notion_read_page(page_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """A Notion page's content as Markdown (find it with notion_search).

    Args:
        page_id: The page's id.
    """
    return await _run(tool_context, "NOTION_GET_PAGE_MARKDOWN", {"page_id": page_id}, "Read a Notion page")


async def notion_create_page(title: str, markdown: str, parent_page_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Create a Notion page under an existing page (find the parent with notion_search; asks first).

    Args:
        title: Page title.
        markdown: Page content in Markdown.
        parent_page_id: The parent page's id (dashed UUID).
    """
    return await _run(tool_context, "NOTION_CREATE_NOTION_PAGE", {"title": title, "markdown": markdown, "parent_id": parent_page_id},
                      f"Created “{title}” in Notion", confirm=f"Create the Notion page “{title}”?", detail=markdown[:600])


# --- Google Drive, Docs and Sheets -----------------------------------------------------------


async def drive_search(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find files in the user's Google Drive.

    Args:
        query: Words in the file name or text.
    """
    return await _run(tool_context, "GOOGLEDRIVE_FIND_FILE", {"q": query, "pageSize": 8}, f'Searched Drive for "{query}"')


async def docs_find(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find Google Docs by title or text.

    Args:
        query: Words in the doc.
    """
    return await _run(tool_context, "GOOGLEDOCS_SEARCH_DOCUMENTS", {"query": query, "max_results": 8}, f'Looked for docs about "{query}"')


async def docs_read(document: str, tool_context: ToolContext) -> dict[str, Any]:
    """A Google Doc's text.

    Args:
        document: The doc's id or its link.
    """
    return await _run(tool_context, "GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT", {"document_id": document}, "Read a Google Doc")


async def docs_create(title: str, markdown: str, tool_context: ToolContext) -> dict[str, Any]:
    """Write a new Google Doc from Markdown (a plan, a packing list, notes for someone; asks first).

    Args:
        title: The doc's title.
        markdown: Its content, in Markdown.
    """
    return await _run(tool_context, "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN", {"title": title, "markdown_text": markdown},
                      f"Wrote “{title}” in Google Docs", confirm=f"Make a Google Doc called “{title}”?", detail=markdown[:600])


async def sheets_find(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find Google Sheets by name.

    Args:
        query: Words at the start of the name ("Budget", "Trip").
    """
    return await _run(tool_context, "GOOGLESHEETS_SEARCH_SPREADSHEETS", {"query": query, "max_results": 8}, f'Looked for sheets called "{query}"')


async def sheets_read(spreadsheet: str, tool_context: ToolContext, cells: str = "A1:Z200") -> dict[str, Any]:
    """Read cells from a Google Sheet.

    Args:
        spreadsheet: The spreadsheet's id or link (find it with sheets_find).
        cells: A1 range, with the tab's name if it isn't the first ("Budget!A1:F50").
    """
    return await _run(tool_context, "GOOGLESHEETS_VALUES_GET", {"spreadsheet_id": spreadsheet, "range": cells}, "Read a Google Sheet")


async def sheets_add_rows(spreadsheet: str, rows_json: str, tool_context: ToolContext, tab: str = "") -> dict[str, Any]:
    """Add rows to the end of a Google Sheet's table (asks first).

    Args:
        spreadsheet: The spreadsheet's id or link.
        rows_json: A JSON list of rows, each a list of cells: [["Sat", "Lunch at Lilia", 45]].
        tab: The tab's name, if it isn't the first.
    """
    rows = _rows(rows_json)
    if isinstance(rows, str):
        return {"error": rows}
    args = {"spreadsheetId": spreadsheet, "range": f"'{tab}'!A1" if tab else "A1", "valueInputOption": "USER_ENTERED",
            "insertDataOption": "INSERT_ROWS", "majorDimension": "ROWS", "values": rows}
    return await _run(tool_context, "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", args, f"Added {len(rows)} rows to a sheet",
                      confirm=f"Add {len(rows)} row{'s' if len(rows) != 1 else ''} to the sheet?", detail=_preview(rows))


async def sheets_create(title: str, rows_json: str, tool_context: ToolContext) -> dict[str, Any]:
    """Make a new Google Sheet, with a header row and rows (asks first).

    Args:
        title: The spreadsheet's name.
        rows_json: A JSON list of rows, the first being the headers: [["Day", "Plan", "Cost"], ["Sat", "Lilia", 45]].
    """
    rows = _rows(rows_json)
    if isinstance(rows, str):
        return {"error": rows}
    data, problem = await _call(tool_context, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1", {"title": title}, f"Made the sheet “{title}”",
                                confirm=f"Make a Google Sheet called “{title}”?", detail=_preview(rows))
    if problem:
        return problem
    sheet_id = _find(data, "spreadsheetId", "spreadsheet_id", "id")
    if not rows or not sheet_id:
        return {"result": _trim(data)}
    _, problem = await _call(tool_context, "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
                             {"spreadsheetId": sheet_id, "range": "A1", "valueInputOption": "USER_ENTERED",
                              "insertDataOption": "INSERT_ROWS", "majorDimension": "ROWS", "values": rows},
                             f"Filled in {len(rows)} rows")
    url = _find(data, "spreadsheetUrl", "spreadsheet_url") or f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    return {"spreadsheet_id": sheet_id, "url": url, **(problem or {"rows": len(rows)})}


# --- the long tail -------------------------------------------------------------------------


async def find_app_action(app: str, need: str, tool_context: ToolContext) -> dict[str, Any]:
    """Find the right action in one of the user's cloud apps when no other tool covers it
    (a Slack channel's history, a Drive folder, a Calendar invite reply). Then call run_app_action.

    Args:
        app: googlecalendar, gmail, slack, notion, googledrive, googledocs, googlesheets, google_maps or ticketmaster.
            For concerts use shows_for_me instead.
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
        slug: The action's slug, e.g. "SLACK_FETCH_CONVERSATION_HISTORY".
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
    connected_apps, connect_app,
    gmail_search, find_trip_emails, gmail_draft, gmail_send,
    google_calendar_events, google_calendar_free_time, google_calendar_add,
    google_maps_places, google_maps_route,
    slack_search, slack_send,
    notion_search, notion_read_page, notion_create_page,
    drive_search, docs_find, docs_read, docs_create, sheets_find, sheets_read, sheets_add_rows, sheets_create,
    find_app_action, run_app_action,
]
