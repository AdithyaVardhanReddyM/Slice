# The Slice for Mac brain, for Google Cloud Run (apps/agent/scripts/deploy-cloud-run.sh builds it).
#
#   docker build -t slice-brain apps/agent
#   docker run --rm -p 8080:8080 -e MAC_CLIENT_TOKEN=test slice-brain
#
# It serves mac_server:app (only /mac/*). Set APP_MODULE=server:app to serve every service.
FROM python:3.13-slim-bookworm

# uv, pinned, installs from uv.lock exactly.
COPY --from=ghcr.io/astral-sh/uv:0.8.3 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Headless Chromium, which make_printout (the large-print PDF) and the Pages service drive,
# plus the system libraries and fonts it needs. Only the headless shell: that is what
# chromium.launch(headless=True) uses, and it is much smaller than full Chromium.
RUN playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/*

# Run as a normal user. HOME is writable for Chromium's profile and temp files.
RUN useradd --create-home --uid 10001 slice \
    && chown slice /app
COPY --chown=slice:slice . .
USER slice

ENV APP_MODULE=mac_server:app \
    PORT=8080
EXPOSE 8080

# Cloud Run sends traffic to $PORT. The WebSocket (/mac/live) needs no special flags.
CMD ["sh", "-c", "exec uvicorn ${APP_MODULE} --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
