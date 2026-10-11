# Pages: build contracts

Everything below is the agreed surface between the five parts of the Pages service. Change a contract here first, then the code. Shapes named in CamelCase (BrandKit, PageDoc, TrackBatch, …) are defined in `packages/backend/convex/pagesTypes.ts`; tables in `packages/backend/convex/schema.ts`. Read `docs/pages-plan.md` for intent.

## Parts and owners

| Part | Where | Depends on |
| --- | --- | --- |
| A. Backend | `packages/backend/convex/pages*.ts`, `http.ts` additions | schema, pagesTypes |
| B. Renderer + publish + tracker | `apps/web/src/components/pages/**`, `apps/web/src/app/p/**`, `apps/web/src/app/api/pages/track`, `proxy.ts` | A's query names below |
| C. Agent | `apps/agent/slice_pages/**`, routes added to `apps/agent/server.py` | A's HTTP routes + queries |
| D. Console | `apps/web/src/app/(app)/dashboard/pages/**`, `apps/web/src/components/console/pages/**`, `apps/web/src/app/api/pages/*` proxies | A, C |
| E. Demo brand sites | `apps/stores/src/app/(ridgeline|saltline)/**`, `packages/demo-catalogs/src/(ridgeline|saltline)` | nothing |

## Environment

| Where | Variable | Purpose |
| --- | --- | --- |
| `apps/web/.env.local` | `NEXT_PUBLIC_PAGES_HOST` | Base host for published pages, e.g. `pages.slice.example`. Dev default `pages.localhost:3000`. A page lives at `http(s)://{brandSlug}.{PAGES_HOST}/{pageSlug}` and always also at `/p/{brandSlug}/{pageSlug}` on the app itself. |
| `apps/web/.env.local` | `AGENT_URL` | Already exists; the `/api/pages/*` proxies use it. |
| `apps/agent/.env` | `FIRECRAWL_API_KEY` | Intake crawl of public sites. Optional: localhost URLs and missing key fall back to a direct fetch. |
| `apps/agent/.env` | `PEXELS_API_KEY` | Default imagery. |
| `apps/agent/.env` | `NANO_BANANA_2_MODEL` (default `gemini-3.1-flash-image`), `NANO_BANANA_PRO_MODEL` (default `gemini-3-pro-image`) | Image generation on Vertex via the existing genai client. |
| Convex env | `QLOO_API_KEY`, `QLOO_PROXY_SECRET` | Already set. The agent's Pages routes reuse `QLOO_PROXY_SECRET`. |

## A. Backend (Convex)

Module files and public functions. Args/returns in TypeScript; ids are Convex ids as strings. Every long-running action updates `status` + `progress` on its document so the console can subscribe instead of waiting.

### `pagesBrands.ts`

- `list` query `{}` → `Doc<"pagesBrands">[]` (newest first).
- `get` query `{ id }` → doc or null. `bySlug` query `{ slug }` → doc or null.
- `create` mutation `{ name, url, slug? }` → `{ id, slug }`. Slug derived from name, unique (`-2` suffix). Status `extracting`, progress `{0, "Starting"}`.
- `updateKit` mutation `{ id, kit }`, `updateBrief` mutation `{ id, brief }`, `rename` mutation `{ id, name }`, `remove` mutation `{ id }` (cascades audiences, uploads, members, pages, variants, builds, events, stats, forms, sessions).
- `qlooLookup` action `{ id }` → fills `qloo`: `/search` the brand name with `types=urn:entity:brand` (accept only name matches like `storeBrandAffinities` does); if matched, read the entity's tags (brand-domain types) and `similar_brands`; demographics via `urn:demographics` on the entity. If not matched, resolve up to 5 `brief.relatedBrands` plus LLM-free fallbacks (none), use them as `proxies`, and take tag insights on them. Writes `qloo`, appends spans to `trace`.
- Internal: `setProgress`, `setStatus`, `patch` (used by HTTP routes).

### `pagesAudiences.ts`

