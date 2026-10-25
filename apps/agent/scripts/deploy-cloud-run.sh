#!/bin/bash
# Host the Slice for Mac brain on Google Cloud Run.
#
#   ./scripts/deploy-cloud-run.sh setup     once per project: APIs, image repository, service
#                                           account, and the secrets in Secret Manager
#   ./scripts/deploy-cloud-run.sh           build the image with Cloud Build and deploy it
#   ./scripts/deploy-cloud-run.sh --yes     the same without the "go ahead?" question
#
# Run from anywhere; it works inside apps/agent. It serves mac_server:app (only /mac/*), so the
# concierge, Pages, Email and Media services are not exposed. Docs: docs/mac-release.md.
#
# Where things come from (nothing secret is ever printed):
#   project            GCP_PROJECT, else GOOGLE_CLOUD_PROJECT in apps/agent/.env, else `gcloud config`
#   CONVEX_URL, CONVEX_SITE_URL     the environment, else apps/agent/.env (they are addresses, not secrets)
#   secrets            Secret Manager: slice-mac-client-token, slice-qloo-proxy-secret,
#                      slice-composio-api-key, and (optional) slice-ticketmaster-api-key.
#                      `setup` fills them from apps/agent/.env and makes the client token.
#
# Settings you may override in the environment:
#   REGION=us-central1  (Gemini Live is only served there)   SERVICE=slice-brain   REPO=slice
#   MIN_INSTANCES=1  MAX_INSTANCES=4  CPU=2  MEMORY=2Gi  CONCURRENCY=40  TIMEOUT=3600
set -euo pipefail

cd "$(dirname "$0")/.."   # apps/agent

MODE="deploy"
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    setup) MODE="setup" ;;
    deploy) MODE="deploy" ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-slice-brain}"
REPO="${REPO:-slice}"
SA_NAME="${SA_NAME:-slice-brain}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-4}"
CPU="${CPU:-2}"
MEMORY="${MEMORY:-2Gi}"
CONCURRENCY="${CONCURRENCY:-40}"
TIMEOUT="${TIMEOUT:-3600}"   # seconds; Cloud Run's maximum. A WebSocket is cut at this age and the app reconnects.
VERTEX_LOCATION="${VERTEX_LOCATION:-$(dotenv_get GOOGLE_CLOUD_LOCATION)}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
CONVEX_URL="${CONVEX_URL:-$(dotenv_get CONVEX_URL)}"
CONVEX_SITE_URL="${CONVEX_SITE_URL:-$(dotenv_get CONVEX_SITE_URL)}"

[ -n "$PROJECT" ] || die "No Google Cloud project. Set GCP_PROJECT=your-project-id, or run: gcloud config set project your-project-id"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
IMAGE_REPO="$REGION-docker.pkg.dev/$PROJECT/$REPO"

# Secret Manager name : environment variable : required?
SECRETS=(
  "slice-mac-client-token:MAC_CLIENT_TOKEN:required"
  "slice-qloo-proxy-secret:QLOO_PROXY_SECRET:required"
  "slice-composio-api-key:COMPOSIO_API_KEY:required"
  "slice-ticketmaster-api-key:TICKETMASTER_API_KEY:optional"
)

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
  say "Setting up project $PROJECT (region $REGION)"
  echo "    Enables the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Vertex AI APIs;"
  echo "    makes the image repository '$REPO' and the service account $SA (Vertex AI User);"
  echo "    stores the brain's secrets in Secret Manager from apps/agent/.env."
  confirm "Go ahead?"

  say "Enabling APIs"
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com aiplatform.googleapis.com iam.googleapis.com --project "$PROJECT"

  say "Image repository $REPO"
  if gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    echo "    already there"
  else
    gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" \
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
      if [ "$var" = "MAC_CLIENT_TOKEN" ] && [ -z "$value" ]; then
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
[ -n "$CONVEX_SITE_URL" ] || problem "CONVEX_SITE_URL is not set (the https://....convex.site address). Export it, or put it in apps/agent/.env."

if [ -n "$ACCOUNT" ]; then
  if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
    problem "The service account $SA does not exist in $PROJECT (or you cannot see it). Run: ./scripts/deploy-cloud-run.sh setup"
  fi
  if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    problem "The image repository '$REPO' does not exist in $REGION. Run: ./scripts/deploy-cloud-run.sh setup"
  fi
  for entry in "${SECRETS[@]}"; do
    IFS=: read -r secret var need <<<"$entry"
    if secret_exists "$secret"; then
      SECRET_MAPPING="${SECRET_MAPPING:+$SECRET_MAPPING,}$var=$secret:latest"
    elif [ "$need" = "required" ]; then
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
  --set-secrets "$SECRET_MAPPING"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
HOST="${URL#https://}"

say "Checking the live service"
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
