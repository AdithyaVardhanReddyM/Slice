# Email service: plan and contracts

The fourth Slice service, beside Concierge, Pages and Media. A business sets
up its brand once (logo, colours, voice, what it does), imports contacts,
and sends campaigns whose content follows each audience's taste (Qloo).
Built for the hackathon: real enough that judges can read the code and click
through every step, without being a full ESP.

Shapes live in `packages/backend/convex/emailTypes.ts` (the contract; do
not change a shape without updating this file and telling the other tracks).

## Running it

- Apps: `pnpm dev` (or web on :3000, the agent on :8000, the stores on :3002
  for the Stackhouse Books site, deployed at https://stackhouse-books.vercel.app). Email
  lives at `/dashboard/email`.
- Demo: `cd packages/backend && npx convex run emailSeed:run` rebuilds the
  Stackhouse Books master (~5 min cold, ~1 min warm; follow it with
  `emailSeed:status`). Then personalise the book-club campaign from its
  Recipients step (or `POST localhost:8000/email/personalise {campaignId}`).
  The account whose email is `PAGES_DEMO_OWNER_EMAIL` claims the master on
  first visit; every other account gets its own copy.
- Second demo: `npx convex run emailSeedCovers:run` rebuilds **Covers**, a
  London restaurant booking app (~1 min; `emailSeed:status '{"slug":"covers"}'`).
  Site at `localhost:3002/covers`, deployed at https://covers-london.vercel.app.
- Real sending: `npx convex env set RESEND_API_KEY re_…`, then connect and
  verify a domain on the brand's Sending page. Demo brands always simulate.
- Templates render to HTML for a visual check with
  `cd packages/backend && npx tsx scripts/render-templates.ts <outDir>`.

## User decisions (2026-10-15)

- **Its own service** at `/dashboard/email`, independent like Concierge and
  Pages: its own brands, contacts, audiences and campaigns. Code helpers may be
  shared (Qloo wrappers, profile compile helpers, CSV/k-means), data may not.
- **Sending through Resend**, from the business's own domain (DNS records
  shown, verified through Resend's Domains API). Open and click tracking are
  ours (Convex HTTP routes), so they work without Resend webhooks.
- **Personalisation like Pages**: every contact can carry a Qloo taste profile.
  A campaign goes to ONE audience:
  - a **taste group** (a cluster of a contact list): one email written for the group's taste;
  - a **customer list kept one by one** ("people"): one base design whose
    *personal* blocks are rewritten for each person from their own profile.
  Merge tags (`{{first_name|there}}`) work in both.
- **Recipients**: CSV upload (map columns, then "Cluster them?" into taste groups
  or keep one by one, as in Pages) and adding contacts by hand. No CRM, no
  signup form.
- **Demo brand**: a new independent bookshop, **Stackhouse Books** (Brooklyn).
- **Editor layout**: Wix-style. Icon rail on the left (AI chat, Add, Themes,
  Personalise, Layers) opening one panel at a time; the canvas in the middle
  (desktop/phone toggle); a toolbar floats over the selected block; an
  inspector slides in on the right for its settings. Drag and drop. Three steps
  in the top bar: **1 Create · 2 Recipients · 3 Review & send**.
- Brand setup is light: one homepage read for logo, colours, fonts, what it
  does, voice, footer details and a few items. No crawling.

## Design rules (from the user's feedback on earlier work)

- Inter only in the console; no monospace (except DNS values and code), no
  ALL CAPS labels, no serif/italic UI text. Emails themselves use the brand's fonts.
- Never the sparkles / AI-magic icon (no `Sparkles`, `WandSparkles`, `Stars`).
  AI chat uses lucide `MessagesSquare`; taste slots `UserStar`; tuning
  `SlidersHorizontal`; match pills `Fingerprint`.
- No status dots, pulsing dots, hatching or highlighter text. Status = text +
  icon or a neutral badge.
- Image-led, characterful, not bland admin tables: show the emails themselves
  (live scaled renders), Qloo imagery (taste covers from Pages:
  `components/console/pages/taste-cover.tsx`), book covers.
- Console chrome follows `components/console/shell-ui.tsx` (white sidebar with
  ink pills, grey `bg-canvas` inset, rounded-2xl white panels).
- Copy never frames taste picks against bestsellers/trending ("not the
  bestseller list"); taste picks are additive.
- shadcn/ui is the Base UI flavour: `render` prop, not `asChild`; a `<Button>`
  rendering a link needs `nativeButton={false}`. Sheets need
  `data-[side=right]:sm:max-w-xl` to widen.
- Next 16 cache components: client-driven segments export
  `export const instant = false`; a page reading `params` renders
  `<Suspense><Inner params={params} /></Suspense>`.

## Data model (Convex, `packages/backend/convex/schema.ts`)

All tables are `email*`. Kits, docs and profiles are `v.any()` with the
shapes in emailTypes.ts.

```ts
emailBrands: {
  slug: string;               // unique across emailBrands
  name: string;
  nameFromSite?: boolean;     // placeholder name until setup reads the real one
  url?: string;
  status: "setup" | "ready";
  setup?: { status: "reading" | "done" | "failed"; progress?: { value: number; label: string }; error?: string; at: number };
  kit?: EmailKit; about?: EmailAbout; footer?: EmailFooterInfo;
  sender?: { fromName: string; fromLocal: string; replyTo?: string };
  domain?: EmailDomain;
  owner?: string; demo?: boolean; demoOf?: Id<"emailBrands">;
  createdAt: number; updatedAt: number;
}  // by_slug, by_owner, by_demo [demo, demoOf]

emailItems: {
  brandId; name; subtitle?; kind; description; price?; image?; url?;
  tags: string[];
  qloo?: { id; name; type; tags?: string[] };
  order: number; createdAt: number;
}  // by_brand

emailLists: {
  brandId; name;
  source: "csv" | "manual" | "demo";
  filename?: string; columns: string[]; rowCount: number;
  mode: "groups" | "people";
  mapping: { email: string; name?; firstName?; lastName?; taste: string[]; city?; country?; age?; gender? };
  status: "importing" | "resolving" | "clustering" | "profiling" | "ready" | "failed";
  progress?: { value; label };
  audienceId?: Id<"emailAudiences">;   // people mode: the list's audience
  trace: Span[]; error?: string; createdAt; updatedAt;
}  // by_brand

emailContacts: {
  brandId; listId;
  email: string;              // lower-cased
  name: string; firstName?: string; lastName?: string;
  row: Record<string, string>;
  interests: string[];        // raw taste terms from the taste columns / the add form
  entities: { id; name; type; image? }[];   // resolved Qloo entities
  city?; country?; age?;      // age = Qloo bucket (24_and_younger …)
  gender?;
  cluster?: number;
  audienceId?: Id<"emailAudiences">;        // its group (groups mode) or its list's people audience
  profile?: AudienceProfile;                // people mode: compiled per person
  profileStatus?: "pending" | "compiling" | "ready" | "failed";
  unsubscribed?: boolean; unsubscribedAt?: number;
  createdAt: number;
}  // by_list, by_brand, by_brand_email [brandId, email], by_audience

emailAudiences: {
  brandId; listId;
  name: string;
  kind: "group" | "people";
  cluster?: number;
  status: "compiling" | "ready" | "failed";
  progress?: { value; label };
  profile?: AudienceProfile;   // group: the cluster's; people: merged, for the cover
  brief?: { summary: string; speakTo: string; leadWith: string; hooks: { text: string; evidence: string }[] };
  size: number;
  topEntities: string[];       // names, for cards
  trace: Span[]; error?: string; createdAt; updatedAt;
}  // by_brand, by_list

emailCampaigns: {
  brandId; name;
  status: CampaignStatus;
  audienceId?: Id<"emailAudiences">;
  doc: EmailDoc;
  templateId?: string;
  prompt?: string;             // the first prompt, for the first generate turn
  personalization?: { status: "idle" | "running" | "ready" | "failed"; done: number; total: number; docVersion?: number; error?: string; startedAt?: number };
  scheduledAt?: number; sentAt?: number;
  sendingMode?: SendingMode;   // fixed when sending starts
  stats: CampaignStats;
  test?: { to: string; at: number };
  createdAt; updatedAt;
}  // by_brand, by_status

emailChats: {                  // builder chat per campaign (same message shape as pagesBuilds)
  campaignId;
  messages: { id; role: "merchant" | "agent"; at; text; trace?; steps?: any[];
              attachments?: { url; name; type }[];
              blocks?: { id: string; label: string; type: string }[] }[];   // blocks the merchant picked
  updatedAt;
}  // by_campaign

emailVersions: {               // one person's version of a people campaign
  campaignId; contactId;
  docVersion: number;          // the doc version it was written against (stale when lower)
  personalization: Personalization;
  status: "ready" | "failed"; error?: string;
  createdAt; updatedAt;
}  // by_campaign, by_campaign_contact

emailSends: {
  campaignId; brandId; contactId; email;
  status: SendStatus;
  resendId?: string; error?: string;
  subject: string;
  queuedAt: number; sentAt?; deliveredAt?; openedAt?; clickedAt?; bouncedAt?;
  opens: number; clicks: number;
  links: { url: string; blockId?: string; at: number }[];
  simulated?: boolean;
}  // by_campaign, by_resend [resendId], by_contact
```

Schema validators for kit/doc/profile/personalization fields are `v.any()`.
Optional fields never receive `null` (Convex rejects it; strip `None` in Python).

## Shared TypeScript modules (track R: renderer)

Plain TS in `packages/backend/convex/` (no Convex imports), importable from
the web app as `@slice/backend/convex/<file>` and from Convex functions.

### `emailDoc.ts`

```ts
export function newId(prefix: string): string;                    // "b_k3x9q2" style, 8 chars after prefix
export function validateEmailDoc(input: unknown): { doc: EmailDoc; problems: string[] };
  // Normalises: assigns missing ids (and dedupes), clamps numbers, drops unknown block types,
  // fixes column widths to sum to 1, sanitises inline HTML (allowlist), ensures a footer
  // block with an unsubscribe label exists (adds one at the end and reports it).
export function applyOps(doc: EmailDoc, ops: EmailOp[]): { doc: EmailDoc; problems: string[]; changed: string[] };
  // Pure; never throws for a bad op (reports it in problems). Bumps nothing: callers bump version.
export function findBlock(doc, id): { block; column; section; index } | null;
export function findColumn(doc, id); export function findSection(doc, id);
export function allBlocks(doc): { block; column; section }[];
export function personalBlocks(doc): EmailBlock[];
export function withIds<T>(input): T;                              // assigns ids to a section/column/block input
export function cloneWithNewIds<T>(x: T): T;                       // duplicate a block or section
export function applyPersonalization(doc: EmailDoc, p: Personalization | null | undefined): EmailDoc;
  // Overrides only blocks marked personal; subject/preheader when given.
export function sanitizeInline(html: string): string;             // heading text, button-free inline set
export function sanitizeRich(html: string): string;               // text blocks (p, ul, ol, li too)
export function blankDoc(theme: EmailTheme, brandName: string): EmailDoc;  // logo header + empty body + footer
export function docSummary(doc: EmailDoc): string;                // compact text outline for the agent
```

### `emailThemes.ts`

```ts
export function themeFromKit(kit: EmailKit | undefined): EmailTheme;   // id "brand"
export const THEME_PRESETS: EmailTheme[];   // ~8: Ink, Paper, Forest, Sunset, Ocean, Mono, Blush, Midnight (distinct font pairs + palettes)
export function applyTheme(doc: EmailDoc, theme: EmailTheme): EmailDoc;   // replaces theme; fixed hex colours stay
export function resolveColor(ref: ColorRef | undefined, theme: EmailTheme): string | undefined;
export function onColor(ref: ColorRef | undefined, theme: EmailTheme): string;  // readable text on that fill
export function fontStack(f: EmailFont): string;
export function googleFontsHref(theme: EmailTheme): string | null;
```

### `emailRender.ts`

One renderer for the editor canvas, previews, tests and sends. Table-based,
inline-styled, 600 px, bulletproof buttons, mobile stacking via a media
query class (`.col` → 100% under 620 px), dark-mode-safe colours, hidden
preheader, `role="presentation"` tables, alt text everywhere.

```ts
export interface RenderContext {
  /** Items for items blocks, by id. Missing ids are skipped. */
  items: Record<string, EmailItem>;
  brand: { name: string; logo?: EmailKit["logo"]; wordmark?: string; footer?: EmailFooterInfo };
  /** Recipient values for merge tags; absent → fallbacks / example values in "edit". */
  merge?: Partial<Record<MergeKey, string>>;
  links?: {
    unsubscribe?: string;          // default "#unsubscribe"
    viewOnline?: string;
    /** Rewrites every href for click tracking (blockId lets the report group clicks). */
    track?: (href: string, blockId: string) => string;
    /** 1x1 open pixel URL appended to the body. */
    openPixel?: string;
  };
  /** "edit": adds data-block-id/data-section-id attributes, shows merge tags as chips, no tracking. */
  mode: "send" | "preview" | "edit";
}
export function renderEmail(doc: EmailDoc, ctx: RenderContext): string;        // full <!doctype html> document
export function renderBlockHtml(block: EmailBlock, ctx: RenderContext & { theme: EmailTheme; sectionBackground?: ColorRef; columnWidthPx: number }): string;
export function sectionStyle(section: EmailSection, theme: EmailTheme): Record<string, string>;  // for the canvas wrappers
export function textStyle(block: HeadingBlock | TextBlock | ButtonBlock, theme: EmailTheme, sectionBackground?: ColorRef): Record<string, string>;  // for inline editing
export function renderPlainText(doc: EmailDoc, ctx: RenderContext): string;
export function fillMerge(text: string, merge: RenderContext["merge"], mode: RenderContext["mode"]): string;
```

### `emailTemplates.ts` and `emailPresets.ts`

- `EMAIL_TEMPLATES: EmailTemplate[]` — 12 designed templates written with theme
  tokens and curated Pexels photos (stable `images.pexels.com/photos/<id>/...`
  URLs), copy written as clear placeholders a bookshop *or* any shop can use:
  Welcome · Monthly newsletter · New arrivals · Picked for you (personal,
  taste items) · Flash sale + coupon · Event invite (save the date) · Product
  spotlight · We miss you (personal, re-engage) · Gift guide · Reviews / what
  people say · A letter from us (plain) · Announcement. Plus `BLANK_TEMPLATE`.
- `SECTION_PRESETS: { id; group: "Header" | "Hero" | "Text" | "Items" | "Gallery" | "Quote" | "Promotion" | "Footer" | "Layout"; label; section: EmailSectionInput }[]`
  for the Add panel ("Made for you" groups) and `BLOCK_PRESETS` (single
  elements: heading, subheading, paragraph, image, button (2 styles), divider
  (2), spacer, items, social, quote, coupon, video, logo, footer) and
  `LAYOUT_PRESETS` (1 col; 2 cols image+text both ways; 2 images; 3 cols).

A script `packages/backend/scripts/render-templates.ts` (run with
`npx tsx`) writes every template, in 3 themes, to HTML files in a scratch
folder for visual checks.

## Convex functions (track B: backend)

Owner scoping: `list` / `mineBySlug` read `ctx.auth.getUserIdentity()`;
`create` sets `owner`. Id-based reads are public and unchecked (the agent
reads them unauthenticated, same as Pages).

**emailBrands.ts**: `list({})` (owner's brands + counts {campaigns, contacts}),
`mineBySlug({slug})`, `get({id})`, `getInternal`, `create({url?, name?})` →
`{id, slug}` (placeholder name from the URL when no name, `nameFromSite`),
`update({id, name?, url?, kit?, about?, footer?, sender?})`, `markReady({id})`,
`remove({id})` (throws on demo; cascades), `patch` (internal, for the agent),
`sendingInfo({id})` → `{ mode: SendingMode; from: string; reason?: string }`,
`uploadUrl({})` (mutation → Convex storage upload URL, for logos, images and
chat attachments) and `fileUrl({storageId})` (query → public URL or null).

**emailItems.ts**: `list({brandId})`, `create`, `update`, `remove`, `reorder`,
`bulkCreate({brandId, items})`, `resolve({brandId})` (action: Qloo entity
per item without one; `kind` "book" → `urn:entity:book`, else best match),
`rank({brandId, audienceId?, contactId?, profile?, take?, exclude?})`
(action) → `{ items: { id; score; evidence: string }[] }`:
  - signals = the profile's top resolved entities (≤ 10, interleaved kinds);
  - Qloo `/v2/insights` `filter.type=<item qloo type>` +
    `signal.interests.entities` + `filter.results.entities` (batches of ≤ 20,
    ranks merged by normalised rank) → rank score;
  - tag overlap: item tags + qloo tags vs profile tag names (match on slug) → boost;
  - an item whose entity or name the person already listed (their favourites) is excluded;
  - evidence string: which signals and tags carried it, in plain words.
  Books are popularity-heavy in Qloo; the tag overlap keeps picks personal.

**emailLists.ts**: `list({brandId})`, `get({id})`, `create({brandId, name,
filename?, columns, mapping, mode, rows})` (≤ 500 rows per call; more via
`appendRows`), `appendRows`, `process({id})` (action):
  1. resolve taste terms (reuse `resolveNames` + `splitTerms` from pages helpers) → contact entities;
  2. groups mode: k-means (reuse `pagesCsv.vectorize/kmeans/lift`), create one `group` audience per
     cluster named from its top entities (the console renames them via `/api/email/name-groups`),
     compile each (cluster profile like `compileCsv`);
  3. people mode (≤ `MAX_PEOPLE_LIST`): one `people` audience, each contact's profile compiled
     one after another (like `compileLead`), merged for the audience (like `mergeProfiles`).
  `remove({id})` cascades to contacts and audiences. Export the needed helpers
  from `pagesAudiences.ts` (`enrich`, `cultureFrom`, `demographicSignal`,
  `mergeProfiles`, …) rather than copying them; keep their behaviour unchanged.

**emailContacts.ts**: `list({listId})`, `byAudience({audienceId})`,
`get({id})`, `add({brandId, listId?, email, name, city?, age?, gender?, interests?})`
(new "Added by hand" people list when no listId; people list → compile its
profile; groups list → nearest group by entity overlap), `update`,
`remove`, `compile({id})` (action), `counts({brandId})`.

**emailAudiences.ts**: `list({brandId})` (each with `unsubscribed`: members
who opted out, and `listName`), `get({id})`, `rename({id, name})`,
`remove({id})`, `compile({id})` (action), `setBrief` (internal).

**emailCampaigns.ts**: `list({brandId})` (with audience name + stats),
`get({id})`, `create({brandId, name?, templateId?, doc?, prompt?, audienceId?})`
→ id (doc = template themed with the brand, or `blankDoc`),
`rename`, `duplicate`, `remove` (drafts only), `saveDoc({id, doc, baseVersion})`
→ `{version}` (rejects when `baseVersion` < stored version: returns
`{conflict: true, version}`), `applyOps({id, ops})` (public, for the editor's
quick actions) → `{version, problems}`, `setAudience({id, audienceId})`
(clears personalisation when it changes), `messages({id})` (chat),
`versions({id})` → `{ contact, personalization, docVersion, status }[]`,
`getForAgent({id})` (internal; the agent reads it over `/agent/read`) → `{ campaign, brand, audience, items, contacts? }`,
`renderFor({id, contactId?, mode?})` → `{ html, subject, preheader, text }`
(personalised + merged for that contact), `report({id})` →
`{ stats, timeline: { at; opens; clicks }[], links: { url; label?; blockId?; clicks }[], people?: { contactId; name; email; status; opened; clicked; subject }[] }`.

**emailSend.ts**: `sendTest({campaignId, to, contactId?})` (action; real Resend
send when a key and a sender exist, else throws a readable reason),
`start({campaignId, at?})` (mutation: checks audience, subject, footer,
personalisation ready for people campaigns; freezes `sendingMode`; creates
`emailSends`; schedules `run` now or at `at`), `cancel({campaignId})`,
`run` (internal action: batches of 50 → render per recipient
(`applyPersonalization` + merge + tracking links) → Resend
`POST /emails/batch` (`from`, `to`, `subject`, `html`, `text`,
`reply_to`, `headers: List-Unsubscribe + List-Unsubscribe-Post`,
`tags: [{name:"campaign",value:id}]`) → record ids/errors → stats), `simulate`
(internal: demo mode: every send "delivered" now, then scheduled opens for
~45% and clicks for ~12% over the next 2 minutes so the report moves).

Sending modes (`emailBrands.sendingInfo`): `domain` when the brand's domain is
verified; `shared` when Convex env `EMAIL_SHARED_DOMAIN` is set (from
`"<Brand> <brand-slug@shared>"`); `demo` for demo brands; else `none`
(only test sends to the merchant's address through Resend's
`onboarding@resend.dev`, which Resend delivers only to the key owner).

**emailDomains.ts** (actions, Resend `https://api.resend.com`, `RESEND_API_KEY`
in Convex env): `connect({brandId, name})` → `POST /domains` → store
records; `verify({brandId})` → `POST /domains/{id}/verify` then
`GET /domains/{id}`; `refresh({brandId})`; `disconnect({brandId})`. No key →
a clear error the console shows ("Resend isn't configured yet").

**emailDemo.ts**: `provision({})` mirrors `pagesDemo.provision`: copies every
email master the viewer lacks (brand, items, lists, contacts, audiences,
campaigns, chats, versions, sends of sent campaigns) with ids remapped; the
account whose email is `PAGES_DEMO_OWNER_EMAIL` claims unowned masters.
`setMasters({slugs})` (internal).

### HTTP routes (`http.ts`, agent secret = `QLOO_PROXY_SECRET` bearer)

| Route | Body → reply |
|---|---|
| `POST /agent/read` | `{path, args}` → `{value}`: the agent's reads (`emailBrands:get`, `emailLists:get`, `emailAudiences:list`, `emailContacts:byAudience`, `emailCampaigns:getForAgent`, `emailCampaigns:renderFor`); console queries answer only the brand's owner |
| `POST /agent/action` | `{path, args}` → `{value}`: `emailItems:rank` (and Pages' `pagesBrands:qlooLookup`) as their internal twins; the public actions answer only the brand's owner |
| `POST /email/brand` | `{brandId, patch}` → `{ok}` (kit, about, footer, sender, name, setup, url) |
| `POST /email/items` | `{brandId, items: EmailItem-like[]}` → `{ids}` (appends, skipping names the brand already has) |
| `POST /email/doc` | `{campaignId, doc}` → `{version, doc, problems}` (validate, bump version, save) |
| `POST /email/ops` | `{campaignId, ops}` → `{version, doc, problems}` |
| `POST /email/chat` | `{campaignId, messages}` → `{ok}` (append) |
| `POST /email/version` | `{campaignId, contactId, docVersion, personalization, status?, error?}` → `{ok}` |
| `POST /email/personalization` | `{campaignId, status, done, total, error?}` → `{ok}` |
| `POST /email/audience-brief` | `{audienceId, brief}` → `{ok}` |
| `GET /email/o?s=` | open pixel (1×1 gif), records the first and counts opens |
| `GET /email/c?s=&u=&b=` | records the click, 302 to `u` (only http/https) |
| `GET /email/u?s=` / `POST /email/u?s=` | unsubscribe: page with confirmation / one-click |
| `GET /email/v?s=` | view in browser (that recipient's version) |
| `POST /email/resend` | Resend webhook (svix signature checked when `RESEND_WEBHOOK_SECRET` is set): delivered, bounced, complained |

Tracking URLs use `process.env.CONVEX_SITE_URL`.

## Agent (track C: `apps/agent/slice_mail/`)

Python ADK beside `slice_pages`, router mounted in `server.py`
(`app.include_router(email_router)`, prefix `/email`). Reuse Pages code by
import (crawl, browser.probe, images.pexels_search, llm.generate_json,
trace) instead of copying. Gemini `gemini-3.8-flash` default; the composer can
pass `model` (`gemini-3.1-pro-preview`), same as Pages.

| Endpoint | Body | Reply |
|---|---|---|
| `POST /email/setup` | `{brandId, url}` | JSON `{ok, error?}`; writes progress, kit, about, footer, sender, name and up to 12 items to Convex as it goes (≤ ~25 s) |
| `POST /email/build` | `{campaignId, kind: "generate" \| "edit", message?, history: {role, text}[], attachments?: {url,name,type}[], blocks?: {id,label,type,text}[], model?}` | NDJSON stream, same event protocol as `/pages/build` |
| `POST /email/personalise` | `{campaignId, contactIds?}` | JSON `{ok, total}`; runs in the background (concurrency 3), writes each `emailVersions` row and progress |
| `POST /email/subjects` | `{campaignId}` | JSON `{options: {subject, preheader, angle}[]}` (5) |
| `POST /email/name-groups` | `{listId}` | JSON `{names: {audienceId, name}[]}` (short, human group names from each group's profile; also writes an audience brief) |

**Stream events** (mirror `slice_pages/routes.py` exactly so the console can
reuse `lib/pages/stream.ts` and `build-steps.ts`): `start {messageId}`,
`status {text}`, `span {span}`, `thought {delta}`, `text {delta}`,
`text_done {text}`, `tool_call {name, label, args}`, `tool_result {name, ok,
summary, problems?, preview?}`, `question {question}`, `doc {version}` (after
every tool that changed the doc; the console re-reads the campaign from
Convex), `error {message}`, `done {messageId, text, trace, steps, totalMs, docVersion}`.
The turn is persisted to `emailChats` via `/email/chat`.

**Builder tools**: `get_brand`, `get_audience` (profile summary: culture by
kind, top tags, brands, geo, demographics, brief; for people lists the
people with their top entities), `get_email` (`docSummary` + ids),
`start_email(subject, preheader)` (clears sections, keeps theme),
`add_section(section, after?)` (one section at a time so the canvas fills live),
`edit_email(ops)`, `pick_items(count, for_contact?)` (Convex
`emailItems:rank`), `list_items(query?)`, `search_images(query,
orientation)` (Pexels), `qloo_search`, `qloo_insights`,
`ask_merchant(question, options, other?)`, optional `review_email()`
(Playwright `set_content` of `emailCampaigns:renderFor` html at 600 and 375
wide + a vision critique; ≤ 1 per turn).

**Writing rules** (system prompt): subject ≤ 45 chars, preheader 40–90 and
not repeating the subject; one primary CTA; short paragraphs; alt text on
every image; real item links; merge tags with fallbacks; every section gets an
`evidence` line citing the taste signal it uses; a footer block always; brand
voice; group campaigns are written for the group's taste with concrete
cultural hooks; people campaigns mark the hero heading, intro text, items
block (pick "taste") and optionally the hero image as `personal` and write
them for the list as a whole (each person's version comes from
`/email/personalise`); never frame picks against bestsellers.

**Personalisation** per contact: `emailItems:rank` for that contact → one
`generate_json` call with the base doc's personal blocks, the person's profile
summary and their ranked items → `Personalization` (only the fields allowed
per block type: heading `text`; text `html`; image `src`/`alt`; button
`label`/`href`; items `itemIds`/`reasons`; quote `text`/`author`) → validated
→ `/email/version`.

Web proxies (track C writes them): `apps/web/src/app/api/email/{setup,build,
personalise,subjects,name-groups}/route.ts` using
`apps/web/src/app/api/pages/_lib/proxy.ts`.

## Console (tracks D: editor, E: everything else)

Routes (`apps/web/src/app/(app)/dashboard/email/…`):

| Route | What | Track |
|---|---|---|
| `/dashboard/email` | brand list (cards with logo, colours, last campaign render) + New brand | E |
| `/dashboard/email/new` | brand setup: URL → reading (progress) → review kit/voice/about/footer/sender → Done. "No website? Set it up by hand" path | E |
| `/dashboard/email/[brand]` | Overview: hero with stats (sent, open rate, click rate, contacts), latest campaigns as live thumbnails, audiences as taste covers, next steps | E |
| `…/[brand]/campaigns` | campaign cards (live scaled render, status, audience, sent/open/click) + filters | E |
| `…/[brand]/campaigns/new` | "Create a campaign": prompt box (+ optional audience) and template gallery rendered in the brand's theme, by category, + Blank | E |
| `…/[brand]/campaigns/[campaign]` | full-screen campaign editor with the 3-step top bar; `?step=recipients` / `?step=review`; sent campaigns show the report | D (shell, Create step) + E (Recipients, Review, Report bodies) |
| `…/[brand]/contacts` | lists (CSV upload with mapping + "Cluster them?", add by hand), groups as taste covers, people drawer with each profile | E |
| `…/[brand]/brand` | brand kit: logo, colours, fonts, buttons, voice, about, footer/socials, items catalog (add/edit/CSV), live email preview rail | E |
| `…/[brand]/sending` | sender (from name, address local part, reply-to), domain connect with DNS records table (copy buttons), verify/refresh, sending mode explainer | E |

Shared web modules:
- `components/console/email/brand-context.tsx` (E): `EmailBrandProvider`, `useEmailBrand()` → the brand doc. The shell resolves it from the slug.
- `components/console/email/email-frame.tsx` (E, used by D too): `<EmailFrame html width scale />` — a sandboxed iframe that renders an email HTML at a scale (thumbnails, previews).
- `lib/email/render-context.ts` (E): `renderContextFor(brand, items, merge?, mode)`.
- Services: `lib/services.ts` gains `email` (label "Email", icon lucide `Mail`, clientNoun "brand", available); the top nav in `widgets/shell.tsx` gets Email; the home bento gets an Email tile (latest campaigns as renders + open rate). (E)

**Editor (D)**, `components/console/email/editor/`:
- `campaign-shell.tsx`: full-screen layout, top bar: back (Exit), campaign name (rename inline), steps 1·2·3 (current highlighted, earlier clickable), autosave state (cloud icon + "Saved"/"Saving"), undo/redo, desktop/phone toggle, Preview, Test email, Next / Send. Renders the Create step (editor) or E's `RecipientsStep` (`components/console/email/campaign/recipients-step.tsx`), `ReviewStep` (`…/review-step.tsx`) or `CampaignReport` (`…/report.tsx`), all with props `{ campaign, brand }`.
- `use-email-editor.ts`: local doc + selection + undo/redo history (ops or snapshots), autosave debounced 700 ms via `emailCampaigns.saveDoc` with `baseVersion`; adopts the server doc when it moves ahead and there are no unsaved local edits (agent turns); during an agent turn the canvas shows a building state and local edits pause.
- `rail.tsx` + panels: `chat-panel.tsx` (agent chat: messages from `emailCampaigns.messages`, the live turn from `/api/email/build`, reusing Pages' `build-steps.ts` / `build-card.tsx` / `question-card.tsx` where they fit; composer with attachments and picked-block pills; suggestion chips for empty chats), `add-panel.tsx` (Quick add: Single element, Column layouts; Made for you: Header, Hero, Items, Galleries, Quotes, Promotion, Footer; previews rendered with the brand theme; click to add after the selection or drag onto the canvas), `themes-panel.tsx` (current theme card with swatches, Edit theme (colours, fonts, buttons, radius), Brand theme + presets), `personalise-panel.tsx` (merge tags to insert, taste slots list with toggles, "Preview as" a contact of the campaign's audience), `layers-panel.tsx` (sections → blocks tree, reorder by drag).
- `canvas.tsx`: the email at 600 px (phone: 375 px, columns stacked) on the backdrop colour; sections and columns are React wrappers styled from `sectionStyle`; blocks render through `renderBlockHtml(..., mode: "edit")`; hover outline + label chip, selection outline, drag handles (`@dnd-kit/core` + `@dnd-kit/sortable`) for sections and blocks, drop targets between blocks for Add-panel drags, "+" insert buttons between sections; inline editing (double click) for heading/text/button labels/quote with a contenteditable styled by `textStyle`, sanitised on commit. The canvas root has class `email-canvas`; `globals.css` gets `@layer base { .email-canvas, .email-canvas * { all: revert-layer } }` so Tailwind preflight does not restyle the email (editor chrome uses Tailwind utilities, which win).
- `floating-toolbar.tsx`: over the selected block: text (font, size, bold, italic, underline, colour, link, align, lists), and for every block: "Edit with AI" (puts a block pill into the chat composer and opens chat), personal toggle (`UserStar`), duplicate, move up/down, delete.
- `inspector.tsx`: right panel per selection type (section: background colour/image, padding, columns layout; column: width, align; each block type's fields; images: replace via URL, upload (Convex storage), Pexels search, brand images, item images).
- `preview-dialog.tsx`: true HTML (`emailCampaigns.renderFor`) in `EmailFrame` at desktop and phone, subject/preheader inbox mock, "as" contact picker.
- `test-email-dialog.tsx`: to (defaults to the signed-in user's email), contact to impersonate, `emailSend.sendTest`.

**Recipients step (E)**: audience cards (taste covers) for the brand's groups and
people lists with size, excluded (unsubscribed) count, the agent's one-line
read of who they are; "Import contacts" / "Add by hand" shortcuts; for a
people list, "Personalise for each person" (calls `/api/email/personalise`)
with progress and a grid of people (face/initial, their subject, their
picks as covers, "Preview" opens their version); stale versions (doc changed
since) flagged with "Update".

**Review step (E)**: checklist (subject, preheader, sender/domain, footer +
unsubscribe, alt text, links, personalisation ready), from/reply-to/subject/
preheader fields with "Suggest subject lines" (`/api/email/subjects`),
inbox preview mock, send now or schedule (date-time), sending-mode notice
(demo: simulated; none: blocked with a link to Sending), confirm dialog.

**Report (E)**: KPI tiles (recipients, delivered, opened, clicked, unsubscribed,
bounced) with rates, opens/clicks over time (recharts via shadcn Chart),
top links by clicks, for people campaigns a per-person table (subject,
opened, clicked), the email itself.

## Demo brand (track F): Stackhouse Books

An independent bookshop in Brooklyn.
- Site in `apps/stores/src/app/stackhouse/` (+ `components/stackhouse`, `public/stackhouse`):
  homepage (logo, new arrivals, staff picks, events, newsletter, footer with
  address and socials) and `/stackhouse/books/[slug]` pages, so the brand setup reads
  a real homepage and email links resolve. Its own look (warm paper, deep
  green, a serif display face, readable sans body); see
  `feedback-store-design`: a professional real retailer, no editorial gimmicks.
- Catalog: ~40 real books across literary fiction, translated fiction,
  sci-fi/fantasy, crime, nonfiction/ideas, poetry, cookbooks, YA; covers
  from Open Library (`covers.openlibrary.org/b/id/<cover_i>-L.jpg`, looked up
  by title + author at authoring time, checked to load); prices; our own
  one-line descriptions (no copied blurbs).
- Contacts: "Book club" (8 people, kept one by one) and "Newsletter
  subscribers" (~36 people, clustered into ~4 taste groups); fictional
  people at `@example.com`; taste columns mixing favourite authors, books,
  artists, films and genres (cross-domain taste is Qloo's strength).
- Campaigns: one **sent** group campaign with simulated stats (e.g. "New in
  literary fiction" to the literary group), one **people** campaign
  personalised per person ("Your autumn reading list" to the book club), one
  draft from the Event template (author night). Hand-written docs, then real
  personalisation through the agent.
- Seed: `packages/backend/convex/emailSeed.ts` (internal actions, data in
  `emailDemoData.ts`), `npx convex run emailSeed:run`, then mark the brand as a
  demo master.

## Second demo brand: Covers

A restaurant booking app for London (fictional) listing 48 real London
restaurants, picked 2026-10-16 because Qloo's place data is deepest in big
cities (every top-50 London restaurant has a photo, description,
neighbourhood, coordinates and 100–200 tags).
- Data: `convex/emailDemoCovers.ts` (restaurants with their Qloo place ids,
  areas, collections, editors' notes, kit, contacts); its shared block is
  copied to `apps/stores/src/lib/covers/restaurants.ts`. Seed:
  `convex/emailSeedCovers.ts`. Site: `apps/stores/src/app/covers/`.
- Photos: Qloo's CDN (`images.qloo.com/i/<key>-<width>x-outside.jpg`); five
  originals carry a newspaper badge and are cropped through wsrv.nl (crop
  only, no width: wsrv resizes before cropping). The seed copies all of them
  into Convex storage.
- Contacts: two regulars kept as individuals (tasting menus; spice) and eight
  members in two taste groups, *Small plates & natural wine* (east London)
  and *Grand rooms & big nights* (West End), each with three diners who
  booked and one new member with only age, gender and neighbourhood.
- New members are placed by `prospectFits`: for a group of places, being near
  home counts (share of the group's restaurants within 3 km of their
  neighbourhood, located through Qloo localities), because Qloo's
  `signal.location.query` barely moves place affinity (Hackney and
  Kensington score the same; Dalston, Shoreditch and Peckham don't resolve).
- Ranking: Qloo's place affinity alone picked The Wolseley and Scott's for
  the Small plates group, so `emailItems.rank` also scores likeness to what
  the person or group bought or booked (idf-weighted tags, the merchant's own
  tags and collections over Qloo's, 60% of the score). Restaurants keep only
  Qloo's cuisine and cooking-style tags; dishes and ambience matched every
  grand room. Picks now: Small plates → Jolene, Mangal 2, Peckham Bazaar;
  Grand rooms → The Ledbury, Hawksmoor, The River Café; Olivia → The Ledbury,
  A. Wong; Leo → Kricket, Rambutan, Darjeeling Express. Stackhouse improved
  too (crime → The Secret History; Daniel → cookbooks).
- The agent's personalise prompt says "booked" for a booking catalog, with
  restaurant examples ("if Brat is your kind of room"); the builder's rules
  name both kinds.

## Track ownership (who edits which files)

| Track | Owns | Must not edit |
|---|---|---|
| R renderer | `convex/emailDoc.ts`, `emailThemes.ts`, `emailRender.ts`, `emailTemplates.ts`, `emailPresets.ts`, `packages/backend/scripts/render-templates.ts` | schema, http, web |
| B backend | `convex/schema.ts` (email tables only), `http.ts` (email routes), `email{Brands,Items,Lists,Contacts,Audiences,Campaigns,Send,Domains,Demo}.ts`, minimal `export`s in `pagesAudiences.ts` / `pagesUploads.ts` | R's files (import them), web, agent |
| C agent | `apps/agent/slice_mail/**`, the include line in `apps/agent/server.py`, `apps/web/src/app/api/email/**` | Convex, other web |
| D editor | `apps/web/src/components/console/email/editor/**`, the campaign route `…/campaigns/[campaign]/page.tsx`, the `.email-canvas` rule in `globals.css`, web deps (`@dnd-kit/*`) | E's files |
| E1 console shell | `lib/services.ts`, `widgets/shell.tsx` nav, home Email tile (`components/console/home/email.tsx` + its slot in `home-view.tsx`), `dashboard/email/page.tsx`, `dashboard/email/new/**`, `dashboard/email/[brand]/layout.tsx`, `[brand]/page.tsx` (overview), `[brand]/brand/**`, `[brand]/sending/**`; `components/console/email/{brand-list,brand-shell,brand-context,email-frame,overview}.tsx`, `components/console/email/{setup,kit,sending}/**`, `lib/email/**` | D's and E2's files |
| E2 campaigns + contacts | `dashboard/email/[brand]/contacts/**`, `[brand]/campaigns/page.tsx`, `[brand]/campaigns/new/**`; `components/console/email/{contacts,campaigns,campaign}/**` (incl. `campaign/recipients-step.tsx`, `review-step.tsx`, `report.tsx`) | D's and E1's files |
| F demo | `apps/stores/src/app/stackhouse/**`, `apps/stores/src/components/stackhouse/**`, `apps/stores/public/stackhouse/**`, `convex/emailDemoData.ts`, `convex/emailSeed.ts` | everything else |

Only track B runs `npx convex dev --once` / codegen (others typecheck with
`pnpm --filter <pkg> typecheck` or `npx tsc --noEmit`). A track that needs
something from another writes against this contract and lists the gap in
its final report.

## Env

- Convex: `RESEND_API_KEY`, optional `EMAIL_SHARED_DOMAIN`,
  `RESEND_WEBHOOK_SECRET`; `PAGES_DEMO_OWNER_EMAIL` (reused for email demo masters).
- Agent: nothing new (Gemini, Pexels, Firecrawl, Convex already set).
