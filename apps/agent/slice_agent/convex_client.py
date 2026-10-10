"""Thin HTTP client for the Convex backend.

Reads use Convex's public query API (POST {CONVEX_URL}/api/query); writes and
Qloo calls go through the HTTP routes in packages/backend/convex/http.ts, which
check the shared QLOO_PROXY_SECRET.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

_client: httpx.AsyncClient | None = None


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set (see apps/agent/.env.example)")
    return value


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


async def query(path: str, args: dict[str, Any] | None = None) -> Any:
    """Run a public Convex query, e.g. query("catalog:store", {"key": "fold"})."""
    res = await client().post(
        f"{_env('CONVEX_URL')}/api/query",
        json={"path": path, "args": args or {}, "format": "json"},
    )
    res.raise_for_status()
    body = res.json()
    if body.get("status") != "success":
        raise RuntimeError(f"Convex query {path} failed: {body.get('errorMessage')}")
    return body.get("value")


async def action(path: str, args: dict[str, Any] | None = None, timeout: float = 120.0) -> Any:
    """Run a public Convex action, e.g. action("catalogTaste:vocabulary")."""
    res = await client().post(
        f"{_env('CONVEX_URL')}/api/action",
        json={"path": path, "args": args or {}, "format": "json"},
        timeout=timeout,
    )
    res.raise_for_status()
    body = res.json()
    if body.get("status") != "success":
        raise RuntimeError(f"Convex action {path} failed: {body.get('errorMessage')}")
    return body.get("value")


async def site(path: str, body: dict[str, Any]) -> tuple[Any, httpx.Headers]:
    """POST to a route on the Convex site URL with the agent secret."""
    res = await client().post(
        f"{_env('CONVEX_SITE_URL')}{path}",
        json=body,
        headers={"Authorization": f"Bearer {_env('QLOO_PROXY_SECRET')}"},
    )
    if res.status_code >= 400:
        raise RuntimeError(f"Convex {path} -> {res.status_code}: {res.text[:300]}")
    return res.json(), res.headers


async def qloo(path: str, params: dict[str, Any]) -> tuple[Any, str]:
    """A Qloo GET through the Convex cache. Returns (json, cache status)."""
    body, headers = await site("/qloo", {"path": path, "params": params})
    return body, headers.get("X-Slice-Cache", "miss")
