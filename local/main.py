"""Standalone runner for local testing.

Runs the fantasy module on its own, without the client's site. Use this to
verify everything works before any of it goes near his repo or his database.

    uvicorn local.main:app --reload --port 8000

Once it is proven here, the same router mounts into his FastAPI app with two
lines and this file is not deployed.
"""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.fantasy.clients.http import aclose          # noqa: E402
from app.fantasy.router import router                # noqa: E402

app = FastAPI(title="Fantasy Hub (local)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await aclose()


@app.get("/")
async def root() -> dict:
    return {"service": "fantasy hub", "docs": "/docs", "health": "/api/fantasy/health"}
