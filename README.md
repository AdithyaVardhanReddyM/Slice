# Slice

A concierge with taste for every storefront. Slice gives businesses an embeddable agent that recommends from their own catalog using [Qloo](https://www.qloo.com/)'s cultural taste graph, so it works on a shopper's first visit with no history and no personal data.

## Repo layout

```
apps/
  web/        Next.js 16 — marketing site, merchant dashboard (Clerk), and /embed/* (the concierge UI the widget iframes)
  widget/     slice.js — the script tag merchants paste; mounts a launcher and iframes /embed/concierge
  agent/      Python ADK concierge agent (Gemini 3.8 Flash on Vertex AI); deployed to Agent Runtime
  stores/     Demo storefronts the widget is tested on (Marlow at /marlow); each embeds slice.js like a real merchant
packages/
  backend/    Convex — schema, queries/mutations/actions, auth config
  qloo/       Typed client for the Qloo API
  demo-catalogs/  Product catalogs for the demo stores (JSON + types), validator, Pexels image fetcher
```

How the pieces talk:

```
merchant site ── slice.js ──iframe──▶ web /embed/concierge ──▶ Convex (anonymous)
merchant      ──────────────────────▶ web /dashboard      ──▶ Convex (Clerk JWT)
backend ──▶ agent (ADK on Agent Runtime) ──▶ Gemini (Vertex AI)
                                          └──▶ Convex POST /qloo (cache) ──▶ Qloo API
```

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
| Demo stores (Marlow)                | http://localhost:3002/marlow                  |
| Agent (ADK dev UI + API)            | http://localhost:8000                         |
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
|                               | `CONVEX_SITE_URL`, `QLOO_PROXY_SECRET`                           | The agent reaches Qloo only through Convex's cached `/qloo` route  |

Server-side secrets (Google credentials, Qloo) live only in the agent and Convex, never in the Next.js or widget env. Don't commit Qloo responses to this repo: caching them privately on the server is allowed, publishing them is not. They're cached in Convex's `qlooCache` table (`packages/backend/convex/qloo.ts`); all Qloo calls go through it.

## Scripts

| Command                                                  | Does                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                               | Convex dev + Next.js + widget playground + agent                      |
| `pnpm build`                                             | Production builds (web, widget)                                       |
| `pnpm typecheck` / `pnpm lint`                           | Across all packages                                                   |
| `pnpm format`                                            | Prettier                                                              |
| `pnpm --filter @slice/demo-catalogs validate`            | Schema + style-coverage check on the demo catalogs                    |
| `pnpm --filter @slice/demo-catalogs fetch-images marlow` | Fetch a Pexels photo per product (needs `PEXELS_API_KEY`)             |
| `cd packages/backend && npx convex run qloo:warm`        | Pre-cache the Qloo requests in `convex/qlooWarmList.ts` before a demo |

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
