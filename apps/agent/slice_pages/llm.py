"""Schema-constrained Gemini calls for the Pages service, on the concierge's genai client."""

from __future__ import annotations

import json
import time
from typing import Any

from google.genai import types

from slice_agent.brief import client
from slice_agent.trace import record

MODEL = "gemini-3.8-flash"


async def generate_json(
    prompt: str | list[Any],
    schema: dict[str, Any],
    *,
    name: str,
    temperature: float = 0.4,
    model: str = MODEL,
    thinking: bool = False,
    result: Any = None,
) -> dict[str, Any]:
    """One JSON-schema call. Records an "llm" span named `name`; `result` may be a
    callable taking the parsed object and returning the span's result text."""
    t0 = time.perf_counter()
    started = time.time()
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
        # Pro models cannot turn thinking off; they get the lowest level instead.
        thinking_config=types.ThinkingConfig(thinking_level="LOW") if thinking or "pro" in model else types.ThinkingConfig(thinking_budget=0),
    )
    try:
        res = await client().aio.models.generate_content(model=model, contents=prompt, config=config)
        parsed = json.loads(res.text or "{}")
    except Exception as err:
        record("llm", name, f"failed: {type(err).__name__}: {str(err)[:160]}", ms=int((time.perf_counter() - t0) * 1000), started=started)
        raise
    text = result(parsed) if callable(result) else (result or "ok")
    record("llm", name, str(text), ms=int((time.perf_counter() - t0) * 1000), started=started)
    return parsed if isinstance(parsed, dict) else {"value": parsed}


async def generate_text(prompt: str | list[Any], *, name: str, temperature: float = 0.5, model: str = MODEL, max_tokens: int = 600) -> str:
    t0 = time.perf_counter()
    started = time.time()
    try:
        res = await client().aio.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=temperature, max_output_tokens=max_tokens, thinking_config=types.ThinkingConfig(thinking_budget=0)),
        )
        text = (res.text or "").strip()
    except Exception as err:
        record("llm", name, f"failed: {type(err).__name__}: {str(err)[:160]}", ms=int((time.perf_counter() - t0) * 1000), started=started)
        raise
    record("llm", name, text[:140], ms=int((time.perf_counter() - t0) * 1000), started=started)
    return text


def clip(text: str, n: int) -> str:
    text = text or ""
    return text if len(text) <= n else text[: n - 20].rstrip() + "\n[... truncated]"
