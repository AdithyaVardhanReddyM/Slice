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

import asyncio
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

from . import accounts, generic, memory, qloo
from .connection import Connection, for_worker, report, save_profile
from .taste import Signals, point_of, rank, signals_for, whose

# How long a stop usually takes, in minutes, for the timeline.
STAY_MIN = {"coffee": 40, "cafe": 45, "bakery": 30, "record_store": 40, "bookstore": 40, "museum": 90, "park": 60,
            "restaurant": 80, "bar": 75, "cocktail_bar": 75, "wine_bar": 75, "music_venue": 150, "hotel": 0,
            "jazz_club": 120, "cinema": 150, "home": 0}
INDOOR = {"coffee", "cafe", "bakery", "record_store", "bookstore", "museum", "restaurant", "bar", "cocktail_bar", "wine_bar", "music_venue",
          "jazz_club", "cinema"}
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
        # Beyond the 16-day forecast: what the same day was like last year (Open-Meteo's archive),
        # marked `typical` so plans and documents say "usually", not "will be".
        return await _typical(point, day)
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


async def _typical(point: dict[str, float], day: dt.date) -> dict[str, Any]:
    try:
        then = day.replace(year=day.year - 1)
    except ValueError:  # 29 February
        then = day.replace(year=day.year - 1, day=28)
    res = await _client().get("https://archive-api.open-meteo.com/v1/archive", params={
        "latitude": point["lat"], "longitude": point["lon"], "timezone": "auto",
        "start_date": then.isoformat(), "end_date": then.isoformat(),
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    })
    res.raise_for_status()
    daily = res.json().get("daily") or {}
    if not daily.get("time"):
        return {"error": f"No forecast for {day.isoformat()} yet (16 days ahead at most)."}
    rain_mm = (daily.get("precipitation_sum") or [0])[0] or 0
    rain = 70 if rain_mm >= 2 else 35 if rain_mm >= 0.3 else 10
    return {
        "date": day.isoformat(), "summary": WMO.get((daily.get("weather_code") or [None])[0], "mixed"),
        "high_c": round(daily["temperature_2m_max"][0]), "low_c": round(daily["temperature_2m_min"][0]),
        "rain_chance": rain, "wet_hours": None, "indoors": rain >= 50, "typical": True,
        "note": "No forecast this far ahead; this is what the same day was like last year.",
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
    found = await ranked_shows(conn, task, city, _date(date_from), _date(date_to, _date(date_from)), near, for_person, count)
    if found.get("shows") and conn.tasks:
        conn.tasks.show_cards(task, show_cards_for(found["shows"]))
    return found


async def ranked_shows(conn: Connection, task: Any, city: str, start: dt.date, end: dt.date, near: str = "",
                       for_person: str = "", count: int = 3) -> dict[str, Any]:
    """Shared by shows_for_me and the playbooks: the shows ranked for a taste, without cards."""
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
    await report(conn, task, "qloo", f"Ranked {len(events)} shows for {whose(for_person or 'you')} taste", out[0]["act"] if out else "none known to Qloo")
    return {"shows": out, "looked_at": len(events)}


def show_cards_for(shows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in {
        "title": e["act"], "tag": "Show", "subtitle": f"{e['venue']}, {e['date']} {e['time']}".strip(),
        "image": e.get("image") or e.get("act_image"), "url": e.get("url"), "reason": e["reason"],
    }.items() if v} for e in shows]


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
    clock = dt.datetime.combine(_date(date), _hhmm(start_time))
    plan, _, _ = await walkable_stops(conn, sig, here, [k.strip() for k in stops.split(",") if k.strip()], clock, step_free, where=start)
    day_title = title or f"{'Your' if sig.who == 'you' else whose(sig.who).capitalize()} day from {start.split(',')[0]}"
    if conn.tasks:
        # One card per day: a trip plans several.
        conn.tasks.show_view(task, {"type": "timeline", "key": date or day_title, "title": day_title, "stops": [{k: v for k, v in s.items() if k not in ("id", "area")} for s in plan]})
    walking = sum(s.get("walk_min") or 0 for s in plan)
    await report(conn, task, "qloo", f"Planned {len(plan)} stops for {whose(sig.who)} taste", f"{walking} min of walking in all")
    return {"for": sig.who, "stops": plan, "step_free": step_free,
            "next": "Merge in fixed things (calendar, a show, dinner) with show_day_plan if needed."}


