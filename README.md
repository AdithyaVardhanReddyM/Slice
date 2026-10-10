# Slice

A concierge with taste for every storefront. Slice gives businesses an embeddable agent that recommends from their own catalog using [Qloo](https://www.qloo.com/)'s cultural taste graph, so it works on a shopper's first visit with no history and no personal data.

## Repo layout

```
apps/
  web/        Next.js 16 — marketing site, merchant dashboard (Clerk), and /embed/* (the concierge UI the widget iframes)
  widget/     slice.js — the script tag merchants paste; mounts a launcher and iframes /embed/concierge
  agent/      Python ADK concierge agent (Gemini 3.8 Flash on Vertex AI); deployed to Agent Runtime
  stores/     Demo storefronts the widget is tested on (Marlow at /marlow, Fold at /fold); each embeds slice.js like a real merchant
packages/
  backend/    Convex — schema, queries/mutations/actions, auth config
  qloo/       Typed client for the Qloo API
  demo-catalogs/  Product catalogs for the demo stores (JSON + types), validator, Pexels image fetcher
```

How the pieces talk:

```
merchant site ── slice.js ──iframe──▶ web /embed/concierge ──▶ Convex (anonymous): questionnaire, taste profile
                                            │
                                            └──▶ web /api/concierge ──▶ agent POST /chat (ADK, Gemini on Vertex AI)
                                                                            ├──▶ Convex queries: catalog:recommend, catalog:search, taste:get
                                                                            └──▶ Convex /qloo (cache) and /agent/* (brief, signals, transcripts)
merchant      ──────────────────────▶ web /dashboard      ──▶ Convex (Clerk JWT)
```

How a recommendation is made (see `docs/test-taste-profiles.md` for shoppers to try):

1. **Taste capture** (`packages/backend/convex/taste.ts`): the questionnaire's options come from Qloo's view of the shopper's city (top artists, films and shows, books, places), plus an adaptive travel question from the answers so far and a free-text field. Every answer is a Qloo entity.
2. **Profile** (same file): Qloo's cross-domain read of those entities: aesthetic tags (`personal_style`, `lifestyle`, `emotional_tone`, …), cultural tags, brand affinities (open-ended, and restricted to the brands the store carries), and the audience skew. A deterministic pass matches Qloo's terms to the store's style vocabulary as hints.
3. **Brief** (`apps/agent/slice_agent/tools.py`, `set_taste_brief`): the agent translates the profile into the store's own styles, palette, materials and things to avoid, citing the Qloo evidence.
4. **Ranking** (`packages/backend/convex/catalog.ts`, `recommend`): products are scored by style weights, Qloo terms found in their copy, palette and materials, brand affinity and the shopper's ask. Never by rating, sales or newness.
5. **Picks** (`present_picks`): the agent chooses from the ranked candidates and writes a one-line reason per product. The widget shows every step under "How I chose these".

## Prerequisites

- Node ≥ 20.9
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- [uv](https://docs.astral.sh/uv/) and Python ≥ 3.11 (for `apps/agent`)
- A Convex project, a Clerk application, and a Google Cloud project with Vertex AI enabled

## Setup

```bash
pnpm install
```

### 1. Clerk

1. In the [Clerk dashboard](https://dashboard.clerk.com), open your app → **API keys** and copy the publishable and secret keys.
2. Open the [Convex integration page](https://dashboard.clerk.com/apps/setup/convex), select your app, and click **Activate Convex integration**. Copy the **Frontend API URL** it shows (`https://<something>.clerk.accounts.dev`).

### 2. Convex

```bash
pnpm --filter @slice/backend run convex:setup
```

Log in, choose **existing project**, and pick the project you created. This writes `packages/backend/.env.local` (`CONVEX_DEPLOYMENT`, `CONVEX_URL`).

The first push will fail until Convex knows the Clerk issuer. Set it (from another terminal), and the running `setup` retries on its own:

```bash
cd packages/backend && npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<something>.clerk.accounts.dev
```

Then give Convex the Qloo key and a secret for the agent's `/qloo` route (put the same secret in `apps/agent/.env` in step 4):

```bash
cd packages/backend && npx convex env set QLOO_API_KEY <hackathon key> && npx convex env set QLOO_PROXY_SECRET $(openssl rand -hex 32)
```

### 3. Env files

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/widget/.env.example apps/widget/.env.local
```

Fill `apps/web/.env.local` with `NEXT_PUBLIC_CONVEX_URL` (the `CONVEX_URL` from step 2) and the two Clerk keys. (`.env` works too; both are git-ignored.)

### 4. Agent

```bash
cp apps/agent/.env.example apps/agent/.env
```

Set your Google Cloud project and the absolute path to a service account key with the **Vertex AI User** role. `pnpm dev` runs `uv run adk web`, which installs the Python dependencies on first run.

### 5. Run

```bash
pnpm dev
```

| What                                | URL                                           |
| ----------------------------------- | --------------------------------------------- |
| Web (site + dashboard)              | http://localhost:3000                         |
| Widget playground (demo storefront) | http://localhost:5173                         |
| Demo stores (Marlow, Fold)          | http://localhost:3002/marlow, `/fold`         |
| Agent server (`POST /chat`)         | http://localhost:8000                         |
| Agent ADK dev UI (optional)         | `pnpm --filter @slice/agent dev:adk` → :8001  |
| Convex dashboard                    | `cd packages/backend && npx convex dashboard` |

## Environment variables

| Where                         | Variable                                                         | Notes                                                              |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/.env.local`         | `NEXT_PUBLIC_CONVEX_URL`                                         | Convex deployment URL                                              |
|                               | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`          | Clerk API keys                                                     |
|                               | `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in`, `/sign-up`                                             |
| `apps/widget/.env.local`      | `VITE_SLICE_APP_URL`                                             | Where the web app runs; the widget iframes `{url}/embed/concierge` |
| `apps/stores/.env.local`      | `NEXT_PUBLIC_SLICE_SCRIPT_URL`                                   | Where the demo stores load `slice.js` from (dev: the vite source)  |
| `packages/demo-catalogs/.env` | `PEXELS_API_KEY`                                                 | Only for `pnpm --filter @slice/demo-catalogs fetch-images`         |
| Convex (`npx convex env set`) | `CLERK_JWT_ISSUER_DOMAIN`                                        | Clerk Frontend API URL                                             |
|                               | `QLOO_API_KEY`                                                   | Hackathon key; only works against `https://hackathon.api.qloo.com` |
|                               | `QLOO_PROXY_SECRET`                                              | Bearer token for `POST /qloo`; shared with the agent               |
| `apps/agent/.env`             | `GOOGLE_GENAI_USE_ENTERPRISE`                                    | `true`: Gemini through Vertex AI, not AI Studio                    |
|                               | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`                  | Location must be `global` for `gemini-3.8-flash`                   |
|                               | `GOOGLE_APPLICATION_CREDENTIALS`                                 | Local dev only; Agent Runtime uses its own service identity        |
|                               | `CONVEX_SITE_URL`, `CONVEX_URL`, `QLOO_PROXY_SECRET`             | The agent reads via Convex's public query API and writes via `/agent/*`; Qloo only through the cached `/qloo` route |
|                               | `AGENT_ALLOW_ORIGINS`                                            | CORS for direct calls; the widget goes through `apps/web` `/api/concierge` |
| `apps/web/.env.local`         | `AGENT_URL`, `NEXT_PUBLIC_STORES_URL`                            | Agent server address; where product images and demo stores are served |

Server-side secrets (Google credentials, Qloo) live only in the agent and Convex, never in the Next.js or widget env. Don't commit Qloo responses to this repo: caching them privately on the server is allowed, publishing them is not. They're cached in Convex's `qlooCache` table (`packages/backend/convex/qloo.ts`); all Qloo calls go through it.

## Scripts

| Command                                                   | Does                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                                                | Convex dev + Next.js + widget playground + agent                            |
| `pnpm build`                                              | Production builds (web, widget)                                             |
| `pnpm typecheck` / `pnpm lint`                            | Across all packages                                                         |
| `pnpm format`                                             | Prettier                                                                    |
| `pnpm --filter @slice/demo-catalogs validate`             | Schema + style-coverage check on the demo catalogs                          |
| `pnpm --filter @slice/demo-catalogs fetch-images <store>` | Fetch a Pexels photo per product (`marlow`, `fold`; needs `PEXELS_API_KEY`) |
| `cd packages/backend && npx convex run qloo:warm`         | Pre-cache the Qloo requests in `convex/qlooWarmList.ts` before a demo       |
| `cd packages/backend && npx convex run seedDemo:seed`     | Load the Marlow and Fold catalogs into Convex (`{"storesUrl": ...}` to override localhost:3002) |
| `pnpm --filter @slice/demo-catalogs export-slice <store>` | Export a demo catalog in the Slice CSV format (`template` writes the empty template)          |

## Catalog import

Shopify and WooCommerce stores will sync automatically (see `docs/`); custom stores upload a CSV in the Slice format. The template is served at `/slice-catalog-template.csv` (source: `packages/demo-catalogs/src/slice-csv.ts`), and `catalogImport:importCsv` in Convex turns one into a store plus products. The demo catalogs exported in that format live in `packages/demo-catalogs/exports/`.

## Embedding the widget

```html
<script
  src="https://<your-cdn>/slice.js"
  data-slice-key="<merchant-key>"
  async
></script>
```

`pnpm --filter @slice/widget build` outputs `apps/widget/dist/slice.js`.

## License

MIT
