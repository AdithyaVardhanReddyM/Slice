"""Planning tools: a day you can walk, the weather, shows ranked for a taste,
how much of someone's taste is near an address, and getting a plan out of
the island (the calendar, a large-print page, every week).

The demos they serve (docs/mac-plan.md): plan a trip, a day out with a
friend, someone else's week, and the Airbnb lens (address scoring).

Checked 2026-10-21: chaining Qloo places near the previous stop
(filter.location=POINT, ~900 m) gives a walkable day; counting a taste's
top 100 places within 800 m of an address separates neighbourhoods well
(Lisbon, an indie taste: Chiado 38, Príncipe Real 18, Belém 4, Parque das
Nações 1). Weather is Open-Meteo (no key). Shows come from Ticketmaster,
directly with TICKETMASTER_API_KEY or through the user's Composio account.
"""

from __future__ import annotations

import base64
import datetime as dt
import html
import json
import os
import re
import uuid
from typing import Any

import httpx
from google.adk.tools import ToolContext

from . import accounts, qloo
from .connection import Connection, for_worker, report, save_profile
from .taste import Signals, point_of, rank, signals_for, whose

# How long a stop usually takes, in minutes, for the timeline.
STAY_MIN = {"coffee": 40, "cafe": 45, "bakery": 30, "record_store": 40, "bookstore": 40, "museum": 90, "park": 60,
            "restaurant": 80, "bar": 75, "cocktail_bar": 75, "wine_bar": 75, "music_venue": 150, "hotel": 0}
INDOOR = {"coffee", "cafe", "bakery", "record_store", "bookstore", "museum", "restaurant", "bar", "cocktail_bar", "wine_bar", "music_venue"}
WALK_RADIUS_M = 900
# "Places you'd love": a taste's top 100 in the area (two Qloo pages), counted within a 10-minute walk.
NEAR_KM = 0.8
WMO = {0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle",
       53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow",
       75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms"}

_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=20.0)
    return _http


async def _weather(point: dict[str, float], day: dt.date) -> dict[str, Any]:
    res = await _client().get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": point["lat"], "longitude": point["lon"], "timezone": "auto", "forecast_days": 16,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "hourly": "precipitation_probability",
    })
    res.raise_for_status()
    data = res.json()
    days = data["daily"]["time"]
    key = day.isoformat()
    if key not in days:
        return {"error": f"No forecast for {key} yet (16 days ahead at most)."}
    i = days.index(key)
    wet = [t[11:16] for t, p in zip(data["hourly"]["time"], data["hourly"]["precipitation_probability"])
           if t.startswith(key) and (p or 0) >= 50 and "08:00" <= t[11:16] <= "23:00"]
    rain = data["daily"]["precipitation_probability_max"][i] or 0
    return {
        "date": key, "summary": WMO.get(data["daily"]["weather_code"][i], "mixed"),
        "high_c": round(data["daily"]["temperature_2m_max"][i]), "low_c": round(data["daily"]["temperature_2m_min"][i]),
        "rain_chance": rain, "wet_hours": f"{wet[0]} to {wet[-1]}" if wet else None,
        "indoors": rain >= 50,
    }


def _date(text: str, default: dt.date | None = None) -> dt.date:
    try:
        return dt.date.fromisoformat(text.strip()[:10])
    except Exception:
        return default or dt.date.today()


# --- events ------------------------------------------------------------------------------


def _find_events(data: Any) -> list[dict[str, Any]]:
    """Ticketmaster's events list, wherever a wrapper put it."""
    if isinstance(data, dict):
        events = (data.get("_embedded") or {}).get("events")
        if isinstance(events, list):
            return events
        for value in data.values():
            found = _find_events(value)
            if found:
                return found
    elif isinstance(data, list) and data and isinstance(data[0], dict) and "dates" in data[0]:
        return data
    return []


def _event(e: dict[str, Any]) -> dict[str, Any]:
    venue = ((e.get("_embedded") or {}).get("venues") or [{}])[0]
    loc = venue.get("location") or {}
    start = (e.get("dates") or {}).get("start") or {}
    acts = [a.get("name") for a in (e.get("_embedded") or {}).get("attractions") or [] if a.get("name")]
    seg = ((e.get("classifications") or [{}])[0].get("segment") or {}).get("name")
    images = sorted(e.get("images") or [], key=lambda i: i.get("width") or 0, reverse=True)
    return {
        "name": e.get("name"), "acts": acts or [e.get("name")], "date": start.get("localDate"), "time": (start.get("localTime") or "")[:5],
        "venue": venue.get("name"), "address": ", ".join(x for x in [(venue.get("address") or {}).get("line1"), (venue.get("city") or {}).get("name")] if x),
        "location": {"lat": float(loc["latitude"]), "lon": float(loc["longitude"])} if loc.get("latitude") else None,
        "url": e.get("url"), "image": images[0]["url"] if images else None, "segment": seg,
    }


