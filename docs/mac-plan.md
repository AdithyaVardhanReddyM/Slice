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
          │  mac_tools.py calendar, reminders, notes, contacts, maps, music, messages, mail, screen
          │  accounts.py  Gmail, Google Calendar, Drive, Docs, Sheets, Maps, Slack, Notion, Ticketmaster (Composio)
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
3. First launch opens onboarding (taste, permissions, then apps to connect).
   Permissions are Microphone and Accessibility (both required), Screen
   Recording (the operator, look_at_screen), Your apps (Apple Events) and Full
   Disk Access (Podcasts); location is asked for only when home is set to
   "where I am". Integrations: connect Gmail, Slack, … (Composio sign-in; the
   brain needs COMPOSIO_MAC_API_KEY in apps/agent/.env) and allow Calendar,
   Contacts, Reminders and Notes (macOS permissions, shown as apps since
   2026-10-26).
4. Hover the notch to open the island and type, or hold **fn + control**
   anywhere, talk, and let go.

Debug launch arguments (`open …/Slice.app --args …`):
`-islandPreview open|captioned|compact|nudge` pins a mode with a sample
conversation; `-sampleTasks YES` adds two sample task cards;
`-sampleViews person|gifts|timeline|map|note|file|why|pill` adds one rich
card (`Agent/SampleViews.swift`, real Qloo answers), and
`-sampleViews picks|picks-music|picks-book|picks-place` a conversation with a
quick picks card; `-revealPick <name>` starts the onboarding reveal with that
node clicked (for `-snapshotWindows`); `-previewOperator <dir>` shows the
operator overlay mid-task and captures only Slice's own windows over a light and
a dark backdrop;
`-renderIsland <dir>` writes each mode as a PNG plus `cards.png` (the cards
alone) and quits, with no screen access needed (it fetches the pictures and
maps first, and lays scroll views out flat, since ImageRenderer can't draw
either); `-renderLens <shot.png> <lens.json> <out.png>` draws the lens over a
screenshot at 2x (the JSON is what `lens_show` gets, `{"badges", "summary"}`,
plus `"menuBar"` in points, or `{"scanning": true}` for the sweep; give it the
picture at point size, so a Retina capture halved); `-ask "…"` types a
question once the brain connects.

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
  Reminders, Notes, Contacts, Apple Maps, Music and Spotify, Messages, Mail,
  the screen); cloud accounts through Composio's own approved apps (Gmail,
  Google Calendar, Drive, Docs, Sheets, Maps, Slack, Notion, Ticketmaster),
  each Mac its own Composio user `mac-user:<id>` in the Mac app's own
  Composio project (`COMPOSIO_MAC_API_KEY`); and anything
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

