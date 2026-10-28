# Deploying Slice

Written 2026-10-28, when everything first went live. What runs where, how to ship a change, and what to switch off after judging.

## What runs where

| Piece | Where | Address |
| --- | --- | --- |
| Web app (`apps/web`): landing, console, `/embed`, published pages, `/slice.js` | Vercel project `slice-agents` | https://slice-agents.vercel.app |
| Marlow and Fold storefronts (`apps/stores`, `STORE=marlow,fold`) | Vercel project `slice-shops` | https://slice-shops.vercel.app/marlow, `/fold` |
| Six brand sites the demos use (Tágide, Gwen, Knock, Half Moon, Stackhouse, Covers) | One Vercel project each (see the `vercel-store-deploys` note in memory) | `https://<project>.vercel.app/<store>` |
| Agent (`apps/agent/server.py`: concierge, Pages, Email, Media) | Cloud Run `slice-agent`, us-east4 | https://slice-agent-295933863137.us-east4.run.app |
| Slice for Mac brain (`apps/agent/mac_server.py`, `/mac/live`) | Cloud Run `slice-brain`, us-central1 | wss://slice-brain-295933863137.us-central1.run.app/mac/live (also answers as slice-brain-5xsuts722q-uc.a.run.app) |
| Slice for Mac DMG | GCS bucket `slice-for-mac` (public) | https://storage.googleapis.com/slice-for-mac/Slice.dmg |
| Database, files, Qloo cache | Convex `elated-zebra-414` (the same deployment local dev uses) | https://elated-zebra-414.convex.cloud |
| Sign-in | Clerk development instance (the same keys as local) | |

GCP project: `cortana-505209`. Vercel account: `adithyavardhanreddym` (Hobby).

Why Cloud Run and not Agent Engine: the agent is a FastAPI app with its own routes, NDJSON streams, a WebSocket (Gemini Live), headless Chromium, ffmpeg and jobs that keep running after their request returns. Agent Engine only serves an ADK agent behind its own query API.

## Shipping a change

- **Web and stores:** push to `main`. Vercel builds each project from Git. The store projects skip the build when nothing they ship changed (`apps/stores/scripts/vercel-ignore.sh`).
- **Agent:** `cd apps/agent && WEB_URL=https://slice-agents.vercel.app ./scripts/deploy-cloud-run.sh agent`
- **Mac brain:** `cd apps/agent && ./scripts/deploy-cloud-run.sh`
- **Mac app:** see `docs/mac-release.md` (unnotarized build, uploaded to the bucket above).
- **Convex functions:** `cd packages/backend && npx convex dev --once` (production and local dev share the deployment).

## How the pieces trust each other

- The web app calls the agent server-side only, with `AGENT_URL` and `AGENT_API_KEY` (Vercel env). The agent rejects every request outside `/health` and `/mac/*` without that key (`RequireKey` in `server.py`). The key is the Secret Manager secret `slice-agent-api-key`.
- Before forwarding, the web app's `/api/pages/*`, `/api/email/*` and `/api/media/*` routes require a signed-in Clerk user who owns the brand, page, audience, campaign or list the body names (`api/pages/_lib/guard.ts`, `api/media/_lib/guard.ts`). Only `/api/pages/track` and `/api/pages/form` stay anonymous, for published pages.
- The Mac app sends `MAC_CLIENT_TOKEN` (secret `slice-mac-client-token`, baked into the DMG).
- Other agent secrets live in Secret Manager and are mounted as env vars: `slice-qloo-proxy-secret`, `slice-catalog-secret-key`, `slice-firecrawl-api-key`, `slice-pexels-api-key`, `slice-composio-api-key`, `slice-mac-composio-api-key`.
- Vertex AI is reached as the service account `slice-brain@cortana-505209.iam.gserviceaccount.com` (Vertex AI User); no key file is deployed.

## Settings worth knowing

- **Agent:** one instance (min 1, max 1), 2 CPU, 4 GiB, CPU always allocated, 80 concurrent requests, 60-minute timeout. One instance because chat sessions, Pages builds and Media/Email jobs live in its memory, and Vercel's server-to-server calls carry no affinity cookie. CPU always on because Media and Email jobs run after the request that started them returns.
- **Vercel Hobby** caps a function at 300 s, so long streams (a Pages build, a Media studio turn) are cut at 5 minutes. Pro allows 800 s.
- **Published pages** live at `https://slice-agents.vercel.app/p/{brand}/{page}`: `NEXT_PUBLIC_PAGES_HOST=slice-agents.vercel.app/p` puts the brand in the path, because `*.vercel.app` has no wildcard subdomains. With your own domain, set it to `pages.example.com` and add a wildcard domain to the project.
- **Demo catalogs** (Marlow, Fold) point at `https://slice-shops.vercel.app`. Moved off localhost with `npx convex run seedDemo:rehost '{"from":"http://localhost:3002","to":"https://slice-shops.vercel.app"}'`; run it the other way round if you need local images while offline.
- **Marlow's widget** only opens on its allowed domains: `marlow.co` and `slice-shops.vercel.app` (localhost always works).

## After judging

```sh
gcloud run services update slice-agent --region us-east4 --min-instances 0 --project cortana-505209
gcloud run services update slice-brain --region us-central1 --min-instances 0 --project cortana-505209
```

Or delete them. The always-on agent instance (2 CPU, 4 GiB, CPU always allocated) costs roughly $100 a month; the brain's idle instance much less.