async def _events(conn: Connection, city: str, start: dt.date, end: dt.date, point: dict[str, float] | None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "size": 60, "sort": "date,asc", "segmentName": "Music",
        "startDateTime": f"{start.isoformat()}T00:00:00Z", "endDateTime": f"{end.isoformat()}T23:59:59Z",
    }
    if point:
        params.update(latlong=f"{point['lat']},{point['lon']}", radius=15, unit="km")
    else:
        params["city"] = city
    key = os.environ.get("TICKETMASTER_API_KEY")
    if key:
        res = await _client().get("https://app.ticketmaster.com/discovery/v2/events.json", params={**params, "apikey": key})
        res.raise_for_status()
        return {"events": [_event(e) for e in _find_events(res.json())]}
    try:
        data = await accounts.execute(conn.user_id, "TICKETMASTER_GET_EVENTS", params)
    except accounts.NotConnected:
        # Mid-plan, a sign-in would stall everything: plan around it and offer it at the end.
        return {"not_connected": "ticketmaster",
                "next": "Ticketmaster isn't connected. Plan without a show, and at the end offer to connect it (connect_app('ticketmaster'))."}
    except Exception as err:
        return {"error": str(err)[:300]}
    return {"events": [_event(e) for e in _find_events(data)]}


# --- worker tools ------------------------------------------------------------------


async def weather(place: str, tool_context: ToolContext, date: str = "") -> dict[str, Any]:
    """The forecast for a day somewhere (Open-Meteo): summary, high and low, chance of rain and
    the wet hours. If `indoors` is true, plan indoor stops.

    Args:
        place: Neighbourhood or city.
        date: YYYY-MM-DD (default today); up to 16 days ahead.
    """
    conn, task = for_worker(tool_context)
    point = await point_of(conn, place)
    if point is None:
        return {"error": f"Couldn't place {place}."}
    try:
        out = await _weather(point, _date(date))
    except Exception as err:
        return {"error": f"The forecast didn't load: {err}"}
    await report(conn, task, "mac", f"Checked the weather in {place}", f"{out.get('summary')}, {out.get('rain_chance')}% rain" if "summary" in out else None)
    return out


async def shows_for_me(city: str, tool_context: ToolContext, date_from: str = "", date_to: str = "", near: str = "",
                       for_person: str = "", count: int = 3) -> dict[str, Any]:
    """Concerts on given dates, from Ticketmaster, ranked by Qloo for the user's taste (or a saved
    person's, or "Sam and me"), with why each fits, shown as cards. Each has the venue's address,
    for dinner near the venue (recommend near=<venue address>, also_like=<the act>).

    Args:
        city: The city ("New York", "Lisbon").
        date_from: YYYY-MM-DD, default today.
        date_to: YYYY-MM-DD, default the same day as date_from.
        near: Optional neighbourhood to search around instead of the whole city.
        for_person: A saved person, "Sam and me", or empty for the user.
        count: How many to show (1-6).
    """
    conn, task = for_worker(tool_context)
    start = _date(date_from)
    end = _date(date_to, start)
    point = await point_of(conn, near or city)
    found = await _events(conn, city, start, end, point)
    if "events" not in found:
        return found
    events = [e for e in found["events"] if e.get("acts")]
    if not events:
        await report(conn, task, "app", f"No shows found in {city}")
        return {"events": [], "note": "Ticketmaster has no music listed for those dates."}
    # One row per act; an event fits as well as its best act.
    items = [{"name": act, "kind": "artist", "event": i} for i, e in enumerate(events) for act in e["acts"][:3]]
    ranked = await rank(conn, items, "artist", for_person)
    best: dict[int, dict[str, Any]] = {}
    for r in ranked:
        if r["match"] is not None and r["event"] not in best:
            best[r["event"]] = r
    order = sorted(best.items(), key=lambda kv: kv[1]["match"], reverse=True)[:max(1, min(count, 6))]
    who = "you love" if not for_person else "of"
    out = []
    for i, r in order:
        because = f", because {who} {' and '.join(r['because'])}" if r.get("because") else ""
        out.append({**events[i], "act": r["name"], "match": r["match"], "because": r.get("because"),
                    "reason": f"{r['match']}% match{because}", "act_image": (r.get("entity") or {}).get("image")})
    if conn.tasks and out:
        conn.tasks.show_cards(task, [{k: v for k, v in {
            "title": e["act"], "tag": "Show", "subtitle": f"{e['venue']}, {e['date']} {e['time']}".strip(),
            "image": e.get("image") or e.get("act_image"), "url": e.get("url"), "reason": e["reason"],
        }.items() if v} for e in out])
    await report(conn, task, "qloo", f"Ranked {len(events)} shows for {whose(for_person or 'you')} taste", out[0]["act"] if out else "none known to Qloo")
    return {"shows": out, "looked_at": len(events)}


