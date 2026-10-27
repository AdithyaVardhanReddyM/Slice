"""A fake Mac for the Slice brain, playing the dad's weekend demo: drives /mac/live with the
user's lines, answers every tool_call (calendar, contacts, Messages, Mail, files, a Playwright
page as the screen), logs everything with timings. Copied from mac_trip_demo.py (the trip demo).

Usage (from apps/agent): .venv/bin/python scripts/mac_dad_demo.py ws://127.0.0.1:8010/mac/live <profile.json> <log path> [--screen] [--no-book] [--memory]
--screen stands in for the Mac's display with a headless Playwright page so the operator can be
watched (the table booking); without it the operator says it can't see the screen. --memory
resets the conversation after the demo and asks about dad again, to check the saved person.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import websockets

WS_URL, PROFILE_PATH, LOG_PATH = sys.argv[1], sys.argv[2], sys.argv[3]
SCREEN = "--screen" in sys.argv
NO_BOOK = "--no-book" in sys.argv
MEMORY = "--memory" in sys.argv
FILES = Path(LOG_PATH).parent / "files"
FILES.mkdir(exist_ok=True)
T0 = time.monotonic()
_log = open(LOG_PATH, "a", encoding="utf-8")


def log(kind: str, text: str) -> None:
    line = f"[{time.monotonic() - T0:7.1f}s] {kind:<10} {text}"
    print(line, flush=True)
    _log.write(line + "\n")
    _log.flush()


# --- the screen: a Playwright page standing in for the Mac's display ------------------------

W, H = 1440, 900


class Screen:
    def __init__(self) -> None:
        self.page: Any = None
        self.address_mode = False

    async def start(self) -> None:
        from playwright.async_api import async_playwright

        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(headless=True)
        self.ctx = await self.browser.new_context(viewport={"width": W, "height": H}, locale="en-US",
                                                  user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")
        self.page = await self.ctx.new_page()
        await self.page.goto("about:blank")

    async def goto(self, url: str) -> None:
        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=25000)
        except Exception as err:
            log("screen", f"goto {url} -> {type(err).__name__}: {str(err)[:120]}")

    async def shot(self) -> dict[str, Any]:
        try:
            await self.page.wait_for_load_state("domcontentloaded", timeout=3000)
        except Exception:
            pass
        img = await self.page.screenshot(type="jpeg", quality=72)
        return {"image": base64.b64encode(img).decode(), "mime": "image/jpeg", "width": W, "height": H, "url": self.page.url}

    def _xy(self, args: dict[str, Any], xk: str = "x", yk: str = "y") -> tuple[float, float]:
        return float(args.get(xk) or 0) / 999 * W, float(args.get(yk) or 0) / 999 * H

    async def act(self, args: dict[str, Any]) -> dict[str, Any]:
        action = args.get("action", "")
        p = self.page
        try:
            if action in ("click", "double_click", "triple_click", "right_click", "middle_click", "click_at"):
                x, y = self._xy(args)
                count = {"double_click": 2, "triple_click": 3}.get(action, 1)
                button = "right" if action == "right_click" else "middle" if action == "middle_click" else "left"
                await p.mouse.click(x, y, click_count=count, button=button)
                self.address_mode = False
            elif action in ("move", "hover_at"):
                x, y = self._xy(args)
                await p.mouse.move(x, y)
            elif action in ("type", "type_text_at"):
                text = str(args.get("text") or "")
                if action == "type_text_at":
                    x, y = self._xy(args)
                    await p.mouse.click(x, y)
                    if args.get("clear_before_typing", True):
                        await p.keyboard.press("Meta+A")
                if self.address_mode:
                    self.address_mode = False
                    url = text if "://" in text else f"https://{text}"
                    await self.goto(url)
                else:
                    await p.keyboard.type(text, delay=10)
                    if args.get("press_enter"):
                        await p.keyboard.press("Enter")
            elif action in ("press_key",):
                await p.keyboard.press(self._key(str(args.get("key") or "")))
            elif action in ("hotkey", "key_combination"):
                keys = args.get("keys") or [k.strip() for k in str(args.get("key") or "").replace("+", " ").split()]
                low = [str(k).lower() for k in keys]
                if ("cmd" in low or "command" in low or "meta" in low or "ctrl" in low) and "l" in low:
                    self.address_mode = True
                else:
                    await p.keyboard.press("+".join(self._key(k) for k in keys))
            elif action in ("scroll", "scroll_document", "scroll_at"):
                x, y = self._xy(args) if "x" in args else (W / 2, H / 2)
                mag = float(args.get("magnitude_in_pixels") or args.get("magnitude") or 400)
                d = str(args.get("direction") or "down")
                dx, dy = {"down": (0, mag), "up": (0, -mag), "left": (-mag, 0), "right": (mag, 0)}.get(d, (0, mag))
                await p.mouse.move(x, y)
                await p.mouse.wheel(dx, dy)
            elif action == "drag_and_drop":
                x1, y1 = self._xy(args, "start_x", "start_y")
                x2, y2 = self._xy(args, "end_x", "end_y")
                await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move(x2, y2); await p.mouse.up()
            elif action == "navigate":
                await self.goto(str(args.get("url") or ""))
            elif action == "go_back":
                await p.go_back()
            elif action == "go_forward":
                await p.go_forward()
            elif action == "search":
                await self.goto("https://www.google.com")
            elif action == "open_web_browser":
                pass
            else:
                return {"error": f"This Mac can't do {action} yet."}
            await asyncio.sleep(0.8)
            return {"ok": True}
        except Exception as err:
            return {"error": f"{type(err).__name__}: {str(err)[:160]}"}

    @staticmethod
    def _key(name: str) -> str:
        m = {"return": "Enter", "enter": "Enter", "esc": "Escape", "escape": "Escape", "tab": "Tab", "space": "Space",
             "backspace": "Backspace", "delete": "Backspace", "down": "ArrowDown", "up": "ArrowUp", "left": "ArrowLeft",
             "right": "ArrowRight", "cmd": "Meta", "command": "Meta", "meta": "Meta", "ctrl": "Control", "control": "Control",
             "alt": "Alt", "option": "Alt", "shift": "Shift", "pagedown": "PageDown", "pageup": "PageUp"}
        return m.get(name.lower(), name if len(name) > 1 else name)


# --- the Mac tools ----------------------------------------------------------------------------

_http = httpx.AsyncClient(timeout=15, headers={"User-Agent": "slice-fakemac/1.0 (test harness)"})


async def geocode(place: str) -> dict[str, float] | None:
    try:
        res = await _http.get("https://nominatim.openstreetmap.org/search", params={"q": place, "format": "json", "limit": 1})
        hits = res.json()
        if hits:
            return {"lat": float(hits[0]["lat"]), "lon": float(hits[0]["lon"])}
    except Exception as err:
        log("geocode", f"{place}: {err}")
    return None


class FakeMac:
    def __init__(self) -> None:
        self.screen = Screen() if SCREEN else None
        self.tasks: dict[str, dict[str, Any]] = {}
        self.seen_steps: dict[str, int] = {}
        self.partial: dict[str, str] = {"user": "", "agent": ""}
        self.agent_lines: list[tuple[float, str]] = []
        self.last_frame = time.monotonic()
        self.turns = 0
        self.audio_bytes = 0
        self.answered: set[str] = set()
        self.calendar_added: list[dict[str, Any]] = []
        self.docs_requested: list[dict[str, Any]] = []
        self.saved_files: list[str] = []
        self.messages: list[dict[str, Any]] = []
        self.ws: Any = None

    # --- tools ---------------------------------------------------------------------------

    async def tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        if name == "frontmost_app":
            return {"app": "Finder", "windowTitle": "Desktop"}
        if name == "calendar_events":
            return {"events": [
                {"title": "Team sync", "start": "2026-10-28T10:00", "end": "2026-10-28T10:30", "location": "", "all_day": False},
                {"title": "Dinner with Sam", "start": "2026-10-30T19:30", "end": "2026-10-30T21:30", "location": "Lilia, Brooklyn", "all_day": False},
            ]}
        if name == "contacts_search":
            q = str(args.get("query") or "").lower()
            if "frank" in q or "dad" in q:
                return {"contacts": [{"name": "Frank Reddy", "phones": ["+1 312 555 0147"], "emails": ["frank.reddy@example.com"]}]}
            if "walter" in q:
                return {"contacts": [{"name": "Walter Hale", "phones": ["+1 312 555 0190"], "emails": []}]}
            return {"contacts": []}
        if name in ("messages_send", "messages_send_file"):
            self.messages.append(args)
            log("messages", f"{name} to {args.get('to')}: {str(args.get('text'))[:300]} {('file=' + str(args.get('path'))) if args.get('path') else ''}")
            return {"ok": True}
        if name == "mail_draft":
            log("mail", f"draft to {args.get('to')}: {args.get('subject')} / {str(args.get('body'))[:200]} attachment={args.get('attachment')}")
            return {"ok": True}
        if name == "maps_geocode":
            pts = []
            for place in args.get("places") or []:
                pts.append(await geocode(str(place)))
            log("geocode", f"{args.get('places')} -> {pts}")
            return {"points": pts}
        if name == "maps_search":
            return {"results": []}
        if name == "maps_eta":
            return {"minutes": 25, "mode": args.get("mode")}
        if name == "open_url":
            if self.screen:
                await self.screen.goto(str(args.get("url") or ""))
            return {"ok": True}
        if name == "open_app":
            return {"ok": True}
        if name == "save_file":
            data = base64.b64decode(args.get("data") or "")
            path = FILES / str(args.get("name") or "file")
            path.write_bytes(data)
            self.saved_files.append(str(path))
            log("file", f"saved {path} ({len(data)} bytes, open={args.get('open')})")
            return {"path": str(path)}
        if name == "calendar_add":
            self.calendar_added.append(args)
            log("calendar", f"add {args.get('start')} to {args.get('end')}  {args.get('title')}  @ {args.get('location')}")
            return {"ok": True, "id": f"evt{len(self.calendar_added)}"}
        if name == "screenshot":
            if self.screen:
                return await self.screen.shot()
            return {"error": "No screen in this fake Mac."}
        if name == "computer":
            if self.screen:
                out = await self.screen.act(args)
                log("computer", f"{args.get('action')} {json.dumps({k: v for k, v in args.items() if k not in ('action', 'intent')})[:100]} -> {out}  | {self.screen.page.url[:90]}")
                return out
            return {"error": "No screen in this fake Mac."}
        if name in ("lens_show", "lens_clear"):
            return {"ok": True}
        if name in ("music_now_playing", "music_open"):
            return {"error": "No music app on this Mac."}
        if name in ("notes_search",):
            return {"notes": []}
        if name == "notes_add":
            log("notes", f"add note {args.get('title')}: {str(args.get('body'))[:200]}")
            return {"ok": True}
        return {"error": f"The fake Mac has no {name}."}

    # --- frames ----------------------------------------------------------------------------

    async def send(self, msg: dict[str, Any]) -> None:
        await self.ws.send(json.dumps(msg))

    async def say(self, text: str) -> None:
        log("USER", text)
        await self.send({"type": "text", "text": text})
        self.last_frame = time.monotonic()

    async def on_frame(self, raw: Any) -> None:
        if isinstance(raw, (bytes, bytearray)):
            self.audio_bytes += len(raw)
            return
        msg = json.loads(raw)
        kind = msg.get("type")
        self.last_frame = time.monotonic()
        if kind == "transcript":
            role, text = msg["role"], msg["text"]
            if msg.get("partial"):
                self.partial[role] += text
            else:
                whole = text if text.strip() else self.partial[role]
                self.partial[role] = ""
                if whole.strip():
                    log("AGENT" if role == "agent" else "heard", whole.strip())
                    if role == "agent":
                        self.agent_lines.append((time.monotonic() - T0, whole.strip()))
        elif kind == "turn_complete":
            self.turns += 1
            for role in ("agent",):
                if self.partial[role].strip():
                    log("AGENT", self.partial[role].strip())
                    self.agent_lines.append((time.monotonic() - T0, self.partial[role].strip()))
                    self.partial[role] = ""
        elif kind == "tool_call":
            asyncio.create_task(self._tool_call(msg))
        elif kind == "task":
            self._task(msg["task"])
        elif kind == "activity":
            if not msg.get("task_id"):
                log("activity", f"{msg.get('kind')}: {msg.get('label')} {('(' + str(msg.get('detail')) + ')') if msg.get('detail') else ''}")
        elif kind == "picks":
            log("picks", f"{msg['picks'].get('title')}: {[i.get('name') for i in msg['picks'].get('items', [])]}")
        elif kind == "nudge":
            log("nudge", json.dumps(msg["nudge"])[:200])
        elif kind == "operator":
            log("operator", "active" if msg.get("active") else "stopped")
        elif kind == "error":
            log("ERROR", msg.get("message", ""))
        elif kind in ("ready", "interrupted", "profile", "feedback_ack"):
            log(kind, json.dumps(msg)[:120])
        else:
            log("frame", json.dumps(msg)[:200])

    async def _tool_call(self, msg: dict[str, Any]) -> None:
        name, args = msg["name"], msg.get("args") or {}
        t = time.monotonic()
        if name not in ("screenshot", "computer"):
            log("tool", f"{name} {json.dumps(args, ensure_ascii=False)[:300]}")
        result = await self.tool(name, args)
        if name == "screenshot":
            log("tool", f"screenshot -> {'image' if result.get('image') else result} url={result.get('url', '')[:80]}")
        await self.send({"type": "tool_result", "id": msg["id"], "result": result})

    def _task(self, t: dict[str, Any]) -> None:
        tid = t["id"]
        old = self.tasks.get(tid) or {}
        self.tasks[tid] = t
        if old.get("status") != t["status"] or not old:
            extra = ""
            if t["status"] == "needs_input":
                extra = f" Q: {t.get('question')}"
            elif t["status"] == "needs_confirmation":
                extra = f" CONFIRM: {(t.get('confirm') or {}).get('title')} | {str((t.get('confirm') or {}).get('detail'))[:300]}"
            elif t["status"] == "done":
                extra = f" SAY: {t.get('say')}"
            elif t["status"] == "failed":
                extra = f" ERROR: {t.get('error')}"
            log("task", f"{tid} \"{t['title']}\" {t['status']}{extra}")
        n = self.seen_steps.get(tid, 0)
        steps = t.get("steps") or []
        # steps is the last 6; log new ones by comparing tails
        old_steps = old.get("steps") or []
        new = [s for s in steps if s not in old_steps] if old_steps else steps
        for s in new:
            log("step", f"{tid} {s}")
        if (t.get("cards") or []) != (old.get("cards") or []):
            log("cards", f"{tid} {[(c.get('tag'), c.get('title')) for c in t.get('cards') or []]}")
        views = t.get("views") or []
        if len(views) != len(old.get("views") or []) or [v.get("key") for v in views] != [v.get("key") for v in old.get("views") or []]:
            for v in views:
                if v not in (old.get("views") or []):
                    desc = v.get("title")
                    if v.get("type") == "timeline":
                        desc += " :: " + " | ".join(f"{s.get('time')} {s.get('title')}" + (f" (walk {s.get('walk_min')}m)" if s.get("walk_min") is not None else "") for s in v.get("stops") or [])
                    elif v.get("type") == "map":
                        desc += " :: " + ", ".join(a.get("name", "") for a in v.get("areas") or [])
                    elif v.get("type") in ("note", "file"):
                        desc += " :: " + str(v.get("text") or v.get("detail") or v.get("path"))[:300]
                    log("view", f"{tid} {v.get('type')}: {desc}")

    # --- waiting -----------------------------------------------------------------------------

    def paused(self) -> dict[str, Any] | None:
        for t in self.tasks.values():
            if t["status"] in ("needs_input", "needs_confirmation"):
                return t
        return None

    def running(self) -> bool:
        return any(t["status"] == "running" for t in self.tasks.values())

    async def wait_quiet(self, quiet_s: float = 8.0, max_s: float = 600.0, answer: Any = None) -> None:
        """Wait until nothing has arrived for quiet_s and no task is running or paused; answer
        questions and confirmations on the way with `answer(task) -> str | None`."""
        start = time.monotonic()
        while time.monotonic() - start < max_s:
            await asyncio.sleep(0.5)
            p = self.paused()
            if p:
                key = f"{p['id']}:{p['status']}:{p.get('question') or (p.get('confirm') or {}).get('title')}"
                if key not in self.answered:
                    # Give the talker a moment to read it out, as it would in the island.
                    await asyncio.sleep(6)
                    self.answered.add(key)
                    reply = answer(p) if answer else None
                    if reply is None:
                        continue
                    await self.say(reply)
                    # If the talker doesn't pass it on, press the island's button.
                    for _ in range(40):
                        await asyncio.sleep(0.5)
                        cur = self.tasks.get(p["id"]) or {}
                        if cur.get("status") != p["status"] or (cur.get("question"), cur.get("confirm")) != (p.get("question"), p.get("confirm")):
                            break
                    else:
                        log("FALLBACK", f"talker didn't pass the answer within 20 s; pressing the island button for {p['id']}")
                        if p["status"] == "needs_confirmation":
                            approved = reply.lower().startswith(("y", "ok", "sure", "go", "do it", "book"))
                            await self.send({"type": "task_confirm", "id": p["id"], "approved": approved})
                        else:
                            await self.send({"type": "task_reply", "id": p["id"], "text": reply})
                continue
            if self.running():
                if time.monotonic() - self.last_frame > 30:
                    log("SILENCE", f"{time.monotonic() - self.last_frame:.0f}s with nothing from the brain while a task runs")
                    self.last_frame = time.monotonic()  # log once per 30 s
                continue
            if time.monotonic() - self.last_frame >= quiet_s and not self.partial["agent"].strip():
                return
        log("TIMEOUT", f"wait_quiet gave up after {max_s}s")


# --- the dad's weekend demo ---------------------------------------------------------------------

# What the user says, in two breaths (docs/mac-plan.md, "The dad's weekend demo").
LINE_DAD = ("My dad Frank is 73 and lives in Lincoln Park in Chicago. He's fit, but he likes a proper table with a "
            "reservation, nothing too loud, no late nights, and short walks between things. He loves The Godfather, "
            "Bob Dylan and Columbo.")
LINE_FRIEND = "His friend Walter is into Miles Davis and old westerns like The Searchers. Plan their weekend, the two of them together."


def answer_dad(task: dict[str, Any]) -> str | None:
    """The user's answer to whatever the agent asks, the way they'd answer on the recording."""
    if task["status"] == "needs_input":
        # Only the question itself (the last sentence with a question mark), not the chat before it.
        q = (task.get("question") or "").lower()
        asked = [part for part in re.split(r"(?<=[.!?])\s+", q) if "?" in part]
        q = asked[-1] if asked else q
        if any(w in q for w in ("lunch", "dinner", "meal", "eat")):
            return "Lunch both days, and one early evening out would be nice. He likes to be home by nine."
        if any(w in q for w in ("saturday", "sunday", "which day", "both days", "one day", "what day", "date", "when ", "weekend")):
            return "Both days, this Saturday and Sunday."
        if any(w in q for w in ("drive", "driv", "car", "get around", "transport")):
            return "He drives, so an easy drive is fine, just short walks once they're there."
        if any(w in q for w in ("where does", "lives", "start from", "meet", "where walter", "walter live")):
            return "Walter lives a few streets away. They'll start from Frank's place."
        if any(w in q for w in ("budget", "spend", "price", "expensive")):
            return "Mid-range is fine."
        if any(w in q for w in ("phone", "number", "contact", "reach", "email")):
            return "He's in my contacts as Frank Reddy."
        if any(w in q for w in ("name", "who", "reservation under")):
            return "Under Frank Reddy, for two."
        return "Whatever you think is best."
    if task["status"] == "needs_confirmation":
        title = ((task.get("confirm") or {}).get("title") or "").lower()
        if any(w in title for w in ("book", "reserve", "reservation", "confirm the", "complete", "submit", "place the")):
            return "No, leave it there, I'll finish that bit myself."
        if any(w in title for w in ("every", "weekly", "repeat")):
            return "Yes, every Thursday morning."
        return "Yes, go ahead."
    return None


async def answer_talker(mac: FakeMac, fallback: str) -> None:
    """The talker itself asked (no task yet): answer from its last line."""
    last = mac.agent_lines[-1][1] if mac.agent_lines else ""
    reply = answer_dad({"status": "needs_input", "question": last}) if last else fallback
    if reply == "Whatever you think is best." and "?" not in last:
        reply = fallback
    await mac.say(reply)


def offered(mac: FakeMac, *words: str) -> bool:
    recent = " ".join(l for _, l in mac.agent_lines[-3:]).lower()
    return any(w in recent for w in words)


async def dad_demo(mac: FakeMac) -> None:
    await mac.say(LINE_DAD)
    # A breath, then the friend and the ask (the agent may say a word in between).
    await mac.wait_quiet(quiet_s=5, max_s=25, answer=answer_dad)
    await mac.say(LINE_FRIEND)
    await mac.wait_quiet(quiet_s=10, max_s=900, answer=answer_dad)
    for _ in range(4):
        if mac.tasks:
            break
        await answer_talker(mac, "Both days, lunch both days and one early evening out; he likes to be home by nine.")
        await mac.wait_quiet(quiet_s=10, max_s=900, answer=answer_dad)
    log("MARK", "=== plan finished ===")
    if offered(mac, "send", "text", "message", "print"):
        await mac.say("Yes, send it to him.")
    else:
        log("JUDGE", "the agent did not offer to send the plan to dad")
        await mac.say("Can you send it to my dad?")
    await mac.wait_quiet(quiet_s=10, max_s=600, answer=answer_dad)
    log("MARK", f"=== send finished: {len(mac.messages)} messages, files={mac.saved_files} ===")
    if offered(mac, "calendar"):
        await mac.say("Yes, put both days in my calendar.")
    else:
        log("JUDGE", "the agent did not offer the calendar")
        await mac.say("Put both days in my calendar.")
    await mac.wait_quiet(quiet_s=10, max_s=600, answer=answer_dad)
    log("MARK", f"=== calendar finished: {len(mac.calendar_added)} events added ===")
    if not NO_BOOK:
        if offered(mac, "book", "reserv", "table"):
            await mac.say("Yes, book the table.")
        else:
            log("JUDGE", "the agent did not offer to book the table")
            await mac.say("Can you book the lunch table for them?")
        await mac.wait_quiet(quiet_s=12, max_s=900, answer=answer_dad)
        log("MARK", "=== booking finished ===")
    if offered(mac, "every week", "weekly", "each week", "every saturday", "every thursday", "every friday"):
        await mac.say("Yes, do it every week, Thursday morning is good.")
    else:
        log("JUDGE", "the agent did not offer to repeat it weekly")
        await mac.say("Can you do this for them every week?")
    await mac.wait_quiet(quiet_s=10, max_s=400, answer=answer_dad)
    log("MARK", "=== weekly finished ===")
    if not MEMORY:
        return
    # A fresh conversation: does it remember dad?
    await mac.send({"type": "reset"})
    await asyncio.sleep(2)
    log("MARK", "=== reset: new conversation ===")
    await mac.say("What does my dad like?")
    await mac.wait_quiet(quiet_s=10, max_s=300, answer=answer_dad)
    await mac.say("Plan something for dad and Walter next Saturday.")
    await mac.wait_quiet(quiet_s=10, max_s=600, answer=answer_dad)
    for _ in range(2):
        last = mac.agent_lines[-1][1] if mac.agent_lines else ""
        if "?" in last and not mac.running():
            await answer_talker(mac, "Just lunch and the afternoon.")
            await mac.wait_quiet(quiet_s=10, max_s=600, answer=answer_dad)
    log("MARK", "=== memory check finished ===")


async def main() -> None:
    profile = json.load(open(PROFILE_PATH))
    profile = profile.get("profile", profile)
    mac = FakeMac()
    if mac.screen:
        await mac.screen.start()
    async with websockets.connect(WS_URL, max_size=20_000_000, ping_interval=20, ping_timeout=60) as ws:
        mac.ws = ws
        await mac.send({"type": "hello", "user_id": "dad-test-adithya", "profile": profile, "timezone": "America/New_York", "taste": True})

        async def pump() -> None:
            async for raw in ws:
                try:
                    await mac.on_frame(raw)
                except Exception as err:
                    log("harness", f"frame error {type(err).__name__}: {err}")

        pumper = asyncio.create_task(pump())
        await asyncio.sleep(1.5)
        try:
            await dad_demo(mac)
        finally:
            log("END", f"turns={mac.turns} audio={mac.audio_bytes // 1000}kB calendar_events={len(mac.calendar_added)} messages={len(mac.messages)} files={mac.saved_files}")
            pumper.cancel()
    if mac.screen:
        await mac.screen.browser.close()


if __name__ == "__main__":
    asyncio.run(main())
