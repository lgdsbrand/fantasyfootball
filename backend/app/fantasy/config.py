"""Configuration for the fantasy module.

Every value comes from the environment. Nothing here has a secret default.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


def _load_dotenv() -> None:
    """Read local/.env into the environment if it exists.

    Works the same on Windows, macOS and Linux, so nobody has to remember shell
    specific export syntax. Real environment variables always win, which is what
    keeps Render and GitHub Actions in charge in production.
    """
    for candidate in (
        Path.cwd() / ".env",
        Path.cwd() / "local" / ".env",
        Path(__file__).resolve().parents[3] / "local" / ".env",
    ):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return


_load_dotenv()


class Settings(BaseModel):
    # --- Supabase (shares the main site's project) ---
    supabase_url: str = ""
    supabase_service_key: str = ""      # server-side only, never sent to the browser
    supabase_jwt_secret: str = ""       # used to verify user tokens on protected routes

    # --- AI (reuses the keys already configured for the site) ---
    groq_api_key: str = ""
    # Groq deprecated the Llama chat models for free/developer tiers in June 2026
    # and moved Llama 3.3 70B to enterprise-only. gpt-oss-120b is their
    # recommended replacement and is generally available.
    groq_model: str = "openai/gpt-oss-120b"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # --- upstream APIs ---
    sleeper_base: str = "https://api.sleeper.app/v1"
    sleeper_data_base: str = "https://api.sleeper.com"   # projections live here, undocumented
    fantasycalc_base: str = "https://api.fantasycalc.com"

    season: int = 2026
    http_timeout: float = 15.0
    user_agent: str = "fantasy-hub/1.0 (+https://example.com)"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.groq_api_key or self.gemini_api_key)

    @property
    def supabase_ready(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET", ""),
        groq_api_key=os.getenv("GROQ_API_KEY", ""),
        groq_model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        season=int(os.getenv("FANTASY_SEASON", "2026")),
    )


# ---------------------------------------------------------------------------
# League format -> the key we store values under.
# FantasyCalc only serves 10/12/14 teams, 1 or 2 QBs, and ppr 0 / 0.5 / 1,
# so anything else snaps to the nearest supported combination.
# ---------------------------------------------------------------------------
SUPPORTED_TEAMS = (10, 12, 14)
SUPPORTED_PPR = (0.0, 0.5, 1.0)


def format_key(is_dynasty: bool, num_qbs: int, ppr: float, num_teams: int) -> str:
    teams = min(SUPPORTED_TEAMS, key=lambda t: abs(t - num_teams))
    p = min(SUPPORTED_PPR, key=lambda x: abs(x - ppr))
    qbs = 2 if num_qbs >= 2 else 1
    mode = "dynasty" if is_dynasty else "redraft"
    return f"{mode}_{qbs}qb_ppr{p:g}_{teams}"


# The combinations the nightly job pre-fetches.
#
# format_key snaps any league to the nearest supported size, so an 18-team league
# resolves to the 14-team values. Every size therefore has to be fetched, or a
# league that snaps to one we skipped would find an empty board.
REFRESH_FORMATS = [
    (dynasty, qbs, 1.0, teams)
    for teams in (10, 12, 14)
    for qbs in (1, 2)
    for dynasty in (True, False)
] + [
    # Half-PPR is common enough at the default size to be worth carrying.
    (True, 1, 0.5, 12),
    (False, 1, 0.5, 12),
]
