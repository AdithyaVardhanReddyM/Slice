"""The taste graph for Settings > Taste: the user's loves, the threads that tie them
together, the people they've saved, and where their taste goes next.

Nodes: "you"; each love ("love", with its picture and kind); the Qloo tags two or more
loves share ("tag": "melancholic", "coming of age"); saved people ("person") with their
loves ("their_love", or an edge to the user's own love when they share one); Qloo's next
picks for the taste ("pick", tied to the loves that drive them); and what isn't for the
user ("dislike"). Edges: you-love (weight), love-tag, person-love, person-tag (common
ground), pick-love (because), you-dislike.

Tags come from the loves' own Qloo tags (/entities), counted across loves, the way
qloo.common_tags reads a person ("reflective, intimate"); tag insights for the same loves
are noisier. One graph costs a few /entities calls plus two recommend and two score
calls, and is kept for 15 minutes per set of loves.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import json
import time
from typing import Any

from . import memory, qloo

KEEP_S = 15 * 60
_cache: dict[str, tuple[float, dict[str, Any]]] = {}

# Tag families worth drawing, most telling first (genre last: "drama" fits everything).
_FAMILIES = ["mood", "style", "audience", "theme", "plot", "character", "characteristic", "subgenre", "music", "artist", "genre"]
_KIND_FOR_PICKS = {"album": "artist", "artist": "artist", "movie": "movie", "tv_show": "tv_show", "book": "book",
                   "podcast": "podcast", "brand": "brand", "video_game": "video_game"}
MAX_TAGS = 16
CARRIERS_PER_TAG = 3
# Words most loves carry that say little about a taste.
_EMPTY = {"love", "loyal", "devoted", "friend", "friendship", "family relationships", "relationships", "romance",
          "passionate", "expressive", "family", "music", "pop"}


def _family(tag_type: str) -> str:
    parts = tag_type.split(":")
    return parts[2] if len(parts) >= 3 else ""


def _count(seeds: list[dict[str, Any]], details: dict[str, dict[str, Any]]) -> tuple[dict[str, set[str]], dict[str, tuple[int, str, str]]]:
    """Each tag (lower-case) to the loves that carry it, and how to show it (family rank, name, family)."""
    carriers: dict[str, set[str]] = {}
    shown: dict[str, tuple[int, str, str]] = {}
    for s in seeds:
        for family, name in (details.get(s["id"]) or {}).get("tags") or []:
            # One thread per word, however Qloo spells it ("Singer-Songwriter", "Singer & Songwriter").
            low = re.sub(r"[^a-z0-9]+", " ", name.lower().replace("&", " ")).strip()
            if low in _EMPTY:
                continue
            carriers.setdefault(low, set()).add(s["id"])
            shown.setdefault(low, (_FAMILIES.index(family), name, family))
    return carriers, shown


def _ranked(carriers: dict[str, set[str]], shown: dict[str, tuple[int, str, str]], few: bool) -> list[str]:
    tags = [t for t in carriers if len(carriers[t]) >= 2 or few]
    return sorted(tags, key=lambda t: (-len(carriers[t]), shown[t][0]))


async def reads_as(profile: dict[str, Any], take: int = 14) -> list[dict[str, Any]]:
    """The words the user's loves share, most shared first ("Intimate", "Melancholic", "Folk"):
    what the profile's `tags` hold, and what the journal compares when the taste moves."""
    seeds = memory.signal_seeds(profile)
    details = await _entities([s["id"] for s in seeds])
    carriers, shown = _count(seeds, details)
    return [{"name": shown[t][1], "type": shown[t][2], "count": len(carriers[t])}
            for t in _ranked(carriers, shown, len(seeds) < 3)[:take]]


async def _entities(ids: list[str]) -> dict[str, dict[str, Any]]:
    """Full Qloo entities (picture, description, tags) for ids, ten a call."""
    out: dict[str, dict[str, Any]] = {}

    async def batch(chunk: list[str]) -> None:
        try:
            body, _ = await qloo._get("/entities", {"entity_ids": ",".join(chunk)})
        except Exception as err:
            print(f"mac: graph entities failed: {err}", flush=True)
            return
        for e in (body or {}).get("results") or []:
            tags = []
            for t in e.get("tags") or []:
                name = (t.get("name") or "").strip()
                family = _family(t.get("type") or "")
                if name and family in _FAMILIES and name.lower() not in qloo._BLAND:
                    tags.append((family, name))
            props = e.get("properties") or {}
            out[e.get("entity_id")] = {
                "image": (props.get("image") or {}).get("url"),
                "description": str(props.get("short_description") or props.get("description") or "")[:200] or None,
                "tags": tags,
            }

    ids = list(dict.fromkeys(i for i in ids if i))
    await asyncio.gather(*(batch(ids[i:i + 10]) for i in range(0, len(ids), 10)))
    return out


