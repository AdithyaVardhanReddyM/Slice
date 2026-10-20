# Slice for Mac: plan and contracts

A personal agent that lives in the Mac's notch, for the Qloo hackathon
("agents, but with taste"). It works like Clicky, Vovy or VoiceOS (talk to
it from any app; it sees what you're looking at and acts on your computer),
but every choice it makes runs through Qloo's taste graph, so it picks the
way a friend with great taste would, not generic top-rated results.

The app is the eyes, ears and hands. The brain lives in `apps/agent`, like
every other service: same Vertex project, same Qloo cache in Convex.

```
apps/mac (Swift)                                  apps/agent/slice_mac (Python)
  notch island, fn+control, mic, speaker  ──WS──▶  /mac/live ── ADK run_live ── Gemini Live (us-central1)
  LocalTools: frontmost app, open link   ◀─tool_call/tool_result─┤
                                                                 └── Convex /qloo (cache) ── Qloo
```

## Running it

1. Brain: `pnpm dev` (or just `pnpm --filter @slice/agent dev`), agent on :8000.
   `curl localhost:8000/mac/health` shows the Live model.
2. App: `pnpm --filter @slice/mac app` (XcodeGen, `xcodebuild` Debug, relaunch).
   `pnpm --filter @slice/mac xcode` opens the project in Xcode instead.
3. First launch opens Settings: allow Microphone and Accessibility (the
   fn+control keys and reading other apps' windows need it). Screen Recording
   is listed but not used yet.
4. Hover the notch to open the island and type, or hold **fn + control**
   anywhere, talk, and let go.

Debug launch arguments (`open …/Slice.app --args …`):
`-islandPreview open|captioned|compact` pins a mode with a sample
conversation (for screenshots and design work); `-ask "…"` types a question
once the brain connects.

Requirements: Xcode 27, `brew install xcodegen`. The `.xcodeproj` and
`Info.plist` are generated from `apps/mac/project.yml` and not committed.

## Decisions (2026-10-20)

- **Name and brand:** Slice for Mac, bundle `ai.slice.mac` (`com.slice` is
  likely taken on the App Store), the Freshly squeezed palette on a black
  island. Coucou's code (MIT) was a reference for the notch panel; its name,
  Mochi character, icon and sounds are reserved, so none of them are used.
- **AI stack:** Gemini Live through ADK (`run_live`), voice in and out of one
  model with tool calls. The model is `gemini-3.8-live` (Google's default Live
  model); the project also serves `gemini-live-2.5-flash-native-audio`, both
  only in `us-central1` (`global` and Europe return "not found", and
  `gemini-3.8-live-extended-thinking` isn't on the project). ADK already sends
  3.x Live text and audio through `realtimeInput`. 3.8 runs tools without
  blocking: it says a short line ("Let me look that up") while the tool runs,
  then answers. Override with `MAC_LIVE_MODEL`. `gemini-3.8-flash` accepts the
  `computer_use` tool directly (it answered "Open google.com" with
  `navigate`), so computer use needs no separate model.
- **Talking:** push-to-talk on fn + control (like Vovy). The model's own
  voice detection is off; the app sends `talk_start`/`talk_end`. Presses
  shorter than 180 ms are dropped, and another key while holding cancels
  (it was a shortcut). Hovering the notch opens the island for typing.
- **Signing:** Debug is signed with the team's Apple Development certificate
  (team `5Q3KU6MZ8A`) so macOS keeps the permission grants across rebuilds.
  Release expects a **Developer ID Application** certificate (not created
  yet) for a notarized DMG; judges need a hosted build, not localhost.
- **Hosted brain:** when `MAC_CLIENT_TOKEN` is set, `/mac/live` requires it
  as a bearer token (Settings > Brain > Token, kept in the Keychain).

Measured with `say`-generated speech at real-time pace on `gemini-3.8-live`:
about 1 s from releasing the keys to the first audio (a short line while
tools run), and about 4 to 5 s to the start of the real answer after one or
two tool calls (2.5 was silent for about 4 s). Push-to-talk input is
transcribed only after `talk_end`.

## The /mac/live protocol

One WebSocket per Mac. Text frames are JSON; binary frames are audio.

Mac → brain:

| Frame | Meaning |
| --- | --- |
| binary | Mic audio, PCM16 mono 16 kHz, about 100 ms per frame, only between `talk_start` and `talk_end` |
| `{"type":"talk_start"}` / `{"type":"talk_end"}` | The talk keys went down (held past 180 ms) / up |
| `{"type":"text","text":"…"}` | Typed in the island |
| `{"type":"tool_result","id":"…","result":{…}}` or `"error":"…"` | Answer to a `tool_call` |
| `{"type":"reset"}` | New conversation (new ADK session) |

Brain → Mac:

| Frame | Meaning |
| --- | --- |
| binary | The agent's voice, PCM16 mono 24 kHz |
| `{"type":"ready","model":"…"}` | Connected |
| `{"type":"transcript","role":"user"\|"agent","text":"…","partial":bool}` | Partials are pieces to append; the final one (`partial:false`) is the whole text |
| `{"type":"tool_call","id":"…","name":"…","args":{…}}` | Run a Mac tool (`frontmost_app`, `open_url`) |
| `{"type":"activity","kind":"qloo"\|"mac","label":"…","detail":"…"}` | A line for the island's activity list; every tool posts one |
| `{"type":"interrupted"}` | Stop playing (barge-in) |
| `{"type":"turn_complete"}` | The model finished a turn (also after each tool round) |
| `{"type":"error","message":"…"}` | The Live session failed; the next input opens a new one |

The Live session opens on the first input, not on connect, and reopens when
Gemini ends it (about ten minutes of audio).

## Where things are

- `apps/mac/Sources/Island/`: the notch panel (`IslandController`: placement
  over the notch, hover to open, click-through), its modes and sizes
  (`IslandModel`: closed, compact, captioned, open) and views.
- `apps/mac/Sources/Agent/AgentSession.swift`: the conversation state the
  island draws (phase, turns, activities, mic level), push-to-talk, playback.
- `apps/mac/Sources/Agent/LocalTools.swift`: tools that run on the Mac.
  Names match `apps/agent/slice_mac/tools.py`.
- `apps/agent/slice_mac/`: `routes.py` (the WebSocket and Live session),
  `bridge.py` (tool calls to the Mac), `tools.py`, `agent.py` (model, voice,
  instruction, run config).

## Next

Order to build the demos in (ideas and judge mapping are in the hackathon
scoping thread):

1. **Taste profile and cold start:** "pick 5 things you love" plus reading
   Music, browser history and Calendar, mapped to Qloo entities; the
   shareable taste card. Persist it and feed it into every session.
2. **Real Qloo recommendation tools:** insights by type with the profile as
   signals, location, compare, trending, heatmap. The first test picked
   "After Yang" from the model's own knowledge and only then looked it up;
   3.8 Live did the same ("The Lives of Others"); recommendations must come
   from Qloo, not the model.
3. **Screen awareness:** ScreenCaptureKit screenshots fed to the Live session.
4. **Computer use:** a `do_on_computer` sub-agent on `gemini-3.8-flash` with
   the `computer_use` tool, driving the browser, with a confirm step before
   anything that spends money or sends a message.
5. Hero demo "Handle Friday", then gifting, trip mode, concert scout.
6. A "Qloo off / on" switch and the activity list as the visible proof.
7. Distribution: Developer ID, notarized DMG, hosted brain with a token.
