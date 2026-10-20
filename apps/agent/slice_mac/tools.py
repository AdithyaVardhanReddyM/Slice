"""Tools for the Mac agent.

Mac tools run on the user's computer through the bridge; Qloo tools run here,
through the Convex cache like every other service. Each tool posts its own
activity line so the island shows what the agent did and which Qloo call fired.
"""

from __future__ import annotations

from typing import Any

from google.adk.tools import ToolContext

from slice_agent import convex_client as convex

from .bridge import bridge_for

# Qloo entity kinds the agent may name, mapped to their URNs.
ENTITY_KINDS = {
    "artist": "urn:entity:artist",
    "album": "urn:entity:album",
    "movie": "urn:entity:movie",
    "tv_show": "urn:entity:tv_show",
    "book": "urn:entity:book",
    "author": "urn:entity:author",
    "podcast": "urn:entity:podcast",
    "video_game": "urn:entity:videogame",
    "place": "urn:entity:place",
    "destination": "urn:entity:destination",
    "brand": "urn:entity:brand",
    "person": "urn:entity:person",
}


async def look_at_frontmost_app(tool_context: ToolContext) -> dict[str, Any]:
    """What the user has in front of them right now: the app, its window title,
    and the page address when it is a browser. Use it when they say "this",
    "here" or "what I'm looking at"."""
    bridge = bridge_for(tool_context)
    result = await bridge.call("frontmost_app")
    await bridge.activity("mac", "Looked at the front app", result.get("app") or result.get("error"))
    return result


async def open_link(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a web page (https://...) or an app link on the user's Mac, in their
    default browser or app.

    Args:
        url: The full address to open.
    """
    bridge = bridge_for(tool_context)
    result = await bridge.call("open_url", {"url": url})
    await bridge.activity("mac", "Opened a link", url)
    return result


async def find_in_taste_graph(query: str, kind: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look something up in Qloo's taste graph (films, artists, places, books,
    brands and more) and get its Qloo id, kind and a short description. Do this
    before recommending from it, so you work from real entities.

    Args:
        query: The name to look up, e.g. "Radiohead" or "Past Lives".
        kind: One of artist, album, movie, tv_show, book, author, podcast,
            video_game, place, destination, brand, person. Use "" if unsure.
    """
    bridge = bridge_for(tool_context)
    params: dict[str, Any] = {"query": query}
    if kind in ENTITY_KINDS:
        params["types"] = ENTITY_KINDS[kind]
    body, cache = await convex.qloo("/search", params)
    hits = [
        {
            "name": hit.get("name"),
            "entity_id": hit.get("entity_id"),
            "kind": next((t.rsplit(":", 1)[-1] for t in hit.get("types") or []), None),
            "description": (hit.get("properties") or {}).get("short_description"),
        }
        for hit in ((body or {}).get("results") or [])[:5]
    ]
    await bridge.activity("qloo", f'Search "{query}"', f"{len(hits)} results ({cache})")
    return {"results": hits}


TOOLS = [look_at_frontmost_app, open_link, find_in_taste_graph]
