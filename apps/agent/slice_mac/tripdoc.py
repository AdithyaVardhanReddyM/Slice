"""A planned trip written up as a document the user can keep: the same plan as the island's
timeline cards, with every stop's neighbourhood, why it fits their taste (Qloo), and the
practical details Qloo knows (address, opening hours that day, price, booking, website).

Two renderings of one structure: Markdown for a Google Doc (GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN
turns headings, bold and bullets into real formatting) and HTML for the PDF saved in
Documents/Slice when Docs isn't connected (the same headless Chromium as make_printout). The
worker adds only the intro paragraph and any tips it checked; every name, time and detail here
comes from the plan, so nothing in the document is made up.
"""

from __future__ import annotations

import datetime as dt
import html as html_lib
from typing import Any

WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
KIND_WORDS = {"coffee": "coffee", "cafe": "café", "bakery": "bakery", "record_store": "record shop", "bookstore": "bookshop",
              "museum": "museum", "park": "park", "restaurant": "restaurant", "bar": "bar", "cocktail_bar": "cocktail bar",
              "wine_bar": "wine bar", "music_venue": "live music", "hotel": "hotel", "calendar": "in your calendar"}
# A meal and an evening read as plans, not shop stops.
MEAL = {"restaurant", "bar", "cocktail_bar", "wine_bar", "music_venue"}


def title_for(city: str, start: dt.date, end: dt.date) -> str:
    """"Paris, 12 to 19 November", or "Paris, 28 November to 4 December"."""
    city = city.split(",")[0].strip()
    if start == end:
        return f"{city}, {start.day} {start.strftime('%B')}"
    if start.month == end.month:
        return f"{city}, {start.day} to {end.day} {start.strftime('%B')}"
    return f"{city}, {start.day} {start.strftime('%B')} to {end.day} {end.strftime('%B')}"


def day_heading(date: dt.date, area: str) -> str:
    head = f"{WEEKDAY[date.weekday()]} {date.day} {date.strftime('%B')}"
    return f"{head}, {area}" if area else head


def _price(level: Any) -> str:
    try:
        return "€" * max(1, min(int(level), 4))
    except (TypeError, ValueError):
        return ""


def _hours_today(stop: dict[str, Any], date: dt.date) -> str | None:
    hours = stop.get("hours") or {}
    today = hours.get(WEEKDAY[date.weekday()].lower())
    if not today:
        return None
    if today == "closed":
        return f"Closed on {WEEKDAY[date.weekday()]}s"
    return f"Open {today}"


def _weather_words(w: dict[str, Any] | None) -> str | None:
    if not w or "summary" not in w:
        return None
    temp = f"{w['low_c']} to {w['high_c']}°C" if w.get("low_c") is not None else f"{w['high_c']}°C"
    rain = "rain likely" if (w.get("rain_chance") or 0) >= 50 else "a chance of rain" if (w.get("rain_chance") or 0) >= 30 else "little rain"
    if w.get("typical"):
        return f"Last year this day: {w['summary']}, {temp}, {rain}."
    wet = f" ({w['wet_hours']})" if w.get("wet_hours") else ""
    return f"Forecast: {w['summary']}, {temp}, {rain}{wet}."


def _practical(stop: dict[str, Any], date: dt.date) -> list[str]:
    bits: list[str] = []
    if stop.get("address"):
        bits.append(str(stop["address"]).replace(" France", "").strip().rstrip(","))
    hours = _hours_today(stop, date)
    if hours:
        bits.append(hours)
    price = _price(stop.get("price_level"))
    if price and stop.get("kind") in MEAL | {"cafe", "coffee", "bakery"}:
        bits.append(price)
    tags = [str(t).lower() for t in stop.get("tags") or []]
    if stop.get("kind") == "restaurant" and (stop.get("time", "") >= "17:00" or "reservations" in tags or "usually a wait" in tags):
        bits.append("Book ahead")
    elif "getting tickets in advance recommended" in tags:
        bits.append("Book tickets ahead")
    if stop.get("kind") == "restaurant":
        dishes = [str(d).strip() for d in stop.get("specialties") or []]
        dishes = [d for d in dishes if d and not d.lower().startswith("and ") and "and more" not in d.lower() and len(d) < 40]
        if dishes:
            bits.append("Try the " + _and([_dish(d) for d in dishes[:2]]))
    return bits


_PROPER = ("french", "italian", "spanish", "japanese", "chinese", "thai", "vietnamese", "indian", "mexican", "peruvian", "lebanese",
           "korean", "greek", "moroccan", "american", "parisian", "basque", "breton", "lyonnais", "niçoise", "provençal")


def _dish(name: str) -> str:
    """"French Onion Soup" -> "French onion soup"."""
    words = name.lower().split()
    return " ".join(w.capitalize() if w in _PROPER else w for w in words)


