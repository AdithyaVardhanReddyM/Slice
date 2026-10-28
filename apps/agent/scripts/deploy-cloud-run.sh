#!/bin/bash
# Host the Slice agents on Google Cloud Run: the Slice for Mac brain, and the agent the web app calls.
#
#   ./scripts/deploy-cloud-run.sh setup     once per project: APIs, image repository, service
#                                           account, and the secrets in Secret Manager
#   ./scripts/deploy-cloud-run.sh           build the image with Cloud Build and deploy the brain
#   ./scripts/deploy-cloud-run.sh agent     the same image as the agent (server:app), for the web app
#   ./scripts/deploy-cloud-run.sh --yes     the same without the "go ahead?" question
#
# Run from anywhere; it works inside apps/agent. The brain serves mac_server:app (only /mac/*). The
# agent serves server:app (concierge, Pages, Email, Media) and answers only requests that carry
# AGENT_API_KEY, which the web app sends; it needs WEB_URL (the web app's https address).
# Docs: docs/mac-release.md, docs/deploy.md.
#
# Where things come from (nothing secret is ever printed):
#   project            GCP_PROJECT, else GOOGLE_CLOUD_PROJECT in apps/agent/.env, else `gcloud config`
#   CONVEX_URL, CONVEX_SITE_URL     the environment, else apps/agent/.env (they are addresses, not secrets)
#   secrets            Secret Manager, see SECRETS below. `setup` fills them from apps/agent/.env
#                      and makes the random ones (client token, agent key, catalog key).
#
# Settings you may override in the environment:
#   brain: REGION=us-central1 (Gemini Live is only served there)  SERVICE=slice-brain
#          MIN_INSTANCES=1  MAX_INSTANCES=4  CPU=2  MEMORY=2Gi  CONCURRENCY=40  TIMEOUT=3600
#   agent: REGION=us-east4 (next to Vercel and Convex)  SERVICE=slice-agent
#          MIN_INSTANCES=1  MAX_INSTANCES=1  CPU=2  MEMORY=4Gi  CONCURRENCY=80  TIMEOUT=3600
#          One instance, CPU always on: chat sessions and Media/Email jobs live in its memory
#          and keep running after the request that started them returns.
#   both:  REPO=slice  REPO_REGION=us-central1 (where images are kept)
set -euo pipefail

cd "$(dirname "$0")/.."   # apps/agent

MODE="deploy"
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    setup) MODE="setup" ;;
    deploy|brain) MODE="deploy" ;;
    agent) MODE="agent" ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\n%s\n' "$1" >&2; exit 1; }

