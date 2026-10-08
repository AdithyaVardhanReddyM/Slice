# Slice

A concierge with taste for every storefront. Slice gives businesses an embeddable agent that recommends from their own catalog using [Qloo](https://www.qloo.com/)'s cultural taste graph, so it works on a shopper's first visit with no history and no personal data.

## Repo layout

```
apps/
  web/        Next.js 16 — marketing site, merchant dashboard (Clerk), and /embed/* (the concierge UI the widget iframes)
  widget/     slice.js — the script tag merchants paste; mounts a launcher and iframes /embed/concierge
packages/
  backend/    Convex — schema, queries/mutations/actions, auth config; the agent runs here
  qloo/       Typed client for the Qloo API
```

How the pieces talk:

```
merchant site ── slice.js ──iframe──▶ web /embed/concierge ──▶ Convex (anonymous)
merchant      ──────────────────────▶ web /dashboard      ──▶ Convex (Clerk JWT)
Convex actions ──▶ Qloo API, LLM
```

## Prerequisites

- Node ≥ 20.9
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- A Convex project and a Clerk application

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

### 3. Env files

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/widget/.env.example apps/widget/.env.local
```

Fill `apps/web/.env.local` with `NEXT_PUBLIC_CONVEX_URL` (the `CONVEX_URL` from step 2) and the two Clerk keys.

### 4. Run

```bash
pnpm dev
```

| What                                | URL                                           |
| ----------------------------------- | --------------------------------------------- |
| Web (site + dashboard)              | http://localhost:3000                         |
| Widget playground (demo storefront) | http://localhost:5173                         |
| Convex dashboard                    | `cd packages/backend && npx convex dashboard` |

## Environment variables

| Where                         | Variable                                                         | Notes                                                              |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/.env.local`         | `NEXT_PUBLIC_CONVEX_URL`                                         | Convex deployment URL                                              |
|                               | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`          | Clerk API keys                                                     |
|                               | `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in`, `/sign-up`                                             |
| `apps/widget/.env.local`      | `VITE_SLICE_APP_URL`                                             | Where the web app runs; the widget iframes `{url}/embed/concierge` |
| Convex (`npx convex env set`) | `CLERK_JWT_ISSUER_DOMAIN`                                        | Clerk Frontend API URL                                             |
|                               | `QLOO_API_KEY`                                                   | Hackathon key; only works against `https://hackathon.api.qloo.com` |
|                               | `ANTHROPIC_API_KEY`                                              | When the agent lands                                               |

Server-side secrets (Qloo, LLM) live only in Convex, never in the Next.js or widget env. Don't commit Qloo responses to this repo: caching them privately on the server is allowed, publishing them is not.

## Scripts

| Command                        | Does                                     |
| ------------------------------ | ---------------------------------------- |
| `pnpm dev`                     | Convex dev + Next.js + widget playground |
| `pnpm build`                   | Production builds (web, widget)          |
| `pnpm typecheck` / `pnpm lint` | Across all packages                      |
| `pnpm format`                  | Prettier                                 |

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
