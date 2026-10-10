"""Per-turn trace of what the agent did, in the shape the widget and console render.

Tools append spans to the current turn's collector; the server drains it as it
streams events. A ContextVar keeps turns apart when the server handles several
sessions at once.
"""

from __future__ import annotations

import contextvars
import time
from typing import Any, TypedDict


class Span(TypedDict, total=False):
    kind: str  # "qloo" | "catalog" | "slice" | "llm"
    name: str
    started: float
    path: str
    params: dict[str, str]
    cache: str
    ms: int
    result: str


_current: contextvars.ContextVar[list[Span] | None] = contextvars.ContextVar(
    "slice_trace", default=None
)


def start_turn() -> list[Span]:
    spans: list[Span] = []
    _current.set(spans)
    return spans


def record(
    kind: str,
    name: str,
    result: str,
    *,
    ms: int,
    path: str | None = None,
    params: dict[str, Any] | None = None,
    cache: str | None = None,
    started: float | None = None,
) -> Span:
    span: Span = {"kind": kind, "name": name, "ms": ms, "result": result}
    # Tools can run in parallel; the UI sorts by when each one began.
    span["started"] = started if started is not None else time.time() - ms / 1000
    if path:
        span["path"] = path
    if params:
        span["params"] = {k: str(v) for k, v in params.items()}
    if cache:
        span["cache"] = cache
    spans = _current.get()
    if spans is not None:
        spans.append(span)
    return span


class timer:
    """`with timer() as t: ...; t.ms`"""

    def __enter__(self) -> "timer":
        self._t0 = time.perf_counter()
        self.started = time.time()
        return self

    def __exit__(self, *exc: object) -> None:
        self.ms = int((time.perf_counter() - self._t0) * 1000)
