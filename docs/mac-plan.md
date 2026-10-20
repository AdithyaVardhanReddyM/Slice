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
`-islandPreview open|captioned|compact|nudge` pins a mode with a sample
conversation; `-sampleTasks YES` adds two sample task cards;
`-sampleViews person|gifts|timeline|map|note|file|why|pill` adds one rich
card (`Agent/SampleViews.swift`, real Qloo answers);
`-renderIsland <dir>` writes each mode as a PNG plus `cards.png` (the cards
alone) and quits, with no screen access needed (it fetches the pictures and
maps first, and lays scroll views out flat, since ImageRenderer can't draw
either); `-renderLens <shot.jpg> <badges.json> <out.png>` draws the lens
badges over a screenshot; `-ask "…"` types a question once the brain connects.

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

## The six demos (built 2026-10-21)

Cast: **you (Alex)** love Mitski, Frank Ocean, Phoebe Bridgers, Aftersun,
Lady Bird and Past Lives, in Williamsburg; **Sam** is a friend; **Maya** has a
Letterboxd page and a birthday on the 29th; **Ray** is your dad, 74, in
Lincoln Park, Chicago, uses a walker, loves Sinatra, Casablanca and Downton
Abbey. To show the answers come from Qloo, rebuild the profile from
Settings > Taste > Try a taste > Country, Nashville and run a demo again
(Big Thief: 96% for the indie taste, 85% for the country one).

1. **Trip**: "Plan my Lisbon trip." The worker reads the flight and hotel
   from Gmail (`find_trip_emails`; or the dates you give), maps where your
   taste lives (`taste_map`: Chiado, Encarnação, Cais do Sodré), checks the
   weather, plans each day as walkable stops from the hotel
   (`plan_walkable_day`, one timeline card per day), ranks shows on those
   dates (`shows_for_me`), and offers to book dinner (operator), fill the
   calendar (`add_plan_to_calendar`, one yes for all) and message a friend.
2. **Someone else's week**: "My dad Ray is 74, lives in Lincoln Park, uses a
   walker, loves …". `remember_person` saves age, home and needs (a person
   card); `recommend(for_person="Ray")` uses his age band (Out of Africa,
   Suite Française; Fresh Air, Mobituaries) and, for places, his home and
   step-free entrances only (Riccardo Trattoria, Mon Ami Gabi);
   `make_printout` makes a large-print PDF; `send_file_imessage` and
   `repeat_weekly` ("every Sunday at 9") follow, each behind a yes.
3. **Birthday**: Maya's Letterboxd on screen, "It's Maya's birthday on the
   29th, find her a gift around $150." `learn_taste_from_screen` reads her
   favourites and five-star films (skips the 1½-star one) and badges them
   "Saved"; `gift_ideas` shows a two-column shortlist (Polaroid, Dr. Martens,
   Nick Drake on vinyl, The Bell Jar) with prices and why; `shop_for` puts the
   pick in the cart on the brand's own site, checks the delivery date and
   stops before payment; `show_note` writes the card. A pill under the notch
   says "Maya's birthday is in 8 days" (people with a saved birthday, or a
   Contacts birthday) with "Sort it".
4. **A day out**: "Plan my Saturday, Sam's joining after 2." Calendar,
   weather (indoor stops if it rains), a morning near home, `compare_tastes`,
   the afternoon and a show for "Sam and me", dinner near the venue
   (`recommend(near=<venue address>, also_like=<act>)`: Mitski fans near
   Brooklyn Steel get cocktail and wine bars, country fans whiskey bars),
   then `show_day_plan` merges it all into one timeline.
5. **Taste lens**: "Which of these would I love?" on Netflix, Spotify, a
   lineup poster or Amazon (ranked by brand); "Which is in my kind of area?"
   on Airbnb (how many of your city-wide top 100 places are a 10-minute walk
   away: Chiado 38, Belém 4). Badges appear over the items, the best three
   outlined with why; "play it" / "open the second one" clicks it
   (`tap_lens_item`). "Which of these would Maya love?" works too.