1. **Trip** (reworked 2026-10-27, see "The trip demo" below): "I'm planning
   to go to Paris next month for a week. Plan my itinerary." The talker asks
   the dates and who's going, then where you're staying, and hands it all to
   one task. `plan_trip` maps where your taste lives (`taste_map`), checks
   the weather (last year's for dates past the 16-day forecast), plans each
   day as a walk of Qloo places that are open that day at that hour (one
   timeline card per day, eight days at most), ranks shows on those dates,
   and offers a doc or the calendar. "Put it in a doc" → `write_this_plan`:
   "Paris, 12 to 19 November" in Google Docs when it's connected, else a
   PDF in Documents/Slice, opened either way. "Put the days in my calendar"
   → `add_this_plan_to_calendar`: one event per day, one yes for all. Then
   it offers to book the dinner it picked (`book_this_dinner`, since 2026-10-27 `book_this_table`): the operator
   goes to the restaurant's own site (TheFork as the fallback), picks the
   date, time and party size and asks before the final confirm.
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
   away: Chiado 38, Belém 4). While the screen is read a light sweeps down it
   (`lens_scan`); then the screen dims a little except the best three, which
   stay lit with a footer (rank, match, why, two of Qloo's words for it), the
   rest get a ring chip with their match at the tile's corner, the user's own
   loves a heart, and a bar at the foot of the screen says what was ranked and
   what to say ("play the first one"). Redesigned 2026-10-27 after the first
   recording: the old black pills on every tile read as noise and the best
   picks didn't stand out. "play it" / "open the second one" clicks it
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

## Knowing the user (built 2026-10-26)

How Slice gets to know someone, remembers it, and keeps learning:

- **Onboarding** (`Sources/Onboarding/OnboardingView.swift`, `slice_mac/onboarding.py`):
  the first launch (no loves yet, or `-onboarding YES`) opens a light, brand
  window in eight steps: welcome and name, home, three picking steps (artists;
  films and shows; brands and books), six quick questions, permissions with a
  "try talking" panel (the first real push-to-talk), and the taste it read.
  Picking steps open on 20 wide-ranging Qloo entities with pictures; after each
  pick, "Because of your picks" asks Qloo for what fits everything picked so
  far, across steps (Mitski and Bon Iver bring Frances Ha and Fleabag to the
  film step, Patagonia and Herschel to brands). The questions become plain
  facts ("Doesn't eat meat", "Gets around on foot"), never scores. Settings >
  General > "Get to know me again" reopens it.
- **Memory** (`slice_mac/memory.py`): the profile gains `dislikes` (never
  picked again, "Not for you" on the lens), `facts` (about the user or a saved
  person), `evidence` (quiet signals adding up), `suggested` (waiting for a
  yes), `declined`, `journal` (every change and why, with undo) and `prefs`.
  Loves carry `source` (onboarding, settings, said, liked, learned, screen,
  music), `at`, `image` and `weight`. Qloo takes 20 signals and no weights
  (a weighted JSON signal 400s, checked 2026-10-26), so weights decide which
  20 loves steer (`memory.signal_seeds`); using a love keeps it strong.
- **The learning loop** (`slice_mac/learning.py`): saying "I loved Perfect
  Days" or a thumbs up on a card adds a love at once; "not for me" or a thumbs
  down adds a dislike (only for an exact Qloo match: "horror films" becomes a
  fact, not the book that starts with those words); "I'm vegetarian" is a fact.
  Quiet signals (a track playing, a film page open, a lens badge tapped, "why
  do I love this?") add up per entity, capped per day; past 6 points on two
  days (`MAC_LEARN_FAST=1`: 3 points, one day) an "Add it to your taste?" pill
  drops from the notch (one per 20 minutes; the rest wait in Settings >
  Memory). Each change re-reads the taste five seconds later and the journal
  says how it moved ("Your taste now reads more folk and indie rock, less
  identity and vulnerable"). Cards for someone else carry `for` and get no
  thumbs.
- **What the profile reads as** is now the words the loves themselves share in
  Qloo (`graph.reads_as`: Intimate, Introspective, Melancholic, Folk); tag
  insights for the same loves gave "lesbian", "female protagonist", "friend".
  The summary speaks to the user ("You love…"); the talker gets it quoted.
- **The taste graph** (Settings > Your taste, `slice_mac/graph.py`,
  `Sources/UI/GraphCanvas.swift`, `Sources/Settings/TasteSpace.swift`): you
  in the middle, loves on a ring (size is weight), the threads two or more
  loves share around them, Qloo's next picks (dashed, tied to the loves behind
  them) and saved people outside (their own loves show when selected),
  dislikes greyed. Planned radially (each thread at the mean angle of its
  loves) then nudged apart; drag, pan, zoom, hover lights up a node's ties,
  click opens an inspector with actions (why, remove, not for me, add a pick,
  forget a person). Filters by kind, people and next picks. The graph is kept
  in Application Support so Settings opens on it at once.
- **Memory** (Settings > Memory, `Sources/Settings/MemorySpace.swift`): a graph
  drawn from the profile (About you, each person, Learning, Not for you,
  Every week, each fanning its details out), the "Add to your taste?" waiting
  list, a timeline of every change with Undo, and a box to tell Slice
  something to remember (about you or a saved person).
- **Taste on or off** (Settings > General > "Use my taste", `slice_mac/generic.py`):
  off, picks, rankings, the lens, why cards, gifts and city areas come from
  Gemini's general knowledge with no Qloo call, labelled as popular picks, and
  the talker says so. A `settings` frame starts a fresh conversation that
  knows. Checked over /mac/live: off, "What should I watch tonight?" gave
  Dune: Part Two; on, Licorice Pizza.
- **Rendering for checks**: `-renderSettings <dir> [-renderProfile taste.json]`
  writes the taste graph, an inspector, memory and every onboarding step as
  PNGs (needs the brain for the graph and tiles; text fields draw as blocks).

## The look (2026-10-26)

Light by default, dark if picked in Settings > General (`Theme`, `NSApp.appearance`); the
island stays black to match the notch. Everything else is drawn with `UI/Sky.swift` (colour
tokens, each with a light and a dark value) and `UI/SkyViews.swift` (gradient skies, glossy
icon tiles, black pill buttons, chips, page dots, fields, key caps, DiceBear "Dylan" avatars).

- **Icons and logo:** glossy 3D renders (Higgsfield, GPT Image 2.5, transparent, every icon made
  with the microphone as its style reference) in `Assets.xcassets/Glossy`. The mark is a puffy
  glass version of the two slabs; the app icon puts it on a light glass tile. No glows, no
  gradient avatar circles.
- **Onboarding** (`Onboarding/`): a borderless rounded window (`SkyWindow`), nine steps:
  welcome, home, three picking steps (with From my Music, Podcasts and Books), the six
  questions one at a time as icon cards, every permission (`System/Permissions.swift`: microphone,
  accessibility, screen recording, location, calendar, contacts, the apps Slice drives, Full Disk
  Access for the Podcasts library), try talking, and the taste it read.
- **Home** is picked with the current location (CoreLocation, named by Apple Maps) or a search,
  and shown on a close-up dotted globe (`UI/GlobeView.swift`, land dots from Natural Earth via
  world-atlas, ISC). The exact point is saved as `profile.home` and the brain's `point_of`
  uses it for the user's city, instead of Qloo's locality search (which put "Tokyo" in the sea).
- **Graphs** (taste, memory) read like a drawn knowledge graph: round photos, small black badges,
  names in outlined pills, thin ink lines, threads as small italic words; the taste graph keeps
  the 8 strongest threads and 4 next picks.
- **Settings**: a sidebar with the user's face and home, General as cards (look, talking, home,
  permissions, taste switches, brain), Accounts as a grid of app tiles. Taste and memory are one
  page, **You** (`TasteSpace` + `YouPanels`): the taste graph with people on its edge, and a panel
  with Taste (how to read it, suggestions waiting, what's adding up, not for you), Facts and
  people (facts, a card per person, weekly jobs) and Changes (the journal with undo).
- **The island** stays black (it meets the notch) and is always dark (`IslandPanel` uses darkAqua):
  solid black under the notch, dark frosted glass below (`IslandShell`, a behind-window blur, so
  the desktop tints its edges), grey cards with a lighter header strip (`IslandCard`), a blue pill
  for the main action, white type tags (`IslandTag`), no glows on the map or lens.
- **While Slice uses the Mac** (`AgentCursor`, 2026-10-26, built on Cortana's actor layer in
  ~/Desktop/cortana `app/src/renderer/overlay.js`): the one glow the user asked for. Light flows
  round the screen's edge (a turning conic gradient, blue, lilac, orchid and sky, under a mask
  that falls off like light, (1 - t)^2.4, all Core Animation); Slice's own cursor (gradient arrow
  with a "Slice" tag) glides to each target 0.3 s before the real click and squeezes on press,
  with a ring where it lands; a bottom pill says the step and "esc to stop" (a key monitor that
  ignores Slice's own synthetic keys, marked with `eventSourceUserData`, and cancels the task).

Check UI without screen access: `-renderSettings <dir>` (add `-appearance dark` for dark) and
`-snapshotWindows <dir>`, both with `-renderProfile <taste.json>`.

## The trip demo (2026-10-27, tested end to end over /mac/live)

Judged against the script the user wants to record (ask a few questions,
a taste-led itinerary, "put it in a doc", the calendar and booking offers,
a booking the operator stops short of). The first run against the real
brain took 20 minutes and went wrong at every step; the fixes:

- **Questions come from the talker**, not the worker: the talker asks the
  dates and who's going, then where they stay (two turns at most, no budget
  or pace questions), and starts the task with all of it. The worker never
  guesses dates (`plan_trip` refuses without them; `find_trip_emails` says
  "ask" when Gmail isn't connected instead of opening a sign-in). Before,
  the worker invented 9 to 15 November for "next month".
- **Follow-ups stay in the task.** "Put it in a doc" used to start a new
  task that searched Notes, Reminders and the screen for an itinerary it had
  never seen, then opened a Composio sign-in and waited 150 s. Now the
  talker's `continue_task` carries follow-ups on a finished task (its
  docstring and the talker prompt say so), and `playbooks._plan_for` keeps
  each user's latest plan so even a new task finds it.
