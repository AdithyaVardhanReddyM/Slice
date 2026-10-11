# Pages: demo and judge script

Two fake B2C brands live on the demo-stores app (`apps/stores`, port 3002): **Ridgeline Coffee Roasters** at `/ridgeline` and **Saltline Hotels** at `/saltline`. They are ordinary professional sites; everything the Pages service knows about them was read from those sites by intake. The customer datasets are in `packages/demo-data/data/`.

## Run it

```bash
pnpm dev                                  # web :3000, stores :3002, agent :8000, widget :5173
pnpm --filter @slice/demo-data generate   # (re)generate the two CSVs
pnpm --filter @slice/demo-data seed       # the whole pipeline for both brands, ~15 min cold
```

`seed` is idempotent: it finds brands, audiences and pages by slug and only generates variants that are not ready. `--only ridgeline|saltline`, `--reset` (wipe the brand first), `--no-traffic`. It prints the public URLs at the end.

Published pages are served at `http://{brand}.pages.localhost:3000/{page}` (Chrome resolves `*.localhost` on its own) and always at `http://localhost:3000/p/{brand}/{page}`.

## What is seeded

### Ridgeline Coffee Roasters (`/dashboard/pages/ridgeline`)

Audiences: Austin locals (location), Seattle commuters (location), Under 25 and 55 and over (demographics), four clusters from `ridgeline-customers.csv` (450 customers; the latent groups are third-wave pour-over drinkers, home-espresso convenience, holiday gift buyers, Austin early adopters).

| Page | Audiences | Scenario |
| --- | --- | --- |
| `austin` Austin café opening | Austin locals | Geo launch. `?city=Austin` (or a real Austin IP) gets the Austin version; anyone else the default. |
| `gifting` Holiday gifting | the four CSV clusters | Customer-data clusters. Compare variants in Analytics; the quiz bar resolves anonymous visitors. |
| `subscriptions` Subscriptions | Under 25, 55 and over, Seattle commuters | Demographics plus a campaign rule: `?utm_source=qr&utm_medium=ooh` (the Seattle poster QR) serves the Seattle version. |

### Saltline Hotels (`/dashboard/pages/saltline`)

Audiences: Londoners, New Yorkers, Berliners (location), three clusters from `saltline-guests.csv` (400 past guests: design and culture, food and wine, slow travel), and one personal lead (a London guest who stayed at Lisbon twice).

| Page | Audiences | Scenario |
| --- | --- | --- |
| `lisbon` Saltline Lisbon | Londoners, New Yorkers, Berliners | Origin-market versions: neighbourhood and dining picks chosen for the visitor's home-city taste. `?city=London`, `?city=Berlin`. |
| `marseille` Marseille, spring | three guest clusters + the lead | Pre-launch waitlist with a form; `?g=<memberId>` is the personal link from the email. |

## Judge script (10 minutes)

1. **Intake.** `/dashboard/pages/new`, paste `http://localhost:3002/saltline` (or any public brand URL), watch the steps. Review the kit (colours, fonts, logo, voice), the brief (items, proof, locations) and "What Qloo knows" (the brand's proxies, tags, similar brands, demographics). Save.
2. **Audiences.** Open Ridgeline → Audiences. Open "Austin locals": the Profile tab is Qloo's read of Austin (tags by type, artists, places, brands, demographics); the Brief tab is how the agent will speak to them; the Trace tab is every Qloo call. Open a CSV cluster and its Members tab. "New audience" shows the five sources (location, demographics, interests, CSV, CRM).
3. **Pages.** Ridgeline → Pages → Holiday gifting. Variant tabs along the top of the preview, one per cluster. "Why this version" lists every section with the Qloo evidence that drove it. Type an edit in the chat ("make the hero darker and lead with the gift subscription") and watch the preview update. Use the image tool to swap a hero image (Pexels search, describe and generate with Nano Banana, or paste a URL).
4. **Publish and routing.** Publish dialog: the public URL, per-audience links, the QR for the Seattle poster, UTM rules, geo and quiz toggles. Open `http://ridgeline.pages.localhost:3000/austin?city=Austin` and the same URL without the parameter; open `http://saltline.pages.localhost:3000/lisbon?city=London` then `?city=Berlin`. Open the gifting page in a private window and answer the three quiz questions.
5. **Analytics.** Ridgeline → Pages → Holiday gifting → Analytics. Variant comparison with lift against the default, time series, hourly grid, breakdowns, the click heat map over the preview, the section funnel, form submissions (Saltline Marseille), and the live feed: your own visits from step 4 appear within seconds.

## Where things live

| Part | Path |
| --- | --- |
| Backend (Convex) | `packages/backend/convex/pages*.ts`, routes in `http.ts` |
| Shared types | `packages/backend/convex/pagesTypes.ts` |
| Agent (intake, audience briefs, builder, images) | `apps/agent/slice_pages/` |
| Renderer, published route, tracker | `apps/web/src/components/pages/`, `apps/web/src/app/p/` |
| Console | `apps/web/src/app/(app)/dashboard/pages/`, `apps/web/src/components/console/pages/` |
| Demo sites | `apps/stores/src/app/ridgeline/`, `apps/stores/src/app/saltline/` |
| Datasets and seed | `packages/demo-data/` |

Keys: `FIRECRAWL_API_KEY` (optional, public sites) and `PEXELS_API_KEY` go in `apps/agent/.env`; Nano Banana model ids are `NANO_BANANA_2_MODEL` and `NANO_BANANA_PRO_MODEL` in the same file.
