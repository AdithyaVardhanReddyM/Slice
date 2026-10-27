"""What Slice remembers about the user, and how it learns their taste over time.

Plain operations on the profile dict (taste.py documents the rest of its shape);
learning.py runs them for a connected Mac, routes.py for the Settings window.
Fields owned here:

    "seeds"[i] also carry "source" (onboarding, settings, said, liked, learned, screen,
        music), "at" (when it was added), "weight" (how much it steers picks, 0.5-1.5)
        and "image"
    "dislikes":  [{"id", "name", "kind", "at"}]   never picked again, flagged in rankings
    "facts":     [{"id", "text", "about", "source", "at"}]   plain words ("Doesn't eat meat");
                 about is "me" or a saved person's name
    "evidence":  {entity id: {"name", "kind", "image", "score", "days", "events", "log"}}
                 what the user played, opened, tapped or picked that isn't a love yet
    "suggested": [{"id", "name", "kind", "image", "why", "at"}]   learned loves waiting for a yes
    "declined":  [entity ids]   suggestions the user turned down (never asked again)
    "journal":   [{"id", "at", "kind", "text", "about", "ref"}]   what changed and why, oldest first
    "prefs":     {"discovery": "new" | "mix" | "known", ...}   from onboarding
    "onboarding": {"done": true | false, "at": ...}   false while the setup is still part-way
                 (the Mac sets done on its last step)

The loop: saying "I love X" (or a thumbs up on a card) adds it at once; quieter
signals (a track playing, a film page open, a lens badge tapped) add up as
evidence, and once one clears the bar on more than one day Slice asks "Add it to
your taste?". Each change to the loves re-reads the taste (taste.reread) and the
journal says how it moved. Qloo takes at most 20 signal entities and no weights
(checked 2026-10-26: a weighted JSON signal 400s), so weights decide which loves
steer: signal_seeds() takes the 20 strongest, newest first among equals.
"""

from __future__ import annotations

import datetime as dt
import os
import uuid
from typing import Any

from . import qloo

SIGNAL_CAP = 20
SEEDS_KEEP = 40
JOURNAL_KEEP = 150
EVIDENCE_KEEP = 250
FACTS_KEEP = 80

# How much each thing the user does says about their taste.
EVENT_SCORE = {"played": 1.0, "opened": 1.0, "asked_why": 1.0, "tapped": 2.0, "picked": 3.0, "booked": 4.0}
# A binge counts, but not forever: at most this many of each a day.
DAILY_CAP = {"played": 3, "opened": 2, "asked_why": 2, "tapped": 2}
# MAC_LEARN_FAST=1 asks after a few plays on one day (for demos); normally it takes days.
FAST = bool(os.environ.get("MAC_LEARN_FAST"))
SUGGEST_AT = 3.0 if FAST else 6.0
SUGGEST_DAYS = 1 if FAST else 2
# Where a love came from, to how much it steers picks at first.
SOURCE_WEIGHT = {"onboarding": 1.0, "settings": 1.0, "said": 1.0, "liked": 0.9, "screen": 0.9, "learned": 0.8, "music": 0.8}
MAX_WEIGHT = 1.5


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:10]


def names_of(items: list[dict[str, Any]], most: int = 3) -> str:
    names = [i["name"] for i in items if i.get("name")]
    if len(names) > most:
        return ", ".join(names[:most]) + f" and {len(names) - most} more"
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + (f" and {names[-1]}" if names else "")


def journal(profile: dict[str, Any], kind: str, text: str, about: str = "me", ref: Any = None) -> dict[str, Any]:
    """Note what changed. kinds: started, added, learned, liked, removed, disliked, fact, forgot, reread."""
    entry = {"id": _new_id(), "at": now_iso(), "kind": kind, "text": text, "about": about}
    if ref is not None:
        entry["ref"] = ref
    entries = list(profile.get("journal") or []) + [entry]
    profile["journal"] = entries[-JOURNAL_KEEP:]
    return entry


def _brief(e: dict[str, Any]) -> dict[str, Any]:
    return {k: e[k] for k in ("id", "name", "kind", "image") if e.get(k)}


# --- loves ------------------------------------------------------------------------------


