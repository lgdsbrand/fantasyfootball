"""Sleeper API client.

Read-only, no auth needed. Docs: https://docs.sleeper.com

Two important operational notes:
  * /players/nfl is roughly 5MB. Sleeper explicitly asks that it be called at
    most once a day and cached on our side. The nightly job does that; nothing
    in the request path ever calls it.
  * Stay well under the documented rate ceiling. Everything here is a handful
    of calls per league sync.
"""
from __future__ import annotations

from typing import Any, Optional

from ..config import get_settings
from .http import get_json

S = get_settings


async def get_user(username_or_id: str) -> Optional[dict]:
    return await get_json(f"{S().sleeper_base}/user/{username_or_id}")


async def get_leagues(user_id: str, season: int, sport: str = "nfl") -> list[dict]:
    data = await get_json(f"{S().sleeper_base}/user/{user_id}/leagues/{sport}/{season}")
    return data or []


async def get_league(league_id: str) -> Optional[dict]:
    return await get_json(f"{S().sleeper_base}/league/{league_id}")


async def get_rosters(league_id: str) -> list[dict]:
    return await get_json(f"{S().sleeper_base}/league/{league_id}/rosters") or []


async def get_league_users(league_id: str) -> list[dict]:
    return await get_json(f"{S().sleeper_base}/league/{league_id}/users") or []


async def get_matchups(league_id: str, week: int) -> list[dict]:
    return await get_json(f"{S().sleeper_base}/league/{league_id}/matchups/{week}") or []


async def get_state(sport: str = "nfl") -> dict:
    return await get_json(f"{S().sleeper_base}/state/{sport}") or {}


async def get_trending(kind: str = "add", hours: int = 24, limit: int = 25) -> list[dict]:
    return await get_json(
        f"{S().sleeper_base}/players/nfl/trending/{kind}",
        params={"lookback_hours": hours, "limit": limit},
    ) or []


async def get_all_players() -> dict[str, dict]:
    """The full ~5MB player map. Nightly job only."""
    return await get_json(f"{S().sleeper_base}/players/nfl") or {}


async def get_projections(season: int, week: int, season_type: str = "regular") -> Any:
    """Weekly projections.

    This lives on api.sleeper.com and is NOT part of the documented v1 API, so it
    can change without notice. Callers must treat a failure here as "no
    projections available" and keep working on trade values alone.
    """
    return await get_json(
        f"{S().sleeper_data_base}/projections/nfl/{season}/{week}",
        params={"season_type": season_type, "order_by": "pts_half_ppr"},
    )


async def get_season_projections(season: int, season_type: str = "regular"):
    """Season-long projected totals.

    Same undocumented host as the weekly endpoint, without a week. Used for
    redraft trades, where what matters is the rest of the year rather than
    Sunday.
    """
    return await get_json(
        f"{S().sleeper_data_base}/projections/nfl/{season}",
        params={"season_type": season_type, "order_by": "pts_half_ppr"},
    )


async def get_stats(season: int, week: int, season_type: str = "regular"):
    """Actual points scored in a week — what a player did, not what he might do.
    This is what 'top producers' has to be built on."""
    return await get_json(
        f"{S().sleeper_data_base}/stats/nfl/{season}/{week}",
        params={"season_type": season_type, "order_by": "pts_half_ppr"},
    )


def slim_player(pid: str, p: dict) -> dict:
    """Cut the 5MB map down to the fields the product actually shows."""
    name = p.get("full_name") or " ".join(
        x for x in (p.get("first_name"), p.get("last_name")) if x
    ) or pid
    return {
        "sleeper_id": pid,
        "name": name,
        "position": p.get("position"),
        "team": p.get("team"),
        "age": p.get("age"),
        "years_exp": p.get("years_exp"),
        "search_rank": p.get("search_rank"),
        "injury_status": p.get("injury_status"),
        "active": bool(p.get("active")),
    }