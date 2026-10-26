# Slice for Mac: shipping it to judges

Written 2026-10-26. The goal is a download a judge can open on their own Mac with no setup: a notarized DMG whose app talks to a hosted brain. Three things make that work, and you do each of them once.

1. A **Developer ID Application** certificate, so macOS lets other people's Macs open the app.
2. A **notarytool profile** called `slice-notary`, so the build can send the app to Apple for notarization.
3. The **brain on Google Cloud Run**, so the app has something to talk to that isn't `127.0.0.1`.

Then one command builds the DMG.

## What was added

| File | What it does |
| --- | --- |
| `apps/mac/scripts/release.sh` | Checks this Mac, archives the Release build, exports it Developer ID signed, notarizes and staples the app, builds the DMG, signs, notarizes and staples that, and prints where it is. Output goes to `apps/mac/build/release` (already gitignored). |
| `apps/mac/project.yml` and `apps/mac/Sources/Agent/BrainSettings.swift` | The Info.plist keys `SliceBrainURL` and `SliceBrainToken`, filled from the `SLICE_BRAIN_URL` and `SLICE_BRAIN_TOKEN` build settings. A fresh install connects to that address. With them empty (every Debug build) the app uses `ws://127.0.0.1:8000/mac/live` as before. |
| `apps/agent/mac_server.py` | A small server app that mounts only the `/mac/*` routes. The hosted brain runs this, not `server.py`. |
| `apps/agent/Dockerfile`, `.dockerignore`, `.gcloudignore` | The brain's image: Python 3.13, dependencies from `uv.lock`, headless Chromium for the large-print PDF. |
| `apps/agent/scripts/deploy-cloud-run.sh` | `setup` (once) and deploy. Builds with Cloud Build and deploys to Cloud Run in `us-central1`. |

Two choices worth knowing about:

- **The hosted brain only serves `/mac/*`.** `server.py` also mounts the concierge, Pages, Email and Media services, and only the Mac routes check `MAC_CLIENT_TOKEN`. Put `server.py` on a public address and anyone could start Pages or Media jobs on your Gemini bill. `mac_server.py` avoids that, and it refuses to start on Cloud Run if `MAC_CLIENT_TOKEN` is missing. Set `APP_MODULE=server:app` on the container if you ever want everything.
- **The token is baked into the app.** That means a judge opens the app and it works. It also means anyone who unpacks the app can read the token. Treat it as a door lock for the judging period, not a secret: when judging is over, delete the Cloud Run service or add a new secret version and redeploy. If you would rather not ship it, leave `SLICE_BRAIN_TOKEN` out of the build and give judges the token to paste into Settings, Brain, Token.

## Step 1: the Developer ID Application certificate

You have an Apple Development certificate. That signs builds for your own Mac. Judges need Developer ID.

In Xcode: Settings, Accounts, pick the team (5Q3KU6MZ8A), Manage Certificates, the + button, Developer ID Application. Usually only the team's Account Holder can do this. If the option is greyed out, ask the Account Holder to do it, or to add you as an Admin.

Or on the web: in Keychain Access choose Certificate Assistant, Request a Certificate from a Certificate Authority, save the request to disk. Then at developer.apple.com, Certificates, Identifiers & Profiles, Certificates, +, Developer ID Application, upload the request, download the `.cer` and double-click it.

Check it worked. This should print one line:

```sh
security find-identity -v -p codesigning | grep "Developer ID Application"
```

## Step 2: the notarization login

Make an app-specific password at appleid.apple.com, Sign-In and Security, App-Specific Passwords. Then store it in your keychain once:

```sh
xcrun notarytool store-credentials slice-notary \
  --apple-id YOU@EXAMPLE.COM --team-id 5Q3KU6MZ8A --password abcd-efgh-ijkl-mnop
```

Leave out `--password` and it asks you for it instead, so it stays out of your shell history. Check it:

```sh
xcrun notarytool history --keychain-profile slice-notary
```

## Step 3: host the brain on Cloud Run

You need the `gcloud` CLI signed in as someone who can create resources in the project (`gcloud auth login`). The script takes the project from `GOOGLE_CLOUD_PROJECT` in `apps/agent/.env`, or from `GCP_PROJECT`, or from `gcloud config`, and shows it before it does anything.