# A value from apps/agent/.env, or nothing. Never echoed by this script.
dotenv_get() {
  [ -f .env ] || return 0
  local line
  line="$(grep -E "^$1=" .env | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"; line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

command -v gcloud >/dev/null 2>&1 || die "gcloud is not installed (https://cloud.google.com/sdk/docs/install)."

PROJECT="${GCP_PROJECT:-$(dotenv_get GOOGLE_CLOUD_PROJECT)}"
[ -n "$PROJECT" ] || PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
REPO="${REPO:-slice}"
REPO_REGION="${REPO_REGION:-us-central1}"
SA_NAME="${SA_NAME:-slice-brain}"
TIMEOUT="${TIMEOUT:-3600}"   # seconds; Cloud Run's maximum. A WebSocket is cut at this age and the app reconnects.
if [ "$MODE" = "agent" ]; then
  REGION="${REGION:-us-east4}"
  SERVICE="${SERVICE:-slice-agent}"
  MIN_INSTANCES="${MIN_INSTANCES:-1}"
  MAX_INSTANCES="${MAX_INSTANCES:-1}"
  CPU="${CPU:-2}"
  MEMORY="${MEMORY:-4Gi}"
  CONCURRENCY="${CONCURRENCY:-80}"
else
  REGION="${REGION:-us-central1}"
  SERVICE="${SERVICE:-slice-brain}"
  MIN_INSTANCES="${MIN_INSTANCES:-1}"
  MAX_INSTANCES="${MAX_INSTANCES:-4}"
  CPU="${CPU:-2}"
  MEMORY="${MEMORY:-2Gi}"
  CONCURRENCY="${CONCURRENCY:-40}"
fi
WEB_URL="${WEB_URL:-}"
WEB_URL="${WEB_URL%/}"
VERTEX_LOCATION="${VERTEX_LOCATION:-$(dotenv_get GOOGLE_CLOUD_LOCATION)}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
CONVEX_URL="${CONVEX_URL:-$(dotenv_get CONVEX_URL)}"
CONVEX_SITE_URL="${CONVEX_SITE_URL:-$(dotenv_get CONVEX_SITE_URL)}"

[ -n "$PROJECT" ] || die "No Google Cloud project. Set GCP_PROJECT=your-project-id, or run: gcloud config set project your-project-id"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
IMAGE_REPO="$REPO_REGION-docker.pkg.dev/$PROJECT/$REPO"

# Secret Manager name : environment variable : required? ("random" = setup makes one if .env has none)
BRAIN_SECRETS=(
  "slice-mac-client-token:MAC_CLIENT_TOKEN:random"
  "slice-qloo-proxy-secret:QLOO_PROXY_SECRET:required"
  # The Mac app's own Composio project (slice_mac/accounts.py), not the Pages one.
  "slice-mac-composio-api-key:COMPOSIO_MAC_API_KEY:required"
  "slice-ticketmaster-api-key:TICKETMASTER_API_KEY:optional"
)
AGENT_SECRETS=(
  # The web app sends this on every call (apps/web/src/lib/agent.ts); set it there as AGENT_API_KEY.
  "slice-agent-api-key:AGENT_API_KEY:random"
  "slice-qloo-proxy-secret:QLOO_PROXY_SECRET:required"
  # Encrypts WooCommerce keys at rest (slice_catalog/vault.py).
  "slice-catalog-secret-key:CATALOG_SECRET_KEY:random"
  "slice-firecrawl-api-key:FIRECRAWL_API_KEY:optional"
  "slice-pexels-api-key:PEXELS_API_KEY:optional"
  # Pages CRM audiences (slice_pages), not the Mac app's Composio project.
  "slice-composio-api-key:COMPOSIO_API_KEY:optional"
)
if [ "$MODE" = "agent" ]; then SECRETS=("${AGENT_SECRETS[@]}")
elif [ "$MODE" = "setup" ]; then SECRETS=("${BRAIN_SECRETS[@]}" "${AGENT_SECRETS[@]}")
else SECRETS=("${BRAIN_SECRETS[@]}"); fi

SECRET_MAPPING=""

secret_exists() { gcloud secrets describe "$1" --project "$PROJECT" >/dev/null 2>&1; }

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  local answer
  read -r -p "$1 [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || die "Stopped. Nothing was changed."
}

# ---------------------------------------------------------------------------------------
# setup: run once. Everything is skipped if it already exists.
# ---------------------------------------------------------------------------------------
if [ "$MODE" = "setup" ]; then
  say "Setting up project $PROJECT (images in $REPO_REGION)"
  echo "    Enables the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Vertex AI APIs;"
  echo "    makes the image repository '$REPO' and the service account $SA (Vertex AI User);"
  echo "    stores the brain's secrets in Secret Manager from apps/agent/.env."
  confirm "Go ahead?"

  say "Enabling APIs"
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com aiplatform.googleapis.com iam.googleapis.com --project "$PROJECT"

  say "Image repository $REPO"
  if gcloud artifacts repositories describe "$REPO" --location "$REPO_REGION" --project "$PROJECT" >/dev/null 2>&1; then
    echo "    already there"
  else
    gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REPO_REGION" \
      --description "Slice images" --project "$PROJECT"
  fi

  say "Service account $SA"
  if gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
    echo "    already there"
  else
    gcloud iam service-accounts create "$SA_NAME" --display-name "Slice brain" --project "$PROJECT"
  fi
  # Gemini on Vertex AI uses this account's credentials, so no key file is ever deployed.
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" \
    --role roles/aiplatform.user --condition None --quiet >/dev/null
  echo "    has Vertex AI User"

  say "Secrets"
  for entry in "${SECRETS[@]}"; do
    IFS=: read -r secret var need <<<"$entry"
    if secret_exists "$secret"; then
      echo "    $secret: already there"
    else
      value="$(dotenv_get "$var")"
      if [ "$need" = "random" ] && [ -z "$value" ]; then
        value="$(openssl rand -hex 24)"
        echo "    $secret: made a new random token"
      fi
      if [ -z "$value" ]; then
        if [ "$need" = "required" ]; then
          die "$var is not in apps/agent/.env, so $secret cannot be created. Add it there, or create it yourself:
  printf '%s' 'THE-VALUE' | gcloud secrets create $secret --data-file=- --project $PROJECT"
        fi
        echo "    $secret: no $var in apps/agent/.env, skipped (optional)"
        continue
      fi
      printf '%s' "$value" | gcloud secrets create "$secret" --data-file=- --replication-policy automatic \
        --project "$PROJECT" >/dev/null
      echo "    $secret: created"
    fi
    secret_exists "$secret" || continue
    gcloud secrets add-iam-policy-binding "$secret" --member "serviceAccount:$SA" \
      --role roles/secretmanager.secretAccessor --project "$PROJECT" --quiet >/dev/null
  done

  say "Setup done"
  echo "    Next: ./scripts/deploy-cloud-run.sh"
  exit 0
