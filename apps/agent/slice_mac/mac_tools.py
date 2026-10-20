"""The worker's tools that run on the user's Mac (apps/mac/Sources/Tools/*).

Reads go straight through. Anything that sends or changes something asks the
user first (`confirm_action`), so the worker never needs to ask twice.
"""

from __future__ import annotations

import base64
from typing import Any

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from .connection import for_worker, report

VISION_MODEL = "gemini-3.8-flash"
_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def _mac(tool_context: ToolContext, name: str, args: dict[str, Any] | None = None, *, label: str, timeout: float = 20) -> dict[str, Any]:
    conn, task = for_worker(tool_context)
    result = await conn.bridge.call(name, args or {}, timeout=timeout)
    await report(conn, task, "mac", label, result.get("error"))
    return result


async def _confirm(tool_context: ToolContext, title: str, detail: str = "") -> bool:
    conn, task = for_worker(tool_context)
    assert conn.tasks
    return await conn.tasks.confirm_action(task, title, detail)


async def what_is_in_front(tool_context: ToolContext) -> dict[str, Any]:
    """The app the user has in front, its window title and the page address in a browser."""
    return await _mac(tool_context, "frontmost_app", label="Looked at the front app")


async def look_at_screen(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Take a screenshot and answer a question about what's on it (a profile someone has open,
    a menu, a chat, a booking page).

    Args:
        question: What you need to know from the screen.
    """
    conn, task = for_worker(tool_context)
    shot = await conn.bridge.call("screenshot", {}, timeout=15)
    if shot.get("error"):
        await report(conn, task, "mac", "Couldn't see the screen", shot["error"])
        return shot
    image = base64.b64decode(shot["image"])
    res = await _client().aio.models.generate_content(
        model=VISION_MODEL,
        contents=[types.Content(role="user", parts=[
            types.Part(text=f"This is the user's screen. {question} Answer briefly and concretely."),
            types.Part.from_bytes(data=image, mime_type=shot.get("mime") or "image/jpeg"),
        ])],
    )
    await report(conn, task, "mac", "Looked at your screen")
    return {"answer": (res.text or "").strip()}


async def calendar_events(tool_context: ToolContext, days_ahead: int = 7, search: str = "") -> dict[str, Any]:
    """Events from the Mac's Calendar (iCloud, Google or Exchange calendars added to the Mac).

    Args:
        days_ahead: How many days from now to look (1-60).
        search: Only events whose title or notes contain this.
    """
    return await _mac(tool_context, "calendar_events", {"days": max(1, min(days_ahead, 60)), "search": search}, label="Checked your calendar")


async def add_calendar_event(title: str, start: str, end: str, tool_context: ToolContext, location: str = "", notes: str = "") -> dict[str, Any]:
    """Add an event to the Mac's Calendar (asks the user first).

    Args:
        title: Event title.
        start: Local start, ISO 8601 ("2026-10-23T20:00").
        end: Local end, ISO 8601.
        location: Optional place or address.
        notes: Optional notes.
    """
    if not await _confirm(tool_context, f"Add “{title}” to your calendar?", f"{start} to {end} {location}".strip()):
        return {"cancelled": True}
    return await _mac(tool_context, "calendar_add", {"title": title, "start": start, "end": end, "location": location, "notes": notes}, label=f"Added {title} to your calendar")


async def find_contact(name: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look someone up in the Mac's Contacts (phone numbers, emails, address).

    Args:
        name: Their name or part of it.
    """
    return await _mac(tool_context, "contacts_search", {"query": name}, label=f"Looked up {name} in Contacts")


async def find_on_map(query: str, tool_context: ToolContext, near: str = "") -> dict[str, Any]:
    """Apple Maps search for an address or a specific business (opening hours aren't included).
    For recommendations use `recommend` instead.

    Args:
        query: What to find ("Lilia Brooklyn", "the nearest pharmacy").
        near: Optional area to search around.
    """
    return await _mac(tool_context, "maps_search", {"query": query, "near": near}, label=f'Searched Maps for "{query}"')


async def travel_time(destination: str, tool_context: ToolContext, origin: str = "", mode: str = "driving") -> dict[str, Any]:
    """How long it takes to get somewhere (Apple Maps).

    Args:
        destination: Address or place name.
        origin: Start address; defaults to the user's home city centre.
        mode: driving, walking or transit.
    """
    conn, _ = for_worker(tool_context)
    return await _mac(tool_context, "maps_eta", {"to": destination, "from": origin or conn.city or "", "mode": mode}, label=f"Checked travel time to {destination}")


async def now_playing(tool_context: ToolContext) -> dict[str, Any]:
    """What's playing in Music or Spotify right now."""
    return await _mac(tool_context, "music_now_playing", label="Checked what's playing")


async def open_in_music(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a search for an artist, album or playlist in Spotify (or Apple Music) so the user can play it.

    Args:
        query: What to look for ("Beach House Bloom").
    """
    return await _mac(tool_context, "music_open", {"query": query}, label=f"Opened {query} in your music app")


async def send_imessage(to: str, text: str, tool_context: ToolContext) -> dict[str, Any]:
    """Send an iMessage or SMS from the Mac's Messages app (asks the user first).

    Args:
        to: Phone number or email of the recipient (look it up with find_contact).
        text: The message.
    """
    if not await _confirm(tool_context, f"Send this to {to}?", text):
        return {"cancelled": True}
    return await _mac(tool_context, "messages_send", {"to": to, "text": text}, label=f"Messaged {to}")


async def draft_email_in_mail(to: str, subject: str, body: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a ready-to-send draft in the Mac's Mail app (the user presses Send themselves).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain-text body.
    """
    return await _mac(tool_context, "mail_draft", {"to": to, "subject": subject, "body": body}, label="Opened an email draft in Mail")


async def open_link(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a web page in the user's browser.

    Args:
        url: The full https:// address.
    """
    return await _mac(tool_context, "open_url", {"url": url}, label="Opened a link")


TOOLS = [
    what_is_in_front, look_at_screen, calendar_events, add_calendar_event, find_contact,
    find_on_map, travel_time, now_playing, open_in_music, send_imessage, draft_email_in_mail, open_link,
]