```sh
cd apps/agent
./scripts/deploy-cloud-run.sh setup     # once
./scripts/deploy-cloud-run.sh           # every time you want to ship a new brain
```

`setup` asks before it starts, then:

- turns on the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Vertex AI APIs,
- creates the image repository `slice` in `us-central1`,
- creates the service account `slice-brain` and gives it the Vertex AI User role (the brain reaches Gemini with that account, so no key file is deployed),
- creates the secrets in Secret Manager from `apps/agent/.env`: `slice-qloo-proxy-secret` and `slice-mac-composio-api-key` (from `COMPOSIO_MAC_API_KEY`), plus `slice-ticketmaster-api-key` if the key is in `.env`. It makes `slice-mac-client-token` as a new random token, and lets the service account read each one.

If a value is missing from `.env`, setup stops and tells you the one command to create that secret yourself. Setup never prints a secret.

The deploy asks once more, uploads `apps/agent` to Cloud Build (never `.env`; the script checks that before it uploads), builds the image, and deploys the service `slice-brain` with:

- Region `us-central1`, because Gemini Live is only served there (the other models use `GOOGLE_CLOUD_LOCATION=global`, which the script sets).
- A request timeout of 3600 seconds, the most Cloud Run allows. A Live conversation lasts about ten minutes and the app opens a new one by itself, but the WebSocket between the app and the brain is cut at the timeout, so expect one reconnect an hour. The app already reconnects with backoff.
- Session affinity on, minimum 1 instance (no cold start when a judge opens the app), maximum 4, 2 CPU, 2 GiB, 40 concurrent connections per instance.
- `--allow-unauthenticated`, because Cloud Run's own login would fight with the app's bearer token. The token is the lock. If your organisation blocks public Cloud Run services, the deploy fails at this step and you will need an exception.
- Secrets passed as `MAC_CLIENT_TOKEN`, `QLOO_PROXY_SECRET`, `COMPOSIO_MAC_API_KEY` (and `TICKETMASTER_API_KEY`). `CONVEX_URL` and `CONVEX_SITE_URL` are read from your environment or `.env` and passed as plain variables, since they are addresses.

At the end it checks the service and prints the address:

```
Brain address for the Mac app:  wss://slice-brain-xxxxx-uc.a.run.app/mac/live
```

If the build fails with "permission denied", the script prints the one `gcloud projects add-iam-policy-binding` command that fixes it (newer projects build as the default compute account) and you run the script again.

Before spending time on the DMG, try the hosted brain from your normal dev build: run the app (`pnpm --filter @slice/mac app`), open Settings, Brain, paste the address and the token (`gcloud secrets versions access latest --secret slice-mac-client-token`), press Connect, hold fn and control and say something. The address you saved there sticks to your dev install; run `defaults delete ai.slice.mac brainURL` to go back to the local server.

Cost: one always-on instance with 2 CPU and 2 GiB, plus Gemini Live usage. After judging, scale it to zero or delete it:

```sh
gcloud run services update slice-brain --region us-central1 --min-instances 0
gcloud run services delete slice-brain --region us-central1
```

## Step 4: build the DMG

Check the Mac is ready, then build. With the certificate and notary profile in place, `release:check` ends with "Ready".

```sh
pnpm --filter @slice/mac release:check

SLICE_BRAIN_URL=wss://slice-brain-xxxxx-uc.a.run.app/mac/live \
SLICE_BRAIN_TOKEN=$(gcloud secrets versions access latest --secret slice-mac-client-token) \
  pnpm --filter @slice/mac release
```

The deploy script prints this command with your address filled in. The build takes a few minutes plus however long Apple takes to notarize (the app and then the DMG, usually a few minutes each). When it finishes it prints:

```
apps/mac/build/release/Slice-0.1.0.dmg
```

The version comes from `MARKETING_VERSION` in `apps/mac/project.yml`. Raise `CURRENT_PROJECT_VERSION` too if you ship a second build. If Apple rejects the app, the script prints Apple's report and stops. The logs for every step are in `apps/mac/build/release/logs`, with the token blanked out.