def _hhmm(text: str, default: str = "10:00") -> dt.time:
    try:
        return dt.time.fromisoformat(text.strip()[:5])
    except Exception:
        return dt.time.fromisoformat(default)


async def walkable_stops(conn: Connection, sig: Signals, here: dict[str, float], kinds: list[str], clock: dt.datetime,
                         step_free: bool = False, used: set[str] | None = None, where: str = "",
                         stand_ins: dict[str, str] | None = None, needs: dict[str, bool] | None = None,
                         radii: tuple[int, ...] = (WALK_RADIUS_M, WALK_RADIUS_M * 2), drive_radius_m: int = 0,
                         ) -> tuple[list[dict[str, Any]], dict[str, float], dt.datetime]:
    """Shared by plan_walkable_day and the playbooks: one Qloo place per kind, each near the last.
    `used` can be shared by days planned at the same time, so they don't pick the same places.
    Returns the stops, where the walk ends and the time after the last stop. A kind with nothing
    nearby becomes its stand-in (`stand_ins`, record_store -> bookstore) if one is given. With taste
    off, the popular picks for `where` instead (generic.py), not chained by distance.
    `needs` (see `needs_of`): a place must suit them (`suits`), and the first one that also has the
    nice-to-haves (quiet, parking) wins over a higher-ranked one that doesn't. `radii` are how far
    a walk may be; with `drive_radius_m`, a kind found nowhere on foot is looked for within a
    drive instead and the stop says so."""
    used = used if used is not None else set()
    if conn.taste_off:
        return await _popular_stops(where or conn.city or "", kinds, clock, used), here, clock
    # What the user said isn't for them never comes back (memory.py).
    skip = sig.ids + memory.dislike_ids(conn.profile)
    needs = needs or {}
    plan: list[dict[str, Any]] = []
    for kind in kinds:
        found: list[dict[str, Any]] = []
        drove = False
        # A stand-in only when the day doesn't already have one of those (two bakeries read oddly).
        for option in [kind] + ([stand_ins[kind]] if stand_ins and kind in stand_ins and stand_ins[kind] not in kinds else []):
            genre = option if option in qloo.PLACE_GENRES else None
            for radius in list(radii) + ([drive_radius_m] if drive_radius_m and drive_radius_m > max(radii) else []):
                arrive = clock + dt.timedelta(minutes=10)
                found = [p for p in await qloo.recommend("place", sig.ids, near=here, radius_m=radius, genre=genre, take=15,
                                                         age=sig.age, accessible=step_free, exclude=skip)
                         if p["id"] not in used and p.get("location") and fits(p, option) and open_at(p, arrive, STAY_MIN.get(option, 60))
                         and suits(p, option, needs)]
                if found:
                    drove = radius == drive_radius_m and radius > max(radii)
                    break
            if found:
                kind = option
                break
        if not found:
            plan.append({"kind": kind, "title": f"No {kind.replace('_', ' ')} found nearby", "time": clock.strftime("%H:%M")})
            continue
        pick = next((p for p in found if prefers(p, option, needs)), found[0])
        used.add(pick["id"])
        walk = qloo.walk_minutes(here, pick["location"])
        drove = drove or (needs.get("short_walks", False) and walk > 12 and bool(drive_radius_m))
        if drove:
            walk = drive_minutes(here, pick["location"])
        clock += dt.timedelta(minutes=walk)
        # A morning that runs quick doesn't make lunch at half eleven, and dinner is at a quarter
        # hour ("7:45", not "7:44") since it's the one stop that gets booked.
        if kind == "restaurant" and clock.time() < dt.time(12, 15) and clock.hour < 17:
            clock = clock.replace(hour=12, minute=15)
        elif kind == "restaurant" and clock.hour >= 17 and clock.minute % 15:
            clock += dt.timedelta(minutes=15 - clock.minute % 15)
        plan.append({
            "kind": kind, "time": clock.strftime("%H:%M"), "title": pick["name"], "address": pick.get("address"),
            "lat": pick["location"]["lat"], "lon": pick["location"]["lon"], "image": pick.get("image"),
            "note": (f"A {walk}-minute drive. " if drove else "") + (pick.get("description") or "")[:110], "id": pick["id"], "area": pick.get("neighborhood"),
            # For the written plan (tripdoc.py): the whole description and the practical details.
            "about": pick.get("description"), "tags": pick.get("tags"), "price_level": pick.get("price_level"),
            "url": pick.get("url"), "phone": pick.get("phone"), "hours": pick.get("hours"), "rating": pick.get("rating"),
            "specialties": pick.get("specialties"), "genre": pick.get("genre"),
            # What someone's needs turn on (qloo._place_details).
            "noise": pick.get("noise"), "reservations": pick.get("reservations"), "reservations_required": pick.get("reservations_required"),
            "parking": pick.get("parking"), "wait": pick.get("wait"),
            **({"drive_min": walk} if drove else {"walk_min": walk}),
        })
        clock += dt.timedelta(minutes=STAY_MIN.get(kind, 60))
        here = pick["location"]
    return plan, here, clock


