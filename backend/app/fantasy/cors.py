"""CORS for the deployed split-origin setup.

Locally the frontend and backend share an origin because Vite proxies /api, so
CORS never comes up. In production they do not: the frontend is on Vercel and
the API is on Render. Without this the browser blocks every call and the page
looks broken while the API is perfectly healthy.

Mount in the main app:

    from app.fantasy.cors import add_fantasy_cors
    add_fantasy_cors(app)

Origins come from FANTASY_ALLOWED_ORIGINS, comma separated. Vercel preview
deployments get fresh subdomains on every push, so *.vercel.app previews are
matched by pattern rather than needing a new variable each time.
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DEFAULT_LOCAL = ["http://localhost:5173", "http://127.0.0.1:5173"]


def allowed_origins() -> list[str]:
    raw = os.getenv("FANTASY_ALLOWED_ORIGINS", "")
    listed = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return listed or DEFAULT_LOCAL


def add_fantasy_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        # Vercel preview URLs change every deploy; production stays in the list above.
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=3600,
    )