def _key(profile: dict[str, Any]) -> str:
    seeds = sorted(s.get("id", "") for s in profile.get("seeds") or [])
    people = {n: sorted(p.get("id", "") for p in loves) for n, loves in (profile.get("people") or {}).items()}
    raw = json.dumps([seeds, people, memory.dislike_ids(profile), profile.get("declined") or []], sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()


async def taste_graph(profile: dict[str, Any], fresh: bool = False) -> dict[str, Any]:
    key = _key(profile)
    hit = _cache.get(key)
    if hit and not fresh and time.monotonic() - hit[0] < KEEP_S:
        return hit[1]
    graph = await _build(profile)
    _cache[key] = (time.monotonic(), graph)
    return graph


async def _build(profile: dict[str, Any]) -> dict[str, Any]:
    seeds = [s for s in profile.get("seeds") or [] if s.get("id")]
    steering = {s["id"] for s in memory.signal_seeds(profile)}
    people = {name: [p for p in loves if p.get("id")][:6] for name, loves in list((profile.get("people") or {}).items())[:6]}
    signal = [s["id"] for s in memory.signal_seeds(profile)]
    skip = signal + memory.dislike_ids(profile) + list(profile.get("declined") or [])

    # The two kinds the user loves most, for "next for you".
    counts: dict[str, int] = {}
    for s in seeds:
        k = _KIND_FOR_PICKS.get(s.get("kind") or "")
        if k:
            counts[k] = counts.get(k, 0) + 1
    pick_kinds = sorted(counts, key=lambda k: -counts[k])[:2]

    async def next_picks(kind: str) -> list[dict[str, Any]]:
        try:
            found = await qloo.recommend(kind, signal, take=3, exclude=skip)
            scored = await qloo.score(kind, signal, [p["id"] for p in found]) if found else {}
        except Exception as err:
            print(f"mac: graph picks ({kind}) failed: {err}", flush=True)
            return []
        for p in found:
            p["because"] = (scored.get(p["id"]) or {}).get("because", [])[:2]
        return found

    love_ids = [s["id"] for s in seeds] + [p["id"] for loves in people.values() for p in loves]
    if not signal:
        pick_kinds = []
    details, *pick_lists = await asyncio.gather(_entities(love_ids), *(next_picks(k) for k in pick_kinds))

    nodes: list[dict[str, Any]] = [{"id": "you", "type": "you", "label": profile.get("name") or "You",
                                    "detail": profile.get("summary") or None}]
    edges: list[dict[str, Any]] = []

    # Tags two or more of the user's loves carry.
    carriers, shown = _count(seeds, details)
    tags = _ranked(carriers, shown, len(seeds) < 3)[:MAX_TAGS]
    seed_names = {s["id"]: s["name"] for s in seeds}

    for s in seeds:
        d = details.get(s["id"]) or {}
        nodes.append({"id": s["id"], "type": "love", "label": s["name"], "kind": s.get("kind"), "image": s.get("image") or d.get("image"),
                      "weight": s.get("weight") or 1.0, "source": s.get("source"), "at": s.get("at"), "detail": d.get("description"),
                      "steers": s["id"] in steering})
        edges.append({"a": "you", "b": s["id"], "type": "loves", "weight": s.get("weight") or 1.0})
    for t in tags:
        _, name, family = shown[t]
        nodes.append({"id": f"tag:{t}", "type": "tag", "label": name, "kind": family,
                      "detail": "In " + memory.names_of([{"name": seed_names[i]} for i in carriers[t] if i in seed_names], most=4)})
    # Each thread links to the loves that carry it, spread so no love takes more than its share
    # of lines and the picture stays readable.
    load: dict[str, int] = {s["id"]: 0 for s in seeds}
    for t in tags:
        ids = sorted((i for i in carriers[t] if i in load), key=lambda i: load[i])[:CARRIERS_PER_TAG]
        for i in ids:
            load[i] += 1
            edges.append({"a": i, "b": f"tag:{t}", "type": "carries"})

    tag_set = set(tags)
    known = {s["id"] for s in seeds}
    info = profile.get("people_info") or {}
    for name, loves in people.items():
        pid = f"person:{name}"
        about = info.get(name) or {}
        nodes.append({"id": pid, "type": "person", "label": name, "kind": about.get("relation"),
                      "detail": ", ".join(str(b) for b in (about.get("relation"), about.get("age"), about.get("home")) if b) or None})
        edges.append({"a": "you", "b": pid, "type": "knows"})
        common: dict[str, int] = {}
        for p in loves:
            if p["id"] in known:
                edges.append({"a": pid, "b": p["id"], "type": "shares"})
                continue
            nid = f"{pid}:{p['id']}"
            d = details.get(p["id"]) or {}
            nodes.append({"id": nid, "type": "their_love", "label": p["name"], "kind": p.get("kind"), "image": d.get("image"),
                          "detail": d.get("description"), "owner": name, "entity": p["id"]})
            edges.append({"a": pid, "b": nid, "type": "their"})
            for _, tag in d.get("tags") or []:
                low = re.sub(r"[^a-z0-9]+", " ", tag.lower().replace("&", " ")).strip()
                if low in tag_set:
                    common[low] = common.get(low, 0) + 1
        for t in sorted(common, key=lambda t: -common[t])[:3]:
            edges.append({"a": pid, "b": f"tag:{t}", "type": "common"})

    for kind, found in zip(pick_kinds, pick_lists):
        for p in found:
            because = [i for i in p.get("because") or [] if i in seed_names]
            nodes.append({"id": f"pick:{p['id']}", "type": "pick", "label": p["name"], "kind": p.get("kind") or kind,
                          "image": p.get("image"), "detail": p.get("description"), "entity": p["id"],
                          "because": [seed_names[i] for i in because]})
            for i in because or signal[:1]:
                edges.append({"a": f"pick:{p['id']}", "b": i, "type": "because"})

    for d in profile.get("dislikes") or []:
        if d.get("id"):
            nodes.append({"id": f"no:{d['id']}", "type": "dislike", "label": d["name"], "kind": d.get("kind"), "entity": d["id"],
                          "image": d.get("image")})
            edges.append({"a": "you", "b": f"no:{d['id']}", "type": "not"})

    return {"nodes": nodes, "edges": edges, "reads_as": [t["name"] for t in profile.get("tags") or []][:8],
            "summary": profile.get("summary"), "built": memory.now_iso()}