def signal_seeds(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """The loves that steer Qloo: the strongest 20, newest first among equals."""
    seeds = [s for s in profile.get("seeds") or [] if s.get("id")]
    seeds = sorted(seeds, key=lambda s: s.get("at") or "", reverse=True)
    return sorted(seeds, key=lambda s: s.get("weight") or 1.0, reverse=True)[:SIGNAL_CAP]


def dislike_ids(profile: dict[str, Any]) -> list[str]:
    return [d["id"] for d in profile.get("dislikes") or [] if d.get("id")]


def _trim_seeds(seeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(seeds) <= SEEDS_KEEP:
        return seeds
    # The weakest, oldest go first.
    keep = sorted(seeds, key=lambda s: ((s.get("weight") or 1.0), s.get("at") or ""), reverse=True)[:SEEDS_KEEP]
    kept = {id(s) for s in keep}
    return [s for s in seeds if id(s) in kept]


async def add_loves(profile: dict[str, Any], items: list[Any], source: str, why: str = "",
                    kind: str = "", quiet: bool = False) -> list[dict[str, Any]]:
    """Names or Qloo entities to loves. A love said again gets stronger. Returns what was new."""
    entities = [i for i in items if isinstance(i, dict) and i.get("id")]
    names = [i.strip() for i in items if isinstance(i, str) and i.strip()]
    if names:
        entities += await qloo.resolve(names, kind)
    seeds = list(profile.get("seeds") or [])
    by_id = {s["id"]: s for s in seeds if s.get("id")}
    added: list[dict[str, Any]] = []
    for e in entities:
        if e["id"] in by_id:
            seed = by_id[e["id"]]
            seed["weight"] = round(min(MAX_WEIGHT, (seed.get("weight") or 1.0) + 0.1), 2)
            continue
        row = {**_brief(e), "source": source, "at": now_iso(), "weight": SOURCE_WEIGHT.get(source, 1.0)}
        seeds.append(row)
        by_id[e["id"]] = row
        added.append(row)
    profile["seeds"] = _trim_seeds(seeds)
    taken = {e["id"] for e in entities}
    profile["dislikes"] = [d for d in profile.get("dislikes") or [] if d.get("id") not in taken]
    profile["suggested"] = [s for s in profile.get("suggested") or [] if s.get("id") not in taken]
    for eid in taken:
        (profile.get("evidence") or {}).pop(eid, None)
    if added and not quiet:
        kind_ = {"learned": "learned", "liked": "liked"}.get(source, "added")
        journal(profile, kind_, f"Added {names_of(added)}" + (f": {why}" if why else ""), ref=[_brief(a) for a in added])
    return added


def forget_love(profile: dict[str, Any], entity_id: str, why: str = "") -> dict[str, Any] | None:
    seeds = list(profile.get("seeds") or [])
    gone = next((s for s in seeds if s.get("id") == entity_id), None)
    if gone is None:
        return None
    profile["seeds"] = [s for s in seeds if s.get("id") != entity_id]
    journal(profile, "removed", f"Removed {gone['name']}" + (f": {why}" if why else ""), ref=[_brief(gone)])
    return gone


async def add_dislike(profile: dict[str, Any], item: Any, why: str = "", kind: str = "") -> dict[str, Any] | None:
    """Something that isn't for them: never picked again. Unknown to Qloo, it's kept as a fact."""
    entity = item if isinstance(item, dict) and item.get("id") else None
    if entity is None and isinstance(item, str) and item.strip():
        # Only the exact thing: "horror films" is a kind of film, not the book that starts with it.
        hits = await qloo.resolve([item], kind) or (await qloo.resolve([item]) if kind else [])
        entity = next((h for h in hits if qloo._norm(h["name"]) == qloo._norm(item)), None)
        if entity is None:
            add_fact(profile, f"Doesn't like {item.strip()}", source="said")
            return None
    if entity is None:
        return None
    profile["seeds"] = [s for s in profile.get("seeds") or [] if s.get("id") != entity["id"]]
    profile["suggested"] = [s for s in profile.get("suggested") or [] if s.get("id") != entity["id"]]
    (profile.get("evidence") or {}).pop(entity["id"], None)
    dislikes = [d for d in profile.get("dislikes") or [] if d.get("id") != entity["id"]]
    row = {**_brief(entity), "at": now_iso()}
    profile["dislikes"] = (dislikes + [row])[-60:]
    journal(profile, "disliked", f"{entity['name']} isn't for you" + (f": {why}" if why else ""), ref=[_brief(entity)])
    return row


def forget_dislike(profile: dict[str, Any], entity_id: str) -> dict[str, Any] | None:
    gone = next((d for d in profile.get("dislikes") or [] if d.get("id") == entity_id), None)
    if gone:
        profile["dislikes"] = [d for d in profile.get("dislikes") or [] if d.get("id") != entity_id]
        journal(profile, "forgot", f"No longer marked {gone['name']} as not for you", ref=[_brief(gone)])
    return gone


# --- facts ------------------------------------------------------------------------------


def add_fact(profile: dict[str, Any], text: str, about: str = "me", source: str = "said", quiet: bool = False) -> dict[str, Any] | None:
    text = " ".join(text.split()).rstrip(".")
    if not text:
        return None
    about = about.strip() or "me"
    facts = list(profile.get("facts") or [])
    if any(f.get("text", "").lower() == text.lower() and f.get("about") == about for f in facts):
        return None
    fact = {"id": _new_id(), "text": text[:200], "about": about, "source": source, "at": now_iso()}
    profile["facts"] = (facts + [fact])[-FACTS_KEEP:]
    if not quiet:
        # "Remembered: Doesn't eat meat", "Remembered about Sam: Doesn't drink".
        journal(profile, "fact", f"Remembered{' about ' + about if about != 'me' else ''}: {fact['text']}", about=about, ref=fact["id"])
    return fact


def forget_fact(profile: dict[str, Any], fact_id: str) -> dict[str, Any] | None:
    gone = next((f for f in profile.get("facts") or [] if f.get("id") == fact_id), None)
    if gone:
        profile["facts"] = [f for f in profile.get("facts") or [] if f.get("id") != fact_id]
        journal(profile, "forgot", f"Forgot: {gone['text']}", about=gone.get("about") or "me")
    return gone


def facts_about(profile: dict[str, Any], about: str = "me") -> list[str]:
    return [f["text"] for f in profile.get("facts") or [] if (f.get("about") or "me").lower() == about.lower()]


# --- learning from what the user does ---------------------------------------------------


def _evidence_line(ev: dict[str, Any]) -> str:
    events = ev.get("events") or {}
    days = len(ev.get("days") or [])
    bits = []
    if events.get("played"):
        bits.append(f"you've played them {events['played']} times" + (f" over {days} days" if days > 1 else ""))
    if events.get("opened"):
        bits.append(f"you've looked it up {events['opened']} times" if events["opened"] > 1 else "you looked it up")
    if events.get("tapped"):
        bits.append("you opened it from my picks")
    if events.get("picked") or events.get("booked"):
        bits.append("you picked it from my suggestions")
    if events.get("asked_why"):
        bits.append("you asked why it fits you")
    line = ", and ".join(bits[:2]) if bits else "it keeps coming up"
    return line[0].upper() + line[1:]


def observe(profile: dict[str, Any], entity: dict[str, Any], event: str, day: str) -> dict[str, Any] | None:
    """Count one thing the user did with an entity. Returns a suggestion when this tipped it over."""
    eid = entity.get("id")
    if not eid or event not in EVENT_SCORE:
        return None
    seed = next((s for s in profile.get("seeds") or [] if s.get("id") == eid), None)
    if seed is not None:
        # Already a love: using it keeps it strong.
        if seed.get("last") != day:
            seed["last"] = day
            seed["weight"] = round(min(MAX_WEIGHT, (seed.get("weight") or 1.0) + 0.03), 2)
        return None
    if eid in dislike_ids(profile) or eid in (profile.get("declined") or []):
        return None
    if any(s.get("id") == eid for s in profile.get("suggested") or []):
        return None
    evidence = profile.setdefault("evidence", {})
    ev = evidence.setdefault(eid, {**_brief(entity), "score": 0.0, "days": [], "events": {}, "log": []})
    if sum(1 for d, e in ev["log"] if d == day and e == event) >= DAILY_CAP.get(event, 99):
        return None
    ev["log"] = (ev["log"] + [[day, event]])[-30:]
    ev["score"] = round(ev["score"] + EVENT_SCORE[event], 2)
    ev["events"][event] = ev["events"].get(event, 0) + 1
    if day not in ev["days"]:
        ev["days"] = (ev["days"] + [day])[-14:]
    ev["last"] = day
    if len(evidence) > EVIDENCE_KEEP:
        weakest = sorted(evidence, key=lambda k: (evidence[k]["score"], evidence[k].get("last") or ""))
        for k in weakest[: len(evidence) - EVIDENCE_KEEP]:
            evidence.pop(k, None)
    strong = any(ev["events"].get(k) for k in ("picked", "booked"))
    if ev["score"] >= SUGGEST_AT and (len(ev["days"]) >= SUGGEST_DAYS or strong):
        suggestion = {**_brief(ev), "id": eid, "why": _evidence_line(ev), "at": now_iso()}
        profile["suggested"] = (list(profile.get("suggested") or []) + [suggestion])[-20:]
        return suggestion
    return None


async def answer_suggestion(profile: dict[str, Any], entity_id: str, accept: bool) -> dict[str, Any] | None:
    found = next((s for s in profile.get("suggested") or [] if s.get("id") == entity_id), None)
    profile["suggested"] = [s for s in profile.get("suggested") or [] if s.get("id") != entity_id]
    if found is None:
        return None
    if accept:
        await add_loves(profile, [found], "learned", why=found.get("why", "").lower())
    else:
        profile["declined"] = (list(profile.get("declined") or []) + [entity_id])[-200:]
        (profile.get("evidence") or {}).pop(entity_id, None)
    return found


# --- undo -------------------------------------------------------------------------------


async def undo(profile: dict[str, Any], entry_id: str) -> bool:
    """Take back one journal entry: an added love, a removal, a dislike or a fact."""
    entry = next((j for j in profile.get("journal") or [] if j.get("id") == entry_id), None)
    if entry is None or entry.get("undone"):
        return False
    refs = entry.get("ref")
    kind = entry.get("kind")
    if kind in ("added", "learned", "liked", "started") and isinstance(refs, list):
        for ref in refs:
            forget_love(profile, ref.get("id", ""), why="undone")
    elif kind == "removed" and isinstance(refs, list):
        await add_loves(profile, refs, "settings", why="put back")
    elif kind == "disliked" and isinstance(refs, list):
        for ref in refs:
            forget_dislike(profile, ref.get("id", ""))
    elif kind == "fact" and isinstance(refs, str):
        forget_fact(profile, refs)
    else:
        return False
    entry["undone"] = True
    return True