fi

# ---------------------------------------------------------------------------------------
# deploy
# ---------------------------------------------------------------------------------------
say "Checking"
PROBLEMS=()
problem() { PROBLEMS+=("$1"); }

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
[ -n "$ACCOUNT" ] || problem "gcloud is not signed in. Run: gcloud auth login"
[ -f Dockerfile ] || problem "apps/agent/Dockerfile is missing."
[ -n "$CONVEX_URL" ] || problem "CONVEX_URL is not set (the https://....convex.cloud address). Export it, or put it in apps/agent/.env."
[ "$MODE" != "agent" ] || [ -n "$WEB_URL" ] || problem "WEB_URL is not set (the web app's https address, e.g. https://slice.vercel.app). The agent's Pages builder renders pages there, and CORS allows it."
[ -n "$CONVEX_SITE_URL" ] || problem "CONVEX_SITE_URL is not set (the https://....convex.site address). Export it, or put it in apps/agent/.env."

if [ -n "$ACCOUNT" ]; then
  if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
    problem "The service account $SA does not exist in $PROJECT (or you cannot see it). Run: ./scripts/deploy-cloud-run.sh setup"
  fi
  if ! gcloud artifacts repositories describe "$REPO" --location "$REPO_REGION" --project "$PROJECT" >/dev/null 2>&1; then
    problem "The image repository '$REPO' does not exist in $REPO_REGION. Run: ./scripts/deploy-cloud-run.sh setup"
  fi
  for entry in "${SECRETS[@]}"; do
    IFS=: read -r secret var need <<<"$entry"
    if secret_exists "$secret"; then
      SECRET_MAPPING="${SECRET_MAPPING:+$SECRET_MAPPING,}$var=$secret:latest"
    elif [ "$need" != "optional" ]; then
      problem "The secret $secret ($var) is not in Secret Manager. Run: ./scripts/deploy-cloud-run.sh setup"
    else
      echo "    optional secret $secret not found, deploying without $var"
    fi
  done
fi

if [ "${#PROBLEMS[@]}" -gt 0 ]; then
  echo >&2
  echo "Not ready to deploy (${#PROBLEMS[@]} thing(s) to fix):" >&2
  n=0
  for p in "${PROBLEMS[@]}"; do n=$((n + 1)); printf '\n  %d. %s\n' "$n" "$p" >&2; done
  echo >&2
  exit 1
fi

# The build uploads this folder to Google. apps/agent/.env (real keys) must not go with it.
UPLOAD_LIST="$(gcloud meta list-files-for-upload . 2>/dev/null || true)"
if grep -qx '\.env' <<<"$UPLOAD_LIST"; then
  die "apps/agent/.gcloudignore does not exclude .env; refusing to upload your keys. Restore that file."
fi

