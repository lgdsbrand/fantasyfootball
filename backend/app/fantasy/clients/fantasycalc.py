"""FantasyCalc trade values.

GET https://api.fantasycalc.com/values/current?isDynasty=&numQbs=&numTeams=&ppr=

This endpoint is public and free but undocumented, so treat it as something that
can disappear. Values are written to Supabase by the nightly job and every
request-path read comes from there. If FantasyCalc breaks, the site serves the
last good values and shows their age instead of showing nothing.

Each row carries player.sleeperId, which is how values join to Sleeper rosters.
"""
from __future__ import annotations

from typing import Optional

from ..config import get_settings
from .http import get_json


async def get_values(
    *, is_dynasty: bool, num_qbs: int = 1, num_teams: int = 12, ppr: float = 1.0
) -> list[dict]:
    raw = await get_json(
        f"{get_settings().fantasycalc_base}/values/current",
        params={
            "isDynasty": str(bool(is_dynasty)).lower(),
            "numQbs": num_qbs,
            "numTeams": num_teams,
            "ppr": ppr,
        },
    )
    return raw or []


# FantasyCalc prices draft picks alongside players and gives them synthetic ids:
#   DP_<round>_<slot>        a pick in the upcoming rookie draft
#   FP_<year>_<round>        a future pick, e.g. FP_2027_1
#   FP_<year>_early|mid|late_<n>
# They are real tradeable assets and belong in the trade calculator, but they are
# not players and must not appear on a player rankings board.
PICK_PREFIXES = ("DP_", "FP_", "RP_")


def is_pick(sleeper_id: str) -> bool:
    return str(sleeper_id).startswith(PICK_PREFIXES)


def normalise(row: dict) -> Optional[dict]:
    """FantasyCalc row -> our flat shape. Rows without a sleeperId are dropped:
    they cannot be matched to a roster, so they would only ever be dead weight."""
    player = row.get("player") or {}
    sleeper_id = player.get("sleeperId")
    if not sleeper_id:
        return None
    sleeper_id = str(sleeper_id)
    return {
        "sleeper_id": sleeper_id,
        "name": player.get("name"),
        "position": "PICK" if is_pick(sleeper_id) else player.get("position"),
        "team": player.get("maybeTeam"),
        "age": player.get("maybeAge"),
        "value": int(row.get("value") or 0),
        "overall_rank": row.get("overallRank"),
        "position_rank": row.get("positionRank"),
        "trend_30d": int(row.get("trend30Day") or 0),
        "redraft_value": int(row.get("redraftValue") or 0),
    }