# What Qloo must say a place mainly is for it to stand in for a kind of stop. Qloo's genre filter
# matches any tag, so a hotel with a restaurant came back as lunch, a department store as a record
# shop and a shopping mall as a bookshop (Paris, 2026-10-27); the primary genre tells them apart.
FITS = {
    "coffee": ("coffee_shop", "cafe", "coffee", "bakery", "tea", "brunch", "breakfast"),
    "cafe": ("cafe", "coffee", "bakery", "tea", "brunch", "breakfast", "patisserie"),
    "bakery": ("bakery", "patisserie", "pastry", "boulangerie", "cafe", "bread"),
    "restaurant": ("restaurant", "bistro", "brasserie", "bouillon", "trattoria", "diner", "eatery", "steak", "pizza", "sushi", "noodle"),
    "bar": ("bar", "pub", "lounge", "taproom", "brewery", "beer"),
    "cocktail_bar": ("bar", "lounge", "cocktail", "speakeasy"),
    "wine_bar": ("bar", "wine", "cave", "bistro"),
    # Somewhere with music on most nights (a jazz club, a music bar), not a concert hall that's dark without a show.
    "music_venue": ("jazz", "music_bar", "live_music_bar", "club", "cabaret", "bar", "lounge"),
    "museum": ("museum", "gallery", "art", "exhibit", "cultural", "monument", "landmark", "attraction", "historic", "heritage", "palace", "foundation"),
    "bookstore": ("book", "library", "comic"),
    "record_store": ("record", "music_store", "vinyl"),
    "park": ("park", "garden", "square", "promenade", "plaza", "cemetery", "canal", "river"),
    "hotel": ("hotel", "hostel", "inn", "lodging"),
    # A proper jazz room (Qloo's own genre), not a bar or restaurant with a jazz tag.
    "jazz_club": ("jazz_club", "jazz"),
    "cinema": ("movie_theater", "cinema", "film"),
}
# Global chains and shops that aren't a stop worth a line in a plan.
CHAINS = ("starbucks", "nespresso", "mcdonald", "fnac", "pret a manger", "costa coffee", "five guys", "hard rock", "brioche dorée", "illy", "paris baguette",
          "planet hollywood", "subway", "burger king", "kfc", "domino", "pizza hut", "paul ", "columbus café", "zara", "h&m",
          "apple store", "sephora", "centre commercial", "shopping", "galeries lafayette", "printemps")
# A lunch or dinner stop that Qloo files mainly under one of these isn't a meal.
NOT_A_MEAL = ("bar", "pastry", "tea", "coffee", "bakery", "ice_cream", "dessert", "chocolate", "candy", "food_court", "fast_food")
GOOD_RATING = 3.9


def fits(pick: dict[str, Any], kind: str) -> bool:
    """Whether a Qloo place can be this kind of stop: open for business, not a chain, well rated
    when a rating exists, and mainly what the stop asks for (a hotel is never lunch)."""
    if pick.get("closed"):
        return False
    name = (pick.get("name") or "").lower()
    if any(c in name for c in CHAINS):
        return False
    rating = pick.get("rating")
    if rating is not None and rating < GOOD_RATING:
        return False
    genre = (pick.get("genre") or "").lower()
    if not genre:
        return not (kind != "hotel" and (name.startswith(("hôtel", "hotel")) or " hotel" in name))
    if kind != "hotel" and ("hotel" in genre or "shopping_mall" in genre or "department_store" in genre):
        return False
    if kind == "restaurant" and any(n in genre for n in NOT_A_MEAL):
        return False
    # A dinner cruise or a bus tour is an outing, not a table (Le Calife, Bustronome: Paris, 2026-10-27).
    tags = " ".join(str(t).lower() for t in pick.get("tags") or [])
    if kind in ("restaurant", "cafe", "coffee", "bakery") and any(w in name or w in genre or w in tags for w in ("cruise", "boat", "bus ", "tour", "péniche", "river")):
        return False
    if kind == "music_venue" and any(n in genre for n in ("live_music_venue", "concert_hall", "arena", "stadium", "theater", "theatre")):
        return False
    allowed = FITS.get(kind)
    return not allowed or any(a in genre for a in allowed)


