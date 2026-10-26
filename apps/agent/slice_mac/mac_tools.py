"""The worker's tools that run on the user's Mac (apps/mac/Sources/Tools/*).

Reads go straight through. Anything that sends or changes something asks the
user first (`confirm_action`), so the worker never needs to ask twice.
"""

from __future__ import annotations

import base64
from typing import Any
from urllib.parse import quote

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


async def reminders(tool_context: ToolContext, list_name: str = "", include_done: bool = False) -> dict[str, Any]:
    """What's on the user's Reminders lists (the Mac's Reminders app, iCloud lists included).

    Args:
        list_name: Only this list ("Groceries"); every list when empty.
        include_done: Also the ones already ticked off in the last two weeks.
    """
    return await _mac(tool_context, "reminders_list", {"list": list_name, "done": include_done}, label="Checked your reminders")


async def add_reminder(title: str, tool_context: ToolContext, due: str = "", notes: str = "", list_name: str = "") -> dict[str, Any]:
    """Add a reminder to the Mac's Reminders (asks the user first).

    Args:
        title: What to remember ("Pick up the cake").
        due: Optional local time to be reminded, ISO 8601 ("2026-10-29T17:00"), or a date ("2026-10-29").
        notes: Optional notes.
        list_name: Optional list to put it on; the default list otherwise.
    """
    when = f"{due}" + (f", on {list_name}" if list_name else "")
    if not await _confirm(tool_context, f"Add “{title}” to your reminders?", when.strip(", ")):
        return {"cancelled": True}
    return await _mac(tool_context, "reminders_add", {"title": title, "due": due, "notes": notes, "list": list_name},
                      label=f"Added {title} to Reminders")


async def complete_reminder(title: str, tool_context: ToolContext) -> dict[str, Any]:
    """Tick off a reminder by its title (asks the user first).

    Args:
        title: The reminder's title, or enough of it to find it.
    """
    if not await _confirm(tool_context, f"Tick off “{title}”?"):
        return {"cancelled": True}
    return await _mac(tool_context, "reminders_complete", {"title": title}, label=f"Ticked off {title}")


async def find_notes(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Search the Mac's Notes by title and text; gives each note's id, title, folder and a snippet.

    Args:
        query: Words in the note ("packing list", "Sam's address").
    """
    return await _mac(tool_context, "notes_search", {"query": query}, label=f'Searched your notes for "{query}"', timeout=30)


async def read_note(note: str, tool_context: ToolContext) -> dict[str, Any]:
    """The full text of one note in the Mac's Notes.

    Args:
        note: Its id from find_notes, or its exact title.
    """
    return await _mac(tool_context, "notes_read", {"note": note}, label="Read a note", timeout=30)


async def add_note(title: str, body: str, tool_context: ToolContext) -> dict[str, Any]:
    """Write a new note in the Mac's Notes (a plan, a list, an idea; asks the user first).

    Args:
        title: The note's title.
        body: Its text; one item per line for a list.
    """
    if not await _confirm(tool_context, f"Write the note “{title}”?", body[:600]):
        return {"cancelled": True}
    return await _mac(tool_context, "notes_add", {"title": title, "body": body}, label=f"Wrote {title} in Notes", timeout=30)


async def find_contact(name: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look someone up in the Mac's Contacts (phone numbers, emails, address, birthday).

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


async def send_file_imessage(to: str, path: str, tool_context: ToolContext, text: str = "") -> dict[str, Any]:
    """Send a file (a PDF from make_printout) by iMessage, with an optional message (asks first).

    Args:
        to: Phone number or email of the recipient (look it up with find_contact).
        path: The file's path on the Mac.
        text: A short message to go with it.
    """
    name = path.rsplit("/", 1)[-1]
    if not await _confirm(tool_context, f"Send {name} to {to}?", text):
        return {"cancelled": True}
    return await _mac(tool_context, "messages_send_file", {"to": to, "path": path, "text": text}, label=f"Sent {name} to {to}")


async def draft_email_in_mail(to: str, subject: str, body: str, tool_context: ToolContext, attachment: str = "") -> dict[str, Any]:
    """Open a ready-to-send draft in the Mac's Mail app (the user presses Send themselves).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain-text body.
        attachment: Optional path of a file on the Mac to attach (from make_printout).
    """
    return await _mac(tool_context, "mail_draft", {"to": to, "subject": subject, "body": body, "attachment": attachment},
                      label="Opened an email draft in Mail")


async def open_link(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a web page in the user's browser.

    Args:
        url: The full https:// address.
    """
    return await _mac(tool_context, "open_url", {"url": url}, label="Opened a link")


async def open_app(name: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open (or bring to the front) an app on the Mac by name: Spotify, Safari, Notes, Slack,
    Messages, Music, Maps, Photos… Use it before operate_computer when the job is in an app that
    isn't open yet.

    Args:
        name: The app's name as it appears in the Applications folder ("Spotify").
    """
    return await _mac(tool_context, "open_app", {"name": name}, label=f"Opened {name}")


async def open_directions(destination: str, tool_context: ToolContext, mode: str = "walking") -> dict[str, Any]:
    """Open directions to a place in Apple Maps, from where the user is now, ready to start.
    Use it for "take me there", "how do I get to", "directions to" (after picking the place
    with `recommend` or find_on_map).

    Args:
        destination: The place's name and area, or its address ("Lilia, Williamsburg, Brooklyn").
        mode: walking, driving or transit.
    """
    flag = {"walking": "w", "driving": "d", "transit": "r"}.get(mode.strip().lower(), "w")
    url = f"https://maps.apple.com/?daddr={quote(destination)}&dirflg={flag}"
    return await _mac(tool_context, "open_url", {"url": url}, label=f"Opened directions to {destination}")


TOOLS = [
    what_is_in_front, look_at_screen, calendar_events, add_calendar_event,
    reminders, add_reminder, complete_reminder, find_notes, read_note, add_note, find_contact,
    find_on_map, travel_time, now_playing, open_in_music, send_imessage, send_file_imessage, draft_email_in_mail, open_link,
    open_app, open_directions,
]