- `list` query `{ brandId }` → docs. `get` query `{ id }`.
- `create` mutation `{ brandId, name, kind, sources }` → `{ id }` (status `compiling`). Slug from name.
- `compile` action `{ id }`: builds `profile` (AudienceProfile) and marks `ready`. Per kind:
  - `location`: `entitiesForCity` for artist(8), movie(6), tv_show(4), book(4), `placesInCity`(8) (all in `qlooApi.ts`), with `signal.demographics.*` added when `sources.demographics` is set. Entities = those results. Tags: `tagInsightsByGroup(AESTHETIC_TAG_GROUPS)` + `tagInsights(CULTURAL_TAG_TYPES)` on the top ~12 entity ids. Brands: `brandInsights` with the city (vertical "retail"; keep the existing industry filter). Demographics: `demographicInsights`. geo = `[{name: city, count: 1, lat, lon}]` via `locateCity`.
  - `demographic`: same without a city; use `signal.demographics.age` / `.gender` on the insights calls (add an `extra` params arg where needed). Entities from `/v2/insights` per kind with the demographic signal only.
  - `interests`: `searchEntity` for each string (paced 120 ms, one retry), then tags/brands/demographics from those ids; culture = `entitiesFromSignals` per kind (artist, movie, place via `signal.interests.entities`), 6 each.
  - `csv` cluster: entities = the cluster's members' entities ranked by count (top 12 as signals); culture from the same entities grouped by type plus `entitiesFromSignals` for missing kinds; tags/brands/demographics on the top 12; geo = member cities counted (top 8), located via `locateCity` for the top 3.
  - `lead`: one member's entities; everything else like `interests`.
  - `default`: the brand's own Qloo read (`pagesBrands.qloo`) turned into a profile (its tags, similar brands as brands, no culture).
  `size`: members for csv/lead, else an estimate: 1 for lead, `0` for default, and for location use `Math.round(40000 + hash(city) % 60000)` labelled as an estimate in the UI (no real reach data).
- `remove` mutation `{ id }`.
- Internal: `setProfile`, `setBrief` (called by the HTTP route the agent uses), `setProgress`.

### `pagesUploads.ts` (CSV)

- `create` mutation `{ brandId, filename, columns, rows: Record<string,string>[], mapping }` → `{ id }`. Rows are inserted as `pagesMembers` in chunks (the mutation takes ≤ 200 rows; the client calls `appendRows` for the rest). `appendRows` mutation `{ uploadId, rows }`.
- `suggestMapping` (pure helper, exported from `pagesCsv.ts`, also used by the console): guesses `mapping` from column names: taste = columns matching `/artist|band|music|film|movie|show|brand|place|restaurant|interest|like|favou?rite|podcast|book/i`; city/country/age/gender/id/name by name.
- `process` action `{ uploadId, k? }`:
  1. `resolving`: collect unique taste terms across members (split on `;` `,` `|`), `searchEntity` each (no type filter; paced 120 ms, retry once on 429; cache makes repeats free). Progress = resolved/unique. Keep terms that resolved; store per member `entities`.
  2. `clustering`: one-hot entity matrix (unique entities as dims, weight 1; plus city one-hot at weight 0.5 and age bucket at 0.5), k-means with k = provided or chosen by silhouette over 2..4 (deterministic seed), min cluster size 5% of rows else merge into nearest. Name clusters later (agent); set `clusters[]` with `topEntities` = entities over-represented vs the whole upload (lift), top 6 names, provisional name `Cluster 1..k`.
  3. For each cluster: `pagesAudiences.create` with kind `csv`, `sources.uploadId/cluster`, provisional name, then `compile`.
  Marks `ready`. Trace spans for each step.
- `members` query `{ uploadId, cluster?, take? }` → members. `list` query `{ brandId }`.
- `createLead` mutation `{ memberId }` → creates a one-member audience (kind `lead`), sets `leadAudienceId`, returns `{ audienceId }`; the console then calls `compile`.

### `pages.ts` (pages, variants, builds)

