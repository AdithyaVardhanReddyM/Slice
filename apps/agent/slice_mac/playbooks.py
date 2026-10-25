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
import datetime as dt
import json
import os
import time
from typing import Any

from google.adk.tools import ToolContext

from . import lens, plans, qloo, taste
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

# What each task's last playbook planned, for add_this_plan_to_calendar and print_this_plan.
_planned: dict[str, dict[str, Any]] = {}

# A trip day's stops and roughly when each starts; the arrival and departure days keep the ones that fit.
DAY_SLOTS = [("coffee", "09:30"), ("museum", "10:30"), ("restaurant", "12:30"), ("record_store", "14:00"), ("park", "15:30")]
EVENING_AT = "19:30"
# A task keeps eight rich cards (tasks.show_view): the map and seven days.
MAX_TRIP_DAYS = 7
WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class _Laps:
    """Stage times in the brain's log (MAC_DEBUG=1), to see where a playbook spends its time."""

    def __init__(self, name: str) -> None:
        self.name, self.t0 = name, time.monotonic()

    def __call__(self, stage: str) -> None:
        if DEBUG:
            print(f"mac: {self.name} {stage} at {time.monotonic() - self.t0:.1f}s", flush=True)


def _remember(task: Any, **plan: Any) -> None:
    _planned[task.id] = plan
    while len(_planned) > 50:
        _planned.pop(next(iter(_planned)))


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
    second = "record_store" if i % 2 == 0 else "bookstore"
    last = "cafe" if wet else "park"
    return [(k if k not in ("record_store", "park") else (second if k == "record_store" else last), t) for k, t in DAY_SLOTS]


async def plan_trip(city: str, date_from: str, date_to: str, tool_context: ToolContext, stay: str = "",
                    arrive_time: str = "", leave_time: str = "", for_person: str = "") -> dict[str, Any]:
    """A whole trip in one call: where the taste lives in the city (a map card), the weather each
    day, a walkable day of Qloo picks for every day (one timeline card per day; indoor stops when it
    rains; the arrival and departure days fit around the travel), and shows on those dates ranked
    for the taste, the best one with dinner near the venue. Use it for "plan my Lisbon trip" once
    the dates are known (from find_trip_emails, or ask). Then add_this_plan_to_calendar, booking
    the dinner (operate_computer) and messaging a friend are offers behind a yes.

    Args:
        city: The city ("Lisbon").
        date_from: The first day, YYYY-MM-DD.
        date_to: The last day, YYYY-MM-DD (seven days at most are planned).
        stay: Their hotel or address, if known ("Hotel do Chiado, Rua Nova do Almada 114").
        arrive_time: HH:MM they arrive on the first day, if known.
        leave_time: HH:MM they leave on the last day, if known.
        for_person: A saved person or "Sam and me", or empty for the user.
    """
    conn, task = for_worker(tool_context)
    lap = _Laps("plan_trip")
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
        _safe(point_of(conn, stay_query)) if stay else asyncio.sleep(0, None),
    )
    lap("map, weather and shows")
    stay_pt = stay_pt if isinstance(stay_pt, dict) and "lat" in stay_pt else None
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
            bar = "wine_bar" if i % 2 else "cocktail_bar"
            night, _ = await _stops(conn, sig, here, ["restaurant", bar], _at(day, EVENING_AT), used, f"{label}, {city}")
        else:
            night = []
        _fix_walk(night, 0, _end_of(stops))
        clean = timeline_stops(stops + night)
        # "Friday in Alfama": where most of the day's stops are (Qloo's neighbourhood for each place).
        seen = [s["area"] for s in stops + night if s.get("area") and s["area"].lower() != city.split(',')[0].lower()]
        where = max(set(seen), key=seen.count) if seen else city.split(',')[0]
        title = f"{WEEKDAY[day.weekday()]} in {where}"
        return {"date": day.isoformat(), "title": title, "from": label, "weather": _weather_line(w), "stops": clean}

    planned = await asyncio.gather(*(one_day(i, d) for i, d in enumerate(days)))
    lap(f"{len(planned)} days")
    if conn.tasks:
        for d in planned:
            conn.tasks.show_view(task, {"type": "timeline", "key": d["date"], "title": d["title"], "stops": d["stops"]})
        if shows:
            conn.tasks.show_cards(task, show_cards_for(shows))
    stops_total = sum(len(d["stops"]) for d in planned)
    await report(conn, task, "qloo", f"Planned {len(planned)} days for {whose(sig.who)} taste", f"{stops_total} stops, each a short walk from the last")

    dinners = [(d, s) for d in planned for s in d["stops"] if s.get("kind") == "restaurant" and s.get("time", "") >= "17:00"]
    show_day = next(((d, s) for d, s in dinners if best and d["date"] == best.get("date")), None)
    # The one to offer booking: the show night's, else the first full day's.
    dinner = show_day or next(((d, s) for d, s in dinners if d["date"] != planned[0]["date"]), dinners[0] if dinners else None)
    events = [e for d in planned for e in _events_for(_date(d["date"]), d["stops"])]
    _remember(task, events=events, title=f"{city.split(',')[0]} trip")
    return {
        "for": sig.who,
        "your_city": [{"area": a["name"], "places_you_d_love": a.get("places"), "e_g": a.get("examples", [])[:2]} for a in areas[:3]],
        "days": [{"date": d["date"], "day": d["title"], "starts_from": d["from"], "weather": d["weather"], "plan": _short(d["stops"])}
                 for d in planned],
        "shows": [{"act": s["act"], "venue": s["venue"], "date": s["date"], "time": s["time"], "match": s["match"], "url": s.get("url")}
                  for s in shows[:3]],
        "shows_note": _shows_note(found),
        "dinner_to_book": {"name": dinner[1]["title"], "date": dinner[0]["date"], "time": dinner[1]["time"],
                           "address": dinner[1].get("address")} if dinner else None,
        "shown": "A map card, one timeline card per day" + (", show cards" if shows else ""),
        "next": "Say where their taste lives and one highlight per day in two or three sentences. Offer: book "
                "dinner_to_book on the restaurant's own page (operate_computer), add_this_plan_to_calendar, and "
                "sending the plan to a friend.",
    }


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
    _remember(task, events=_events_for(day, merged), title=title)
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
    _remember(task, printout={"title": title, "subtitle": subtitle, "sections": sheet}, events=[])
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
    """Add what the last playbook in this task planned (plan_trip or plan_day_out) to the Mac's
    Calendar, after one yes from the user.

    Args:
        only_day: YYYY-MM-DD to add just that day; empty for all of it.
    """
    _, task = for_worker(tool_context)
    events = (_planned.get(task.id) or {}).get("events") or []
    if only_day:
        events = [e for e in events if e["start"].startswith(only_day)]
    if not events:
        return {"error": "Nothing planned in this task to add; use add_plan_to_calendar with the events."}
    return await plans.add_plan_to_calendar(json.dumps(events), tool_context)


async def print_this_plan(tool_context: ToolContext) -> dict[str, Any]:
    """Make the large-print page of what plan_for_someone picked in this task (saved on the Mac and
    opened), to send with send_file_imessage or draft_email_in_mail."""
    _, task = for_worker(tool_context)
    sheet = (_planned.get(task.id) or {}).get("printout")
    if not sheet:
        return {"error": "Nothing planned in this task to print; use make_printout with the sections."}
    return await plans.make_printout(sheet["title"], json.dumps(sheet["sections"]), tool_context, sheet["subtitle"])


TOOLS = [plan_trip, plan_day_out, plan_for_someone, gift_for, add_this_plan_to_calendar, print_this_plan]
