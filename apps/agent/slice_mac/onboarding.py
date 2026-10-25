"""Onboarding: what the first-run window shows, step by step.

Each picking step opens on a wide spread of well-known things (so anyone finds a
few they love, whatever their taste), then "more like these" asks Qloo for what
fits the picks so far, so the next tiles get closer to the person. The quick
questions (Saturday night, eating out, what they don't eat…) live on the Mac and
arrive as plain facts with the finished profile (taste.build_profile).
"""

from __future__ import annotations

import asyncio
from typing import Any

from . import qloo

# Wide on purpose: genres, decades and moods far apart, all with pictures in Qloo.
STARTERS: dict[str, list[tuple[str, str]]] = {
    "music": [(n, "artist") for n in [
        "Taylor Swift", "Kendrick Lamar", "Mitski", "Bad Bunny", "Beyoncé", "Radiohead", "Morgan Wallen", "Billie Eilish",
        "Frank Ocean", "Fleetwood Mac", "Daft Punk", "SZA", "Zach Bryan", "Arctic Monkeys", "Norah Jones", "Miles Davis",
        "BTS", "Fred again..", "Bon Iver", "Metallica",
    ]],
    "screen": [
        ("Past Lives", "movie"), ("Top Gun: Maverick", "movie"), ("The Bear", "tv_show"), ("Succession", "tv_show"),
        ("Spirited Away", "movie"), ("Barbie", "movie"), ("Oppenheimer", "movie"), ("Yellowstone", "tv_show"),
        ("Ted Lasso", "tv_show"), ("Parasite", "movie"), ("Everything Everywhere All at Once", "movie"), ("The Office", "tv_show"),
        ("Dune", "movie"), ("Aftersun", "movie"), ("Breaking Bad", "tv_show"), ("Bridgerton", "tv_show"),
        ("La La Land", "movie"), ("The Godfather", "movie"), ("Fleabag", "tv_show"), ("Stranger Things", "tv_show"),
    ],
    "everyday": [
        ("Patagonia", "brand"), ("Aesop", "brand"), ("Nike", "brand"), ("Glossier", "brand"), ("Carhartt", "brand"),
        ("Le Creuset", "brand"), ("Lululemon", "brand"), ("Muji", "brand"), ("Trader Joe's", "brand"), ("Dr. Martens", "brand"),
        ("Polaroid", "brand"), ("Ralph Lauren", "brand"),
        ("Normal People", "book"), ("Project Hail Mary", "book"), ("Pachinko", "book"), ("The Midnight Library", "book"),
        ("Educated", "book"), ("Sapiens", "book"), ("Little Women", "book"), ("The Hobbit", "book"),
    ],
}
# What "more like these" asks Qloo for on each step.
MORE_KINDS = {"music": ["artist"], "screen": ["movie", "tv_show"], "everyday": ["brand", "book"]}

_resolved: dict[str, list[dict[str, Any]]] = {}
_lock = asyncio.Lock()


def _tile(hit: dict[str, Any]) -> dict[str, Any]:
    return {k: hit[k] for k in ("id", "name", "kind", "image", "description") if hit.get(k)}


async def starters(step: str) -> list[dict[str, Any]]:
    """The opening tiles for a step, found once per process (Convex caches the searches too)."""
    if step not in STARTERS:
        return []
    async with _lock:
        if step not in _resolved:
            hits = await qloo.resolve_each(STARTERS[step])
            _resolved[step] = [_tile(h) for h in hits if h and h.get("image")]
    return _resolved[step]


async def more(step: str, picked: list[str], exclude: list[str], take: int = 8) -> list[dict[str, Any]]:
    """What fits the picks so far, for the next row of tiles."""
    kinds = MORE_KINDS.get(step) or []
    if not picked or not kinds:
        return []
    skip = list(dict.fromkeys(picked + exclude))
    per_kind = max(2, take // len(kinds) + 2)
    found = await asyncio.gather(*(qloo.recommend(k, picked[:20], take=per_kind, exclude=skip) for k in kinds), return_exceptions=True)
    lists = [[r for r in f if r.get("image")] if isinstance(f, list) else [] for f in found]
    # Taken in turns, so a step with films and shows gets some of each.
    tiles: list[dict[str, Any]] = []
    for i in range(max((len(rows) for rows in lists), default=0)):
        tiles += [_tile(rows[i]) for rows in lists if i < len(rows)]
    return tiles[:take]