IMAGE="$IMAGE_REPO/$SERVICE:$(date +%Y%m%d-%H%M%S)"
echo "    Account:  $ACCOUNT"
echo "    Project:  $PROJECT"
echo "    Service:  $SERVICE in $REGION ($MIN_INSTANCES to $MAX_INSTANCES instances, $CPU CPU, $MEMORY, timeout ${TIMEOUT}s, session affinity)"
[ "$MODE" != "agent" ] || echo "    Web app:  $WEB_URL"
echo "    Image:    $IMAGE"
echo "    Secrets:  ${SECRET_MAPPING//:latest/}"
confirm "Build and deploy this? It uses Cloud Build and Cloud Run in $PROJECT and is billed there."

say "Building the image with Cloud Build (about 5 minutes the first time)"
if ! gcloud builds submit . --project "$PROJECT" --tag "$IMAGE"; then
  die "The build failed. If the log says permission denied, give the Cloud Build account its role:
  PN=\$(gcloud projects describe $PROJECT --format 'value(projectNumber)')
  gcloud projects add-iam-policy-binding $PROJECT --member serviceAccount:\$PN-compute@developer.gserviceaccount.com --role roles/cloudbuild.builds.builder
then run this script again."
fi

say "Deploying to Cloud Run"
# "^@^" makes @ the separator between variables, so values may contain commas.
ENV_VARS="^@^GOOGLE_GENAI_USE_ENTERPRISE=true@GOOGLE_CLOUD_PROJECT=$PROJECT@GOOGLE_CLOUD_LOCATION=$VERTEX_LOCATION"
ENV_VARS="$ENV_VARS@MAC_LIVE_LOCATION=us-central1@CONVEX_URL=$CONVEX_URL@CONVEX_SITE_URL=$CONVEX_SITE_URL"
EXTRA_FLAGS=()
if [ "$MODE" = "agent" ]; then
  ENV_VARS="$ENV_VARS@APP_MODULE=server:app@PAGES_WEB_URL=$WEB_URL@AGENT_ALLOW_ORIGINS=$WEB_URL"
  # Media and Email jobs run on after their request returns; throttled CPU would stall them.
  EXTRA_FLAGS+=(--no-cpu-throttling)
fi
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --port 8080 \
  --execution-environment gen2 \
  --cpu "$CPU" --memory "$MEMORY" --cpu-boost \
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" \
  --concurrency "$CONCURRENCY" \
  --timeout "$TIMEOUT" \
  --session-affinity \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "$SECRET_MAPPING" \
  ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"}

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
HOST="${URL#https://}"

say "Checking the live service"
if [ "$MODE" = "agent" ]; then
  HEALTH="$(curl -sS --max-time 20 "$URL/health" || true)"
  echo "    GET /health                   $HEALTH"
  CODE="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$URL/brief" || true)"
  echo "    POST /brief, no key           $CODE (401 is right)"
  [ "$CODE" = "401" ] || echo "    WARNING: expected 401 without the key. Check AGENT_API_KEY is set on the service." >&2
  say "Done"
  echo "    Agent address for the web app:  AGENT_URL=$URL"
  echo "    The key the web app sends:      AGENT_API_KEY=\$(gcloud secrets versions access latest --secret slice-agent-api-key --project $PROJECT)"
  exit 0
fi
HEALTH="$(curl -sS --max-time 20 "$URL/mac/health" || true)"
echo "    GET /mac/health               $HEALTH"
CODE="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$URL/mac/search?q=test" || true)"
echo "    GET /mac/search, no token     $CODE (401 is right)"
[ "$CODE" = "401" ] || echo "    WARNING: expected 401 without a token. Check MAC_CLIENT_TOKEN is set on the service." >&2

say "Done"
echo "    Brain address for the Mac app:  wss://$HOST/mac/live"
echo
echo "Build the app that talks to it:"
echo "    SLICE_BRAIN_URL=wss://$HOST/mac/live \\"
echo "    SLICE_BRAIN_TOKEN=\$(gcloud secrets versions access latest --secret slice-mac-client-token --project $PROJECT) \\"
echo "      pnpm --filter @slice/mac release"