6. **Why do I love this?**: `why_this` explains what's playing or the film,
   show or book page in front: match, the loved things it shares Qloo tags
   with ("same emotive, raw streak as Phoebe Bridgers and Mitski"), and what
   its fans also love, with play buttons. Unasked, when a track or media page
   fits you at 94% or more, a "Very you" pill drops from the notch (at most
   once an hour; Settings > General can turn it off).

## Decisions (2026-10-21, the demos)

- **Rank anything** (`taste.rank`): resolve each name (a few at a time, typed
  by what the screen says), then one `filter.results.entities` call per kind
  with `feature.explainability`. A few loves weigh on every score, so a
  pick's "because" names the loves that drive it more than they drive the
  rest of the list; otherwise ten titles all said "because you love Past
  Lives". The user's own loves come back unscored and are badged "One of
  your loves".
- **Why** (`taste.explain`): match from the same scoring, shared words from
  `/v2/insights/compare` with regions, instruments and bland musical traits
  ("moderate", "4/4 time") dropped and moods ("melancholic", "poetic")
  first, plus what the thing's fans love.
- **Someone else**: age goes in as `signal.demographics.age` (a band) only
  beside their loves; their home city is not a signal for films or music
  (it dragged Ray's films to whatever is popular in Chicago). Needs like
  "uses a walker" turn on `step_free`: places must have a wheelchair-
  accessible entrance (`operator.filter.tags=intersection`).
- **How a person reads** ("thoughtful, intimate, reflective"): the tags
  their loves share, counted from `/entities`; tag insights were noise.
- **Gifts**: brands from film loves alone came back as luxury labels; brands
  from the artists those films point to are giftable (Polaroid, Dr. Martens,
  Herschel). Filtered by Qloo's brand `industries` and price range.
- **Taste map**: the user's top 100 places in the city grouped by the
  `neighborhood` Qloo gives each place (the heatmap put the hottest Lisbon
  cells in a park and across the river).
- **Address scoring** (Airbnb): count the top 100 within 800 m; the same
  list is reused for the taste map in one process.
- **Lens speed**: gemini-3.5-flash-lite reads the screen with boxes in 3 s
  (3.8 Flash 7 s); `MAC_LENS_MODEL` overrides it. The talker calls
  `taste_lens` and `why_this` itself (non-blocking), no worker.
- **Resilience**: Qloo calls run four at a time with a retry on 429 (four
  day plans at once tripped the key's burst limit), a tool that raises
  returns the error to the model instead of ending the task, and two yes/no
  questions from one task take turns.
- **Names**: untyped Qloo search prefers the national park over the show
  (Yellowstone) and the region over the brand (Patagonia), so a loved thing
  prefers a cultural match; a venue name ("Brooklyn Steel") isn't taken for
  the borough it starts with, and Apple Maps places venues and addresses.

## Measured (2026-10-21, fake Mac over /mac/live, real talker and worker)

- Lens on a Netflix screen by voice: badges at 9 s, the spoken pick at 14 s
  (screenshot, a 3 s vision read on gemini-3.5-flash-lite, Qloo search and
  scoring in parallel). Airbnb: badges at 9 s.
- "Why do I love this?": the card at 4 s, speech at 9 s.
- Gift from a Letterboxd page: 20 to 36 s. Dad's week: about 60 s; with the
  printout, iMessage and weekly repeat as a follow-up, another 15 s.
  Lisbon trip (map, weather, four day plans): 60 to 80 s. Saturday with Sam:
  about 130 s. Most of it is worker steps of 10 to 20 s on the shared
  3.8 Flash quota (`MAC_DEBUG=1` prints each step); a quota increase, or
  `MAC_WORKER_MODEL=gemini-3.7-flash`, would cut it.

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
| `{"type":"noticed","artist","track"}` or `{"type":"noticed","title","url"}` | A new track, or a film, show, book or music page in front (`Agent/Watchers.swift`, every 20 s, only media sites); the brain may answer with a `nudge` |
| `{"type":"run_routine","title","goal"}` | A weekly job came due (`profile.routines`); it runs as a quiet task (a card, no voice) |

Brain → Mac:

| Frame | Meaning |
| --- | --- |
| binary | The agent's voice, PCM16 mono 24 kHz |
| `{"type":"ready","model":"…"}` | Connected |
| `{"type":"transcript","role":"user"\|"agent","text":"…","partial":bool}` | Partials are pieces to append; the final one is the whole text |
| `{"type":"tool_call","id","name","args"}` | Run a Mac tool (below) |
| `{"type":"activity","kind","label","detail","task_id"}` | One line per tool call; with a `task_id` it belongs to that task's card |
| `{"type":"task","task":{id,title,status,steps,question,confirm,say,cards,views,error}}` | A task changed (statuses above). `cards` have an optional `tag`; `views` are rich cards by `type`: `person`, `gifts`, `timeline`, `map`, `note`, `file`, `why` |
| `{"type":"nudge","nudge":{id,kind,title,line,show,why,prompt,action}}` | Something to bring up: `show` false is a pill under the notch (a "very you" moment), `show` true opens the island on a why card the user asked for |
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
`messages_send {to, text}`, `messages_send_file {to, path, text}`,
`mail_draft {to, subject, body, attachment}`, `maps_geocode {places}`,
`save_file {name, data, open}` (Documents/Slice), `screenshot` (JPEG, 1440
wide, Slice's own windows left out, plus the browser `url`),
`computer {action, x, y, …}` (Gemini's desktop actions), `lens_show {badges:
[{box, label, detail, top}]}` (boxes 0-1000 over the last screenshot) and
`lens_clear`.

HTTP routes beside it: `GET /mac/search?q=&kind=`, `POST /mac/profile/build
{seeds, city, base}`, `GET /mac/accounts?user=`, `POST /mac/accounts/connect
{user, app}` → `{url}`.

The Live session opens on the first input, not on connect, and reopens when
Gemini ends it (about ten minutes of audio).

## Where things are

- `apps/agent/slice_mac/`: `routes.py` (WebSocket, Live session, HTTP),
  `agent.py` and `tools.py` (talker), `tasks.py`, `worker.py`, `taste.py`
  (profile, people, recommend, rank, why, gifts, taste map), `plans.py`
  (weather, shows, walkable days, address scoring, calendar, printout,
  weekly jobs), `lens.py` (screen reading, badges, why now, the "very you"
  nudge), `qloo.py` (Qloo calls), `mac_tools.py`, `accounts.py` (Composio),
  `computer.py` (operator, `shop_for`), `connection.py` and `bridge.py` (one
  connected Mac).
- `apps/mac/Sources/Island/`: the notch panel (`IslandController`), its modes
  (`IslandModel`: closed, compact, captioned, nudge, open; it opens by itself
  when a task needs you or a why card was asked for), `IslandView`,
  `TaskViews` (task cards, buttons, picks), `RichViews` (person, gifts,
  timeline and taste map with Apple Maps snapshots, note, file, why, nudge),
  `LensOverlay` (badges over the screen) and `AgentCursor` (screen glow and
  click marks while the operator works).
- `apps/mac/Sources/Agent/`: `AgentSession` (conversation, tasks, profile,
  nudges, push-to-talk, playback), `LocalTools` (tool router), `TasteStore`,
  `Watchers` (what's playing or open, birthdays, weekly jobs),
  `SampleViews` (debug cards).
- `apps/mac/Sources/Tools/`: Calendar, Contacts, Maps, Music/Messages/Mail,
  Screen, Computer.
- `apps/mac/Sources/Settings/SettingsView.swift`: General, Taste, Accounts.

## Not done yet

- Not tried on a real Mac by a person: holding fn + control and speaking,
  hover to open, the permission prompts, the operator on the real screen,
  Composio sign-ins with real accounts. The six demos ran against a fake Mac
  (mock Netflix, Airbnb, Amazon and Letterboxd pages), not real sites.
- Needs accounts before the demo: Gmail (trip emails) and Ticketmaster
  (shows) through Settings > Accounts, or `TICKETMASTER_API_KEY` in
  apps/agent/.env (Discovery API). Without Ticketmaster, plans skip the show
  and offer to connect it.
- `shop_for` (cart, delivery date, stop before payment) is the operator with
  a fixed job; untested on a real shop.
- Worker steps of 10 to 20 s on the shared quota make the long demos slow.
- A "Qloo off / on" switch for the judges (the Country preset does a
  similar job).
- Distribution: Developer ID, notarized DMG, hosted brain with a token.