- `list` query `{ brandId }` → pages with variant counts and status. `get` query `{ id }` → `{ page, variants, audiences }`. `bySlug` query `{ brandSlug, pageSlug }` → `{ brand, page, variants, audiences }` or null (used by the renderer; include the brand kit).
- `create` mutation `{ brandId, title, slug?, brief, audienceIds }` → `{ id }`. Creates one `pagesVariants` row per audience (name = audience name, status `building`, version 0) plus a default variant (audienceId unset, name "Default"), sets `defaultVariantId`, routing = `DEFAULT_ROUTING`.
- `updateBrief` mutation, `setAudiences` mutation `{ id, audienceIds }` (adds/removes variants to match), `setRouting` mutation `{ id, routing }`.
- `publish` mutation `{ id }` → status `published`, `publishedAt`, and `quiz` generated: 3 questions ("What's on repeat?", "A place you'd book", "A brand you trust") whose options are drawn from each audience's `profile.culture.artists / places` and `profile.brands` (one option per audience per question, `votes: { [audienceId]: 1 }`). `unpublish` mutation.
- `variant` query `{ id }` → doc. `saveVariant` mutation `{ id, doc, trace?, status? }` (validates with `validateDoc`; bumps `version`). `resetVariant` mutation `{ id }` (status `building`, keeps doc).
- `build` query `{ pageId }` → `pagesBuilds` doc. Internal `appendBuild` mutation `{ pageId, messages }`.
- `remove` mutation `{ id }` (cascades).
- `resolveVariant` query `{ brandSlug, pageSlug, param?, lead?, utm?, city?, country?, cookieAudienceId?, quizAudienceId? }` → `{ variantId, audienceId?, resolvedBy }`: order param → lead (member.leadAudienceId, else the member's cluster audience) → utm rules → quiz → cookie → geo (case-insensitive match of city, then country, against `location` audiences that belong to this page) → default. Only variants with status `ready` are eligible; otherwise fall through to default.

### `pagesEvents.ts` (analytics)

- `ingest` mutation `{ batch: TrackBatch, device, browser, os, country?, region?, city?, source, referrerHost? }` → null. Inserts one `pagesEvents` row per event, upserts `pagesSessions` (new session ⇒ sessions+1; new visitor for the page/day ⇒ visitors+1, approximated by "first session of this visitor today"), and upserts the `pagesStats` row for (variant, day, hour): `views` on pageview, `clicks` on click, `ctaClicks` on cta_click, `formSubmits`, `engagedMs += value` on heartbeat, `scrollSum/scrollN` on scroll, `bySection[sectionId].seen/clicks`, and the `by*` maps on pageview. `form_submit` also inserts `pagesForms`.
- `stats` query `{ pageId, from, to }` → `{ variants: { variantId, name, audienceId?, views, sessions, visitors, ctaRate, clickRate, avgEngagedMs, avgScroll, formRate, formSubmits }[], series: { day, hour, variantId, views, sessions, ctaClicks }[], byDevice, byBrowser, byCountry, bySource, byResolvedBy, hourly: number[24][7] }` (sum of pagesStats in range).
- `heatmap` query `{ variantId, from, to }` → `{ points: { sectionId, x, y }[], sections: Record<sectionId, { seen, clicks }> }` from click events (cap 5000).
- `forms` query `{ pageId, take? }` → `pagesForms[]` newest first.
- `recent` query `{ pageId, take? }` → last events (for a live feed).
- `brandOverview` query `{ brandId, days }` → per page: views, sessions, ctaRate, top variant.

### `pagesSeed.ts`

- `simulateTraffic` internalAction `{ pageId, days, sessionsPerDay, weights?: Record<variantId, number> }`: generates realistic sessions over the last `days` (weekday/hour curves, device mix 55/40/5, browsers, countries weighted toward each variant's audience geo, sources, scroll depths, 0–3 clicks with CTA probability differing per variant so there is a winner, occasional form submits) and calls `ingest` for each. Used by the demo seed; deterministic seed arg.

### HTTP routes (`http.ts`, all `Authorization: Bearer ${QLOO_PROXY_SECRET}`)

- `POST /pages/brand` `{ brandId, patch: { status?, progress?, kit?, brief?, screenshot?, crawled?, error?, spans?: Span[] } }` → appends spans, patches fields.
- `POST /pages/audience` `{ audienceId, patch: { name?, brief?, status?, progress?, spans? } }`.
- `POST /pages/upload` `{ uploadId, patch: { clusters?, status?, progress?, spans? } }` (the agent names clusters).
- `POST /pages/variant` `{ variantId, patch: { doc?, status?, error?, spans?, name? } }` → validates doc, bumps version.
- `POST /pages/build` `{ pageId, messages }` → appends to `pagesBuilds`.
- `POST /pages/file` raw body with `Content-Type` image/*, query `?brandId=` → `{ url }` (Convex storage; `ctx.storage.store` + `getUrl`).
- Existing `POST /qloo` stays the agent's Qloo path.

## B. Renderer, publishing, tracker (apps/web)

- Components in `src/components/pages/sections/*.tsx`, one per Section type, plus `render-doc.tsx` (`<PageRenderer brand kit doc variantId pageId trackingMeta />`) and `theme.ts` (kit → CSS variables on a wrapper: `--pg-bg, --pg-fg, --pg-primary, --pg-primary-fg, --pg-accent, --pg-muted, --pg-surface, --pg-radius, --pg-font-heading, --pg-font-body`, density spacing scale). Google Fonts loaded with a `<link>` built from the kit. Everything scoped under `.pg-root`; no shadcn here; Tailwind utilities plus the variables. Sections must look like a professional brand's landing page, not a template: generous type scale, real image treatment, hover states, mobile first.
- Route `src/app/p/[brand]/[slug]/page.tsx`: server component, `fetchQuery(api.pages.bySlug)` then `fetchQuery(api.pages.resolveVariant, {...})` using `searchParams` (`a`, `g`, `utm_*`, `city` override), cookies (`pg_aud_<pageId>`), and headers (`x-vercel-ip-city`, `x-vercel-ip-country`). Sets the cookie via a client component after the first render. Renders `PageRenderer`. `generateMetadata` from `doc.meta`. Draft pages render only with `?preview=1` (resolvedBy `preview`), and `?v=<variantId>` forces a variant for the console preview.
- Quiz: when `resolvedBy === "default"` and `page.quiz` exists and the visitor has no cookie, render a slim quiz bar (`quiz-bar.tsx`) above the hero: three questions, one tap each; on finish compute the winning audience, set the cookie, `router.refresh()` so the server re-resolves with `quizAudienceId` from the cookie (cookie value `audienceId:quiz`). Sends `quiz_answer` events.
- Host routing in `src/proxy.ts`: before Clerk, if `host` ends with `.${PAGES_HOST}` (strip port) and the first label is the brand slug, rewrite `/{slug}` (and `/`) to `/p/{brand}/{slug}` (or `/p/{brand}` for an index listing published pages). `/p` and `/api/pages/track` are excluded from Clerk protection.
- Tracker `src/components/pages/tracker.tsx` (client, inlined; no separate app): visitorId in `localStorage` (`pg_vid`), sessionId in `sessionStorage` with 30-minute idle refresh, batches events every 4 s and on `visibilitychange`/`pagehide` via `navigator.sendBeacon` to `/api/pages/track`. Captures: pageview (with utm, referrer, screen), heartbeat every 5 s while visible and active (value = ms), scroll depth max (value 0..1, sent on change ≥ 0.1), section_seen (IntersectionObserver ≥ 50 %), click (nearest `[data-section]`, normalised x/y within the section, label = text ≤ 60 chars, href), cta_click (elements with `data-cta`), form_submit (fields), outbound (external hrefs). Sections render `data-section={id}`; CTAs render `data-cta={track ?? label}`.
- `src/app/api/pages/track/route.ts`: parses UA (small hand-written parser for device/browser/os; no new dependency), geo from Vercel headers (`?city=` is not available here, so the tracker includes `city/country` overrides from the page's `searchParams` in its batch when present), source classification from utm/referrer (`gclid` or `utm_medium=cpc` ⇒ ads; `utm_medium=email` ⇒ email; `utm_source=qr` ⇒ qr; social hosts ⇒ social; search engines ⇒ search; else referral/direct), then `fetchMutation(api.pagesEvents.ingest)`.
- Forms: `form` section posts to `/api/pages/form` which calls `ingest` with a `form_submit` event (same batch shape), then shows `success`.
- `PageRenderer` must also work inside the console preview iframe (`/p/...?v=&preview=1`), where the tracker is disabled.

## C. Agent (apps/agent)

New package `slice_pages/` beside `slice_agent/`, routes registered in `server.py`. All LLM calls use the existing genai client pattern (`brief.py`). Every route streams NDJSON events `{type: "status", text}`, `{type: "span", span}`, `{type: "error", message}`, `{type: "done", ...}` unless noted. Spans use `slice_agent.trace`.

- `POST /pages/intake` `{ brand_id, url }` (stream). Steps, each written to Convex via `POST /pages/brand` so the console follows along:
  1. Fetch: Firecrawl v2 `/v2/scrape` with `formats: ["markdown", "html", "links", "screenshot", "branding"]` for the start URL; then `/v2/map` (or the `links` of the first page) to pick up to 7 more same-host pages preferring `/about`, `/products|/shop|/collections|/rooms|/menu|/coffee|/hotels`, `/locations|/contact|/visit`, `/journal|/blog`, `/subscriptions|/offers|/experiences`. Localhost URLs or no key ⇒ direct `httpx` fetch of the same pages, markdown via a light HTML-to-text pass.
  2. Deterministic extraction from the HTML/CSS: logo (`og:image`, `link rel=icon`, `img[src|alt*=logo]`, header svg), colours (CSS custom properties, `theme-color`, hex/rgb frequency in inline + linked stylesheets fetched same-host; pick background, foreground, primary = most-used saturated colour on buttons/links, accent), fonts (`fonts.googleapis.com` families, `@font-face`, `font-family` declarations by frequency; map to heading/body), radius from `border-radius` frequency, button style, uppercase labels. Firecrawl `branding` output, when present, overrides the colour/font guesses.
  3. LLM (Gemini, JSON schema): given the markdown of all pages + the extracted candidates ⇒ `BrandKit` (voice, imagery, final colour roles, density) and `BrandBrief` (summary, categories, positioning, audience, proof, ctas, locations, items ≤ 24 with kinds/prices/images/urls from JSON-LD Product or the page text, relatedBrands). Image URLs made absolute.
  4. Write kit + brief + screenshot + crawled, status `review`. Then call Convex action `pagesBrands:qlooLookup` through `convex.action(...)`.
  Progress labels: "Reading the homepage", "Following 6 links", "Reading colours and type", "Writing the brand brief", "Asking Qloo about the brand".
- `POST /pages/audience-brief` `{ audience_id }` → `{ ok, brief }`. Reads the audience + brand (`pagesAudiences:get`, `pagesBrands:get`), writes `AudienceBrief` via `POST /pages/audience`. For csv clusters also proposes a 2–4 word `name` (patch `name`) when the current name starts with "Cluster".
- `POST /pages/name-clusters` `{ upload_id }` → names clusters from their topEntities and member stats; patches `/pages/upload` and each audience's name.
- `POST /pages/build` `{ page_id, variant_id, message?, kind: "generate" | "edit", history?: [...] }` (stream). ADK `LlmAgent` ("slice_pages_builder", `gemini-3.8-flash`) with state {brand, kit, brief, page, audience (profile + brief), current doc}. Tools:
  - `get_audience_detail()`: full profile (tags by type, brands with style words, culture lists with images, geo, demographics, brief).
  - `qloo_places(city, kind="restaurant"|"cafe"|"bar"|"gallery"|"park", take=6)`: via `convex.qloo("/v2/insights", {...filter.location.query, filter.tags})`; returns names, addresses, images.
  - `qloo_culture(kind, take)`: artists/films/books for the audience's signals via `signal.interests.entities`.
  - `pick_items(n)`: ranks `brief.items` for the audience using the audience brief's item reasons first, then tag/keyword overlap; returns items with images.
  - `search_images(query, orientation, take=4)`: Pexels search; returns `ImageRef[]` with `source: "pexels"`, credit = photographer.
  - `generate_image(prompt, aspect="16:9"|"4:5"|"1:1", model="nano-banana-2"|"nano-banana-pro")`: genai `generate_content` with the configured model and `response_modalities=["IMAGE"]`, upload bytes to `POST /pages/file`, return `ImageRef` with `source: "generated"`, `prompt`. Only when `page.brief.imageMode` is not `pexels` or the merchant asks.
  - `fetch_reference(url)`: Firecrawl/direct fetch → a 200-word description of layout, section order and tone.
  - `describe_image(url)`: Gemini vision → art-direction notes.
  - `write_page(doc)`: validates (same rules as `validateDoc`: ids unique, required fields), saves via `POST /pages/variant` with `status: "ready"` and the turn's spans, stores in state. Returns problems if invalid.
  - `patch_section(section_id, props)` / `insert_section(index, section)` / `remove_section(section_id)` / `reorder(ids)`: edit the current doc and save.
  Streamed events add `{type: "doc", doc}` whenever the doc changes (so the preview updates live), `{type: "text", delta}`, `{type: "text_done", text}`, `{type: "done", messageId, text, trace}`. On `generate`, the instruction demands: 6–9 sections, hero first, a `culture` or `locations` section whenever the audience has culture/geo, a `grid` of the picked items, a `form` when the goal is waitlist/booking, a `cta` last; every section's `evidence` cites the Qloo tags/brands/entities that drove it; copy in the brand voice; headline angle from emotional_tone/core_values tags; imagery direction from personal_style/aesthetic tags; items reordered by taste fit; no "bestseller/trending/popular" framing (taste is additive, see repo rules); no em dashes; sentence case. Images: Pexels unless the page's imageMode says otherwise; one `generate_image` for the hero when it does. Persist the merchant message and the reply to `POST /pages/build`.
- `POST /pages/image` `{ brand_id, prompt?, query?, model: "pexels"|"nano-banana-2"|"nano-banana-pro", aspect? }` → `{ images: ImageRef[] }` for the console's image picker.
- `GET /health` unchanged.

## D. Console (apps/web, `/dashboard/pages`)

Stock shadcn, Inter, no sparkles icon, no "coming soon" left anywhere for Pages; set `available: true` for Pages in `src/lib/services.ts`. Data via Convex React hooks (`useQuery`/`useMutation`/`useAction` from `convex/react`, `api` from `@slice/backend/convex/_generated/api`). Proxies to the agent in `src/app/api/pages/{intake,build,audience-brief,name-clusters,image}/route.ts` (same pattern as `api/concierge/route.ts`).

- `/dashboard/pages`: brand cards (name, url, favicon/logo, pages count, 7-day views, status) + "New brand". Empty state explains the flow.
- `/dashboard/pages/new`: URL + name form → `pagesBrands.create` → POST `/api/pages/intake` → live progress screen that subscribes to the brand doc (steps with the progress label, spans as they arrive) → kit review: palette swatches (editable hex), fonts (editable family, preview text), logo (replaceable by URL), radius/density/button style, voice; brief (editable summary, items list with images, proof, locations); "What Qloo knows" card (matched entity or proxies, tags by type as chips, similar brands with images, demographics bars). Save ⇒ status `ready`, go to the brand hub.
- `/dashboard/pages/[brand]` layout: sidebar like the concierge console (`WidgetSidebar` pattern; brand switcher at top): Overview, Audiences, Pages, Analytics, Brand kit, Settings.
  - Overview: pages table with views/CTA rate/top variant (`brandOverview`), audiences count, kit summary, quick actions.
  - Audiences: cards (name, kind badge, size, demographics mini bars, top tags chips, top culture refs with images, brief summary) + "New audience" sheet with tabs: Location (city, optional age/gender), Demographics, Interests (chips input), Upload CSV (file → parse client-side with a small CSV parser → column mapping UI prefilled by `suggestMapping` → `pagesUploads.create/appendRows` → `process`; progress; clusters appear as audiences), Connect CRM (HubSpot, Salesforce, Klaviyo, Shopify cards marked "Soon", disabled). Audience detail drawer: full profile, culture lists, geo list, brief, trace (reuse the trace/waterfall look from the concierge console if easy), members table for csv clusters with "Personal link" action (`createLead` + compile).
  - Pages: list + "New page" dialog (title, goal select, prompt textarea, offer, CTA label+href, items multi-select from the brief, facts, reference URLs, inspiration image URLs, image mode select: Pexels / Nano Banana 2 / Nano Banana Pro, audiences multi-select) → `pages.create` → open the builder.
  - `/dashboard/pages/[brand]/[page]` builder: left column chat (messages from `pagesBuilds` + streaming reply; status line and spans like the concierge "How I chose these"), right column preview: variant tabs (Default + one per audience, status dot), device toggle (desktop/mobile widths), iframe to `/p/{brand}/{page}?v={variantId}&preview=1` that reloads on `doc` events, "Why this version" side panel listing sections with their `evidence`, and an image tool: pick a section image → Pexels search / describe + generate (model select) / paste URL → `patch_section` through the build endpoint with `kind: "edit"` and a structured message. Buttons: "Generate all variants" (sequential `kind: "generate"` per variant), "Regenerate this variant", "Publish" (→ `pages.publish`; shows the public URL `https://{brand}.{PAGES_HOST}/{slug}`, per-variant links `?a=<audienceSlug>`, QR code rendered as SVG for the OOH scenario, UTM rule editor), "Analytics" tab.
  - Analytics (per page): range picker (7/14/30 days), variant comparison table (views, sessions, CTA rate, avg engaged time, avg scroll, form rate, lift vs default), time series (recharts, one line per variant), hourly grid (7×24 heat cells), breakdowns (device, browser, country, source, resolved-by), click heat map: the variant preview iframe with an overlay canvas drawing `heatmap` points per section (sections' bounding boxes measured via `postMessage` from the preview, or approximate with equal bands if the message is not available), section funnel (seen → clicked), form submissions table with CSV export, live feed of recent events. Follow the `dataviz` skill for colours.
  - Brand kit: the same review editor as onboarding.
  - Settings: slug, domain preview, delete brand.

## E. Demo brand sites (apps/stores)

Two ordinary, professional B2C sites the intake is tested against, at `/ridgeline` and `/saltline` on :3002 (same app as Marlow and Fold). Each must be extraction-friendly the way real sites are: Google Fonts via `<link href="https://fonts.googleapis.com/css2?...">` in the route group layout (not `next/font`, which obfuscates family names), colours as `:root`-level CSS custom properties with hex values and a `<meta name="theme-color">`, an SVG logo in the header with `alt` containing the brand name plus `og:image`, `Organization` JSON-LD on the home page and `Product` JSON-LD on item pages (JSON-LD helper exists in `src/components/product-json-ld.tsx`), clear `/about` copy, a `/locations` page with addresses. Item data lives in `packages/demo-catalogs/src/ridgeline/*.json` and `src/saltline/*.json` in the existing Product shape (so `pnpm fetch-images ridgeline` works); see `docs/pages-plan.md` §5 for the brands, pages and style directions. Scale: Ridgeline 12 coffees, 3 plans, 4 gift sets, 3 cafés; Saltline 3 hotels × 4 room tiers, 12 experiences, 4 offers. Both sites include the `slice.js` script tag like Marlow does (harmless) and respect the store-design feedback: readable sans/serif, sentence case, no editorial gimmicks.

## Integration (after A–E)

`packages/demo-data/`: `ridgeline-customers.csv` (~450 rows) and `saltline-guests.csv` (~400 rows) generated by `scripts/generate.ts` with the latent groups from the plan, using only real, well-known names for taste columns (artists, films, brands, restaurants) so Qloo resolves them; `scripts/seed-demo.ts` drives the real pipeline end to end (create brands from the local sites, compile audiences, upload CSVs, create pages, generate variants through the agent, publish, simulate traffic) and prints the judge URLs; `docs/pages-demo.md` is the judge script.