async def plan_walkable_day(start: str, stops: str, tool_context: ToolContext, start_time: str = "10:00",
                            for_person: str = "", also_like: str = "", date: str = "", title: str = "",
                            accessible: bool = False) -> dict[str, Any]:
    """A day of places that suit the taste, each a short walk from the last (Qloo, near the previous
    stop), with times. Shows the timeline in the island; adjust with show_day_plan if needed.

    Args:
        start: Where the day starts: an address, hotel or neighbourhood ("Chiado, Lisbon").
        stops: The kinds of stop, in order, comma-separated, from: coffee, cafe, bakery, record_store,
            bookstore, museum, park, restaurant, bar, cocktail_bar, wine_bar, music_venue.
            Indoor ones only when it rains.
        start_time: HH:MM of the first stop.
        for_person: A saved person ("Ray"), "Sam and me", or empty for the user.
        also_like: Extra things to steer by ("Mitski" for dinner before her show).
        date: YYYY-MM-DD, for the card's title.
        title: The card's title ("Thursday in Lisbon").
        accessible: Step-free places only (also on when the person needs it).
    """
    conn, task = for_worker(tool_context)
    sig = await signals_for(conn, also_like, for_person)
    if not sig.ids:
        return {"error": "No taste to go on yet."}
    here = await point_of(conn, start)
    if here is None:
        return {"error": f"Couldn't place {start}."}
    step_free = accessible or sig.step_free
    clock = dt.datetime.combine(_date(date), dt.time.fromisoformat(start_time if len(start_time) == 5 else "10:00"))
    used: set[str] = set()
    plan: list[dict[str, Any]] = []
    for kind in [k.strip() for k in stops.split(",") if k.strip()]:
        genre = kind if kind in qloo.PLACE_GENRES else None
        found: list[dict[str, Any]] = []
        for radius in (WALK_RADIUS_M, WALK_RADIUS_M * 2):
            found = [p for p in await qloo.recommend("place", sig.ids, near=here, radius_m=radius, genre=genre, take=8,
                                                     age=sig.age, accessible=step_free, exclude=sig.ids)
                     if p["id"] not in used and p.get("location")]
            if found:
                break
        if not found:
            plan.append({"kind": kind, "title": f"No {kind.replace('_', ' ')} found nearby", "time": clock.strftime("%H:%M")})
            continue
        pick = found[0]
        used.add(pick["id"])
        walk = qloo.walk_minutes(here, pick["location"])
        clock += dt.timedelta(minutes=walk)
        plan.append({
            "kind": kind, "time": clock.strftime("%H:%M"), "title": pick["name"], "address": pick.get("address"),
            "lat": pick["location"]["lat"], "lon": pick["location"]["lon"], "walk_min": walk, "image": pick.get("image"),
            "note": (pick.get("description") or "")[:110], "id": pick["id"],
        })
        clock += dt.timedelta(minutes=STAY_MIN.get(kind, 60))
        here = pick["location"]
    day_title = title or f"{'Your' if sig.who == 'you' else whose(sig.who).capitalize()} day from {start.split(',')[0]}"
    if conn.tasks:
        # One card per day: a trip plans several.
        conn.tasks.show_view(task, {"type": "timeline", "key": date or day_title, "title": day_title, "stops": [{k: v for k, v in s.items() if k != "id"} for s in plan]})
    walking = sum(s.get("walk_min") or 0 for s in plan)
    await report(conn, task, "qloo", f"Planned {len(plan)} stops for {whose(sig.who)} taste", f"{walking} min of walking in all")
    return {"for": sig.who, "stops": plan, "step_free": step_free,
            "next": "Merge in fixed things (calendar, a show, dinner) with show_day_plan if needed."}