# What a person's needs ask of a place ("proper table with a reservation, nothing too loud"), from
# the needs they were saved with (taste.needs_of). Hard rules in `suits`, nice-to-haves in `prefers`.
def suits(pick: dict[str, Any], kind: str, needs: dict[str, bool]) -> bool:
    """Whether a place respects someone's needs: not loud when they want quiet; a restaurant that
    takes reservations when they want a proper table; nothing that's mainly a bar or a counter."""
    if not needs:
        return True
    genre = (pick.get("genre") or "").lower()
    if needs.get("quiet") and (pick.get("noise") == "loud" or any(w in genre for w in ("night_club", "sports_bar", "karaoke"))):
        return False
    if needs.get("quiet"):
        # A record shop with in-store DJ sets, a bar that's really a dance floor: not for someone who wants quiet.
        words = ((pick.get("description") or "") + " " + " ".join(str(t) for t in pick.get("tags") or [])).lower()
        if any(w in words for w in ("dj set", "dance music", "techno", "nightclub", "night club", "karaoke", "dance floor", "sports bar")):
            return False
    if needs.get("seated") and kind == "restaurant":
        if any(w in genre for w in ("bar", "pub", "fast_food", "food_court", "takeout", "counter", "stand", "truck", "cafeteria")):
            return False
        words = (pick.get("description") or "").lower()
        if any(w in words for w in ("cafeteria", "counter-serve", "counter serve", "order at the counter", "quick bites", "grab-and-go",
                                    "fast-casual", "fast casual", "food hall", "takeout spot", "self-serve")):
            return False
        if pick.get("reservations") is None and pick.get("hours") is not None:
            # Qloo knows the place well (it has hours) but lists no reservations: likely walk-in only.
            return False
    if needs.get("seated") and kind in ("bar", "cocktail_bar", "wine_bar", "music_venue") and "night_club" in genre:
        return False
    # Someone who keeps early hours is only sent where Qloo knows the hours (a gallery with none may
    # open by appointment); parks and cinemas rarely list any.
    if (needs.get("early") or needs.get("seated")) and not pick.get("hours") and kind not in ("park", "cinema", "home"):
        return False
    return True


def prefers(pick: dict[str, Any], kind: str, needs: dict[str, bool]) -> bool:
    """The nice-to-haves: quiet rather than moderate, parking when they drive, no usual wait when
    they want a proper table. The first place in Qloo's order with all of them wins."""
    if not needs:
        return True
    if needs.get("quiet") and pick.get("noise") not in (None, "quiet") and kind in ("restaurant", "cafe", "coffee", "bakery"):
        return False
    if needs.get("parking") and not pick.get("parking"):
        return False
    if needs.get("seated") and kind == "restaurant" and pick.get("wait") and not pick.get("reservations"):
        return False
    # A proper table is rarely a one-dollar-sign place.
    if needs.get("seated") and kind == "restaurant" and (pick.get("price_level") or 2) < 2:
        return False
    # Two grown men don't need the kids' museum.
    if kind in ("museum",) and any(w in (pick.get("description") or "").lower() for w in ("kid", "children", "playground", "family-friendly")):
        return False
    return True


def drive_minutes(a: dict[str, float], b: dict[str, float]) -> int:
    """A city drive: 22 km/h door to door, plus five minutes to park."""
    return max(5, round(qloo.km_between(a, b) * 1.33 / 22 * 60) + 5)


