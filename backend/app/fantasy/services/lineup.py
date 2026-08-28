"""Optimal-lineup maths, shared by trade analysis and roster grading."""
from __future__ import annotations

from typing import Iterable, Optional

FLEX = {"RB", "WR", "TE"}
SUPERFLEX = {"QB", "RB", "WR", "TE"}

DEFAULT_SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX"]


def slots_from_league(roster_positions: Optional[list[str]]) -> list[str]:
    """Sleeper gives roster_positions like ['QB','RB','RB','WR','WR','TE','FLEX','BN',...].
    Keep the starting slots, drop bench and IR."""
    if not roster_positions:
        return list(DEFAULT_SLOTS)
    keep = [p for p in roster_positions if p not in {"BN", "IR", "TAXI"}]
    return keep or list(DEFAULT_SLOTS)


def optimal_points(
    player_ids: Iterable[str],
    positions: dict[str, str],
    points: dict[str, float],
    slots: list[str],
) -> float:
    """Greedy fill: scarcest slots first, then flex from what is left.

    Fixed slots are filled before flex slots because a QB-only slot cannot be
    filled by anyone else, while a flex slot has options. Filling flex first
    would strand better players on the bench.
    """
    pool = [pid for pid in player_ids if pid in points]
    pool.sort(key=lambda p: points.get(p, 0.0), reverse=True)
    used: set[str] = set()
    total = 0.0

    fixed = [s for s in slots if s not in {"FLEX", "SUPER_FLEX", "WRRB_FLEX", "REC_FLEX"}]
    flexes = [s for s in slots if s in {"FLEX", "SUPER_FLEX", "WRRB_FLEX", "REC_FLEX"}]

    for slot in fixed:
        for pid in pool:
            if pid in used:
                continue
            if positions.get(pid) == slot:
                used.add(pid)
                total += points.get(pid, 0.0)
                break

    for slot in flexes:
        eligible = SUPERFLEX if slot == "SUPER_FLEX" else (
            {"RB", "WR"} if slot == "WRRB_FLEX" else (
                {"WR", "TE"} if slot == "REC_FLEX" else FLEX))
        for pid in pool:
            if pid in used:
                continue
            if positions.get(pid) in eligible:
                used.add(pid)
                total += points.get(pid, 0.0)
                break

    return round(total, 1)
