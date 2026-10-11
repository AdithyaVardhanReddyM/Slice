# Pages: plan

Pages is the second Slice service: landing pages a B2C brand builds with an agent, one version per audience, published on a Slice subdomain, measured with first-party analytics. Qloo is load-bearing at two points: it turns an audience definition (a city, a demographic, a CSV of customers) into a taste profile, and the builder reads that profile to decide what each version says, shows and features.

What we take from the three Qloo stories and from Genpage:

| Source | Lesson for Pages |
| --- | --- |
| Michelin / Tablet Hotels | Personalise against two profiles at once: the visitor's taste and the thing being sold (hotel style, product line). Cross-domain hooks (music, film, dining) make a page feel made for someone. |
| Jewelry brand | A brand's own customer records are the richest input. Enrich each record with Qloo, cluster into audiences, find lookalikes and where affinity is geographically strong. |
| JCDecaux | Location alone is a valid audience. City (down to block) taste drives what to show and when. Heat maps sell the idea to non-technical people. |
| Genpage | Confirms the product shape (brand kit → generate per segment → host → analytics → compare). They serve B2B intent (account, keyword, ad). We serve B2C taste, which they cannot do without a taste graph. |

## 1. Pipeline

```
Brand URL ──▶ Brand intake ──▶ Brand kit + brand brief + Qloo view of the brand
                                        │
Audience sources ──▶ Audience compiler ─┼──▶ Audience cards (taste profile + brief)
(location, demographics,                │
 interests, CSV, CRM)                   ▼
                              Page brief + Builder agent ──▶ Page doc + one variant per audience
                                        │
                                        ▼
                      Publish on {brand}.slice.page/{slug} ──▶ variant router (param, UTM, geo, quiz, cookie)
                                        │
                                        ▼
                      Tracker ──▶ events ──▶ rollups ──▶ per-page analytics, variant comparison
```

### 1.1 Brand intake

Input: a URL. Output: a reviewable **brand kit**, a **brand brief**, and **what Qloo knows about the brand**.

- Crawl the homepage plus up to ~8 linked pages (about, products/collections, locations, journal). Keep HTML, computed styles, and a full-page screenshot (Playwright in a Convex action is awkward; run intake as a Next.js route handler or a small Node job, store results in Convex).
- **Design system extraction**, deterministic first, LLM second:
  - Logo: `og:image`, `link rel=icon`, `<img>` whose src/alt contains logo, SVG in the header.
  - Colours: CSS custom properties, `theme-color`, computed background/foreground of body, header, primary buttons, links. Cluster to a palette with roles (background, ink, primary, accent, muted).
  - Type: Google Fonts links, `@font-face`, computed `font-family` and weights on h1, h2, body, buttons. Map unknown proprietary fonts to a close Google font.
  - Shape and density: button radius, card radius, border usage, section spacing, max content width, image treatment (photo vs illustration, aspect ratios, corner radius).
  - Voice: LLM reads the copy and writes a 3-line voice guide (register, sentence length, words they use, words they avoid).
- **Brand brief**: what they sell, categories and price positioning, who they appear to sell to, proof points (press, reviews, numbers), existing CTAs, locations, products found via JSON-LD or sitemap. Stored as structured JSON the agent reads.
- **Qloo view of the brand**: `/search` for the brand entity (name-match guard as in `qlooApi.storeBrandAffinities`). If found: its `personal_style`, `lifestyle`, `emotional_tone`, `similar_brands`, and audience demographics via `urn:demographics`. If not found (most small brands): use the similar, known brands the LLM names from the brief, resolve those, and show "brands your customers also love". This is the first wow screen and the default audience.
- Everything is editable in the console (swap a colour, upload the real logo, fix the tagline). Extraction will be wrong sometimes; the review step is the product, not a fallback.

### 1.2 Audiences

The single abstraction is the **Audience**: a named group with a Qloo taste profile, the same shape the concierge already stores (`tags`, `brands`, `entities`, `demographics`) plus geo and a written brief. A page variant is always page × audience. Per customer, per group and per location are not separate modes; they are different ways to define an audience:

