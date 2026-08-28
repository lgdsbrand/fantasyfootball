"""Draft helper suggestions.

Ranks what is left on the board by value, then bends that ranking toward the
positions the roster still needs and toward positions whose tier is about to
run out. A pure value list would just hand you the top overall name every time,
which is not how anyone actually drafts.
"""
from __future__ import annotations

from .roster import CONTRIBUTORS, POSITIONS

# Roughly how much a starting slot at each position is worth to a lineup.
SLOT_WEIGHT = {"QB": 1.0, "RB": 1.35, "WR": 1.35, "TE": 1.05, "K": 0.2, "DEF": 0.2}


def tier_break(candidates: list[dict], position: str, cliff: float = 0.18) -> int:
    """How many players at this position remain before value drops off a cliff.
    A small number means the run is about to start."""
    pos_players = [c for c in candidates if c.get("position") == position]
    if len(pos_players) < 2:
        return len(pos_players)
    for i in range(len(pos_players) - 1):
        a, b = pos_players[i].get("value", 0), pos_players[i + 1].get("value", 0)
        if a and (a - b) / a >= cliff:
            return i + 1
    return len(pos_players)


def suggest(
    *,
    available: list[dict],
    my_players: list[str],
    positions: dict[str, str],
    limit: int = 5,
) -> list[dict]:
    have: dict[str, int] = {p: 0 for p in POSITIONS}
    for pid in my_players:
        pos = positions.get(pid)
        if pos in have:
            have[pos] += 1

    top_value = max((c.get("value", 0) for c in available), default=1) or 1
    scored = []

    for c in available[:80]:
        pos = c.get("position")
        if pos not in SLOT_WEIGHT:
            continue
        value_score = c.get("value", 0) / top_value

        # need: falls off once the position is filled
        filled = have.get(pos, 0)
        need = SLOT_WEIGHT[pos] / (1 + filled * 1.5)
        if filled >= CONTRIBUTORS.get(pos, 2):
            need *= 0.45

        # scarcity: a position about to run out is worth reaching for
        remaining = tier_break(available, pos)
        scarcity = 1.0 + max(0.0, (6 - remaining)) * 0.06

        score = value_score * need * scarcity
        scored.append((score, remaining, filled, c))

    scored.sort(key=lambda x: x[0], reverse=True)

    out = []
    for score, remaining, filled, c in scored[:limit]:
        out.append({
            **c,
            "fit_score": round(score, 3),
            "reason": _reason(c.get("position"), filled, remaining),
        })
    return out


def _reason(pos: str, filled: int, remaining: int) -> str:
    if filled == 0:
        base = f"You have no {pos} yet and this is the best one left."
    elif filled == 1:
        base = f"Gives you a second {pos} with a real weekly role."
    else:
        base = f"Depth rather than need — you are already set at {pos}."
    if remaining <= 3:
        base += f" Only {remaining} left in this tier, so the run starts soon."
    return base
