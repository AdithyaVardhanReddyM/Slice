"""The hosted brain for Slice for Mac: only the /mac/* routes.

    uv run uvicorn mac_server:app --port 8000

server.py also mounts the concierge, Pages, Email and Media services. Those have no
token, so a brain that judges reach over the internet runs this smaller app instead: it
serves the Mac app's WebSocket (/mac/live) and HTTP routes and nothing else. The Docker
image (Dockerfile) starts it. Locally, server.py still serves everything, /mac included.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI  # noqa: E402

from slice_mac.routes import router as mac_router  # noqa: E402

# Cloud Run sets K_SERVICE. A public service without a token would hand Gemini Live and the
# user's connected accounts to anyone with the address, so refuse to start without one.
if os.environ.get("K_SERVICE") and not os.environ.get("MAC_CLIENT_TOKEN"):
    raise RuntimeError("MAC_CLIENT_TOKEN must be set when the brain is hosted (see scripts/deploy-cloud-run.sh)")

app = FastAPI(title="Slice for Mac brain")
app.include_router(mac_router)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