| Source | How it becomes a profile | Qloo calls |
| --- | --- | --- |
| **Location** ("people in Austin") | City taste: top artists, films, places, brands and tags for that geo, optionally filtered by age/gender | `signal.location.query`, `signal.demographics.*`, `filter.type=urn:tag` per tag group, brands filtered by industry |
| **Demographics** (age bucket, gender) | Taste skew for the bucket | `signal.demographics.age/gender` on tag and brand insights |
| **Interests** (free text or picked entities: "likes Bon Iver, Aesop, Wes Anderson") | Resolve to entities, cross-domain read | `/search`, then the same profile build as `taste:build` |
| **Customer CSV** | Per row: resolve taste-bearing columns to entities, build a profile; then cluster rows into 2 to 4 audiences; each cluster gets a profile from its centroid entities | Same as above, batched and cached; `urn:demographics` for skew; geo affinity heat from the rows' cities |
| **CRM connector** (HubSpot, Salesforce, Klaviyo, Shopify customers) | Maps to the CSV schema | Same as CSV |
| **Lookalike** | From the brand's best customers' profile, ask where affinity is strong and which cities to expand to | Brand/tag insights with `filter.location.query` per candidate city, ranked |
| **Audience of one** (a lead or a past guest) | One CSV row, used for personal links in email | Same as a row |

CSV schema (columns optional; anything taste-bearing gets resolved): `id, email, first_name, city, region, country, age, gender, joined_at, orders, ltv, last_order_at, items (semicolon list of SKUs or names), liked (wishlist/cart), favourite_brands, favourite_artists, favourite_films, favourite_places, interests (free text), segment`. We publish this template like the catalog CSV.

Clustering: build a tag vector per row from its Qloo tags (slug-keyed, rank-weighted), k-means with k chosen by silhouette in 2..4, then an LLM names each cluster and writes its brief from the centroid's tags, brands, demographics and top cities. Deterministic enough to repeat, explainable enough to show.

The **audience card** shows: name, size, demographics skew, geo (cities, with a heat map when there are rows), top tags per type, brand affinities, cultural references (artists, films, places), and the brief: how to speak to them, imagery direction, what to lead with, what to avoid. Cards are reusable across pages and this is where Qloo is visible to a judge before any page exists.

### 1.3 Page brief and the builder agent

A **Page** has a brief: goal (launch, sale, subscription, waitlist, booking), offer, primary CTA, products or items to feature, must-include facts, reference sites or inspiration images, and the list of audiences. The agent builds one **variant** per audience plus a default.

Representation decision: pages are a **structured document of sections**, not free-form code. Each section has a type from our library, props, and a Qloo-evidence note. The library covers what a landing page needs: hero, split feature, product grid, story/editorial, gallery, testimonial, stats band, FAQ, pricing/offer, map/locations, playlist or culture strip, form, CTA band, footer. One `custom` type accepts constrained HTML/Tailwind for things the library lacks.

Why structured over Lovable-style codegen: variants become diffs of props (headline, image, featured items, section order), so five versions stay consistent; analytics attaches to sections and CTAs for free; theming through brand tokens is reliable; click-to-edit in the console is possible; rendering is safe and fast. The chat still feels like a builder ("make the hero moodier", "add a section about the Austin café", "use this site's layout"); the agent edits the document.

Agent (Python ADK, same stack as the concierge) tools:

- `get_brand(kit, brief)`, `get_audience(id)` (profile + brief), `compare_audiences(a, b)` (what differs, so variants differ where it matters).
- `qloo_insights(audience, kind)` for live detail: artists, films, places near a geo, brands, tags by type; `qloo_geo_places(city, tags)` for local sections.
- `pick_items(audience, items)` ranks the brand's products/rooms/offers for an audience with the `productTaste` approach if a catalog exists, else by LLM against the profile.
- `fetch_reference(url)` reads layout and style of a reference site; `read_inspiration(image)` describes an inspo image into layout and art-direction notes.
- `generate_image(prompt, direction)` for heroes (Imagen on Vertex; Pexels fallback via the existing fetcher for demo speed), always constrained by the brand kit's image treatment.
- `write_page(doc)`, `patch_section(variantId, sectionId, props)`, `reorder_sections`.

Every variant records a trace (which Qloo results drove which choice) shown in the console as "Why this version", the same pattern as the concierge's "How I chose these". The explicit personalisation levers, so judges can see them side by side:

1. Headline angle from `emotional_tone` and `core_values` tags.
2. Imagery direction from `personal_style` / aesthetic tags (muted and minimal vs bold and saturated), applied through the brand's own palette and type.
3. Cultural hooks: artists, films, places and brands the audience loves, used in a culture strip, a playlist, social proof, or copy references.
4. Featured items reordered by taste match.
5. Local section for geo audiences: neighbourhood, nearby places from Qloo, local delivery or opening details.
6. Copy tone and length from `lifestyle` tags and the demographics skew.
7. Offer framing (price-led vs craft-led vs convenience-led) from the brief.