def _walk(stop: dict[str, Any]) -> str:
    walk = stop.get("walk_min")
    if walk is None:
        return ""
    walk = int(round(float(walk)))
    if walk <= 2:
        return "right next door"
    if walk > 20:
        return f"{walk} minutes on foot or a short metro ride"
    article = "an" if walk in (8, 11, 18) else "a"
    return f"{article} {walk}-minute walk"


class Doc:
    """One trip document: build it once, read it as Markdown or HTML."""

    def __init__(self, plan: dict[str, Any], intro: str, whys: dict[str, str], tips: dict[str, str]) -> None:
        self.plan = plan
        self.intro = intro.strip()
        self.whys = whys
        self.tips = {k.strip().lower(): v for k, v in tips.items() if v}
        self.start = dt.date.fromisoformat(plan["days"][0]["date"])
        self.end = dt.date.fromisoformat(plan["days"][-1]["date"])
        self.title = title_for(plan["city"], self.start, self.end)

    # --- the structure -------------------------------------------------------------------

    def opening(self) -> list[str]:
        """The paragraphs before the first day."""
        out = []
        if self.intro:
            out.append(self.intro)
        loves = [n for n in self.plan.get("loves") or []][:5]
        if loves:
            out.append(_sentence("Every stop was picked through Qloo for what you love: " + _and(loves)))
        areas = [a for a in self.plan.get("areas") or [] if a.get("name")][:3]
        if areas:
            where = _and([a["name"] for a in areas])
            out.append(f"Your taste in {self.plan['city'].split(',')[0]} lives mostly around {where}, so the days are grouped there, "
                       "each one a walk from stop to stop.")
        if self.plan.get("stay"):
            out.append(f"You're staying at {self.plan['stay']}; the first day starts from there.")
        weather = [d.get("weather_data") for d in self.plan["days"] if isinstance(d.get("weather_data"), dict) and "summary" in d["weather_data"]]
        if weather:
            highs = [w["high_c"] for w in weather]
            wet = sum(1 for w in weather if (w.get("rain_chance") or 0) >= 50)
            if all(w.get("typical") for w in weather):
                out.append(f"It's too far ahead for a forecast. Last year these days were {min(highs)} to {max(highs)}°C"
                           + (f" with rain on {wet} of them" if wet else " and mostly dry") + ", so pack a coat and plan for a wet afternoon or two.")
            else:
                out.append(f"The forecast says {min(highs)} to {max(highs)}°C" + (f", with rain on {wet} of the days" if wet else ", mostly dry")
                           + "; rainy days lean on museums, shops and cafés.")
        return out

    def days(self) -> list[dict[str, Any]]:
        out = []
        for d in self.plan["days"]:
            date = dt.date.fromisoformat(d["date"])
            stops = [s for s in d.get("stops") or [] if s.get("title") and not str(s["title"]).startswith("No ")]
            out.append({"heading": day_heading(date, d.get("area") or ""), "date": date,
                        "weather": _weather_words(d.get("weather_data")), "stops": stops})
        return out

    def stop_lines(self, stop: dict[str, Any], date: dt.date, first: bool = False) -> tuple[str, list[str]]:
        """(the bold head, the sentences under it). The first stop of a day has no "last stop":
        on day one it's a walk from the hotel, on the others the walk isn't worth a line."""
        kind = KIND_WORDS.get(stop.get("kind") or "", "")
        head = f"{stop.get('time', '')} {stop['title']}".strip()
        where = ", ".join(x for x in [kind, stop.get("area")] if x)
        if where:
            head += f" ({where})"
        lines: list[str] = []
        walk = _walk(stop)
        if first:
            walk = f"{walk} from the hotel" if walk and self.plan.get("stay") and date == self.start else ""
        elif walk == "right next door":
            walk = "right next door to the last stop"
        elif walk:
            walk = f"{walk} from the last stop"
        about = (stop.get("about") or stop.get("note") or "").strip().rstrip(".")
        if about:
            lines.append(_sentence(about + (f", {walk}" if walk else "")))
        elif walk:
            lines.append(_sentence(f"{walk[0].upper()}{walk[1:]}"))
        why = self.whys.get(stop.get("id") or "") or stop.get("why")
        if why:
            lines.append(_sentence(why))
        tip = self.tips.get(str(stop["title"]).strip().lower())
        if tip:
            lines.append(_sentence(tip))
        practical = _practical(stop, date)
        if practical:
            lines.append(_sentence(". ".join(practical)))
        return head, lines

    def closing(self) -> list[tuple[str, list[str]]]:
        """(heading, lines) sections after the days."""
        out: list[tuple[str, list[str]]] = []
        dinner = self.plan.get("dinner")
        if dinner:
            date = dt.date.fromisoformat(dinner["date"])
            line = f"Dinner at {dinner['name']} on {WEEKDAY[date.weekday()]} {date.day} {date.strftime('%B')} at {dinner['time']}."
            if dinner.get("url"):
                line += f" Reservations on its own site: {dinner['url']}"
            out.append(("Worth booking", [line]))
        shows = self.plan.get("shows") or []
        if shows:
            out.append(("Shows those nights", [f"{s['act']} at {s['venue']}, {s['date']} {s['time']}, a {s['match']}% match for you." for s in shows[:3]]))
        return out

    # --- Markdown (Google Docs) -------------------------------------------------------------

    def markdown(self) -> str:
        parts = [f"# {self.title}", ""]
        for para in self.opening():
            parts += [para, ""]
        for day in self.days():
            parts += [f"## {day['heading']}", ""]
            if day["weather"]:
                parts += [f"*{day['weather']}*", ""]
            for i, stop in enumerate(day["stops"]):
                head, lines = self.stop_lines(stop, day["date"], first=i == 0)
                parts.append(f"- **{head}** " + " ".join(lines))
            parts.append("")
        for heading, lines in self.closing():
            parts += [f"## {heading}", ""] + [f"- {line}" for line in lines] + [""]
        parts += ["*Planned by Slice around your taste, with Qloo. Hours and prices are as listed when this was written; "
                  "check before you go.*"]
        return "\n".join(parts).strip() + "\n"

    # --- HTML (the PDF on the Mac) --------------------------------------------------------

    def html(self) -> str:
        e = html_lib.escape
        parts = [f"<header><h1>{e(self.title)}</h1><div class='kicker'>Planned by Slice around your taste, with Qloo</div></header>"]
        parts.append("<section class='intro'>" + "".join(f"<p>{e(p)}</p>" for p in self.opening()) + "</section>")
        for day in self.days():
            parts.append(f"<section class='day'><h2>{e(day['heading'])}</h2>")
            if day["weather"]:
                parts.append(f"<p class='weather'>{e(day['weather'])}</p>")
            parts.append("<ol class='stops'>")
            for i, stop in enumerate(day["stops"]):
                head, lines = self.stop_lines(stop, day["date"], first=i == 0)
                time, _, rest = head.partition(" ")
                parts.append(f"<li><span class='time'>{e(time)}</span><div class='stop'><b>{e(rest)}</b>"
                             + "".join(f"<p>{e(line)}</p>" for line in lines) + "</div></li>")
            parts.append("</ol></section>")
        for heading, lines in self.closing():
            parts.append(f"<section class='day'><h2>{e(heading)}</h2>" + "".join(f"<p>{e(line)}</p>" for line in lines) + "</section>")
        parts.append("<footer>Hours and prices are as listed when this was written; check before you go.</footer>")
        return f"<!doctype html><html><head><meta charset='utf-8'><title>{e(self.title)}</title><style>{CSS}</style></head><body>{''.join(parts)}</body></html>"


