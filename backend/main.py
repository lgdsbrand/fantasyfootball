"""Production entry point.

Render runs this from the `backend` root directory:

    uvicorn main:app --host 0.0.0.0 --port $PORT

Locally the equivalent is local/main.py, which adds the Vite dev origin and
lives outside this folder. They are separate on purpose: this file makes no
assumptions about localhost, and the local one is never deployed.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from app.fantasy.clients.http import aclose
from app.fantasy.config import get_settings
from app.fantasy.cors import add_fantasy_cors
from app.fantasy.router import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(
    title="Fantasy Hub API",
    version="1.0.0",
    description="Sleeper sync, trade analysis, rankings and draft tools.",
)

add_fantasy_cors(app)
app.include_router(router)


@app.on_event("startup")
async def _startup() -> None:
    s = get_settings()
    # Surface misconfiguration in the deploy log rather than as a mystery 500
    # on the first request.
    if not s.supabase_ready:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — "
                  "every endpoint will fail until they are")
    if not s.ai_enabled:
        log.warning("no AI key configured — verdicts return without written analysis")
    log.info("fantasy api ready (season %s)", s.season)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await aclose()


@app.get("/")
async def root() -> dict:
    return {"service": "fantasy hub", "docs": "/docs", "health": "/api/fantasy/health"}