- **The written plan** (`tripdoc.py`, `write_this_plan`): built from the
  plan's data, never retyped by the model (the worker only writes the intro
  and any tips it checked). Title "Paris, 12 to 19 November"; a day per
  section with the weather; each stop with time, kind, neighbourhood, Qloo's
  description, why it fits (Qloo's feel words for the place, leading with any
  word it also uses for the user's taste, and that it's Qloo's top-ranked
  place of that kind nearby), address, hours that day, price, "Book ahead",
  signature dishes. Markdown for `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN`
  (no confirm: "put it in a doc" is the consent), HTML to PDF through the
  shared headless Chromium when Docs isn't connected (saved in
  Documents/Slice and opened; a file card in the island). Qloo's per-place
  explainability is flat (every stop "because you love Breaking Bad"), so
  loves aren't quoted for places.
- **Places that fit** (`plans.fits`, `plans.open_at`): Qloo's genre filter
  matches any tag, so lunch came back as hotels, a record shop as Fnac and a
  bookshop as a shopping mall. `qloo._brief` now carries a place's primary
  genre, rating, website, phone, hours by weekday and dishes; a stop must
  mainly be its kind (never a hotel, mall, department store, chain, cruise
  or bus), rated 3.9 or better when rated, and open when the plan arrives
  (Qloo hours; a place that opens within half an hour counts). Lunch is
  never before 12:15, dinner lands on a quarter hour. Three day shapes take
  turns (museum and record shop, bookshop and café, park and record shop),
  evenings rotate cocktail bar, wine bar, jazz or music bar (never a concert
  hall without a show), and a stand-in kind isn't used twice in a day.