def _sentence(text: str) -> str:
    """Ends with one full stop, even after a name like "Fred again..", and not with "etc.."."""
    text = text.strip()
    return text if text.endswith((".", "!", "?", "…")) else text + "."


def _and(items: list[str]) -> str:
    items = [str(i) for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" and {items[-1]}"


CSS = """
@page { size: A4; margin: 18mm 18mm 20mm; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #15181f; font-size: 10.5pt; line-height: 1.45; margin: 0; }
header { border-bottom: 2px solid #15181f; padding-bottom: 8pt; margin-bottom: 14pt; }
h1 { font-size: 26pt; letter-spacing: -0.4pt; margin: 0 0 2pt; }
.kicker { color: #6b7280; font-size: 9.5pt; }
.intro p { margin: 0 0 7pt; font-size: 11pt; }
.day { margin-top: 16pt; page-break-inside: avoid; }
h2 { font-size: 15pt; margin: 0 0 3pt; letter-spacing: -0.2pt; }
.weather { color: #6b7280; margin: 0 0 8pt; font-size: 9.5pt; }
ol.stops { list-style: none; padding: 0; margin: 0; }
ol.stops li { display: flex; gap: 10pt; padding: 7pt 0; border-top: 1px solid #e5e7eb; page-break-inside: avoid; }
ol.stops li:first-child { border-top: 0; }
.time { flex: 0 0 38pt; font-variant-numeric: tabular-nums; color: #6b7280; font-size: 10pt; padding-top: 1pt; }
.stop b { display: block; font-size: 11pt; margin-bottom: 2pt; }
.stop p { margin: 0 0 2pt; }
.stop p:last-child { color: #4b5563; font-size: 9.5pt; }
footer { margin-top: 18pt; color: #9ca3af; font-size: 8.5pt; }
"""