async def show_day_plan(title: str, stops_json: str, tool_context: ToolContext) -> dict[str, Any]:
    """Show (or replace) a day's timeline card in the island, e.g. after merging a show, dinner
    near the venue, and calendar events into plan_walkable_day's stops.

    Args:
        title: The card's title ("Saturday with Sam"); the same title replaces that day's card.
        stops_json: JSON list of {"time": "HH:MM", "title", "kind", "note", "address", "walk_min",
            "lat", "lon", "image", "with": "Sam"} in order; only time and title are required.
    """
    conn, task = for_worker(tool_context)
    try:
        stops = json.loads(stops_json)
    except json.JSONDecodeError as err:
        return {"error": f"stops_json isn't valid JSON: {err}"}
    clean = [{k: v for k, v in s.items() if k in ("time", "title", "kind", "note", "address", "walk_min", "lat", "lon", "image", "with")}
             for s in stops if isinstance(s, dict) and s.get("title")]
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "timeline", "key": title, "title": title, "stops": clean[:10]})
    await report(conn, task, "slice", f"Showed the plan, {len(clean)} stops")
    return {"shown": len(clean)}


async def score_addresses(places: str, city: str, tool_context: ToolContext, for_person: str = "") -> dict[str, Any]:
    """How much of the user's taste is within a 10-minute walk of each address or neighbourhood
    (Qloo): the count of their city-wide top 100 places nearby, and the closest few. For Airbnb or
    flat listings, hotels, and "where should we stay".

    Args:
        places: Addresses or neighbourhoods, separated by semicolons ("Rua da Rosa 10, Lisbon; Belém, Lisbon").
        city: The city they're in, for the taste's top places.
        for_person: A saved person, "Sam and me", or empty for the user.
    """
    conn, task = for_worker(tool_context)
    rows = await score_places(conn, [p.strip() for p in places.split(";") if p.strip()], city, for_person)
    if "error" in rows:
        return rows
    await report(conn, task, "qloo", f"Scored {len(rows['places'])} addresses for your taste",
                 ", ".join(f"{r['place'].split(',')[0]} {r['loved_nearby']}" for r in rows["places"][:3]))
    return rows


async def score_places(conn: Connection, places: list[str], city: str, for_person: str = "",
                       points: list[dict[str, float] | None] | None = None) -> dict[str, Any]:
    """Shared by score_addresses and the Airbnb lens."""
    sig: Signals = await signals_for(conn, "", for_person)
    if not sig.ids:
        return {"error": "No taste to go on yet."}
    centre = await point_of(conn, city)
    if centre is None:
        return {"error": f"Couldn't place {city}."}
    loved = await qloo.places_for_taste(sig.ids, centre, radius_m=7000, pages=2)
    if points is None:
        res = await conn.bridge.call("maps_geocode", {"places": [p if city.lower() in p.lower() else f"{p}, {city}" for p in places]}, timeout=30)
        points = [pt if isinstance(pt, dict) and pt.get("lat") is not None else None for pt in res.get("points") or []]
        points += [None] * (len(places) - len(points))
    rows = []
    for place, pt in zip(places, points):
        if pt is None:
            rows.append({"place": place, "loved_nearby": None})
            continue
        near = sorted(((qloo.km_between(pt, p["location"]), p) for p in loved if qloo.km_between(pt, p["location"]) <= NEAR_KM), key=lambda x: x[0])
        rows.append({"place": place, "lat": pt["lat"], "lon": pt["lon"], "loved_nearby": len(near),
                     "closest": [{"name": p["name"], "walk_min": qloo.walk_minutes(pt, p["location"])} for _, p in near[:3]]})
    return {"for": sig.who, "places": rows, "of_top": len(loved)}


