"""Playbooks: each long demo as one worker tool.

The long demos (docs/mac-plan.md, "The six demos") used to take the worker
ten to fifteen steps: taste_map, then weather, then one plan_walkable_day per
day, then shows_for_me, a recommend per meal, show_day_plan, and every step
was a model round trip of 3 to 20 s on the shared quota. Here the chain runs
in Python, the independent parts at the same time (qloo.py's gate keeps Qloo
to four calls at once), and shows the same island views (map, timeline,
person, gifts, cards). The worker calls one playbook, speaks the result and
offers the follow-ups (book, calendar, message, printout, every week); those
stay separate tools behind a yes. add_this_plan_to_calendar and
print_this_plan reuse what the playbook planned, so the worker never has to
write the plan back out as JSON.
"""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import json
import os
import re
import time
from typing import Any

from google.adk.tools import ToolContext

from . import accounts, lens, plans, qloo, taste, tripdoc
from .connection import Connection, for_worker, report
from .plans import (
    STAY_MIN,
    _date,
    _hhmm,
    _weather,
    ranked_shows,
    show_cards_for,
    timeline_stops,
    walkable_stops,
)
from .taste import picks, point_of, signals_for, whose

DEBUG = bool(os.environ.get("MAC_DEBUG"))

# What each task's last playbook planned, for add_this_plan_to_calendar, write_this_plan,
# book_this_table and print_this_plan; and each user's latest plan, because "put it in a doc" can
# arrive as a new task (the talker started one) rather than a follow-up on the planning task.
_planned: dict[str, dict[str, Any]] = {}
_latest: dict[str, str] = {}

# A trip day's stops and roughly when each starts; the arrival and departure days keep the ones that
# fit. Three shapes take turns so a week doesn't read as the same day seven times.
DAY_SLOTS = [("coffee", "09:30"), ("museum", "10:30"), ("restaurant", "12:30"), ("record_store", "14:00"), ("park", "15:30")]
DAY_SHAPES = [
    [("coffee", "09:30"), ("museum", "10:30"), ("restaurant", "12:30"), ("record_store", "14:00"), ("park", "15:30")],
    [("bakery", "09:30"), ("bookstore", "10:15"), ("museum", "11:00"), ("restaurant", "13:00"), ("cafe", "15:00")],
    [("coffee", "09:30"), ("park", "10:15"), ("museum", "11:30"), ("restaurant", "13:15"), ("record_store", "15:00")],
]
EVENINGS = ["cocktail_bar", "wine_bar", "music_venue"]
EVENING_AT = "19:30"
# A task keeps ten rich cards (tasks.show_view): the map, eight days ("12 to 19" is eight) and the doc.
MAX_TRIP_DAYS = 8
WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class _Laps:
    """Stage times in the brain's log (MAC_DEBUG=1), to see where a playbook spends its time."""

    def __init__(self, name: str) -> None:
        self.name, self.t0 = name, time.monotonic()

    def __call__(self, stage: str) -> None:
        if DEBUG:
            print(f"mac: {self.name} {stage} at {time.monotonic() - self.t0:.1f}s", flush=True)


def _remember(conn: Connection, task: Any, **plan: Any) -> None:
    _planned[task.id] = plan
    _latest[conn.user_id] = task.id
    while len(_planned) > 50:
        _planned.pop(next(iter(_planned)))


def _plan_for(conn: Connection, task: Any) -> dict[str, Any]:
    """This task's plan, else the user's latest one in this brain."""
    return _planned.get(task.id) or _planned.get(_latest.get(conn.user_id, ""), {})


# A kind with nothing near the last stop gets one stand-in, not a "No record store found" stop.
STAND_IN = {"record_store": "bookstore", "bookstore": "cafe", "museum": "bookstore", "park": "cafe", "coffee": "cafe",
            "cafe": "bakery", "wine_bar": "bar", "cocktail_bar": "bar", "music_venue": "bar"}


async def _stops(conn: Connection, sig: Any, here: dict[str, float], kinds: list[str], clock: dt.datetime, used: set[str],
                 where: str) -> tuple[list[dict[str, Any]], dict[str, float]]:
    """plans.walkable_stops with stand-ins, leaving out any kind still found nowhere near."""
    stops, end, _ = await walkable_stops(conn, sig, here, kinds, clock, sig.step_free, used, where=where, stand_ins=STAND_IN)
    return [s for s in stops if not s["title"].startswith("No ")], end


async def _safe(coro: Any) -> Any:
    """One part failing (Qloo busy, the forecast down) shouldn't sink the whole plan."""
    try:
        return await coro
    except Exception as err:
        print(f"mac: playbook part failed: {type(err).__name__}: {err}", flush=True)
        return {"error": f"{type(err).__name__}: {str(err)[:200]}"}


def _at(day: dt.date, hhmm: str) -> dt.datetime:
    return dt.datetime.combine(day, _hhmm(hhmm))


def _short(stops: list[dict[str, Any]]) -> list[str]:
    """Stops as "13:05 Taberna da Rua (restaurant)", for the worker to speak from."""
    return [f"{s.get('time', '')} {s['title']}" + (f" ({s['kind'].replace('_', ' ')})" if s.get("kind") else "") for s in stops]