## Step 5: check it like a judge, then send it

Do this once before you send the file out.

1. Get the DMG onto a Mac that has never seen the project (or a second user account on yours), by AirDrop or by downloading it from wherever you will host it. Downloading is what makes macOS check the notarization, a copy on your own disk skips that check.
2. Open it. It should show Slice and an Applications shortcut with no warning.
3. Drag Slice onto Applications, open it from there. macOS says it was downloaded from the internet and asks to open it. That is normal for a notarized app. There is no Dock icon: look for Slice in the menu bar and the notch.
4. macOS asks for Microphone, Accessibility, Screen Recording and so on as the app needs them, and Settings lists them. Judges will see the same prompts.
5. Hold fn and control and talk. The status in Settings, Brain should say it is connected.

You can also run these on the file: `spctl --assess --type open --context context:primary-signature -v Slice-0.1.0.dmg` and `xcrun stapler validate Slice-0.1.0.dmg`. The release script already runs both.

### What to tell judges

- Slice runs on macOS 15 or later, on Apple silicon and Intel, and needs an internet connection.
- Open the DMG, drag Slice onto Applications, open it from Applications.
- Slice lives in the menu bar and the notch. Hold fn and control to talk, or hover over the notch to type.
- Say yes to the permission prompts (Microphone first). Without Accessibility and Screen Recording it can talk but not look at or act on the screen.
- If the brain does not connect and you did not bake the token in: Settings, Brain, Token, paste the token, Connect.

## What was checked, and what was not

Checked on this Mac, 2026-10-26:

- `bash -n` on both scripts, and `release.sh --check` run for real. With no Developer ID certificate it lists the three problems (no certificate, no `slice-notary` profile, no brain address) with the fix for each, and exits without building anything.
- `deploy-cloud-run.sh` against your real project in read-only mode: it correctly reported that the service account, repository and secrets do not exist yet. `setup` and the deploy were then run against a stand-in `gcloud` that records what it is asked to do; they issue the expected commands in order and print no secret values. `gcloud meta list-files-for-upload` confirms `.env`, `.venv` and `__pycache__` are not uploaded.
- A Release archive with an Apple Development certificate in place of Developer ID: it succeeds, is a universal binary (arm64 and x86_64), is signed with the hardened runtime and a secure timestamp, has the same entitlements as Debug, embeds no frameworks, and has `SliceBrainURL` and `SliceBrainToken` in its Info.plist. The export options file passes `plutil -lint` and `xcodebuild -exportArchive` accepts it (it stops only because no Developer ID certificate exists).
- The DMG layout: `hdiutil` builds a DMG with the app and an Applications shortcut, `hdiutil verify` passes, `codesign` signs it.
- The Debug build (`apps/mac/scripts/run.sh --build`) still builds, and its Info.plist has the two keys empty, so Debug still uses the local server.
- The Docker image builds (Python 3.13, 1.99 GB, dependencies from `uv.lock`). Run locally with a made-up token: `/health` and `/mac/health` answer, `/mac/search` without the token gives 401, the `/mac/live` WebSocket is accepted with the token and refused without it, `/chat` and `/pages/build` do not exist, and Chromium renders a PDF as the non-root user. With `K_SERVICE` set and no token it refuses to start.

Not checked, because it needs your accounts or spends money:

- Signing with a real Developer ID certificate, notarization, stapling, and the Gatekeeper check. `release.sh` has not been run end to end. The notarization step reads `notarytool`'s normal text output, which was not exercised here.
- Cloud Build and the Cloud Run deploy, the permissions they need on your project, and the public address.
- A Gemini Live conversation through the hosted brain, and Composio account connections from a hosted address.
- A Release app on a second Mac.
- DMG window styling: the DMG opens with Finder's default layout, with no background picture or placed icons.
- `hdiutil create` prints a deprecation notice on this version of macOS, pointing at `diskutil image create`. It still works, and it is the tool you asked for.

One small thing in the app itself: the Settings window footer says "keep" followed by the default address, written for developers. In a release build it will show the hosted address. `SettingsView.swift` was left alone; `BrainSettings.localURL` is the local address if you want the footer to keep showing that.