def open_at(pick: dict[str, Any], when: dt.datetime, stay_min: int = 60) -> bool:
    """Whether a place is open when the plan arrives (Qloo hours by weekday); unknown hours pass.
    A place that opens within half an hour of arriving counts, so a 09:30 coffee can open at 10."""
    hours = pick.get("hours")
    if not hours:
        return True
    today = hours.get(qloo.WEEKDAYS[when.weekday()])
    if today is None:
        return True
    if today == "closed":
        return False
    arrive = when.hour * 60 + when.minute
    for span in today.split(", "):
        try:
            opens, closes = span.split(" to ")
            o = int(opens[:2]) * 60 + int(opens[3:5])
            c = int(closes[:2]) * 60 + int(closes[3:5])
        except ValueError:
            return True
        if c <= o:
            c += 24 * 60  # closes after midnight
        if o <= arrive + 30 and arrive + min(stay_min, 45) <= c:
            return True
    return False


async def _popular_stops(where: str, kinds: list[str], clock: dt.datetime, used: set[str]) -> list[dict[str, Any]]:
    """Taste off: each stop is the most popular of its kind in the area, from a model's general
    knowledge; no Qloo, so no walking times."""
    found = await asyncio.gather(*(generic.picks("place", where, k if k in qloo.PLACE_GENRES else "", 3) for k in kinds))
    plan = []
    for kind, out in zip(kinds, found):
        pick = next((p for p in out.get("picks") or [] if p["name"] not in used), None)
        if pick is None:
            continue
        used.add(pick["name"])
        plan.append({"kind": kind, "time": clock.strftime("%H:%M"), "title": pick["name"], "address": pick.get("address"),
                     "note": (pick.get("description") or "")[:110]})
        clock += dt.timedelta(minutes=STAY_MIN.get(kind, 60) + 10)
    return plan


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
    clean = timeline_stops(stops)
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "timeline", "key": title, "title": title, "stops": clean[:10]})
    await report(conn, task, "slice", f"Showed the plan, {len(clean)} stops")
    return {"shown": len(clean)}