def _events_for(day: dt.date, stops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for s in stops:
        if not s.get("time") or s.get("kind") == "calendar" or s["title"].startswith("No "):
            continue
        start = _at(day, s["time"])
        end = start + dt.timedelta(minutes=STAY_MIN.get(s.get("kind") or "", 60) or 60)
        out.append({"title": s["title"], "start": start.strftime("%Y-%m-%dT%H:%M"), "end": end.strftime("%Y-%m-%dT%H:%M"),
                    "location": s.get("address") or "", "notes": "Planned by Slice"})
    return out


def _weather_line(w: dict[str, Any]) -> str | None:
    if not w or "summary" not in w:
        return None
    if w.get("typical"):
        return f"usually around {w['high_c']}°C this time of year (last year: {w['summary']})"
    return f"{w['summary']}, {w['high_c']}°C, {w['rain_chance']}% rain" + (f" ({w['wet_hours']})" if w.get("wet_hours") else "")


def _fix_walk(stops: list[dict[str, Any]], i: int, came_from: dict[str, float] | None) -> None:
    """After merging pieces planned at the same time, the walk to a piece's first stop is from where
    the last piece ended."""
    if came_from and 0 <= i < len(stops) and stops[i].get("lat") is not None:
        stops[i]["walk_min"] = qloo.walk_minutes(came_from, {"lat": stops[i]["lat"], "lon": stops[i]["lon"]})


def _end_of(stops: list[dict[str, Any]]) -> dict[str, float] | None:
    for s in reversed(stops):
        if s.get("lat") is not None:
            return {"lat": s["lat"], "lon": s["lon"]}
    return None


def _shows_note(found: dict[str, Any]) -> str | None:
    if found.get("not_connected"):
        return "Shows need Ticketmaster: offer connect_app('ticketmaster'), then shows_for_me."
    if found.get("error"):
        return "Ticketmaster didn't answer, so no shows this time."
    if not found.get("shows"):
        return found.get("note") or "No shows found for those dates."
    return None


async def _venue_point(conn: Connection, show: dict[str, Any]) -> dict[str, float] | None:
    if show.get("location"):
        return show["location"]
    return await point_of(conn, show.get("address") or show.get("venue") or "")


def _show_stop(show: dict[str, Any], who: str | None = None) -> dict[str, Any]:
    stop = {"time": show.get("time") or "20:00", "title": f"{show['act']} at {show['venue']}", "kind": "music_venue",
            "address": show.get("address"), "note": show.get("reason"), "image": show.get("image") or show.get("act_image")}
    if show.get("location"):
        stop.update(lat=show["location"]["lat"], lon=show["location"]["lon"])
    if who:
        stop["with"] = who
    return stop


async def _dinner_before(conn: Connection, show: dict[str, Any], for_person: str, used: set[str],
                         day: dt.date) -> list[dict[str, Any]]:
    """Dinner near the venue that suits the act's crowd, done half an hour before the show."""
    venue = await _venue_point(conn, show)
    if venue is None:
        return []
    sig = await signals_for(conn, show["act"], for_person)
    starts = _at(day, show.get("time") or "20:00") - dt.timedelta(minutes=STAY_MIN["restaurant"] + 30)
    stops, _ = await _stops(conn, sig, venue, ["restaurant"], starts, used, show.get("address") or "")
    for s in stops:
        s["note"] = f"Near {show['venue']}, suits a {show['act']} crowd"
    return stops


# --- the trip -----------------------------------------------------------------------


def _day_kinds(i: int, wet: bool) -> list[tuple[str, str]]:
    """The day's shape, with the park swapped for somewhere indoors when it rains."""
    shape = DAY_SHAPES[i % len(DAY_SHAPES)]
    if not wet:
        return shape
    have = {k for k, _ in shape}
    indoors = next(k for k in ("bookstore", "cafe", "record_store", "bakery") if k not in have)
    return [(indoors if k == "park" else k, t) for k, t in shape]


async def plan_trip(city: str, date_from: str, date_to: str, tool_context: ToolContext, stay: str = "",
                    arrive_time: str = "", leave_time: str = "", for_person: str = "", party: str = "") -> dict[str, Any]:
    """A whole trip in one call: where the taste lives in the city (a map card), the weather each
    day (last year's weather when it's too far ahead for a forecast), a walkable day of Qloo picks
    for every day (one timeline card per day; indoor stops when it rains; the arrival and departure
    days fit around the travel), and shows on those dates ranked for the taste, the best one with
    dinner near the venue. Use it for "plan my Paris trip" once the dates are known. Never guess the
    dates: if the user hasn't said when, ask_user ("Which dates?") before calling this. Afterwards
    write_this_plan (a doc), add_this_plan_to_calendar and book_this_table are offers behind a yes.

    Args:
        city: The city ("Lisbon").
        date_from: The first day, YYYY-MM-DD, from the user.
        date_to: The last day, YYYY-MM-DD (eight days at most are planned).
        stay: Their hotel or address, if known ("Hotel do Chiado, Rua Nova do Almada 114").
        arrive_time: HH:MM they arrive on the first day, if known.
        leave_time: HH:MM they leave on the last day, if known.
        for_person: A saved person or "Sam and me", or empty for the user.
        party: Who's going, in the user's words ("just me", "me and Sam"), for the booking later.
    """
    conn, task = for_worker(tool_context)
    lap = _Laps("plan_trip")
    if not date_from.strip():
        return {"error": "No dates. Ask the user which dates (ask_user) and call plan_trip again; never guess them."}
    start = _date(date_from)
    end = max(start, _date(date_to, start))
    days = [start + dt.timedelta(days=i) for i in range(min((end - start).days + 1, MAX_TRIP_DAYS))]
    sig = await signals_for(conn, "", for_person)
    if not sig.ids:
        return {"error": "No taste to go on yet."}
    centre = await point_of(conn, city)
    if centre is None:
        return {"error": f"Couldn't place {city}."}
    stay_query = stay if not stay or city.lower() in stay.lower() else f"{stay}, {city}"

    async def weathers() -> list[dict[str, Any]]:
        got = await asyncio.gather(*(_safe(_weather(centre, d)) for d in days))
        await report(conn, task, "mac", f"Checked the weather in {city}", "; ".join(
            f"{WEEKDAY[d.weekday()][:3]} {w['summary']}" for d, w in zip(days, got) if "summary" in w) or None)
        return got

    mapped, forecast, found, stay_pt = await asyncio.gather(
        _safe(taste.taste_map(city, tool_context, for_person)), weathers(),
        _safe(ranked_shows(conn, task, city, start, end, "", for_person, 4)),
        _safe(point_of(conn, stay_query, near=centre)) if stay else asyncio.sleep(0, None),
    )
    lap("map, weather and shows")
    stay_pt = stay_pt if isinstance(stay_pt, dict) and "lat" in stay_pt else None
    if stay and stay_pt is None and "," in stay:
        # "Hôtel X, Marais, Paris" may not geocode as given; the hotel's name and the city usually do.
        stay_pt = await _safe(point_of(conn, f"{stay.split(',')[0].strip()}, {city}", near=centre))
        stay_pt = stay_pt if isinstance(stay_pt, dict) and "lat" in stay_pt else None
    if stay and stay_pt is None:
        await report(conn, task, "mac", f"Couldn't place {stay.split(',')[0]}", "the days start in your kind of neighbourhoods instead")
    areas = [a for a in (mapped.get("areas") or []) if isinstance(a, dict)]
    shows = found.get("shows") or []
    best = shows[0] if shows and _date(shows[0].get("date") or "", end + dt.timedelta(days=1)) in days else None

    # Day one starts at the hotel; the others each start in another neighbourhood the taste likes.
    others = [a for a in areas if not stay_pt or qloo.km_between(stay_pt, a) > 1.0] or areas
    starts: list[tuple[str, dict[str, float]]] = []
    for i in range(len(days)):
        if i == 0 and stay_pt:
            starts.append((stay.split(",")[0], stay_pt))
        elif others:
            a = others[(i - (1 if stay_pt else 0)) % len(others)]
            starts.append((a["name"], {"lat": a["lat"], "lon": a["lon"]}))
        else:
            starts.append((stay.split(",")[0] if stay_pt else city, stay_pt or centre))

    used: set[str] = set()

    async def one_day(i: int, day: dt.date) -> dict[str, Any]:
        w = forecast[i] if i < len(forecast) else {}
        slots = _day_kinds(i, bool(w.get("indoors")))
        first = i == 0
        last = i == len(days) - 1 and len(days) > 1
        begin = "09:30"
        evening = True
        if first and arrive_time:
            arrive = _at(day, arrive_time) + dt.timedelta(minutes=90)
            begin = arrive.strftime("%H:%M")
            slots = [(k, t) for k, t in slots if _at(day, t) >= arrive - dt.timedelta(minutes=30)]
        if last:
            if leave_time:
                done_by = _at(day, leave_time) - dt.timedelta(hours=3)
                slots = [(k, t) for k, t in slots if _at(day, t) + dt.timedelta(minutes=STAY_MIN.get(k, 60)) <= done_by]
                evening = done_by >= _at(day, "22:30")
            else:
                slots, evening = slots[:3], False
        label, here = starts[i]
        clock = max(_at(day, begin), _at(day, slots[0][1])) if slots else _at(day, begin)
        stops, here = await _stops(conn, sig, here, [k for k, _ in slots], clock, used, f"{label}, {city}")
        if best and _date(best.get("date") or "") == day:
            night = await _dinner_before(conn, best, for_person, used, day) + [_show_stop(best)]
        elif evening:
            night, _ = await _stops(conn, sig, here, ["restaurant", EVENINGS[i % len(EVENINGS)]], _at(day, EVENING_AT), used, f"{label}, {city}")
        else:
            night = []
        _fix_walk(night, 0, _end_of(stops))
        clean = timeline_stops(stops + night)
        # "Friday in Alfama": where most of the day's stops are (Qloo's neighbourhood for each place).
        seen = [s["area"] for s in stops + night if s.get("area") and s["area"].lower() != city.split(',')[0].lower()]
        where = max(set(seen), key=seen.count) if seen else city.split(',')[0]
        title = f"{WEEKDAY[day.weekday()]} in {where}"
        return {"date": day.isoformat(), "title": title, "from": label, "area": where, "weather": _weather_line(w),
                "weather_data": w, "stops": clean, "raw": stops + night}

    planned = await asyncio.gather(*(one_day(i, d) for i, d in enumerate(days)))
    lap(f"{len(planned)} days")
    if conn.tasks:
        for d in planned:
            conn.tasks.show_view(task, {"type": "timeline", "key": d["date"], "title": d["title"], "stops": d["stops"]})
        if shows:
            conn.tasks.show_cards(task, show_cards_for(shows))
    stops_total = sum(len(d["stops"]) for d in planned)
    await report(conn, task, "qloo", f"Planned {len(planned)} days for {whose(sig.who)} taste", f"{stops_total} stops, each a short walk from the last")

    dinners = [(d, s) for d in planned for s in d["raw"] if s.get("kind") == "restaurant" and s.get("time", "") >= "17:00"]
    show_day = next(((d, s) for d, s in dinners if best and d["date"] == best.get("date")), None)
    # The one to offer booking: the show night's, else the most bookable one from the second day on
    # (its own website, takes reservations, a proper restaurant), else the first.
    later = [(d, s) for d, s in dinners if d["date"] != planned[0]["date"]] or dinners
    dinner = show_day or (max(later, key=lambda ds: _bookable(ds[1])) if later else None)
    dinner_raw = dinner[1] if dinner else None
    to_book = {"name": dinner[1]["title"], "date": dinner[0]["date"], "time": dinner[1]["time"], "address": dinner[1].get("address"),
               "url": dinner_raw.get("url"), "phone": dinner_raw.get("phone"), "party": party or "1"} if dinner else None
    city_name = city.split(",")[0]
    # The calendar gets one event per day (the day's stops in its notes), not forty separate stops.
    events = _day_events(city_name, planned)
    _remember(conn, task, events=events, title=f"{city_name} trip", trip={
        "city": city, "days": [{k: d[k] for k in ("date", "title", "area", "weather", "weather_data")} | {"stops": d["raw"]} for d in planned],
        "areas": areas[:3], "loves": list(sig.names.values()), "names": sig.names, "signal_ids": sig.ids, "age": sig.age, "stay": stay,
        "taste_words": [t.get("name") for t in conn.profile.get("tags") or [] if isinstance(t, dict) and t.get("name")],
        "dinner": to_book, "shows": [{"act": s["act"], "venue": s["venue"], "date": s["date"], "time": s["time"], "match": s["match"]} for s in shows[:3]],
    })
    return {
        "for": sig.who,
        "your_city": [{"area": a["name"], "places_you_d_love": a.get("places"), "e_g": a.get("examples", [])[:2]} for a in areas[:3]],
        "days": [{"date": d["date"], "day": d["title"], "starts_from": d["from"], "weather": d["weather"], "plan": _short(d["stops"])}
                 for d in planned],
        "shows": [{"act": s["act"], "venue": s["venue"], "date": s["date"], "time": s["time"], "match": s["match"], "url": s.get("url")}
                  for s in shows[:3]],
        "shows_note": _shows_note(found),
        "dinner_to_book": to_book,
        "shown": "A map card, one timeline card per day" + (", show cards" if shows else ""),
        "next": "Say where their taste lives and one or two highlights (real names from the plan) in two or three "
                "sentences, then offer to put it in a doc (write_this_plan) or the days in their calendar "
                "(add_this_plan_to_calendar). Booking dinner_to_book (book_this_table) comes after those.",
    }


def _bookable(stop: dict[str, Any]) -> int:
    """How likely a dinner is to have a booking page the operator can work: its own website, Qloo
    says it takes reservations, a sit-down restaurant at a mid price."""
    tags = {str(t).lower() for t in stop.get("tags") or []}
    score = 0
    if stop.get("url"):
        score += 4
    if "reservations" in tags:
        score += 3
    if "usually a wait" in tags or "popular" in tags:
        score += 1
    if stop.get("price_level") in (2, 3):
        score += 1
    if (stop.get("rating") or 0) >= 4.4:
        score += 1
    return score


def _day_events(city: str, planned: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One calendar event per trip day: "Paris: Thursday in Le Marais", from the first stop to the
    end of the last, the stops listed in the notes."""
    out = []
    for d in planned:
        stops = [s for s in d["stops"] if s.get("time") and not str(s["title"]).startswith("No ")]
        if not stops:
            continue
        day = _date(d["date"])
        start = _at(day, stops[0]["time"])
        last = stops[-1]
        end = _at(day, last["time"]) + dt.timedelta(minutes=STAY_MIN.get(last.get("kind") or "", 60) or 60)
        if end.date() != day:
            end = _at(day, "23:59")
        notes = "\n".join(f"{s['time']}  {s['title']}" + (f", {s['address']}" if s.get("address") else "") for s in stops)
        if d.get("weather"):
            notes = f"Weather: {d['weather']}\n\n{notes}"
        out.append({"title": f"{city}: {d['title']}", "start": start.strftime("%Y-%m-%dT%H:%M"), "end": end.strftime("%Y-%m-%dT%H:%M"),
                    "location": stops[0].get("address") or "", "notes": notes + "\n\nPlanned by Slice"})
    return out


# --- a day out --------------------------------------------------------------------------


def _midpoint(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"lat": (a["lat"] + b["lat"]) / 2, "lon": (a["lon"] + b["lon"]) / 2}


async def plan_day_out(tool_context: ToolContext, date: str = "", friend: str = "", friend_from: str = "14:00",
                       area: str = "", meet_near: str = "", start_time: str = "") -> dict[str, Any]:
    """A whole day out in one call, merged into one timeline card: the user's calendar that day,
    the weather (indoor stops if it rains), a morning near home for the user's taste, the afternoon
    and evening for "<friend> and me" (what the two tastes share), and the evening's best show for
    both with dinner near the venue that suits the act; with no show, dinner and a music venue.
    For "plan my Saturday, Sam's joining after 2". Then messaging the friend, booking dinner,
    opening the ticket page and add_this_plan_to_calendar are offers behind a yes.

    Args:
        date: The day, YYYY-MM-DD (default today).
        friend: Who joins, by first name, saved with remember_person ("Sam"); empty for a day alone.
        friend_from: HH:MM the friend joins.
        area: Where the day starts, if not the user's home ("Williamsburg, Brooklyn").
        meet_near: Where to meet the friend, if known; else between their homes.
        start_time: HH:MM to start, if not after the morning's calendar events (default 10:00).
    """
    conn, task = for_worker(tool_context)
    lap = _Laps("plan_day_out")
    day = _date(date)
    home = area or conn.city or ""
    if not home:
        return {"error": "Where does the day start? Pass `area`."}
    name, friend_loves, friend_info = taste._person(conn, friend) if friend else ("", [], {})
    both = f"{name} and me" if friend else ""
    days_ahead = max(1, (day - dt.date.today()).days + 1)

    async def friend_home() -> dict[str, float] | None:
        where = meet_near or friend_info.get("home") or ""
        return await point_of(conn, where) if where else None

    async def compare() -> dict[str, Any]:
        if conn.taste_off:
            return {}
        if not friend_loves:
            return {"error": f"I don't know what {name or friend} loves yet."}
        return await taste.compare_tastes(name, tool_context)

    home_pt, friend_pt, calendar, shared, found, contact = await asyncio.gather(
        _safe(point_of(conn, home)), _safe(friend_home()),
        _safe(conn.bridge.call("calendar_events", {"days": min(days_ahead, 60), "search": ""}, timeout=10)),
        _safe(compare()) if friend else asyncio.sleep(0, {}),
        _safe(ranked_shows(conn, task, home, day, day, "", both, 3)),
        _safe(conn.bridge.call("contacts_search", {"query": name}, timeout=8)) if friend else asyncio.sleep(0, {}),
    )
    lap("calendar, shows and compare")
    if not isinstance(home_pt, dict) or "lat" not in home_pt:
        return {"error": f"Couldn't place {home}."}
    await report(conn, task, "mac", "Checked your calendar")
    w = await _safe(_weather(home_pt, day))
    wet = bool(w.get("indoors"))
    await report(conn, task, "mac", f"Checked the weather in {home.split(',')[0]}", _weather_line(w))

    # Calendar events that day are fixed stops; a morning one moves the start.
    fixed: list[dict[str, Any]] = []
    begin = _at(day, start_time or "10:00")
    for e in (calendar.get("events") or []) if isinstance(calendar, dict) else []:
        try:
            s, f = dt.datetime.fromisoformat(e["start"][:16]), dt.datetime.fromisoformat(e["end"][:16])
        except Exception:
            continue
        if s.date() != day or e.get("all_day"):
            continue
        fixed.append({"time": s.strftime("%H:%M"), "title": e.get("title") or "Busy", "kind": "calendar",
                      "address": e.get("location"), "note": "In your calendar"})
        if not start_time and f.hour < 13 and f > begin - dt.timedelta(hours=3):
            begin = max(begin, f + dt.timedelta(minutes=30))

    me = await signals_for(conn, "", "")
    us = await signals_for(conn, "", both) if friend else me
    if not me.ids:
        return {"error": "No taste to go on yet."}
    meet = friend_pt if isinstance(friend_pt, dict) and meet_near else (
        _midpoint(home_pt, friend_pt) if isinstance(friend_pt, dict) and qloo.km_between(home_pt, friend_pt) < 10 else home_pt)
    joins = _at(day, friend_from or "14:00")
    shows = found.get("shows") or []
    best = shows[0] if shows else None
    used: set[str] = set()

    morning_kinds = ["coffee", "bookstore" if wet else "record_store", "restaurant"]
    afternoon_kinds = ["museum", "bookstore" if wet else "park", "cafe"]

    async def morning() -> list[dict[str, Any]]:
        if not friend:
            return []
        stops, _ = await _stops(conn, me, home_pt, morning_kinds, begin, used, home)
        # Lunch is the user's alone; anything that would run into the friend's time goes.
        return [s for s in stops if not s.get("time") or _at(day, s["time"]) < joins - dt.timedelta(minutes=20)]

    async def afternoon() -> list[dict[str, Any]]:
        clock = joins if friend else begin
        kinds = afternoon_kinds if friend else morning_kinds[:2] + afternoon_kinds
        stops, _ = await _stops(conn, us, meet if friend else home_pt, kinds, clock, used, home)
        return stops

    async def evening() -> list[dict[str, Any]]:
        if best:
            return await _dinner_before(conn, best, both, used, day) + [_show_stop(best)]
        stops, _ = await _stops(conn, us, meet if friend else home_pt, ["restaurant", "music_venue"], _at(day, "19:00"), used, home)
        return stops

    am, pm, night = await asyncio.gather(morning(), afternoon(), evening())
    lap("morning, afternoon and evening")
    if friend:
        for s in pm + night:
            s["with"] = name
    _fix_walk(pm, 0, _end_of(am))
    _fix_walk(night, 0, _end_of(pm))
    merged = timeline_stops(sorted(fixed + am + pm + night, key=lambda s: s.get("time") or ""))
    title = f"{WEEKDAY[day.weekday()]} with {name}" if friend else f"Your {WEEKDAY[day.weekday()]}"
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "timeline", "key": day.isoformat(), "title": title, "stops": merged})
        if shows:
            conn.tasks.show_cards(task, show_cards_for(shows))
    await report(conn, task, "qloo", f"Planned {title}", f"{len(merged)} stops for {whose(us.who)} taste")

    dinner = next((s for s in night if s.get("kind") == "restaurant"), None)
    phones = ((contact.get("contacts") or [{}])[0] if isinstance(contact, dict) else {})
    _remember(conn, task, events=_events_for(day, merged), title=title)
    return {
        "date": day.isoformat(), "title": title, "weather": _weather_line(w),
        "calendar_that_day": [f"{s['time']} {s['title']}" for s in fixed],
        "shared_with_friend": [t["name"] for t in (shared.get("shared") or [])[:5]] if isinstance(shared, dict) else [],
        "friend_loves": [p["name"] for p in friend_loves[:5]],
        "morning": _short(am), "afternoon": _short(pm), "evening": _short(night),
        "show": {"act": best["act"], "venue": best["venue"], "time": best["time"], "match": best["match"], "url": best.get("url")} if best else None,
        "shows_note": _shows_note(found) if not best else None,
        "dinner_to_book": {"name": dinner["title"], "time": dinner.get("time"), "address": dinner.get("address")} if dinner else None,
        "friend_contact": {"name": phones.get("name"), "phone": (phones.get("phones") or [None])[0]} if phones else None,
        "shown": "One timeline card for the whole day" + (", show cards" if shows else ""),
        "next": "Say the day's shape in two or three sentences. Offer: message the friend (words that suit "
                "friend_loves; send_imessage to friend_contact), book dinner_to_book, open the ticket page, "
                "add_this_plan_to_calendar.",
    }


# --- someone else's week ----------------------------------------------------------------


async def plan_for_someone(person: str, tool_context: ToolContext, likes: str = "", age: int = 0, home: str = "",
                           needs: str = "", relation: str = "", birthday: str = "", printout: bool = False) -> dict[str, Any]:
    """Someone else's week in one call: saves them (a person card) with what they love, their age,
    home and needs, then picks for their taste and age what to watch (films and a series), what to
    listen to (podcasts) and where to go for lunch near their home (step-free when they need it),
    each with why, as cards. For "my dad Ray is 74, uses a walker, loves…, put together his week".
    printout=true also makes the large-print page now; otherwise print_this_plan does it later.
    Sending it and repeat_weekly are offers behind a yes.

    Args:
        person: Their first name ("Ray").
        likes: What they love, comma-separated ("Frank Sinatra, Casablanca, Downton Abbey"); empty if saved.
        age: Their age in years, if known.
        home: Where they live ("Lincoln Park, Chicago").
        needs: Access or other needs in plain words ("uses a walker").
        relation: Who they are to the user ("dad").
        birthday: "MM-DD", if known.
        printout: Make the large-print page right away (they asked for it on paper).
    """
    conn, task = for_worker(tool_context)
    lap = _Laps("plan_for_someone")
    if likes or age or home or needs or relation or birthday:
        saved = await taste.remember_person(person, likes, tool_context, age, home, needs, birthday, relation)
        if not saved.get("saved") and not taste._person(conn, person)[1]:
            return {"error": f"Qloo didn't recognise what {person} loves ({likes}). Ask for exact titles or names."}
    lap("saved")
    name, loves, info = taste._person(conn, person)
    if not loves:
        return {"error": f"I don't know what {person} loves yet: pass likes."}
    sig = await signals_for(conn, "", name)
    where = info.get("home") or conn.city or ""
    # Six cards: a film and a series, a musician and a podcast, two lunches.
    asks = {"Watch": [("movie", 1, ""), ("tv_show", 1, "")], "Listen": [("artist", 1, ""), ("podcast", 1, "")],
            "Lunch": [("place", 2, "restaurant")]}
    jobs = [(tag, kind, n, genre) for tag, rows in asks.items() for kind, n, genre in rows]
    results, contact = await asyncio.gather(
        asyncio.gather(*(_safe(picks(conn, task, kind, where if kind == "place" else "", genre, "", name, n)) for _, kind, n, genre in jobs)),
        _safe(conn.bridge.call("contacts_search", {"query": name}, timeout=8)),
    )

    # Why each fits: the loved things Qloo says drive it more than the rest.
    async def drivers(kind: str, ids: list[str]) -> dict[str, list[str]]:
        if not ids or conn.taste_off:
            return {}
        try:
            return taste.standouts(await qloo.score(kind, sig.ids, ids, age=sig.age))
        except Exception:
            return {}

    lap("picks")
    rows = [(tag, kind, (r.get("picks") or []) if isinstance(r, dict) else []) for (tag, kind, _, _), r in zip(jobs, results)]
    # A lunch spot's reason is where it is, not what it shares.
    why = await asyncio.gather(*(drivers(kind, [p["id"] for p in ps if p.get("id")] if kind != "place" else []) for _, kind, ps in rows))
    lap("reasons")
    names = dict(sig.names)
    cards, sections = [], {"Watch": [], "Listen": [], "Go out": []}
    for (tag, kind, ps), because in zip(rows, why):
        for p in ps:
            loved = [names[i] for i in because.get(p.get("id"), []) if i in names]
            if kind == "place":
                reason = ("Step-free way in, " if sig.step_free else "") + (f"near {where.split(',')[0]}" if where else "close by")
                subtitle = p.get("address")
            else:
                reason = f"For {name}'s love of {loved[0]}" if loved else (p.get("description") or "")[:90]
                label = {"tv_show": "series", "movie": "film", "artist": "music"}.get(kind, kind)
                subtitle = ", ".join(str(x) for x in [p.get("year"), label] if x)
            cards.append({k: v for k, v in {"title": p["name"], "tag": tag, "subtitle": subtitle, "image": p.get("image"),
                                             "reason": reason}.items() if v})
            detail = p.get("address") if kind == "place" else (p.get("description") or "")[:120]
            sections["Go out" if kind == "place" else tag].append({"title": p["name"], "detail": detail or ""})
    if conn.tasks:
        # Marked as someone else's, so the island doesn't offer thumbs that would teach the user's taste.
        conn.tasks.show_cards(task, [{**c, "for": name} for c in cards[:6]])
    await report(conn, task, "slice", f"Showed {len(cards[:6])} picks for {name}")
    sheet = [{"heading": h, "items": items} for h, items in sections.items() if items]
    title = f"{name}'s week"
    first = dt.date.today() + dt.timedelta(days=(7 - dt.date.today().weekday()) % 7)
    subtitle = f"{first.strftime('%B')} {first.day} to {(first + dt.timedelta(days=6)).strftime('%B')} {(first + dt.timedelta(days=6)).day}"
    _remember(conn, task, printout={"title": title, "subtitle": subtitle, "sections": sheet}, events=[])
    made = await plans.make_printout(title, json.dumps(sheet), tool_context, subtitle) if printout else None
    people = (contact.get("contacts") or [{}])[0] if isinstance(contact, dict) else {}
    return {
        "for": name, "age": info.get("age"), "home": info.get("home"), "step_free": sig.step_free,
        "reads_as": info.get("reads_as"),
        "watch": [c["title"] for c in cards if c["tag"] == "Watch"],
        "listen": [c["title"] for c in cards if c["tag"] == "Listen"],
        "lunch": [c["title"] for c in cards if c["tag"] == "Lunch"],
        "printout": made.get("path") if isinstance(made, dict) else None,
        "contact": {"name": people.get("name"), "phone": (people.get("phones") or [None])[0],
                    "email": (people.get("emails") or [None])[0]} if people else None,
        "shown": "A person card and the picks as cards",
        "next": "Say what to watch, listen to and where to have lunch in two sentences. Offer: a large-print page (print_this_plan), sending it "
                "(send_file_imessage to contact.phone, or draft_email_in_mail), and doing it every week (repeat_weekly).",
    }


# --- someone's weekend with a friend -----------------------------------------------------

# The shape of a day out for two who want it unhurried: a seated coffee, one thing to see, lunch at
# a proper table, one shop to browse. The afternoon changes with the day and the weather.
WEEKEND_DAYS = [
    [("coffee", "10:30"), ("museum", "11:30"), ("restaurant", "12:45"), ("record_store", "14:30")],
    [("coffee", "10:30"), ("park", "11:30"), ("restaurant", "12:45"), ("bookstore", "14:30")],
    [("coffee", "10:30"), ("bookstore", "11:30"), ("restaurant", "12:45"), ("museum", "14:30")],
]
WET_SWAP = {"park": "museum"}
# A weekend's stops are a short walk apart (10 minutes at most); the first and any that can't be
# found that close are a short drive from home.
WEEKEND_RADII = (600, 900)
WEEKEND_DRIVE_M = 2500
LIVE_MUSIC_M = 7000


def _next_weekend(today: dt.date) -> dt.date:
    """The coming Saturday (today if it's Saturday)."""
    return today + dt.timedelta(days=(5 - today.weekday()) % 7)


def _whose(sig: Any, ids: list[str], most: int = 2) -> str:
    """"Walter's Miles Davis and Frank's Bob Dylan" from the signal ids that drive a pick."""
    names = [(sig.owner.get(i, ""), sig.names.get(i, "")) for i in ids if i in sig.names][:most]
    if not names:
        return ""
    if len(names) == 1 or names[0][0] == names[1][0]:
        owner = names[0][0]
        loved = " and ".join(n for _, n in names)
        return f"{owner}'s love of {loved}" if owner and owner != "you" else f"your love of {loved}"
    return " and ".join(f"{o}'s {n}" if o != "you" else f"your {n}" for o, n in names)


def _place_why(stop: dict[str, Any], needs: dict[str, bool], shared: list[str], who: str) -> str:
    """Why a place suits the two of them, in one plain line: the needs it honours, then how Qloo
    says it feels, leading with a word Qloo also uses for what they love."""
    bits: list[str] = []
    kind = stop.get("kind") or ""
    if kind == "restaurant":
        if stop.get("reservations"):
            bits.append("takes reservations" if not stop.get("reservations_required") else "reservations required")
        if stop.get("noise") == "quiet":
            bits.append("quiet")
        elif stop.get("noise") == "moderate" and needs.get("quiet"):
            bits.append("not loud")
    elif stop.get("noise") == "quiet" and needs.get("quiet"):
        bits.append("quiet")
    parking = [p for p in stop.get("parking") or [] if "street" in p.lower() or "lot" in p.lower() or "garage" in p.lower() or "valet" in p.lower()]
    if parking and needs.get("parking"):
        bits.append(parking[0].lower())
    tags = [str(t) for t in stop.get("tags") or []]
    lowered = {t.lower() for t in shared}
    same = [t for t in tags if t.lower() in lowered]
    feel = same + [t for t in tags if t.lower() in FEEL and t not in same and t.lower() not in _NOT_FOR_A_PAGE]
    feel = list(dict.fromkeys(f.lower() for f in feel))[:2]
    kind_word = tripdoc.KIND_WORDS.get(kind, kind.replace("_", " ")) if kind != "jazz_club" else "jazz room"
    head = tripdoc._and(bits)
    if same:
        tail = f"{tripdoc._and(feel)}, the words Qloo also uses for what {who} love, and its top-ranked {kind_word} nearby for {who}"
    elif feel:
        tail = f"{tripdoc._and(feel)}, and Qloo's top-ranked {kind_word} nearby for {who}"
    else:
        tail = f"Qloo's top-ranked {kind_word} nearby for {who}"
    line = f"{head[0].upper()}{head[1:]}. {tail[0].upper()}{tail[1:]}" if head else tail[0].upper() + tail[1:]
    return line


# Qloo feel words that read oddly on a page for someone's dad.
_NOT_FOR_A_PAGE = {"urban exploration", "market culture", "street food", "dj", "immersive", "dynamic", "complex", "nightlife",
                   "late night food", "late-night", "youthful", "edgy", "underground", "alternative", "buzzing", "bustling"}


def _cut(text: str, most: int = 150) -> str:
    """The first sentence or two of a description, never cut mid-word."""
    text = " ".join(str(text or "").split())
    if len(text) <= most:
        return text
    out = ""
    for part in re.split(r"(?<=[.!?])\s+", text):
        if len(out) + len(part) + 1 > most:
            break
        out = f"{out} {part}".strip()
    if out:
        return out
    # A first sentence longer than the cap: end it at its last comma, semicolon or clause word
    # before the cap, as a full sentence; never trail off with an ellipsis.
    head = text[:most]
    half = most // 2
    choices = [max(head.rfind(" that "), head.rfind(" which "), head.rfind(" with ")), max(head.rfind(" and "), head.rfind("; ")), head.rfind(", ")]
    cut = next((c for c in choices if c >= half), len(head.rsplit(" ", 1)[0]))
    return head[:cut].rstrip(" ,;:").rstrip(".") + "."


def _phone(text: Any) -> str:
    """+17736665220 -> (773) 666-5220; anything else as given."""
    digits = re.sub(r"\D", "", str(text or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return str(text or "")


def _slot_time(arrive: dt.datetime, slot: dt.datetime, meal: bool) -> dt.datetime:
    """A stop keeps its slot when the walk lands near it; a late arrival rounds up to five minutes,
    a meal to the quarter hour (the time a table is booked for)."""
    at = slot if arrive <= slot + dt.timedelta(minutes=10) else arrive
    step = 15 if meal else 5
    if at.minute % step:
        at += dt.timedelta(minutes=step - at.minute % step)
    return at


def _loves_jazz(loves: list[dict[str, Any]]) -> bool:
    words = " ".join(str(t) for p in loves for t in p.get("tags") or []).lower()
    return any(w in words for w in ("jazz", "bebop", "swing", "big band"))


def _minutes(n: int, how: str) -> str:
    return f"{'an' if n in (8, 11, 18, 80) else 'a'} {n}-minute {how}"


def _leg(stop: dict[str, Any], first: bool, home: str) -> str:
    if stop.get("drive_min") is not None:
        return f"{_minutes(int(stop['drive_min']), 'drive')} from {home if first else 'the last stop'}"
    walk = stop.get("walk_min")
    if walk is None:
        return ""
    if first:
        return f"{_minutes(int(walk), 'walk')} from {home}" if walk > 2 else f"right by {home}"
    return "right next door" if walk <= 2 else _minutes(int(walk), "walk")


def _hours_line(stop: dict[str, Any], day: dt.date) -> str | None:
    return tripdoc._hours_today(stop, day)


async def plan_weekend_for(person: str, tool_context: ToolContext, friend: str = "", likes: str = "", friend_likes: str = "",
                           age: int = 0, friend_age: int = 0, home: str = "", needs: str = "", relation: str = "",
                           date_from: str = "", date_to: str = "", main_meal: str = "lunch", evening_out: bool = True,
                           home_by: str = "21:00") -> dict[str, Any]:
    """Someone else's weekend with a friend, in one call: saves both of them (person cards) with what
    each loves, his age, home and needs, then plans each day as a short, unhurried route of real
    places near his home for the two tastes together (a seated coffee, something to see, lunch at
    a proper table that takes reservations, a shop to browse; quiet, open at that hour, a short
    walk apart or a short drive from home), one timeline card per day, the weather, an early
    evening out that fits them (a jazz room for a jazz lover, before the hour they like to be
    home), plus a film for the two of them, music for the drive and a series for him, each with
    whose love it comes from. For "my dad Frank is 73, lives in Lincoln Park, likes a proper
    table, nothing loud, no late nights, loves The Godfather and Bob Dylan; his friend Walter is
    into Miles Davis; plan their weekend". Afterwards send_this_plan (the large-print pages to
    him), add_this_plan_to_calendar, book_this_table and repeat_weekly are offers behind a yes,
    one at a time.

    Args:
        person: His first name ("Frank").
        friend: The friend's first name ("Walter"), if there is one.
        likes: What he loves, comma-separated, exact titles and names ("The Godfather, Bob Dylan, Columbo"); empty if saved.
        friend_likes: What the friend loves, the same way ("Miles Davis, The Searchers"); empty if saved.
        age: His age in years, if known.
        friend_age: The friend's age, if known.
        home: Where he lives ("Lincoln Park, Chicago").
        needs: His needs in the user's words ("a proper table with a reservation, nothing too loud, no late nights, short walks").
        relation: Who he is to the user ("dad").
        date_from: The first day, YYYY-MM-DD; empty means the coming Saturday.
        date_to: The last day, YYYY-MM-DD; empty means the Sunday after date_from (three days at most).
            For one day ("next Saturday"), pass the same date as date_from.
        main_meal: "lunch" (default) or "dinner": the meal they sit down to each day.
        evening_out: One early evening out over the weekend (live music), true unless they said no.
        home_by: HH:MM they like to be home by (default 21:00).
    """
    conn, task = for_worker(tool_context)
    lap = _Laps("plan_weekend_for")
    # Both saved at once (each is a few Qloo searches); the friend's relation names him.
    his_name = taste._person(conn, person)[0] if not relation else person.strip().title()
    saves = await asyncio.gather(
        _safe(taste.remember_person(person, likes, tool_context, age, home, needs, "", relation)) if (likes or age or home or needs or relation) else asyncio.sleep(0, {}),
        _safe(taste.remember_person(friend, friend_likes, tool_context, friend_age, "", "", "", f"{his_name}'s friend")) if friend.strip() and (friend_likes or friend_age) else asyncio.sleep(0, {}),
    )
    if likes and not (saves[0] or {}).get("saved") and not taste._person(conn, person)[1]:
        return {"error": f"Qloo didn't recognise what {person} loves ({likes}). Ask for exact titles or names."}
    name, loves, info = taste._person(conn, person)
    if not loves:
        return {"error": f"I don't know what {name} loves yet: pass likes (exact titles and names)."}
    fname, floves, finfo = "", [], {}
    if friend.strip():
        if friend_likes and not (saves[1] or {}).get("saved") and not taste._person(conn, friend)[1]:
            return {"error": f"Qloo didn't recognise what {friend} loves ({friend_likes}). Ask for exact titles or names."}
        fname, floves, finfo = taste._person(conn, friend)
        if not floves:
            return {"error": f"I don't know what {fname} loves yet: pass friend_likes."}
    lap("saved")
    who = f"{name} and {fname}" if fname else name
    sig = await signals_for(conn, "", who)
    needs_flags = dict(sig.needs)
    if main_meal.strip().lower().startswith("dinner"):
        needs_flags["dinner"] = True
    where = info.get("home") or sig.home or conn.city or ""
    if not where:
        return {"error": f"Where does {name} live? Pass home."}
    today = dt.date.today()
    start = _date(date_from) if date_from.strip() else _next_weekend(today)
    end = _date(date_to, start + dt.timedelta(days=1)) if date_to.strip() or not date_from.strip() else start
    end = max(start, end)
    days = [start + dt.timedelta(days=i) for i in range(min((end - start).days + 1, 3))]
    home_pt = await point_of(conn, where)
    if home_pt is None:
        return {"error": f"Couldn't place {where}."}
    home_word = f"{name}'s"
    ends_at = _hhmm(home_by, "21:00")
    his = [p["id"] for p in loves]
    theirs = [p["id"] for p in floves]

    async def weathers() -> list[dict[str, Any]]:
        got = await asyncio.gather(*(_safe(_weather(home_pt, d)) for d in days))
        await report(conn, task, "mac", f"Checked the weather in {where.split(',')[0]}", "; ".join(
            f"{WEEKDAY[d.weekday()][:3]} {w['summary']}, {w['high_c']}°C" for d, w in zip(days, got) if "summary" in w) or None)
        return got

    async def shared_words() -> list[str]:
        if not theirs or conn.taste_off:
            return []
        found = await qloo.shared_tags(his, theirs, take=10)
        await report(conn, task, "qloo", f"Compared {name}'s taste with {fname}'s", ", ".join(t["name"] for t in found[:4]) or None)
        return [t["name"] for t in found]

    async def media() -> dict[str, list[dict[str, Any]]]:
        jobs = [("movie", who, 2), ("artist", who, 2), ("tv_show", name, 1)]
        got = await asyncio.gather(*(_safe(picks(conn, task, kind, "", "", "", for_, n)) for kind, for_, n in jobs))
        out: dict[str, list[dict[str, Any]]] = {}
        for (kind, for_, _), r in zip(jobs, got):
            out[kind] = (r.get("picks") or []) if isinstance(r, dict) else []
        return out

    async def jazz_or_not() -> bool:
        if _loves_jazz(floves + loves):
            return True
        try:
            tags = await qloo.taste_tags(theirs or his, take=12)
        except Exception:
            return False
        return any("jazz" in str(t.get("name") or "").lower() for t in tags)

    forecast, shared, found, contact, jazz = await asyncio.gather(
        weathers(), _safe(shared_words()), media(), _safe(conn.bridge.call("contacts_search", {"query": name}, timeout=8)), jazz_or_not())
    shared = shared if isinstance(shared, list) else []
    lap("weather, compare, media, contact")

    # Why each film or artist fits: whose love Qloo says drives it more than the rest.
    async def drivers(kind: str, ids: list[str], signals: list[str]) -> dict[str, list[str]]:
        if not ids or conn.taste_off:
            return {}
        try:
            return taste.standouts(await qloo.score(kind, signals, ids, age=sig.age))
        except Exception:
            return {}

    used: set[str] = set()
    evening_day = days[-1] if len(days) > 1 else days[0]

    async def one_day(i: int, day: dt.date) -> dict[str, Any]:
        w = forecast[i] if i < len(forecast) else {}
        wet = bool(w.get("indoors"))
        slots = [(WET_SWAP.get(k, k) if wet else k, t) for k, t in WEEKEND_DAYS[i % len(WEEKEND_DAYS)]]
        if needs_flags.get("dinner"):
            slots = [(k, t) for k, t in slots if k != "restaurant"] + [("restaurant", "17:30")]
        kinds = [k for k, _ in slots]
        clock = _at(day, slots[0][1])
        stops, _, _ = await walkable_stops(conn, sig, home_pt, kinds, clock, sig.step_free, used, where=where, stand_ins=STAND_IN,
                                           needs=needs_flags, radii=WEEKEND_RADII, drive_radius_m=WEEKEND_DRIVE_M)
        stops = [s for s in stops if not s["title"].startswith("No ")]
        # Each stop keeps to its slot: a quick walk doesn't make lunch at half eleven, and a meal
        # lands on the quarter hour.
        for s in stops:
            at = next((t for k, t in slots if k == s.get("kind")), s.get("time") or "10:30")
            s["time"] = _slot_time(_at(day, s.get("time") or at), _at(day, at), s.get("kind") == "restaurant").strftime("%H:%M")
        night: list[dict[str, Any]] = []
        if evening_out and day == evening_day:
            kind = "jazz_club" if jazz else "music_venue"
            # Live music that starts early enough to be home on time: a Sunday matinee at four, a Saturday set at six.
            for at in (("15:30", "16:00", "17:00", "18:00") if day.weekday() == 6 else ("17:00", "18:00", "19:00")):
                begin = _at(day, at)
                if (begin + dt.timedelta(minutes=STAY_MIN.get(kind, 120))).time() > ends_at:
                    break
                last_end = _at(day, stops[-1]["time"]) + dt.timedelta(minutes=STAY_MIN.get(stops[-1].get("kind") or "", 60)) if stops else begin
                if begin < last_end:
                    continue
                night, _, _ = await walkable_stops(conn, sig, home_pt, [kind], begin, sig.step_free, used, where=where,
                                                   needs=needs_flags, radii=(1500,), drive_radius_m=LIVE_MUSIC_M)
                night = [s for s in night if not s["title"].startswith("No ")]
                if night:
                    opens = ((night[0].get("hours") or {}).get(qloo.WEEKDAYS[day.weekday()]) or "")[:5]
                    night[0]["time"] = max(at, opens) if re.fullmatch(r"\d\d:\d\d", opens) else at
                    break
        for s in stops + night:
            if fname:
                s["with"] = fname
        seen = [s["area"] for s in stops + night if s.get("area")]
        area = max(set(seen), key=seen.count) if seen else where.split(",")[0]
        title = f"{WEEKDAY[day.weekday()]}, {name} and {fname}" if fname else f"{name}'s {WEEKDAY[day.weekday()]}"
        return {"date": day.isoformat(), "title": title, "area": area, "weather": _weather_line(w), "weather_data": w,
                "stops": timeline_stops(stops + night), "raw": stops + night}

    planned = await asyncio.gather(*(one_day(i, d) for i, d in enumerate(days)))
    lap(f"{len(planned)} days")
    whys = await asyncio.gather(*(drivers(kind, [p["id"] for p in found.get(kind) or [] if p.get("id")], his if kind == "tv_show" else sig.ids)
                                 for kind in ("movie", "artist", "tv_show")))
    lap("reasons")
    because = {kind: w for kind, w in zip(("movie", "artist", "tv_show"), whys)}

    def media_why(kind: str, p: dict[str, Any]) -> str:
        line = _whose(sig, because.get(kind, {}).get(p.get("id"), []))
        if kind == "tv_show" and not line:
            line = f"{name}'s love of {tripdoc._and([x['name'] for x in loves[:2]])}"
        return f"For {line}" if line else (p.get("description") or "")[:100]

    film = (found.get("movie") or [None])[0]
    music = found.get("artist") or []
    series = (found.get("tv_show") or [None])[0]
    cards = []
    if film:
        cards.append({"title": film["name"], "tag": "Film", "subtitle": ", ".join(str(x) for x in [film.get("year"), "a film for both of them"] if x),
                      "image": film.get("image"), "reason": media_why("movie", film)})
    for m in music[:2]:
        cards.append({"title": m["name"], "tag": "Music", "subtitle": "for the drive", "image": m.get("image"), "reason": media_why("artist", m)})
    if series:
        cards.append({"title": series["name"], "tag": f"For {name}", "subtitle": ", ".join(str(x) for x in [series.get("year"), "a series"] if x),
                      "image": series.get("image"), "reason": media_why("tv_show", series)})
    if conn.tasks:
        for d in planned:
            conn.tasks.show_view(task, {"type": "timeline", "key": d["date"], "title": d["title"], "stops": d["stops"]})
        if cards:
            conn.tasks.show_cards(task, [{**c, "for": who} for c in cards[:6]])
    stops_total = sum(len(d["stops"]) for d in planned)
    await report(conn, task, "qloo", f"Planned {len(planned)} days for {who}", f"{stops_total} stops near {where.split(',')[0]}, each a short walk or drive")

    # Lunch at a table that takes reservations, booked under his name for two: the first day's.
    table = None
    for d in planned:
        meal = next((s for s in d["raw"] if s.get("kind") == "restaurant"), None)
        if meal:
            table = {"name": meal["title"], "date": d["date"], "time": meal["time"], "address": meal.get("address"), "url": meal.get("url"),
                     "phone": meal.get("phone"), "party": "2" if fname else "1", "under": name, "city": where.split(",")[-1].strip() or where,
                     "reservations": bool(meal.get("reservations"))}
            break

    # The large-print pages: one per day, then the film, music and series.
    sections: list[dict[str, Any]] = []
    you = "the two of you" if fname else "you"
    for d in planned:
        day = _date(d["date"])
        items = []
        for j, s in enumerate(d["raw"]):
            lines: list[str] = []
            about = _cut(s.get("about") or s.get("note") or "", 190).rstrip(".")
            leg = _leg(s, j == 0, home_word)
            if about and leg and not about.endswith("…"):
                lines.append(tripdoc._sentence(about[0].upper() + about[1:] + f", {leg}"))
            else:
                if about:
                    lines.append(about[0].upper() + about[1:] if about.endswith("…") else tripdoc._sentence(about[0].upper() + about[1:]))
                if leg:
                    lines.append(tripdoc._sentence(leg[0].upper() + leg[1:]))
            lines.append(tripdoc._sentence(_place_why(s, needs_flags, shared, you)))
            practical = [str(s["address"]).replace(", USA", "").replace(" United States", "").strip() if s.get("address") else ""]
            hours = _hours_line(s, day)
            if hours:
                practical.append(hours)
            if s.get("kind") == "restaurant" and table and s["title"] == table["name"]:
                practical.append(f"Table for {table['party']} under {name}" if fname else f"Table under {name}")
            elif s.get("kind") == "restaurant" and s.get("reservations"):
                practical.append("Book a table")
            if s.get("phone"):
                practical.append(_phone(s["phone"]))
            lines.append(tripdoc._sentence(". ".join(p for p in practical if p)))
            kind_word = {"jazz_club": "live jazz", "music_venue": "live music", "restaurant": main_meal.lower() if main_meal else "lunch"}.get(s.get("kind") or "", tripdoc.KIND_WORDS.get(s.get("kind") or "", ""))
            items.append({"time": s.get("time"), "title": s["title"], "kind": kind_word, "lines": lines})
        if film and d is planned[0]:
            why = media_why("movie", film)
            items.append({"time": "19:30", "title": film["name"], "kind": "a film at home",
                          "lines": [tripdoc._sentence(_cut(film.get("description") or "", 230)) if film.get("description") else "",
                                    tripdoc._sentence(why)]})
        sections.append({"heading": f"{WEEKDAY[day.weekday()]} {day.day} {day.strftime('%B')}", "sub": tripdoc._weather_words(d.get("weather_data")) or "",
                         "items": items, "page": True})
    week_items = []
    for m in music[:2]:
        week_items.append({"title": m["name"], "detail": tripdoc._sentence(media_why("artist", m)) + " For the drive."})
    if series:
        week_items.append({"title": series["name"], "detail": tripdoc._sentence(media_why("tv_show", series)) + (f" {tripdoc._sentence(_cut(series['description'], 130))}" if series.get("description") else "")})
    if week_items:
        sections.append({"heading": "And for the week", "items": week_items, "page": False})
    title = f"{name} and {fname}'s weekend" if fname else f"{name}'s weekend"
    subtitle = tripdoc.title_for("", start, days[-1]).lstrip(", ")
    user = conn.profile.get("name") or ""
    lead = (f"{'Two easy days' if len(days) > 1 else 'An easy day'} near {where.split(',')[0]}, every stop a short walk from the last or a quick drive, "
            f"picked around what you love ({tripdoc._and([p['name'] for p in loves[:3]])})"
            + (f" and what {fname} loves ({tripdoc._and([p['name'] for p in floves[:2]])})" if fname else "") + ".")
    footer = f"Planned{' by ' + user if user else ''} with Slice, around what you both love. Hours as listed when this was made; a quick call confirms." if fname \
        else f"Planned{' by ' + user if user else ''} with Slice, around what you love."
    people = (contact.get("contacts") or [{}])[0] if isinstance(contact, dict) else {}
    contact_card = {"name": people.get("name"), "phone": (people.get("phones") or [None])[0], "email": (people.get("emails") or [None])[0]} if people else None
    first_lunch = next((s["title"] for d in planned for s in d["raw"] if s.get("kind") == "restaurant"), "")
    message = (f"Hi {name}, here's a weekend with {fname} from Slice: " if fname else f"Hi {name}, here's your weekend from Slice: ")
    message += ", ".join(f"{WEEKDAY[_date(d['date']).weekday()]} {' then '.join(s['title'] for s in d['raw'][:3])}" for d in planned[:2])
    message += ". The pages have the times and addresses."
    # "Frank and Walter: Saturday in Lincoln Park", the day's stops in the notes.
    events = _day_events(who, [{**d, "title": f"{WEEKDAY[_date(d['date']).weekday()]} in {d['area']}"} for d in planned])
    _remember(conn, task, events=events, title=title, printout={"title": title, "subtitle": subtitle, "sections": sections, "lead": lead, "footer": footer},
              table=table, contact=contact_card, message=message, weekend={"days": planned, "film": film, "music": music, "series": series}, **{"for": name})
    return {
        "for": who, "home": where, "needs": needs_flags, "saved": [name] + ([fname] if fname else []),
        "shared_threads": shared[:5],
        "days": [{"date": d["date"], "day": d["title"], "weather": d["weather"], "plan": _short(d["stops"])} for d in planned],
        "film_for_both": {"name": film["name"], "why": media_why("movie", film)} if film else None,
        "music_for_the_drive": [{"name": m["name"], "why": media_why("artist", m)} for m in music[:2]],
        "series_for_him": {"name": series["name"], "why": media_why("tv_show", series)} if series else None,
        "table_to_book": table,
        "contact": contact_card,
        "shown": "A person card each, one timeline card per day, cards for the film, music and series",
        "next": (f"Say the shape of the two days in two or three sentences with real names from the plan, and name whose love "
                 f"drives one pick (film_for_both). Then offer ONE thing: sending him the pages (send_this_plan). After each yes, "
                 f"the next, one at a time: the days in the user's calendar (add_this_plan_to_calendar), booking the table "
                 f"(book_this_table: {table['name'] if table else 'the lunch'}), and doing this every week (repeat_weekly). "
                 f"Mention once that {who} are saved, so next time 'plan dad's weekend' just works."),
    }


# --- a gift -----------------------------------------------------------------------------


async def gift_for(person: str, tool_context: ToolContext, from_screen: bool = False, likes: str = "", budget_usd: int = 0,
                   occasion: str = "", relation: str = "", birthday: str = "", age: int = 0, home: str = "") -> dict[str, Any]:
    """A gift shortlist in one call: learns the person's taste from the profile page on screen
    (from_screen, e.g. their Letterboxd) or from likes, saves them (a person card), then shows gift
    ideas across brands, records and books with why each fits. When the user picks one, shop_for
    puts it in the cart; a card (show_note) and a wrap reminder are offers.

    Args:
        person: Their first name ("Maya").
        from_screen: Their profile or list page is open in front of the user.
        likes: What they love, comma-separated, when not reading the screen.
        budget_usd: Rough budget in dollars (0 = no limit).
        occasion: With its date, for the card's title ("birthday on the 29th").
        relation: Who they are to the user ("friend").
        birthday: For a birthday, its date as MM-DD ("the 29th" this month is "10-29"), so Slice
            reminds the user next year.
        age: Their age, if known.
        home: Where they live, if known.
    """
    lap = _Laps("gift_for")
    learned: dict[str, Any] = {}
    if from_screen:
        learned = await lens.learn_taste_from_screen(person, tool_context, relation, birthday, age, home)
        if learned.get("error") and not likes:
            return learned
    if likes and not learned.get("saved"):
        learned = await taste.remember_person(person, likes, tool_context, age, home, "", birthday, relation)
    lap("learned")
    ideas = await taste.gift_ideas(person, tool_context, budget_usd, occasion)
    lap("ideas")
    if ideas.get("error"):
        return {**ideas, "learned": learned.get("saved")}
    return {
        "for": ideas["for"], "read_from": learned.get("read_from"), "loves": learned.get("saved"),
        "reads_as": learned.get("reads_as"), "budget_usd": ideas.get("budget_usd"),
        "ideas": [{k: i.get(k) for k in ("title", "tag", "subtitle", "reason", "url") if i.get(k)} for i in ideas["ideas"]],
        "shown": "A person card and the gift shortlist",
        "next": "Say the two best ideas and why in two sentences, and ask which one. Then shop_for it (store_url from "
                "the idea, needed_by the day before the occasion); offer a card (show_note) and a wrap reminder.",
    }


# --- follow-ups -------------------------------------------------------------------------


async def add_this_plan_to_calendar(tool_context: ToolContext, only_day: str = "") -> dict[str, Any]:
    """Put the plan made in this conversation (plan_trip, plan_day_out or plan_weekend_for) in the
    Mac's Calendar after one yes from the user: a trip or a weekend is one event per day with that
    day's stops in the notes; a day out is one event per stop. Use this for "put it in my
    calendar", not add_calendar_event.

    Args:
        only_day: YYYY-MM-DD to add just that day; empty for all of it.
    """
    conn, task = for_worker(tool_context)
    plan = _plan_for(conn, task)
    events = plan.get("events") or []
    if only_day:
        events = [e for e in events if e["start"].startswith(only_day)]
    if not events:
        return {"error": "Nothing planned in this conversation to add; plan it first (plan_trip), or use add_plan_to_calendar with the events."}
    out = await plans.add_plan_to_calendar(json.dumps(events), tool_context)
    dinner = plan.get("table") or (plan.get("trip") or {}).get("dinner")
    if out.get("added") and dinner:
        out["next"] = (f"Say the days are in their calendar. Then offer to book the table: {dinner['name']} on "
                       f"{dinner['date']} at {dinner['time']} (book_this_table).")
    elif out.get("added"):
        out["next"] = "Say it's in their calendar, in one sentence."
    return out


async def write_this_plan(tool_context: ToolContext, intro: str = "", tips_json: str = "") -> dict[str, Any]:
    """Write the trip planned in this conversation (plan_trip) up as a document, for "put it in a
    doc": a title like "Paris, 12 to 19 November", your intro, where their taste lives, the weather,
    then a section per day with every stop's neighbourhood, why it fits them (Qloo), address, hours
    that day, price and whether to book. It goes to Google Docs when it's connected and opens
    there; otherwise it's saved as a PDF in Documents/Slice on the Mac and opened. Everything in it
    comes from the plan, so don't retype the plan: just write the intro.

    Args:
        intro: Two or three plain sentences for the top of the document, in your words: the shape of
            the week and what makes it theirs. No lists, no markdown.
        tips_json: Optional JSON object of {"stop title": "one practical line you checked on the web"}
            (a closing day, a booking that opens on a date). Only what you verified; else leave empty.
    """
    conn, task = for_worker(tool_context)
    trip = _plan_for(conn, task).get("trip")
    if not trip:
        return {"error": "No trip planned in this conversation yet; plan_trip first."}
    try:
        tips = json.loads(tips_json) if tips_json.strip() else {}
        tips = tips if isinstance(tips, dict) else {}
    except json.JSONDecodeError:
        tips = {}
    whys = await _whys(conn, trip)
    doc = tripdoc.Doc(trip, intro, whys, tips)
    await report(conn, task, "slice", f"Wrote “{doc.title}”", f"{sum(len(d['stops']) for d in trip['days'])} stops over {len(trip['days'])} days")
    if await accounts.is_connected(conn.user_id, "googledocs"):
        try:
            data = await accounts.execute(conn.user_id, "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN", {"title": doc.title, "markdown_text": doc.markdown()})
        except accounts.NotConnected:
            data = None
        except Exception as err:
            await report(conn, task, "app", "Google Docs didn't take the document", str(err)[:120])
            data = None
        if data is not None:
            doc_id = accounts._find(data, "documentId", "document_id", "id")
            url = accounts._find(data, "documentUrl", "document_url", "url") or (f"https://docs.google.com/document/d/{doc_id}/edit" if doc_id else None)
            await report(conn, task, "app", f"Made “{doc.title}” in Google Docs")
            if url:
                await conn.bridge.call("open_url", {"url": str(url)})
            if conn.tasks:
                conn.tasks.show_view(task, {"type": "file", "key": "tripdoc", "title": doc.title, "detail": "Open in Google Docs", "url": url})
            return {"doc": url, "title": doc.title, "in": "Google Docs",
                    "next": "Say the doc is open in Google Docs, in one sentence. Then offer to put the days in their calendar (add_this_plan_to_calendar)."}
    # No Google Docs: a PDF on the Mac, opened.
    from slice_pages.browser import browser  # one headless Chromium per process, shared with Pages

    page = await (await browser()).new_page()
    try:
        await page.set_content(doc.html(), wait_until="load")
        pdf = await page.pdf(format="A4", print_background=True)
    finally:
        await page.close()
    name = re.sub(r"[^\w' ,-]+", "", doc.title).strip() or "Trip plan"
    saved = await conn.bridge.call("save_file", {"name": f"{name}.pdf", "data": base64.b64encode(pdf).decode(), "open": True}, timeout=20)
    if saved.get("error"):
        return saved
    await report(conn, task, "mac", f"Saved “{doc.title}” in Documents/Slice", "opened")
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "file", "key": "tripdoc", "title": doc.title, "path": saved.get("path"), "detail": "PDF in Documents/Slice"})
    return {"path": saved.get("path"), "title": doc.title, "in": "a PDF on the Mac",
            "note": "Google Docs isn't connected, so it's a PDF in Documents/Slice, opened. Connecting Google Docs is in Settings > Integrations.",
            "next": "Say it's open as a PDF since Google Docs isn't connected, in one sentence. Then offer to put the days in their calendar (add_this_plan_to_calendar)."}


# Words Qloo uses for how a place feels (its ambience, decor and crowd tags), worth a line in a plan.
FEEL = {"lively", "stylish", "trendy", "romantic", "modern", "classic", "traditional", "cozy", "cosy", "intimate", "energetic",
        "vibrant", "hip", "casual", "elegant", "sophisticated", "quirky", "artistic", "historic", "bohemian", "laid-back", "upscale",
        "luxurious", "moody", "buzzing", "bustling", "relaxed", "warm", "charming", "eclectic", "minimalist", "industrial", "retro",
        "vintage", "glamorous", "edgy", "alternative", "underground", "iconic", "legendary", "grand", "cultural hub", "late night food",
        "late-night", "natural wine", "mixology", "craft cocktails", "live music", "jazz", "dj", "street food", "market culture",
        "urban exploration", "nightlife", "cocktails", "creative", "contemporary", "atmospheric", "immersive", "youthful", "dynamic",
        "innovative", "thoughtful", "engaging", "charismatic", "complex", "fun", "friendly", "local favorite", "hidden gem"}


async def _whys(conn: Connection, trip: dict[str, Any]) -> dict[str, str]:
    """Why each stop fits, in one line from Qloo's own words for the place: how it feels (its
    ambience tags), leading with any word Qloo also uses for the user's taste, and that it's the
    top-ranked place of its kind nearby for them. Checked 2026-10-27: Qloo's per-place
    explainability is flat for places (every stop said "because you love Breaking Bad"), so the
    loves aren't quoted for places."""
    yours = {str(t).lower() for t in trip.get("taste_words") or []}
    out: dict[str, str] = {}
    for day in trip["days"]:
        for stop in day["stops"]:
            if not stop.get("id"):
                continue
            tags = [str(t) for t in stop.get("tags") or []]
            shared = [t for t in tags if t.lower() in yours]
            feel = shared + [t for t in tags if t.lower() in FEEL and t not in shared]
            feel = list(dict.fromkeys(f.lower() for f in feel))[:3]
            kind = tripdoc.KIND_WORDS.get(stop.get("kind") or "", "place")
            top = f"Qloo's top-ranked {kind if kind != 'live music' else 'live music spot'} for your taste around here"
            if shared:
                line = f"{tripdoc._and(feel)}: the same words Qloo uses for your taste, and {top}"
            elif feel:
                line = f"{tripdoc._and(feel)}, and {top}"
            else:
                line = top
            out[stop["id"]] = line[0].upper() + line[1:]
    return out


async def book_this_table(tool_context: ToolContext, party_size: int = 0, time: str = "", name: str = "") -> dict[str, Any]:
    """Book the table the plan picked (a trip's dinner_to_book, a weekend's table_to_book) on the
    restaurant's own website with the operator: it finds the reservation page, picks the date, time
    and party size, and stops at the final confirm to ask the user. Use it when they say yes to
    booking; pass a different party_size or time only if they said so.

    Args:
        party_size: How many people (default: from the plan, else 1).
        time: HH:MM if the user wants another time than the plan's.
        name: The name for the reservation, if the user gave one (else the plan's, else theirs).
    """
    conn, task = for_worker(tool_context)
    plan = _plan_for(conn, task)
    dinner = plan.get("table") or (plan.get("trip") or {}).get("dinner")
    if not dinner:
        return {"error": "No table in a plan from this conversation; plan first, or use operate_computer with the restaurant's details."}
    people = party_size or _party_size(dinner.get("party") or "")
    at = time.strip() or dinner["time"]
    date = _date(dinner["date"])
    when = f"{WEEKDAY[date.weekday()]} {date.day} {date.strftime('%B %Y')}"
    who = (name or dinner.get("under") or conn.profile.get("name") or "").strip()
    city = str(dinner.get("city") or (plan.get("trip") or {}).get("city") or "").split(",")[0].strip()
    site = dinner.get("url")
    where = f"go to {site} (the website of {dinner['name']}, {dinner.get('address') or ''})" if site else \
        f"search for the restaurant {dinner['name']}, {dinner.get('address') or ''}, and open its own website"
    # Where most of a city's tables are listed when the restaurant's own site has no form.
    fallback = ("https://www.thefork.com", "TheFork") if city.lower() in ("paris", "lyon", "madrid", "barcelona", "rome", "milan", "lisbon") \
        else ("https://www.opentable.com", "OpenTable")
    job = (
        f"In the web browser, {where}. Find where to reserve a table: a Book, Réserver, Reservation or Reserve button or "
        f"menu item (it may open a booking service such as OpenTable, Resy, Tock, TheFork, Zenchef or SevenRooms; that's fine). "
        f"If you don't find a reservation form on the site within a few steps, go to {fallback[0]} and search "
        f"for \"{dinner['name']} {city}\".strip() there instead; {fallback[1]} lists most restaurants in the city. "
        f"Choose {when} at {at} for {people} {'person' if people == 1 else 'people'}."
        + (f" If the form asks for a name, use \"{who}\"." if who else "")
        + " Don't sign in, don't type a phone number, email or card details, and never press the button that confirms "
        "or sends the reservation: when you reach that last step, call ask_permission with what you're about to confirm "
        "and wait. If the user says no, leave the page as it is and say what's filled in. If the restaurant takes "
        "bookings only by phone, say so and give the phone number"
        + (f" ({dinner['phone']})" if dinner.get("phone") else "") + "."
    ).replace(f" {city} {city}", f" {city}")
    await report(conn, task, "mac", f"Booking a table at {dinner['name']}", f"{when} at {at}, {people} {'person' if people == 1 else 'people'}")
    from .computer import operate

    # Enough steps to reach a booking form, not enough to wander for six minutes.
    outcome = await operate(conn, task, job, max_steps=28)
    return {"outcome": outcome, "restaurant": dinner["name"], "when": f"{when} {at}", "party": people,
            "next": "Say where you got to in one or two sentences (a table held, the page ready for them, or that it takes phone bookings)."}


def _party_size(words: str) -> int:
    low = words.lower()
    if not low or any(w in low for w in ("just me", "alone", "solo", "myself", "only me")):
        return 1
    m = re.search(r"\b(\d+)\b", low)
    if m:
        return max(1, min(int(m.group(1)), 12))
    for n, word in enumerate(("one", "two", "three", "four", "five", "six"), start=1):
        if word in low:
            return n
    return 2 if any(w in low for w in (" and ", "with", "both", "us", "we")) else 1


async def print_this_plan(tool_context: ToolContext) -> dict[str, Any]:
    """Make the large-print pages of what plan_for_someone or plan_weekend_for picked in this
    conversation (saved on the Mac and opened): a page per day, big type. To send it, use
    send_this_plan instead, which makes it and sends it in one go."""
    conn, task = for_worker(tool_context)
    sheet = _plan_for(conn, task).get("printout")
    if not sheet:
        return {"error": "Nothing planned in this conversation to print; use make_printout with the sections."}
    made = await plans.make_printout(sheet["title"], json.dumps(sheet["sections"]), tool_context, sheet.get("subtitle", ""),
                                     sheet.get("lead", ""), sheet.get("footer", ""))
    if made.get("path"):
        _plan_for(conn, task)["printout_path"] = made["path"]
    return made


async def send_this_plan(tool_context: ToolContext, to: str = "", note: str = "") -> dict[str, Any]:
    """Send the plan made in this conversation (plan_weekend_for, plan_for_someone) to the person it's
    for, as the large-print PDF with a short message, by iMessage from the Mac's Messages app (the
    user says yes first). The number comes from the plan (their Contacts card) unless `to` is given;
    with an email address instead, a draft opens in Mail. Use it for "send it to dad".

    Args:
        to: A phone number or email, only when the plan has no contact for them or the user gave one.
        note: Your own short message to go with it, if you want to change the plain one.
    """
    conn, task = for_worker(tool_context)
    plan = _plan_for(conn, task)
    sheet = plan.get("printout")
    if not sheet:
        return {"error": "Nothing planned in this conversation to send; plan it first."}
    who = plan.get("for") or "them"
    contact = plan.get("contact") or {}
    phone = to.strip() if to.strip() and "@" not in to else (contact.get("phone") or "")
    email = to.strip() if "@" in to else (contact.get("email") or "")
    if not phone and not email:
        return {"need": f"No phone number or email for {who} in Contacts. Ask the user (ask_user) for one, then call send_this_plan with `to`."}
    path = plan.get("printout_path")
    if not path:
        made = await plans.make_printout(sheet["title"], json.dumps(sheet["sections"]), tool_context, sheet.get("subtitle", ""),
                                         sheet.get("lead", ""), sheet.get("footer", ""), open_it=False)
        if made.get("error"):
            return made
        path = plan["printout_path"] = made["path"]
    from . import mac_tools

    text = note.strip() or plan.get("message") or f"{sheet['title']}, from Slice. The pages are attached."
    if phone:
        sent = await mac_tools.send_file_imessage(phone, path, tool_context, text)
        if sent.get("cancelled"):
            return {"cancelled": True, "next": "Say you've left it, in a few words."}
        if not sent.get("error"):
            return {"sent": True, "to": contact.get("name") or phone, "by": "Messages",
                    "next": f"Say it's gone to {who} by Messages, in one sentence. Then make the next offer, one at a time: the days in the user's calendar (add_this_plan_to_calendar)."}
        if not email:
            return sent
    drafted = await mac_tools.draft_email_in_mail(email, sheet["title"], text, tool_context, attachment=path)
    if drafted.get("error"):
        return drafted
    return {"drafted": True, "to": email, "by": "Mail",
            "next": f"Say the email to {who} is open in Mail ready to send, in one sentence. Then offer the days in the user's calendar (add_this_plan_to_calendar)."}


TOOLS = [plan_trip, plan_day_out, plan_weekend_for, plan_for_someone, gift_for, add_this_plan_to_calendar, write_this_plan,
         book_this_table, print_this_plan, send_this_plan]
