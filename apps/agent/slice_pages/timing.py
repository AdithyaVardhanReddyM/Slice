"""`timer` whose `.ms` also works inside the `with` block (for recording a span from an
`except` before the block has exited). Same interface as slice_agent.trace.timer."""

from __future__ import annotations

import time

from slice_agent.trace import timer as _timer


class timer(_timer):
    @property
    def ms(self) -> int:  # type: ignore[override]
        done = self.__dict__.get("_ms")
        return done if done is not None else int((time.perf_counter() - self._t0) * 1000)

    @ms.setter
    def ms(self, value: int) -> None:
        self.__dict__["_ms"] = value
