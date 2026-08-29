"""Trade evaluation.

Three inputs, weighted in this order:
  1. market value        — what the two packages are worth (FantasyCalc)
  2. starting lineup      — what the trade does to the points you actually start
  3. consolidation        — three good players are worth less than one great one,
                            because only so many can start

The written explanation is generated afterwards from these numbers, so the AI
is describing a decision the maths already made rather than making one itself.
"""
from __future__ import annotations

from typing import Optional

from ..models import LeagueSettings, PlayerCard, TradeSide, TradeVerdict
from .lineup import optimal_points, slots_from_league

# Each extra player in a package counts a little less than the one before it.
CONSOLIDATION_DECAY = 0.90


def adjusted_total(values: list[int]) -> int:
    """Best asset counts fully, each next one is discounted."""
    ordered = sorted(values, reverse=True)
    return int(round(sum(v * (CONSOLIDATION_DECAY ** i) for i, v in enumerate(ordered))))


def _side(cards: list[PlayerCard]) -> TradeSide:
    raw = sum(c.value for c in cards)
    return TradeSide(players=cards, raw_total=raw, adjusted_total=adjusted_total([c.value for c in cards]))


def _verdict(gap_pct: float) -> tuple[str, float]:
    """gap_pct is positive when the incoming side is worth more."""
    a = abs(gap_pct)
    confidence = min(95.0, 50.0 + a * 2.6)
    if gap_pct >= 12:
        return "Accept", confidence
    if gap_pct >= 4:
        return "Lean accept", confidence
    if gap_pct > -4:
        return "Even", max(50.0, 62.0 - a * 2)
    if gap_pct > -12:
        return "Lean decline", confidence
    return "Decline", confidence


def evaluate(
    *,
    give: list[PlayerCard],
    receive: list[PlayerCard],
    roster: list[str],
    positions: dict[str, str],
    projections: dict[str, float],
    settings: LeagueSettings,
    roster_positions: Optional[list[str]] = None,
) -> TradeVerdict:
    g, r = _side(give), _side(receive)
    net = r.adjusted_total - g.adjusted_total
    base = max(g.adjusted_total, r.adjusted_total, 1)
    gap_pct = round(net / base * 100, 1)

    label, confidence = _verdict(gap_pct)
    factors: list[dict] = []

    # --- 1. market value ---
    factors.append({
        "name": "Market value",
        "winner": "you" if net > 0 else ("them" if net < 0 else "even"),
        "detail": f"{'+' if net >= 0 else ''}{net:,} after the multi-player discount",
    })

    # --- 2. starting lineup impact ---
    starter_delta: Optional[float] = None
    if roster and projections:
        slots = slots_from_league(roster_positions)
        give_ids = {c.sleeper_id for c in give}
        after = [p for p in roster if p not in give_ids] + [c.sleeper_id for c in receive]
        before_pts = optimal_points(roster, positions, projections, slots)
        after_pts = optimal_points(after, positions, projections, slots)
        starter_delta = round(after_pts - before_pts, 1)
        factors.append({
            "name": "Starting lineup",
            "winner": "you" if starter_delta > 0.5 else ("them" if starter_delta < -0.5 else "even"),
            "detail": f"{'+' if starter_delta >= 0 else ''}{starter_delta} projected points in your starters",
        })

    # --- 3. consolidation ---
    if len(give) != len(receive):
        more, fewer = (give, receive) if len(give) > len(receive) else (receive, give)
        factors.append({
            "name": "Consolidation",
            "winner": "them" if more is receive else "you",
            "detail": (
                f"{len(more)}-for-{len(fewer)} — the side receiving more bodies has to "
                f"start fewer of them, so raw totals overstate that package"
            ),
        })

    # --- 4. age, dynasty only ---
    if settings.is_dynasty:
        def avg_age(cards: list[PlayerCard]) -> Optional[float]:
            ages = [c.age for c in cards if c.age]
            return round(sum(ages) / len(ages), 1) if ages else None

        ain, aout = avg_age(receive), avg_age(give)
        if ain and aout and abs(ain - aout) >= 1.0:
            factors.append({
                "name": "Age curve",
                "winner": "you" if ain < aout else "them",
                "detail": f"incoming average age {ain}, outgoing {aout}",
            })

    def row(card, side):
        return {
            "side": side,
            "name": card.name,
            "position": card.position,
            "team": card.team,
            "age": card.age,
            "value": card.value,
            "season_projection": card.season_projection,
            "week_projection": card.projection,
            "position_rank": card.position_rank,
            "trend_30d": card.trend_30d,
        }

    stat_table = [row(c, "give") for c in give] + [row(c, "receive") for c in receive]

    return TradeVerdict(
        stat_table=stat_table,
        verdict=label,
        confidence=round(confidence, 1),
        net_value=net,
        percent_gap=gap_pct,
        give=g,
        receive=r,
        starter_points_delta=starter_delta,
        factors=factors,
    )