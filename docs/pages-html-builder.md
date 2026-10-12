# Pages: the HTML builder

Decided 2026-10-13. The page builder writes complete HTML and CSS instead of a document of fixed section types, sees the brand's real site, and reviews its own output in a browser. This note records what changed and why.

## Why

Pages built from the 14-section document looked like templates with the brand's colours poured in. Two causes: the agent had never seen the brand's site (it got a palette, two font names and a paragraph), and the renderer's CSS fixed everything else (hero composition, type scale, spacing, image framing, buttons). No prompt could fix the second. Letting the agent write the markup and the styles removes the ceiling; capturing the site and reviewing against it gives it something to aim at.

## What the agent gets now

- **The site itself.** At intake (and on demand through `POST /pages/capture`), `slice_pages/capture.py` screenshots the homepage with headless Chromium (`browser.py`, Playwright), stores the fold and the full page in Convex storage, keeps the cleaned markup and the photographs on the page, and writes an **anatomy**: a vision pass describing header, hero, section rhythm, typography, colour, imagery, buttons, cards, spacing, motion, character and six rules to pass as the brand. Stored as `pagesBrands.site`; the screenshot URL on `pagesBrands.screenshot` is now permanent (Firecrawl's expired).
- **The screenshots in the conversation.** Every generate turn, and the first turn of any session, attaches the fold and full-page screenshots to the message, so the model looks at the brand before writing.
- **Tools.** `get_brand_site` (anatomy, markup, photos), `get_audience_detail`, `qloo_places`, `qloo_culture`, `pick_items`, `search_images`, `generate_image`, `fetch_reference`, `describe_image`, `get_page`, `write_page`, `edit_page` (exact find/replace pairs, Lovable style), `review_page`.
- **A review loop.** `review_page` screenshots the preview route (`PAGES_WEB_URL/p/{brand}/{slug}?v=…&preview=1`), runs a DOM audit inside the page (horizontal overflow, broken images, h1 count, alt text, tiny text, empty sections, CTAs, console errors), stores the screenshot on the variant, and asks an "art director" vision call to compare the new page with the brand's homepage: `brandMatch` and `quality` out of 10, issues with concrete fixes, things to keep. The agent fixes with `edit_page` and may review at most twice per turn.
- **Skills.** `slice_pages/skills/*.md` are included in the instruction; `design.md` distils the frontend-design skill in this repo into rules for extending a brand rather than inventing one.
- **Reasoning.** Gemini's thought summaries stream as `thought` events (the chat renders them in the next phase).

## The document

`HtmlDoc` in `packages/backend/convex/pagesTypes.ts`: `{ kind: "html", meta: { title, description, image?, fonts? }, html, css, sections: [{ id, label, evidence }] }`. The old `PageDoc` still renders for pages built before this change; editing one of them regenerates it as HTML.

Contract (enforced by `validateHtmlDoc` on both sides): body markup only, every block a `data-section="<id>"` element with a header first and a footer last, primary links and buttons carry `data-cta`, forms are `<form data-pg-form="…" data-success="…">` with no action and no script, images only from tool results or the brand's own photos, CSS without `@import` or foreign `url()`, kit tokens (`--pg-brand-*`, `--pg-font-*`, `--pg-radius*`) for brand colour and type so a kit change re-themes the page.

## Rendering

`apps/web/src/components/pages/render-html.tsx` wraps the page in `.pg-root.pg-page` (kit variables, Google Fonts for the kit plus `meta.fonts`), injects the sanitised CSS and markup, and mounts the tracker. Sanitising is a real parser (`sanitize-html`) with an allowlist in `sanitize-page.ts`; CSS is text-filtered. The tracker now handles `pg:scrollTo` from the console and submits `form[data-pg-form]` to `/api/pages/form` itself. `html-base.css` is the only base styling.

## No sandbox

The agent writes data that our own app renders; nothing it produces executes. A Daytona or E2B sandbox would be the place to run agent-written code (a React project per page, say); until that happens the `DAYTONA_API_KEY` in `apps/agent/.env` is unused. Screenshots run in the agent process (Playwright, Chromium downloaded with `playwright install chromium`); `PAGES_WEB_URL` tells the agent where the web app is.

## The chat

Each agent turn is persisted as `steps` on the build message (`BuildStep`: `thought`, `tool` with a label, status and one-line summary, `text`) and rendered as a timeline: a shimmering "Thinking" line while reasoning streams, folded "Thought for 4s" afterwards, one row per tool call with what came back, then the reply. The agent emits `thought`, `tool_call` (with `label`) and `tool_result` (with `summary`) events; `routes._summarise` writes the summaries.

Images can be attached to any message (paperclip, paste or drop); they upload to Convex storage (`pages.attachmentUploadUrl`), travel as `attachments` on the build request and the stored message, and reach the model as inline image parts. Images attached to the first prompt are stored on the brief as `inspiration` and attached to every generate turn.

## More tools

`qloo_search` resolves any name to a Qloo entity; `qloo_insights` asks the taste graph directly (any entity type, tags, demographics; signals default to the audience's). `google_search` is ADK's search sub-agent (`GoogleSearchAgentTool`), the documented way to combine grounding with function tools; the agent is told to use it for facts, never design. `skills/qloo.md` teaches the agent the API through the two tools: what to ask for per entity type, the tag vocabularies, how to read affinity and demographics, the quirks we verified (age and gender only reshape, destinations take no location, affinity saturates, rate limits) and how to cite it.

## Still to do

A mobile screenshot in the review, a per-turn token and cost readout, and a way to pin a reference page as the structural model for a build.

## One page, one audience (2026-10-13)

A page is one version built for its audiences: none (everyone, from the brand's own Qloo read), one, or several combined into one group (`combine_audiences` in `builder.py` merges their profiles; briefs stay side by side). There are no per-audience versions, no visitor routing and no quiz any more: share each page's link with the people it was built for.

- Storage: `pagesVariants` keeps exactly one row per page (`page.defaultVariantId`), so events, stats, forms and sessions keep their variant keys. Its `name` is the audience label ("Berlin + Under 25s", "Everyone"); `audienceId` is set only for a single-audience page. `resolveVariant` always returns that row.
- Another audience is another page. The builder's `start_new_page(request, audience_ids)` tool streams a `new_page` event; the editor (`builder.tsx` → `useStartPage` in `builder/start-page.ts`, shared with the new-page screen) plans it with `/pages/plan` + `source_page_id` (goal, offer, CTA and items carry over), creates any new audiences and the page, and opens it with `?generate=1`. Edits pass the message's @mentions so the agent knows which audiences belong to this page.
- `pages:splitVersions` (internal) migrated pages that had several versions: the default stays as the page for everyone, each audience version becomes `<slug>-<audience>` / "<title> for <audience>" with its chat turns; `moveVersionData` re-points its analytics rows in batches.
- The demo seed builds each brief once for everyone and once per audience as separate pages.