- **Placing the hotel**: Qloo's locality search matched "Hôtel National des
  Arts et Métiers" to a town on another continent, so `qloo.locate(strict)`
  now needs the exact name, `taste.point_of` takes `near` and rejects any
  point over 80 km from the city, and `plan_trip` retries the hotel's name
  with the city when the full phrase doesn't geocode.
- **Weather past the forecast**: Open-Meteo's archive gives the same day
  last year, marked `typical`, so plans say "usually" and the doc says what
  last year was like. Eight days are allowed (12 to 19 is eight), ten rich
  cards per task.
- **Calendar**: one event per day ("Paris: Thursday in Le Marais", first to
  last stop, the stops and weather in the notes), not 45 stops; the Mac's
  Calendar is the default (`google_calendar_add` only when asked by name).
- **Booking** (`book_this_dinner`, now `book_this_table`): the dinner to book is the most bookable
  one from day two on (own website, "Reservations" tag, mid price); the
  operator job names the site, the date, time and party size, allows a
  booking service, falls back to TheFork, never types contact or card
  details, and must `ask_permission` at the confirm step; 28 steps at most.
  Run 2 picked Le Calife, a Seine dinner cruise, and spent six minutes on
  its site: cruises, boats and buses are no longer restaurant stops.
- **Silence and chatter**: a task that's been running 22 s tells the talker
  its latest step (then every 50 s, three times at most) so the user hears
  "still mapping your days" rather than nothing; not while the operator is
  on screen, where the glow and cursor show it (run 2's talker narrated
  every scroll, and once said "confirming" when nothing was). The talker
  can't answer a yes-or-no for the user: `continue_task(approved=…)` is
  refused until the user has spoken since the question was raised
  (`Connection.last_input_at`, `Task.asked_at`); run 1's talker approved
  the doc and the 45 calendar events itself.