def timeline_stops(stops: list[Any]) -> list[dict[str, Any]]:
    """The fields a timeline card draws (RichViews.swift), with walk_min a whole number."""
    clean = []
    for s in stops:
        if not isinstance(s, dict) or not s.get("title"):
            continue
        row = {k: v for k, v in s.items() if k in ("time", "title", "kind", "note", "address", "walk_min", "drive_min", "lat", "lon", "image", "with") and v is not None}
        if "walk_min" in row:
            try:
                row["walk_min"] = round(float(row["walk_min"]))
            except (TypeError, ValueError):
                row.pop("walk_min")
        clean.append(row)
    return clean


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
@page { size: Letter; margin: 0.7in 0.75in 0.8in; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #141414; font-size: 19pt; line-height: 1.38; margin: 0; }
header { margin-bottom: 14pt; }
h1 { font-size: 36pt; line-height: 1.08; letter-spacing: -0.5pt; margin: 0 0 6pt; }
.sub { font-size: 18pt; color: #555; margin: 0 0 4pt; }
.lead { font-size: 18pt; margin: 10pt 0 0; }
section { page-break-inside: avoid; }
section.page { page-break-before: always; }
h2 { font-size: 28pt; line-height: 1.1; letter-spacing: -0.3pt; margin: 6pt 0 2pt; }
.when { font-size: 17pt; color: #555; margin: 0 0 12pt; }
ol { list-style: none; padding: 0; margin: 0; }
li { display: flex; gap: 16pt; padding: 11pt 0; border-top: 1.5pt solid #d9d9d9; page-break-inside: avoid; }
li:first-child { border-top: 0; }
.time { flex: 0 0 76pt; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 20pt; padding-top: 1pt; }
.what { flex: 1; }
.what b { display: block; font-size: 21pt; line-height: 1.2; margin-bottom: 3pt; }
.what .kind { color: #555; font-weight: 400; }
.what p { margin: 0 0 3pt; }
.what p.where { color: #444; font-size: 17pt; }
.simple li { display: block; }
.simple b { display: block; font-size: 21pt; }
footer { margin-top: 26pt; font-size: 14pt; color: #777; border-top: 1.5pt solid #d9d9d9; padding-top: 8pt; }
"""


def _printout_html(title: str, subtitle: str, sections: list[dict[str, Any]], lead: str = "", footer: str = "") -> str:
    """Large print: a title, a line under it, then sections. A section is {"heading", "sub",
    "items", "page": true} (page starts a new sheet). An item is {"time", "title", "kind",
    "lines": [...]} for a stop with a time, or {"title", "detail"} for a plain line."""
    e = html.escape
    parts = [f"<header><h1>{e(title)}</h1>"]
    if subtitle:
        parts.append(f"<div class='sub'>{e(subtitle)}</div>")
    if lead:
        parts.append(f"<p class='lead'>{e(lead)}</p>")
    parts.append("</header>")
    for i, section in enumerate(sections):
        cls = " class='page'" if section.get("page") and i else ""
        parts.append(f"<section{cls}><h2>{e(str(section.get('heading') or ''))}</h2>")
        if section.get("sub"):
            parts.append(f"<p class='when'>{e(str(section['sub']))}</p>")
        items = section.get("items") or []
        timed = any(isinstance(it, dict) and it.get("time") for it in items)
        parts.append("<ol>" if timed else "<ol class='simple'>")
        for item in items:
            if not isinstance(item, dict):
                parts.append(f"<li>{e(str(item))}</li>")
                continue
            head = e(str(item.get("title") or ""))
            if item.get("kind"):
                head += f" <span class='kind'>({e(str(item['kind']))})</span>"
            lines = [str(x) for x in (item.get("lines") or []) if x]
            if item.get("detail"):
                lines.append(str(item["detail"]))
            body = "".join(f"<p{' class=' + chr(39) + 'where' + chr(39) if j == len(lines) - 1 and len(lines) > 1 else ''}>{e(line)}</p>" for j, line in enumerate(lines))
            if item.get("time"):
                parts.append(f"<li><span class='time'>{e(str(item['time']))}</span><div class='what'><b>{head}</b>{body}</div></li>")
            else:
                parts.append(f"<li><b>{head}</b>{body}</li>")
        parts.append("</ol></section>")
    parts.append(f"<footer>{e(footer or 'Picked for your taste by Slice')}</footer>")
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{e(title)}</title><style>{PRINT_CSS}</style></head><body>{''.join(parts)}</body></html>"


async def make_printout(title: str, sections_json: str, tool_context: ToolContext, subtitle: str = "", lead: str = "",
                        footer: str = "", open_it: bool = True) -> dict[str, Any]:
    """A large-print PDF (big type, high contrast) for someone who'd rather read paper: "Ray's
    week", "Frank and Walter's weekend" (a page per day). Saved on the Mac in Documents/Slice and
    opened; send it with send_file_imessage or draft_email_in_mail(attachment=path). For a plan a
    playbook made, print_this_plan or send_this_plan already know its sections.

    Args:
        title: "Ray's week".
        sections_json: JSON list of {"heading": "Saturday 31 October", "sub": "Partly cloudy, 8 to 14°C", "page": true,
            "items": [{"time": "12:45", "title": "Vinci", "kind": "lunch", "lines": ["Why it fits", "Address"]}]}; a plain
            item is {"title": "Out of Africa", "detail": "Tuesday, on Netflix"}.
        subtitle: One line under the title ("31 October and 1 November").
        lead: A warm sentence or two under that, in plain words.
        footer: The line at the foot of the last page.
        open_it: Open it on the Mac once saved (false when it's only being sent).
    """
    conn, task = for_worker(tool_context)
    try:
        sections = [s for s in json.loads(sections_json) if isinstance(s, dict)]
    except json.JSONDecodeError as err:
        return {"error": f"sections_json isn't valid JSON: {err}"}
    from slice_pages.browser import browser  # one headless Chromium per process, shared with Pages

    page = await (await browser()).new_page()
    try:
        await page.set_content(_printout_html(title, subtitle, sections, lead, footer), wait_until="load")
        pdf = await page.pdf(format="Letter", print_background=True)
    finally:
        await page.close()
    name = re.sub(r"[^\w' -]+", "", title).strip() or "Slice plan"
    saved = await conn.bridge.call("save_file", {"name": f"{name}.pdf", "data": base64.b64encode(pdf).decode(), "open": open_it}, timeout=20)
    if saved.get("error"):
        return saved
    pages = sum(1 for sec in sections if sec.get("page")) + 1
    await report(conn, task, "mac", f"Made “{title}”", f"large print, {pages} page{'s' if pages > 1 else ''}")
    if conn.tasks:
        conn.tasks.show_view(task, {"type": "file", "key": "printout", "title": title, "path": saved.get("path"), "detail": "Large print, ready to send"})
    return {"path": saved.get("path"), "pages": pages}


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
