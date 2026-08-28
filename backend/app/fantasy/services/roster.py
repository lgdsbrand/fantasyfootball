"""Roster grading.

Graded against the other teams in the league, not against an abstract ideal.
A B+ here means "third best roster in this league", which is the thing a manager
actually wants to know.
"""
from __future__ import annotations

from typing import Optional

from ..models import RosterGrade

POSITIONS = ["QB", "RB", "WR", "TE"]
# How many at each position realistically contribute in a typical lineup.
CONTRIBUTORS = {"QB": 1, "RB": 3, "WR": 4, "TE": 1}

LETTERS = [
    (93, "A+"), (86, "A"), (79, "A-"), (72, "B+"), (64, "B"), (56, "B-"),
    (48, "C+"), (40, "C"), (32, "C-"), (24, "D+"), (14, "D"), (0, "F"),
]


def positional_value(player_ids: list[str], positions: dict[str, str], values: dict[str, int]) -> dict[str, int]:
    out: dict[str, int] = {}
    for pos in POSITIONS:
        vals = sorted(
            (values.get(p, 0) for p in player_ids if positions.get(p) == pos), reverse=True
        )
        out[pos] = sum(vals[: CONTRIBUTORS[pos]])
    return out


def _letter(pct: float) -> str:
    for floor, letter in LETTERS:
        if pct >= floor:
            return letter
    return "F"


def grade(
    *,
    my_players: list[str],
    league_rosters: list[list[str]],
    positions: dict[str, str],
    values: dict[str, int],
) -> RosterGrade:
    mine = positional_value(my_players, positions, values)
    total = sum(mine.values())

    others = [positional_value(r, positions, values) for r in league_rosters] or [mine]
    totals = sorted((sum(o.values()) for o in others), reverse=True)
    rank = totals.index(total) + 1 if total in totals else None

    # percentile among league teams
    n = max(len(totals), 1)
    beaten = sum(1 for t in totals if t < total)
    pct = round(beaten / n * 100, 1)

    breakdown = []
    for pos in POSITIONS:
        pos_totals = sorted((o[pos] for o in others), reverse=True)
        pos_rank = pos_totals.index(mine[pos]) + 1 if mine[pos] in pos_totals else None
        pos_beaten = sum(1 for t in pos_totals if t < mine[pos])
        breakdown.append({
            "position": pos,
            "value": mine[pos],
            "rank": pos_rank,
            "percentile": round(pos_beaten / max(len(pos_totals), 1) * 100, 1),
            "grade": _letter(pos_beaten / max(len(pos_totals), 1) * 100),
        })

    return RosterGrade(
        grade=_letter(pct),
        score=pct,
        total_value=total,
        league_rank=rank,
        positions=breakdown,
    )


def weakest_position(g: RosterGrade) -> Optional[str]:
    if not g.positions:
        return None
    return min(g.positions, key=lambda p: p["percentile"])["position"]