- **Quota**: a worker step that answers takes 2 to 9 s; one stuck behind
  the shared quota never answered before the 15 s timeout, so each was 17 to
  19 s. `FallbackGemini` now hedges: after 7 s the next model is asked too
  and the first answer wins (measured 7.5 s on a stalled call).

Timings (fake Mac over /mac/live, real talker, worker and operator): run 2
answered the dates in 10 s, planned eight days 40 s after the dates (the
playbook itself 17 s), wrote and opened the PDF 21 s after "put it in a
doc", added eight calendar events 11 s after "yes", and the whole script
ran in 9 min 17 s against run 1's 20 min. Run 3 (after the booking fixes) is
in the report at Library/Application Support/Claude/side-session-notes.

## The dad's weekend demo (2026-10-27, tested end to end over /mac/live)

Demo 2: "My dad Frank is 73 and lives in Lincoln Park in Chicago. He's fit,
but he likes a proper table with a reservation, nothing too loud, no late
nights, and short walks between things. He loves The Godfather, Bob Dylan and
Columbo. His friend Walter is into Miles Davis and old westerns like The
Searchers. Plan their weekend, the two of them together." Judged the same way
as the trip demo (fake Mac `apps/agent/scripts/mac_dad_demo.py`, report and
logs in `video/mac/dad/`). The first run took 12 minutes and went wrong at
every step (two questions it had the answers to, a plan for Frank's taste
alone, a typed-out text message with an invented dinner, six calendar events,
the operator in Terminal, the talker answering the weekly offer itself, and
nothing remembered after a reset). What changed:

- **One playbook for the weekend** (`playbooks.plan_weekend_for`): saves both
  men (person cards, at the same time; `taste.save_person` no longer awaits
  between copying and saving the profile, so two saves can't overwrite each
  other), blends their loves as one Qloo signal set (`taste.signals_for`
  takes several saved people: the older one's age band, the first home, every
  need either has, and which love is whose in `Signals.owner`), checks the
  weather, compares the two tastes, and plans each day as a short route from
  his home: a seated coffee at 10:30, something to see at 11:30, lunch at a
  proper table at 12:45 (meals land on the quarter hour), a shop at 14:30, and
  one early evening out on the Sunday (a jazz room when a love carries Qloo's
  jazz tags, else live music) that starts when the room opens and ends before
  the hour he likes to be home. Walks are 600 to 900 m; anything farther is a
  short drive from home (2.5 km at most; 7 km for the music) and the stop says
  so ("A 12-minute drive."). A film for the two of them, music for the drive
  and a series for him come with whose love drives each ("For Frank's Bob
  Dylan and Walter's The Searchers", from Qloo's explainability through
  `taste.standouts`; the series scored against his loves alone).
- **Needs become rules** (`taste.needs_of`, `plans.suits`, `plans.prefers`):
  "a proper table with a reservation, nothing too loud, no late nights, short
  walks" turn into seated, quiet, early and short_walks. `qloo._place_details`
  now reads Qloo's noise_level, reservations, parking and "usually a wait"
  tags (they were dropped as plumbing). A stop must not be loud, a lunch must
  take reservations and not be a bar, counter, cafeteria or one-dollar-sign
  place, a quiet taste skips rooms with DJ sets or dance music, and someone
  with early hours only goes where Qloo knows the hours (a gallery that opens
  by appointment is out). Among what fits, the first place in Qloo's order
  that is also quiet, has parking when he drives and isn't the kids' museum
  wins.