async def add_plan_to_calendar(events_json: str, tool_context: ToolContext) -> dict[str, Any]:
    """Add several events to the Mac's Calendar after one yes from the user (a whole day or trip).

    Args:
        events_json: JSON list of {"title", "start": "YYYY-MM-DDTHH:MM", "end", "location", "notes"}.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    try:
        events = [e for e in json.loads(events_json) if isinstance(e, dict) and e.get("title") and e.get("start")]
    except json.JSONDecodeError as err:
        return {"error": f"events_json isn't valid JSON: {err}"}
    if not events:
        return {"error": "No events to add."}
    listing = "\n".join(f"{e['start'][11:16] or e['start']}  {e['title']}" for e in events[:12])
    if not await conn.tasks.confirm_action(task, f"Add {len(events)} events to your calendar?", listing):
        return {"cancelled": True}
    added = 0
    for e in events:
        end = e.get("end") or (dt.datetime.fromisoformat(e["start"][:16]) + dt.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        res = await conn.bridge.call("calendar_add", {"title": e["title"], "start": e["start"], "end": end,
                                                      "location": e.get("location", ""), "notes": e.get("notes", "")})
        added += 0 if res.get("error") else 1
    await report(conn, task, "mac", f"Added {added} events to your calendar")
    return {"added": added}


PRINT_CSS = """
@page { size: Letter; margin: 0.6in; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; font-size: 21pt; line-height: 1.35; }
h1 { font-size: 34pt; margin: 0 0 6pt; }
.sub { font-size: 16pt; color: #555; margin-bottom: 18pt; }
h2 { font-size: 24pt; margin: 20pt 0 6pt; border-top: 3pt solid #111; padding-top: 8pt; }
ul { padding-left: 0; list-style: none; margin: 0; }
li { margin: 0 0 10pt; }
li b { display: block; }
.foot { margin-top: 24pt; font-size: 12pt; color: #777; }
"""


def _printout_html(title: str, subtitle: str, sections: list[dict[str, Any]]) -> str:
    parts = [f"<h1>{html.escape(title)}</h1>"]
    if subtitle:
        parts.append(f"<div class='sub'>{html.escape(subtitle)}</div>")
    for section in sections:
        parts.append(f"<h2>{html.escape(str(section.get('heading') or ''))}</h2><ul>")
        for item in section.get("items") or []:
            if isinstance(item, dict):
                head = html.escape(str(item.get("title") or ""))
                body = html.escape(str(item.get("detail") or ""))
                parts.append(f"<li><b>{head}</b>{body}</li>")
            else:
                parts.append(f"<li>{html.escape(str(item))}</li>")
        parts.append("</ul>")
    parts.append("<div class='foot'>Picked for your taste by Slice</div>")
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{PRINT_CSS}</style></head><body>{''.join(parts)}</body></html>"


async def make_printout(title: str, sections_json: str, tool_context: ToolContext, subtitle: str = "") -> dict[str, Any]:
    """A one-page, large-print PDF (big type, high contrast) for someone who'd rather read paper:
    "Ray's week". Saved on the Mac in Documents/Slice and opened; send it with send_file_imessage
    or draft_email_in_mail(attachment=path).

    Args:
        title: "Ray's week".
        sections_json: JSON list of {"heading": "Watch", "items": [{"title": "Out of Africa", "detail": "Tuesday, on Netflix"}]}.
        subtitle: One line under the title ("October 26 to November 1").
    """
    conn, task = for_worker(tool_context)
    try:
        sections = [s for s in json.loads(sections_json) if isinstance(s, dict)]
    except json.JSONDecodeError as err:
        return {"error": f"sections_json isn't valid JSON: {err}"}
    from slice_pages.browser import browser  # one headless Chromium per process, shared with Pages

    page = await (await browser()).new_page()
    try:
        await page.set_content(_printout_html(title, subtitle, sections), wait_until="load")
        pdf = await page.pdf(format="Letter", print_background=True)
    finally:
        await page.close()
    name = re.sub(r"[^\w' -]+", "", title).strip() or "Slice plan"
    saved = await conn.bridge.call("save_file", {"name": f"{name}.pdf", "data": base64.b64encode(pdf).decode(), "open": True}, timeout=20)
    if saved.get("error"):
        return saved
    await report(conn, task, "mac", f"Made “{title}”", "large print, one page")
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "file", "key": "printout", "title": title, "path": saved.get("path"), "detail": "Large print, ready to send"})
    return {"path": saved.get("path")}


WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


async def repeat_weekly(title: str, goal: str, weekday: str, time: str, tool_context: ToolContext) -> dict[str, Any]:
    """Run a task again every week ("do Ray's week every Sunday at 9"). The Mac starts it at that
    time while it's awake; asks the user first.

    Args:
        title: Short name for the card ("Ray's week").
        goal: The whole job, as you'd hand it to a worker, including who it's for and how to send it.
        weekday: monday … sunday.
        time: HH:MM, 24-hour, local time.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    day = weekday.strip().lower()
    if day not in WEEKDAYS or not re.fullmatch(r"\d{1,2}:\d{2}", time.strip()):
        return {"error": "weekday must be monday to sunday and time HH:MM."}
    if not await conn.tasks.confirm_action(task, f"Do “{title}” every {day.title()} at {time}?", goal[:300]):
        return {"cancelled": True}
    profile = dict(conn.profile)
    routines = [r for r in profile.get("routines") or [] if r.get("title", "").lower() != title.lower()]
    routines.append({"id": uuid.uuid4().hex[:8], "title": title, "goal": goal, "weekday": day, "time": time.strip()})
    profile["routines"] = routines
    await save_profile(conn, profile)
    await report(conn, task, "slice", f"“{title}” repeats every {day.title()} at {time}")
    return {"scheduled": True, "weekday": day, "time": time}


TOOLS = [weather, shows_for_me, plan_walkable_day, show_day_plan, score_addresses, add_plan_to_calendar,
         make_printout, repeat_weekly]
