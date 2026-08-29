"""Playoff odds by simulation.

There is no formula for this. A team's chance of making the playoffs depends on
its own remaining games, everyone else's remaining games, and how the tiebreaks
land — so the honest way to compute it is to play the season out thousands of
times and count how often each team finishes in a playoff spot.

Each team is modelled as a normal distribution drawn from its own scoring so
far: teams that have scored a lot keep scoring a lot, and teams whose weekly
scores swing wildly keep swinging. Early in a season there is little history to
draw on, so the model leans on a league-wide prior until real scores accumulate.

This is a projection, not a prediction. It says what usually happens from here,
not what will.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from statistics import mean, pstdev

# Below this many games played, blend heavily toward the league average rather
# than trusting a two-week sample.
CONFIDENCE_GAMES = 6
DEFAULT_STDEV_RATIO = 0.28   # weekly scores vary about 28% around a team's mean


@dataclass
class Team:
    roster_id: int
    owner: str
    wins: int
    losses: int
    ties: int
    points_for: float
    weekly_scores: list[float]

    @property
    def games(self) -> int:
        return self.wins + self.losses + self.ties


def _scoring_model(team: Team, league_mean: float) -> tuple[float, float]:
    """Mean and standard deviation of this team's weekly score."""
    scores = [s for s in team.weekly_scores if s > 0]

    if not scores:
        return league_mean, league_mean * DEFAULT_STDEV_RATIO

    own = mean(scores)
    # Shrink toward the league mean when the sample is thin. With one game
    # played, a 40-point outlier should not make a team a juggernaut.
    weight = min(1.0, len(scores) / CONFIDENCE_GAMES)
    blended = own * weight + league_mean * (1 - weight)

    spread = pstdev(scores) if len(scores) > 1 else blended * DEFAULT_STDEV_RATIO
    spread = max(spread, blended * 0.12)   # nobody is truly consistent
    return blended, spread


def simulate(
    teams: list[Team],
    schedule: dict[int, list[tuple[int, int]]],
    playoff_spots: int,
    runs: int = 5000,
    seed: int | None = None,
) -> list[dict]:
    """Play the remaining schedule `runs` times and count playoff finishes.

    schedule maps week -> list of (roster_id, roster_id) pairs still to play.
    """
    if not teams:
        return []
    rng = random.Random(seed)

    played = [t for t in teams if t.games]
    league_mean = mean([t.points_for / t.games for t in played]) if played else 100.0
    model = {t.roster_id: _scoring_model(t, league_mean) for t in teams}
    start = {t.roster_id: (t.wins, t.points_for) for t in teams}

    made = {t.roster_id: 0 for t in teams}
    seeds: dict[int, list[int]] = {t.roster_id: [] for t in teams}
    final_wins: dict[int, int] = {t.roster_id: 0 for t in teams}

    for _ in range(runs):
        wins = {rid: w for rid, (w, _) in start.items()}
        points = {rid: p for rid, (_, p) in start.items()}

        for matchups in schedule.values():
            for home, away in matchups:
                if home not in model or away not in model:
                    continue
                hs = max(0.0, rng.gauss(*model[home]))
                as_ = max(0.0, rng.gauss(*model[away]))
                points[home] += hs
                points[away] += as_
                # A tie is vanishingly rare with continuous scores, so ignore it.
                wins[home if hs > as_ else away] += 1

        for rid, w in wins.items():
            final_wins[rid] += w

        # Standings: wins first, points for as the tiebreak — Sleeper's default.
        order = sorted(wins, key=lambda r: (wins[r], points[r]), reverse=True)
        for position, rid in enumerate(order, start=1):
            if position <= playoff_spots:
                made[rid] += 1
            seeds[rid].append(position)

    out = []
    for t in teams:
        rid = t.roster_id
        n = len(seeds[rid]) or 1
        remaining = sum(
            1 for matchups in schedule.values() for pair in matchups if rid in pair
        )
        out.append({
            "roster_id": rid,
            "owner": t.owner,
            "wins": t.wins,
            "losses": t.losses,
            "points_for": round(t.points_for, 1),
            "games_remaining": remaining,
            "playoff_odds": round(made[rid] / runs * 100, 1),
            "average_seed": round(sum(seeds[rid]) / n, 1),
            # Averaged across every simulated season, not derived from the odds.
            "projected_wins": round(final_wins[rid] / runs, 1),
        })

    out.sort(key=lambda r: r["playoff_odds"], reverse=True)
    return out