- **New kinds**: `jazz_club` (Qloo's own genre) and `cinema` (a category) in
  `qloo.PLACE_GENRES`, `plans.FITS`, `STAY_MIN`; the island maps them to
  icons (`RichViews.symbol`, needs an app rebuild to show).
- **The talker**: a rule for planning for someone else (never re-ask what
  they said; "their weekend" is the coming Saturday and Sunday; at most one
  question, lunch or an early dinner; don't start a task while they're still
  describing him; don't file his details as the user's facts), follow-ups
  include "send it to dad" and "every week", and a yes to its own offer is
  passed on at once. Saved people are in its instructions
  (`routes._new_session` state `people`), so after a reset "what does my dad
  like?" and "plan dad's weekend" work; `taste._person` finds a person by
  relation ("dad", "my mum").
- **Offers one at a time** (worker prompt and the playbook's `next`): send
  him the pages, the days in the calendar, book the table, do it every week;
  each behind a yes, the next after the last.
- **The pages** (`plans.make_printout`, `_printout_html`): a page per day,
  36 pt title, 28 pt day headings, a bold time column, each stop as its name,
  what it is (Qloo's description cut at a sentence), why it suits the two of
  them (the needs it honours, then Qloo's feel words, leading with any word
  Qloo also uses for what they love), the address, hours that day, "Table for
  2 under Frank", the phone as (773) 666-5220; the film at home closes
  Saturday; a last section for the music and the series; a lead line for
  Frank and a footer naming who planned it. `send_this_plan` makes the PDF
  without opening it, finds his number in Contacts (or takes `to`), and sends
  it with a short plain message through Messages (one yes), or opens a Mail
  draft for an email address.
- **Calendar**: one event per day ("Frank and Walter: Saturday in Lincoln
  Park", the stops in the notes), through the same `add_this_plan_to_calendar`.
- **Booking**: `book_this_dinner` is now `book_this_table` and takes any
  plan's table (the Saturday lunch, party of two, under Frank's name), with
  OpenTable as the fallback outside France and the city in the search.
- **Measured**: the playbook plans the weekend in 8 to 10 s of Qloo and
  weather calls (two saves 1.8 s, weather, compare and media picks together,
  two days in parallel); run 2 spoke the plan 40 s after the user's last
  word, sent the pages 6 s after "yes", added the two events 1 s after the
  confirm.

## Measured (2026-10-26, combined tools)

Each long demo is now one worker tool (`slice_mac/playbooks.py`: `plan_trip`,
`plan_day_out`, `plan_for_someone`, `gift_for`) that runs the chain in Python,
with independent parts at the same time, and shows the same cards. The worker
takes two model steps: call the playbook, then speak. Follow-ups reuse what
was planned (`add_this_plan_to_calendar`, `print_this_plan`), so the plan is
never written back out as JSON. Fake Mac over /mac/live with the indie
Brooklyn profile; times run from the typed request to the task's answer and
include the talker's 4 to 5 s hand-off. No Ticketmaster key, so no shows.

| Demo | Before (old playbook, same day) | After | Worker model steps |
| --- | --- | --- | --- |
| Lisbon trip, 4 days | 37 s | 16 to 19 s (23 s with a cold cache) | 8 to 2 |
| Saturday with Sam | 36 s | 13 to 15 s | 4 to 2 |
| Dad's week | 23 s | 11 to 13 s | 5 to 2 |
| Gift from Letterboxd | 30 s | 19 to 20 s | 4 to 2 |

- Inside the playbooks: the trip takes 8 s warm and 13 s cold (map, weather and
  shows in 3 to 5 s, then the four days at once); the day out takes 3 to 5 s;
  Dad's week takes 3 s warm and 12 s cold; the gift takes 8 s (reading the
  screen and saving Maya is 7 s of it).
- Follow-ups: "add all of it to my calendar" took 5 s (one yes, 22 events),
  and "make the large-print page" took 6 s. Saturday with taste off took 16 s
  (popular picks from generic.py, the calendar still respected).
- The old Saturday spent 7 to 11 s per step writing a 1,000-token
  `show_day_plan` JSON. Today's 3.8 Flash steps were otherwise 2 to 4 s, with
  one 27 s stall that hit the 25 s step timeout (`STEP_TIMEOUT_S`) and fell
  back. Slow runs (33 to 39 s for Dad's week) were a stalled step or a 16 s
  talker hand-off, not the tools.
- The 21 Oct numbers below were measured on a slower quota day.

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
| `{"type":"hello","user_id","profile","timezone","taste"}` | Always the first frame; `taste` false means "Use my taste" is off |
| binary | Mic audio, PCM16 mono 16 kHz, about 100 ms per frame, only between `talk_start` and `talk_end` |
| `{"type":"talk_start"}` / `{"type":"talk_end"}` | The talk keys went down (held past 180 ms) / up |
| `{"type":"text","text":"…"}` | Typed in the island |
| `{"type":"tool_result","id":"…","result":{…}}` or `"error":"…"` | Answer to a `tool_call` |
| `{"type":"task_confirm","id","approved"}` | The island's Go ahead / Not now |
| `{"type":"task_reply","id","text"}` | A typed answer to a task's question |
| `{"type":"task_cancel","id"}` | The card's Stop |
| `{"type":"profile","profile"}` | Settings rebuilt the taste profile |
| `{"type":"reset"}` | New conversation (new talker session; tasks keep running) |
| `{"type":"noticed","artist","track","learn","nudge"}` or `{"type":"noticed","title","url","learn","nudge"}` | A new track, or a film, show, book or music page in front (`Agent/Watchers.swift`, every 20 s, only media sites): it counts towards learning (`learn`) and may bring a "very you" `nudge` |
| `{"type":"feedback","title","verdict":"up"\|"down","tag"}` | A thumbs up or down on a card; answered with `feedback_ack` |
| `{"type":"learn_answer","id","accept"}` | The answer to an "Add it to your taste?" pill |
| `{"type":"settings","taste":bool}` | "Use my taste" switched; a fresh talker session |
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
| `{"type":"picks","picks":{id,kind,genre,title,taste,items[{name,kind,image,year,description,neighborhood,address,price_level,lat,lon,url,because}]}}` | The talker's quick picks as a white card under its reply (`Island/PicksCard.swift`); it opens the island for 30 s unless hovered. The same `id` comes again about a second later with `because` (the loves that drive each pick most: `qloo.score` explainability, `taste.standouts`) |
| `{"type":"nudge","nudge":{id,kind,title,line,show,why,prompt,action,learn}}` | Something to bring up: `show` false is a pill under the notch (a "very you" moment, a birthday, or `kind` "learn" with `learn {id,name,kind,image}`: "Add it to your taste?"), `show` true opens the island on a why card the user asked for |
| `{"type":"feedback_ack","title","verdict","ok","name","message"}` | A card's thumbs was saved (or why not) |
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
`computer {action, x, y, …}` (Gemini's desktop actions), `lens_scan` (the
sweep while the screen is read), `lens_show {badges: [{box, label, detail,
top, match, tags, own, disliked}], summary: {count, what, whose, hint | line}}`
(boxes 0-1000 over the last screenshot) and `lens_clear`.

HTTP routes beside it: `GET /mac/search?q=&kind=`, `POST /mac/profile/build
{seeds, entities, city, base, facts, prefs, name, onboarding}`, `POST
/mac/profile/edit {profile, op, …}` (love, forget, dislike, undislike, fact,
forget_fact, accept, decline, undo, city, forget_person, forget_routine; the
journal notes each, the taste is re-read when loves change), `POST
/mac/profile/graph {profile, fresh}`, `GET /mac/onboarding/starters?step=`,
`POST /mac/onboarding/more {step, picked, exclude}`, `GET /mac/accounts?user=`,
`POST /mac/accounts/connect {user, app}` → `{url}`.

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
  connected Mac), `playbooks.py` (one tool per long demo), `memory.py` and
  `learning.py` (what Slice remembers and how it learns), `graph.py` (the taste
  graph), `onboarding.py` (first-run tiles), `generic.py` (taste off).
- `apps/mac/Sources/Island/`: the notch panel (`IslandController`), its modes
  (`IslandModel`: closed, compact, captioned, nudge, open; it opens by itself
  when a task needs you or a why card was asked for), `IslandView`,
  `TaskViews` (task cards, buttons, picks), `RichViews` (person, gifts,
  timeline and taste map with Apple Maps snapshots, note, file, why, nudge),
  `LensOverlay` (badges over the screen) and `AgentCursor` (edge glow, Slice's
  cursor, ripples and the esc pill while the operator works).
- `apps/mac/Sources/Agent/`: `AgentSession` (conversation, tasks, profile,
  nudges, push-to-talk, playback), `LocalTools` (tool router), `TasteStore`,
  `Watchers` (what's playing or open, birthdays, weekly jobs),
  `SampleViews` (debug cards).
- `apps/mac/Sources/Tools/`: Calendar, Contacts, Maps, Music/Messages/Mail,
  Screen, Computer.
- `apps/mac/Sources/Settings/`: `SettingsView` (sidebar: General, Your taste,
  Memory, Accounts), `TasteSpace`, `MemorySpace`, `SettingsRender` (debug PNGs).
  `Sources/UI/GraphCanvas.swift`: the graph engine both use.
  `Sources/Onboarding/OnboardingView.swift`: the first-run window.

## Not done yet

- Not tried on a real Mac by a person: holding fn + control and speaking,
  hover to open, the operator on the real screen, Composio sign-ins with real
  accounts. Onboarding now walks through the permission prompts and a first
  push-to-talk ("Try talking"), but nobody has done it yet. The demos and the
  learning loop ran against a fake Mac over /mac/live; Settings, Memory and
  onboarding were checked as rendered pictures, not on screen.
- Ticketmaster needs a key (`TICKETMASTER_API_KEY` in apps/agent/.env, free
  from developer.ticketmaster.com) or a Composio connection; without it plans
  offer a music venue and say shows need it. Gmail must be connected for trip
  emails.
- `shop_for` (cart, delivery date, stop before payment) is untested on a real
  shop.
- Distribution: scripts are ready (docs/mac-release.md) but need a Developer
  ID certificate, a notarytool profile and a Cloud Run deploy.

## Integrations (Settings > Integrations, 2026-10-26)

One page for every app Slice reads and acts in, laid out like polly-ai's
Integrations page: a search field, a built-in "Taste by Qloo" row, filter
pills (All apps, Connected, then three groups), a card per app grouped into
Plans and places, Mail and messages, Notes and files, and a side panel per
app (connection state, connect or disconnect, what Slice can do with the
asks-first actions marked, something to try saying).

- **Catalog:** `slice_mac/accounts.py` CATALOG (GET /mac/accounts). Eleven
  apps: Google Calendar, Reminders, Google Maps, Ticketmaster, Gmail, Slack,
  Notes, Notion, Google Drive, Google Docs, Google Sheets. Outlook, WhatsApp,
  YouTube and Discord were dropped (WhatsApp through Composio is the Business
  API, not a person's account).
- **Cloud apps** sign in on Composio's hosted page (POST /mac/accounts/connect),
  which sends the browser to GET /mac/accounts/connected; the page polls every
  2.5 s for up to 5 minutes. POST /mac/accounts/disconnect deletes every
  account of the app, unfinished sign-ins included. All nine toolkits have
  Composio-managed OAuth (checked 2026-10-26), so no Google, Slack or Notion
  developer app is needed. Key: `COMPOSIO_MAC_API_KEY` in apps/agent/.env,
  read on every call (no restart); hosted, the Secret Manager secret
  `slice-mac-composio-api-key`. It needs write access to sessions, tool
  execution, connected accounts and auth configs.
- **Reminders and Notes** are on the Mac: `Tools/RemindersTool.swift`
  (EventKit, NSRemindersFullAccessUsageDescription) and `Tools/NotesTool.swift`
  (AppleScript, its own Automation check for com.apple.Notes). Their cards show
  macOS's answer (Allow, Allowed, Turn on) instead of a sign-in.
- **Worker tools:** accounts.py adds google_calendar_free_time,
  google_calendar_add, google_maps_places, google_maps_route, notion_read_page,
  docs_find/read/create and sheets_find/read/add_rows/create; mac_tools.py adds
  reminders, add_reminder, complete_reminder, find_notes, read_note, add_note.
  Everything that writes asks first.
- **Checks:** `-snapshotWindows <dir> -brainURL ws://127.0.0.1:<port>/mac/live
  -integrationsOpen <slug>` draws the page with one app's panel open.
  Verified 2026-10-26 against a brain using the Pages Composio key: catalog,
  a sign-in link for each of the nine apps, NotConnected for Maps, Sheets and
  Docs, disconnect clean-up. Not tried: a real sign-in, or any tool on a
  connected account (response shapes for Maps and Sheets are read defensively).
