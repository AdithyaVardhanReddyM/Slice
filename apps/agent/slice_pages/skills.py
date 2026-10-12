"""Skill files the builder's instruction includes: Markdown in slice_pages/skills/."""

from __future__ import annotations

import os
from functools import lru_cache

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")


@lru_cache(maxsize=1)
def load_skills() -> str:
    parts: list[str] = []
    if not os.path.isdir(SKILLS_DIR):
        return ""
    for name in sorted(os.listdir(SKILLS_DIR)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(SKILLS_DIR, name), encoding="utf-8") as f:
            parts.append(f.read().strip())
    return "\n\n".join(parts)