### 1.4 Publishing and variant routing

- URL scheme: `{brand}.slice.page/{slug}` (wildcard DNS, one subdomain per brand, path per page). Locally `{brand}.localhost:3000` resolves in Chrome without hosts edits. Custom domains (CNAME) later; keep the field in settings.
- Rendering: a `pages` route in `apps/web` reads host and path, resolves the variant, renders the section document server-side with the brand's theme tokens. Cache per (page, variant).
- Variant resolution order: explicit `?a=<audience>` or `?g=<lead token>` from campaign links; UTM rules set on the page; geo from edge headers (`x-vercel-ip-city`, `?city=` override for local testing); cookie from a previous visit; on-page taste quiz (three questions, the concierge's questionnaire in miniature) that maps to the nearest audience; otherwise the default variant. The resolution is recorded on the pageview so analytics can show "who showed up".
- Merchant preview: "view as" switcher over variants, device toggle, share link per variant.

### 1.5 Analytics

A small first-party tracker is injected into every published page. Events: pageview (with resolved variant, how it was resolved, UTM, referrer class, country/region/city from edge headers, device/browser/OS from UA), session start/heartbeat (engaged time counted while visible and active), scroll depth, section seen (IntersectionObserver with section ids), click (section id, element kind, CTA label, href, normalised x/y for heat maps), form submit (payload stored), outbound click.

Storage: `pageEvents` raw, rolled up by a scheduled Convex function into `pageStats` per (page, variant, day, hour) with counts and breakdown maps. Dashboard per page:

- Variant comparison: visitors, views, CTA click rate, engaged time, scroll depth, form rate, with lift vs the default. This is the screen the whole service exists for.
- Time series with range picker; hourly activity grid.
- Breakdowns: device, browser, country/city, source (UTM, referrer class).
- Click heat map over the variant's screenshot (normalised coordinates per section, so it survives viewport differences).
- Section funnel: seen → engaged → clicked, per section.
- Form submissions table with CSV export.
- Audience fit: which audience each visitor resolved to vs where visitors actually came from, so a geo variant that no one from that geo sees is obvious.

For the demo a **traffic simulator** seeds realistic events per variant so dashboards are populated on day one; real judge visits land on top.

## 2. Data model (Convex, independent of concierge tables)

- `pageBrands`: console client of the Pages service. `slug, name, url, kit (colours, fonts, logo, shape, imagery, voice), brief, qloo (entityId, tags, similarBrands, demographics), status, createdAt`.
- `audiences`: `brandId, name, sources[] (type + params), profile (tags, brands, entities, demographics, geo), brief, size, trace, createdAt`.
- `audienceMembers`: one per CSV row. `audienceId?, brandId, uploadId, row (raw), entities[], tags[], cluster`.
- `pages`: `brandId, slug, title, brief, status (draft, published), defaultVariantId, routingRules, publishedAt`.
- `pageVariants`: `pageId, audienceId?, doc (sections), theme overrides, screenshot, trace, version`.
- `pageBuilds`: builder chat per page (messages, tool traces), like `conversations`.
- `pageEvents`, `pageStats`, `formSubmissions`.
- `connectors`: brandId, provider, status (stubs with real UI; CSV is the working path for the hackathon).

## 3. Console IA

- `/dashboard/pages`: list of brands (clients of this service). `/dashboard/pages/new`: URL → intake progress → kit review → Qloo view of the brand.
- `/dashboard/pages/[brand]`: Overview (pages, traffic, top variant), **Brand kit**, **Audiences** (cards, new audience wizard: location / demographics / interests / upload CSV / connect CRM), **Pages**, **Analytics** (across pages), Settings (domain, tracker, team).
- `/dashboard/pages/[brand]/[page]`: **Build** (chat on the left, live preview on the right with variant tabs and device toggle, section inspector), **Analytics** (the comparison screen), **Publish** (routing rules, links per variant, QR for OOH).

Design rules from memory still hold: stock shadcn, Inter, no sparkles icon, no anti-bestseller framing.

## 4. Build order

| Phase | What | Where |
| --- | --- | --- |
| P0 | Schema, brand intake job (crawl, extract, screenshot, LLM brief), Qloo brand lookup, kit review UI | `packages/backend/convex/pages*.ts`, `apps/web/src/app/api/pages/intake`, `/dashboard/pages/new` |
| P1 | Audience compiler (location, demographics, interests, CSV upload + clustering), audience cards, CSV template, connector stubs | `convex/audiences.ts`, reuse `qlooApi.ts`, `tasteHints.ts`; `/dashboard/pages/[brand]/audiences` |
| P2 | Section schema + renderer + theme tokens, section library, published route on wildcard host, variant router, preview | `apps/web/src/components/pages/sections/*`, `apps/web/src/app/p/...` behind host middleware |
| P3 | Builder agent: tools, streaming, chat UI with live preview, reference site and inspo image ingestion, image generation, "Why this version" trace | `apps/agent/slice_pages/*`, `/dashboard/pages/[brand]/[page]` |
| P4 | Tracker script, event ingest, rollups, analytics screens, click heat map, traffic simulator | `apps/widget` sibling `apps/tracker` or a static script served by web; `convex/pageEvents.ts`, `pageStats.ts` |
| P5 | Demo: two brand sites, their datasets, seeded brands, audiences, variants and traffic; judge script | `apps/stores/src/app/(ridgeline|saltline)`, `packages/demo-data`, `docs/pages-demo.md` |

Risks and how we hold them: Qloo rate limits (everything through the cache, warm list extended with the demo requests); extraction errors (review step, manual overrides); geo locally (`?city=` override); image generation latency and cost (pre-generate for demo variants, Pexels fallback); wildcard host in production (Vercel wildcard domain, one env var for the base).

## 5. Demo businesses

Two fake B2C brands, chosen so the targeting dimensions differ and neither is a storefront clone of Marlow or Fold. Both get an ordinary, professional "original" website in `apps/stores` (that is what intake crawls), a customer dataset, and scripted targeting scenarios with expected differences between variants.

### 5.1 Ridgeline Coffee Roasters

Everyday consumer brand. Specialty roaster from Portland, OR: subscriptions and bags online, cafés in Portland and Seattle, an Austin café opening next month. Site style: warm, modern craft (think Onyx, Blue Bottle): cream background, deep brown ink, a rust accent, a grotesk for UI and a serif for headlines, honest product photography. Pages on the original site: home, coffees (12 roasts: single origins, blends, decaf, instant sticks), subscriptions (3 plans), cafés (locations), about (sourcing), journal (3 posts), gift sets.

Dataset `ridgeline-customers.csv`, ~450 rows: `id, email, first_name, city, state, country, age, gender, joined_at, plan, orders, ltv, last_order_at, roasts_bought, brew_method, flavour_prefs, favourite_artists, favourite_brands, interests`. Taste columns come from Ridgeline's "brew playlist" signup question and a post-purchase survey, which is how a real roaster would plausibly have them. Distributions: 55% Portland/Seattle, 15% Bay Area, 10% Austin, rest scattered US; age 22 to 68 with two bumps (late 20s, early 50s); roughly four latent groups baked in so clustering has something to find:

1. **Third-wave light-roast crowd** (pour-over, single origins, indie folk and jazz, brands like Aesop, Patagonia, Monocle).
2. **Home espresso convenience** (blends, espresso machines, podcasts and pop, brands like Nespresso-adjacent, Lululemon, Apple).
3. **Gift buyers** (orders spike in November and December, gift sets, mixed tastes, older skew).
4. **Austin early adopters** (signed up through the Austin waitlist, local music, Tex-Mex and taco places, Yeti and Howler Brothers type brands).

Scenarios:

- **S1 Geo launch (JCDecaux-style)**: page "Austin café opening". Audiences: Austin locals from Qloo's view of Austin, Portland regulars as default. Expect: Austin variant leads with the neighbourhood and opening week, a culture strip of Austin artists and venues, warmer and brighter imagery, Texan brand co-affinities as social proof; Portland variant leads with "our third city", loyalty and subscription continuity.
- **S2 CSV clusters (jewelry-style)**: page "Holiday gifting". Upload the CSV, get three or four clusters, generate one variant each. Expect: light-roast crowd sees origin stories and a pour-over set; espresso crowd sees a blend bundle and "two minutes to a great shot"; gift buyers see a price-anchored gift guide with shipping deadlines. Compare in analytics after the simulator runs; the demo narrative is which variant won.
- **S3 Demographics**: page "Subscriptions" for 24 and younger vs 45 and older via Qloo demographic signals. Expect: instant sticks and cold brew with a playlist for the young variant, a slower, ritual-led story and a mug bundle for the older one.
- **S4 Campaign link**: Seattle OOH poster with a QR to `?a=seattle-commuter`. Shows the UTM/param routing path and the QR in the Publish tab.
- **S5 Lookalike (stretch)**: "Where next after Austin?" ranks candidate cities by affinity for Ridgeline's best customers' profile. An insight screen, not a page, if time allows.

### 5.2 Saltline Hotels

Travel, Qloo's strongest domain and the Michelin story. A small European boutique hotel group: Lisbon, Copenhagen and Barcelona open, Marseille opening next spring. Site style: quiet luxury (think Ace or The Hoxton without the irony): large photography, an editorial serif, generous whitespace, off-white, charcoal, a sea-glass accent, minimal UI. Original site pages: home, each hotel (rooms, 4 tiers; restaurant; neighbourhood), experiences (12 bookable: gallery walk, surf morning, natural wine dinner, market breakfast), offers, journal, about, a "plan your stay" enquiry form.

Dataset `saltline-guests.csv`, ~400 rows: `id, email, first_name, home_city, home_country, age, gender, party_type, property, nights, room_tier, spend, experiences_booked, dining_prefs, favourite_artists, favourite_films, favourite_places, interests, last_stay, newsletter`. Taste columns come from the pre-arrival "tell us what you love" questionnaire that boutique hotels actually send. Home cities: London 30%, New York 20%, Berlin 15%, Paris 15%, rest Amsterdam, Stockholm, Dublin, Milan. Three latent groups: **design and culture** (galleries, architecture, art-house film, Scandinavian and Japanese brands), **food and wine** (chef's tables, natural wine, market tours, food film and travel TV), **slow travel couples and families** (longer stays, suites, surf and nature, calmer music, outdoor brands).

Scenarios:

- **S1 Origin-market variants (Michelin-style)**: page "Saltline Lisbon". Audiences: Londoners, New Yorkers, Berliners, each from Qloo's view of their city. Expect: different neighbourhood guides and restaurant picks near the hotel (Qloo places matching the origin city's taste), different room tier emphasis, different imagery direction, different cultural hooks. Same hotel, three pages that feel local to the visitor's home taste.
- **S2 Pre-launch waitlist from guest clusters**: page "Marseille, spring". Upload guests.csv, cluster into the three groups, generate a variant each with a waitlist form. Exercises clustering, the form section, and form-submission analytics.
- **S3 Audience of one**: an email to past guests with `?g=<token>`. The variant is built from that guest's row (home city, past property, experiences). Shows the extreme end of the Audience abstraction without a separate mode.
- **S4 On-page quiz**: an anonymous visitor from search answers three taste questions; the router maps them to the nearest audience and swaps the variant in place. Reuses the concierge questionnaire tech and makes the two services rhyme.

### 5.3 Why these two

Coffee covers purchase history, subscription behaviour, demographics and a US geo launch; hotels cover origin-market geo, travel and places, forms, and per-lead links. Between them every audience source and every routing path gets a scripted test, and each brand's site is something a real business would have, so intake is tested on realistic HTML rather than on a page we built to be easy. An alternative third brand, if we want a purchase-heavy fashion-adjacent case later, is a DTC fragrance house (scent families map cleanly to taste clusters).

## 6. Judge script (draft)

1. `/dashboard/pages/new`, paste the Ridgeline URL, watch the kit and the Qloo view of the brand appear.
2. Audiences: create "Austin locals" from location; upload `ridgeline-customers.csv`, see clusters and their cards.
3. Pages: "Holiday gifting", three variants generated with "Why this version" open; edit one by chat.
4. Publish; open `ridgeline.slice.page/gifting?a=...` on a phone; the quiz path on the Saltline Lisbon page.
5. Analytics: variant comparison with simulated traffic plus the judge's own visits appearing live.

## 7. Open decisions

- Builder agent in Python ADK (consistent with the concierge) vs a TypeScript agent in the Next.js API (fewer moving parts for streaming the document into the preview). Plan assumes ADK.
- Base domain for published pages (`slice.page` or a subdomain of the main site).
- Whether Pages gets catalog import or only the items found during intake. Plan assumes intake items, with the Slice CSV importer available later.
