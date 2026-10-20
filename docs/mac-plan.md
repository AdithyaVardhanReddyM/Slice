# Slice for Mac: plan and contracts

A personal agent that lives in the Mac's notch, for the Qloo hackathon
("agents, but with taste"). It works like Clicky, Vovy or VoiceOS (talk to
it from any app; it sees what you're looking at and acts on your computer),
but every choice it makes runs through Qloo's taste graph, so it picks the
way a friend with great taste would, not generic top-rated results.

The app is the eyes, ears and hands. The brain lives in `apps/agent`, like
every other service: same Vertex project, same Qloo cache in Convex.

## Architecture: a talker and background workers

One fast voice that never stops talking to you, handing real work to
smarter agents in the background (Google's async Live tools; OpenAI calls
the same pattern "chat-supervisor"). Agent transfers ("sequential
handoffs") were rejected: they switch which agent talks, which suits
customer-service departments, not one assistant doing hard work.

```
 you ⇄ TALKER   gemini-3.8-live (us-central1), the only voice        agent.py, tools.py
          │  fast tools: look_at_frontmost_app, quick_picks (Qloo, no model)
          │  start_task / continue_task: non-blocking, answers arrive WHEN_IDLE
          ▼
       TASKS    one per hand-off; pause for a question or a yes        tasks.py
          ▼
       WORKER   gemini-3.8-flash, low thinking, one ADK session per task   worker.py
          │  taste.py     recommend, compare_tastes, taste_map, remember_person, …
          │  mac_tools.py calendar, contacts, maps, music, messages, mail, screen
          │  accounts.py  Gmail, Google Calendar, Slack, Notion, Drive, Ticketmaster, … (Composio)
          ▼
       OPERATOR gemini-3.8-flash + computer_use (desktop)              computer.py
          │  screenshot → action → screenshot … asks before anything irreversible
          ▼
       Mac app  the hands: tools, mouse and keyboard, cursor overlay, task cards
```

- **Talker** talks, works out what you want, does small things itself and
  hands everything else to a task with one short line ("On it"). It has no
  thinking and no computer use (gemini-3.8-live supports neither). It never
  recommends anything that didn't come from `quick_picks` or a task.
- **Tasks** (`tasks.py`): the talker's `start_task` awaits the task's next
  stop: `needs_input` (the worker asked something), `needs_confirmation`
  (a tool is about to send, book, buy or change something), `done`,
  `failed`, `cancelled`. The talker relays it and passes the answer with
  `continue_task(reply=…, approved=…)`. If the user answers with the
  island's buttons instead, or nobody was waiting, the update reaches the
  talker as a bracketed text note. Every change goes to the Mac as a `task`
  frame. Duplicate `start_task` calls (Gemini repeats during long waits)
  reuse the running task.
- **Worker**: every pick comes from Qloo (`recommend`), never the model's
  memory. Tools that act ask for confirmation themselves. Websites with no
  integration (Resy, OpenTable, shops) go to the operator.
- **Operator**: Gemini computer use on the desktop, coordinates 0-999 over
  the screenshot. It calls `ask_permission` before irreversible steps;
  Gemini's own `safety_decision` right after a yes is acknowledged without
  asking twice. Never fills in CAPTCHAs, passwords or card numbers.

## Running it

1. Brain: `pnpm dev` (or just `pnpm --filter @slice/agent dev`), agent on :8000.
   `curl localhost:8000/mac/health` shows the Live model. `MAC_DEBUG=1`
   prints each worker step with timings.
2. App: `pnpm --filter @slice/mac app` (XcodeGen, `xcodebuild` Debug, relaunch).
   `pnpm --filter @slice/mac xcode` opens the project in Xcode instead.
3. First launch opens Settings. General: allow Microphone and Accessibility
   (both required), plus Screen Recording (the operator, look_at_screen),
   Calendar and Contacts. Taste: add a few things you love and build the
   profile. Accounts: connect Gmail, Slack, … (Composio sign-in).
4. Hover the notch to open the island and type, or hold **fn + control**
   anywhere, talk, and let go.

Debug launch arguments (`open …/Slice.app --args …`):
`-islandPreview open|captioned|compact` pins a mode with a sample
conversation; `-sampleTasks YES` adds two sample task cards;
`-renderIsland <dir>` writes each mode as a PNG and quits (no screen access
needed); `-ask "…"` types a question once the brain connects.

Requirements: Xcode 27, `brew install xcodegen`. The `.xcodeproj` and
`Info.plist` are generated from `apps/mac/project.yml` and not committed.

## Decisions

2026-10-20 (setup):

- **Name and brand:** Slice for Mac, bundle `ai.slice.mac` (`com.slice` is
  likely taken on the App Store), the Freshly squeezed palette on a black
  island. Coucou's code (MIT) was a reference for the notch panel; its name,
  Mochi character, icon and sounds are reserved, so none of them are used.
- **Talking:** push-to-talk on fn + control (like Vovy). The model's own
  voice detection is off; the app sends `talk_start`/`talk_end`. Presses
  shorter than 180 ms are dropped, and another key while holding cancels
  (it was a shortcut). Hovering the notch opens the island for typing.
- **Signing:** Debug is signed with the team's Apple Development certificate
  (team `5Q3KU6MZ8A`) so macOS keeps the permission grants across rebuilds.
  Release expects a **Developer ID Application** certificate (not created
  yet) for a notarized DMG; judges need a hosted build, not localhost.
- **Hosted brain:** when `MAC_CLIENT_TOKEN` is set, `/mac/live` and the HTTP
  routes require it as a bearer token (Settings > Brain > Token, Keychain).

2026-10-20 (the full agent):

- **Models, checked on the project:** `gemini-3.8-live` and
  `gemini-live-2.5-flash-native-audio` are served, only in `us-central1`;
  `gemini-3.8-live-extended-thinking` isn't. Override with `MAC_LIVE_MODEL`.
  The worker and operator use `gemini-3.8-flash` (global). ADK's
  `ModelConsultTool` (Gemini 4 Argon as advisor) took ~50 s per consult, so
  it isn't used. `MINIMAL` thinking isn't supported on 3.8 Flash; `LOW` is.
- **Quota:** the project's shared quota for 3.8 Flash often answers 429 or
  stalls. Each worker or operator call gets 25 s, then moves on: worker
  `gemini-3.6-flash`, then `gemini-3.7-flash` (`MAC_WORKER_FALLBACKS`);
  operator `gemini-3.5-flash-lite`, which Google lists as computer-use
  capable (`MAC_OPERATOR_FALLBACK`). A quota increase would make every task
  faster.
- **Computer use quirk:** with custom functions beside `computer_use`,
  Gemini rejects an action result without a `url` (400 INVALID_ARGUMENT), so
  every result carries the front browser page's address, or "".
- **Taste profile is local-first:** stored on the Mac
  (`~/Library/Application Support/Slice/taste.json`), sent in `hello`,
  built and updated by the brain (`/mac/profile/build`, `remember_*` tools)
  and handed back in `profile` frames. Other people's tastes live in it too
  (`people`), so "dinner with Sam" and gifts work.
- **Names must really match:** Qloo search turns phrases into the wrong
  entity ("natural wine bars" → "DiWine Natural Wine Bar"), so a hit counts
  only when the names are equal or one starts with the other; descriptions
  are kept as notes.
- **Integrations, three layers:** on the Mac with no sign-in (Calendar,
  Contacts, Apple Maps, Music and Spotify, Messages, Mail, the screen);
  cloud accounts through Composio's own approved apps (Gmail, Google
  Calendar, Slack, Notion, Drive, Ticketmaster, Outlook, WhatsApp, YouTube,
  Discord), each Mac its own Composio user `mac-user:<id>`; and anything
  without an integration through the operator. X was left out (its API is
  pay per use since Feb 2026 and needs our own developer app). Spotify's
  Web API also needs our own app; playback uses the desktop app.

## Measured (2026-10-20, fake Mac, `say`-generated speech)

- First audio about 1 s after releasing the keys (3.8 Live says a short
  line while tools run); about 5 s for a quick pick including the Live
  session opening; 2.5 Live was silent for about 4 s.
- Qloo calls 0.3 to 3 s, cached or not, places included.
- "Plan Friday dinner with Sam" (calendar, contacts, remember Sam, compare,
  three place searches, cards): about 100 s, mostly worker steps of 5 to 15 s.
- Booking on a web page through the operator, confirmed by voice: works
  end to end; slow when 3.8 Flash is rate-limited.

## The /mac/live protocol

One WebSocket per Mac. Text frames are JSON; binary frames are audio.

Mac → brain:

| Frame | Meaning |
| --- | --- |
| `{"type":"hello","user_id","profile","timezone"}` | Always the first frame |
| binary | Mic audio, PCM16 mono 16 kHz, about 100 ms per frame, only between `talk_start` and `talk_end` |
| `{"type":"talk_start"}` / `{"type":"talk_end"}` | The talk keys went down (held past 180 ms) / up |
| `{"type":"text","text":"…"}` | Typed in the island |
| `{"type":"tool_result","id":"…","result":{…}}` or `"error":"…"` | Answer to a `tool_call` |
| `{"type":"task_confirm","id","approved"}` | The island's Go ahead / Not now |
| `{"type":"task_reply","id","text"}` | A typed answer to a task's question |
| `{"type":"task_cancel","id"}` | The card's Stop |
| `{"type":"profile","profile"}` | Settings rebuilt the taste profile |
| `{"type":"reset"}` | New conversation (new talker session; tasks keep running) |

Brain → Mac:

| Frame | Meaning |
| --- | --- |
| binary | The agent's voice, PCM16 mono 24 kHz |
| `{"type":"ready","model":"…"}` | Connected |
| `{"type":"transcript","role":"user"\|"agent","text":"…","partial":bool}` | Partials are pieces to append; the final one is the whole text |
| `{"type":"tool_call","id","name","args"}` | Run a Mac tool (below) |
| `{"type":"activity","kind","label","detail","task_id"}` | One line per tool call; with a `task_id` it belongs to that task's card |
| `{"type":"task","task":{id,title,status,steps,question,confirm,say,cards,error}}` | A task changed (statuses above) |
| `{"type":"profile","profile"}` | The brain updated the taste profile; the Mac saves it |
| `{"type":"operator","active","task_id"}` | The operator started or stopped (screen glow) |
| `{"type":"interrupted"}` | Stop playing (barge-in) |
| `{"type":"turn_complete"}` | The model finished a turn (also after each tool round) |
| `{"type":"error","message":"…"}` | The Live session failed; the next input opens a new one |

Mac tools (`tool_call` names, `apps/mac/Sources/Agent/LocalTools.swift`):
`frontmost_app`, `open_url`, `calendar_events {days, search}`,
`calendar_add {title, start, end, location, notes}`, `contacts_search {query}`,
`maps_search {query, near}`, `maps_eta {from, to, mode}`,
`maps_reverse_geocode {points}`, `music_now_playing`, `music_open {query}`,
`messages_send {to, text}`, `mail_draft {to, subject, body}`,
`screenshot` (JPEG, 1440 wide, Slice's own windows left out, plus the
browser `url`), `computer {action, x, y, …}` (Gemini's desktop actions).

HTTP routes beside it: `GET /mac/search?q=&kind=`, `POST /mac/profile/build
{seeds, city, base}`, `GET /mac/accounts?user=`, `POST /mac/accounts/connect
{user, app}` → `{url}`.

The Live session opens on the first input, not on connect, and reopens when
Gemini ends it (about ten minutes of audio).

## Where things are

- `apps/agent/slice_mac/`: `routes.py` (WebSocket, Live session, HTTP),
  `agent.py` and `tools.py` (talker), `tasks.py`, `worker.py`, `taste.py`
  (profile and taste tools), `qloo.py` (Qloo calls), `mac_tools.py`,
  `accounts.py` (Composio), `computer.py` (operator), `connection.py` and
  `bridge.py` (one connected Mac).
- `apps/mac/Sources/Island/`: the notch panel (`IslandController`), its modes
  (`IslandModel`: closed, compact, captioned, open; it opens by itself when a
  task needs you), `IslandView`, `TaskViews` (task cards, buttons, picks) and
  `AgentCursor` (screen glow and click marks while the operator works).
- `apps/mac/Sources/Agent/`: `AgentSession` (conversation, tasks, profile,
  push-to-talk, playback), `LocalTools` (tool router), `TasteStore`.
- `apps/mac/Sources/Tools/`: Calendar, Contacts, Maps, Music/Messages/Mail,
  Screen, Computer.
- `apps/mac/Sources/Settings/SettingsView.swift`: General, Taste, Accounts.

## Not done yet

- Not tried on a real Mac by a person: holding fn + control and speaking,
  hover to open, the permission prompts, the operator on the real screen,
  Composio sign-ins with real accounts.
- Screen awareness for the talker itself (it asks a task to look).
- The demos beyond Handle Friday: gifting, trip mode (taste_map),
  concert scout (events_near), group-chat referee.
- A "Qloo off / on" switch for the judges.
- Distribution: Developer ID, notarized DMG, hosted brain with a token.
