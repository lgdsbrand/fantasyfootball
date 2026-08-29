"""Fantasy endpoints.

Mounted from the main FastAPI app:

    from app.fantasy.router import router as fantasy_router
    app.include_router(fantasy_router)

Everything is namespaced under /api/fantasy so it cannot collide with the
existing routes on the site.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from . import store
from .auth import current_user, optional_user
from .clients import sleeper
from .clients.http import UpstreamError
from .config import format_key, get_settings
from .models import (
    DraftSuggestRequest,
    LeagueSettings,
    PlayerCard,
    RosterGrade,
    SitStartRequest,
    SyncRequest,
    TradeRequest,
    TradeVerdict,
)
from .services import ai, draft, news, playoffs, roster as roster_svc, trade as trade_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/fantasy", tags=["fantasy"])


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _fmt(s: LeagueSettings) -> str:
    return format_key(s.is_dynasty, s.num_qbs, s.ppr, s.num_teams)


def _settings_from_league(league: dict) -> LeagueSettings:
    """Read format straight off the Sleeper league so the user never has to
    describe their own league to us."""
    settings = league.get("settings") or {}
    scoring = league.get("scoring_settings") or {}
    positions = league.get("roster_positions") or []
    return LeagueSettings(
        is_dynasty=bool(settings.get("type") == 2 or settings.get("taxi_slots")),
        num_qbs=2 if "SUPER_FLEX" in positions else 1,
        ppr=float(scoring.get("rec", 0) or 0),
        num_teams=int(league.get("total_rosters") or settings.get("num_teams") or 12),
    )


async def _cards(ids: list[str], fmt: str, week: Optional[int] = None) -> dict[str, PlayerCard]:
    """Build player cards from cached Supabase rows. No upstream calls."""
    ids = [str(i) for i in ids if i]
    if not ids:
        return {}
    players = await store.players_by_id(ids)
    values = await store.values_for(fmt, ids)
    season = get_settings().season
    projs: dict[str, float] = {}
    if week:
        projs = await store.projections(season, week, ids)
    # Week 0 holds season totals.
    season_projs = await store.projections(season, 0, ids)

    out: dict[str, PlayerCard] = {}
    for pid in ids:
        p = players.get(pid, {})
        v = values.get(pid, {})
        out[pid] = PlayerCard(
            sleeper_id=pid,
            name=p.get("name") or v.get("name") or f"Player {pid}",
            position=p.get("position") or v.get("position") or "NA",
            team=p.get("team") or v.get("team"),
            age=p.get("age") or v.get("age"),
            value=int(v.get("value") or 0),
            overall_rank=v.get("overall_rank"),
            position_rank=v.get("position_rank"),
            trend_30d=int(v.get("trend_30d") or 0),
            projection=projs.get(pid),
            season_projection=season_projs.get(pid),
            injury_status=p.get("injury_status"),
        )
    return out


# --------------------------------------------------------------------------
# league sync
# --------------------------------------------------------------------------

@router.post("/sync")
async def sync(body: SyncRequest):
    """Look up a Sleeper user and return their leagues, or one league directly.

    Sleeper needs no login, so this works for any username immediately.
    """
    season = body.season or get_settings().season

    if body.league_id:
        league = await sleeper.get_league(body.league_id)
        if not league:
            raise HTTPException(404, "no league with that ID")
        return {"leagues": [league]}

    if not body.username:
        raise HTTPException(400, "send a Sleeper username or a league ID")

    user = await sleeper.get_user(body.username)
    if not user:
        raise HTTPException(404, f"no Sleeper account called '{body.username}'")

    leagues = await sleeper.get_leagues(user["user_id"], season)
    return {
        "user": {"user_id": user["user_id"], "username": user.get("display_name")},
        "season": season,
        "leagues": [
            {
                "league_id": l["league_id"],
                "name": l.get("name"),
                "total_rosters": l.get("total_rosters"),
                "avatar": l.get("avatar"),
                "settings": _settings_from_league(l).model_dump(),
            }
            for l in leagues
        ],
    }


@router.get("/league/{league_id}")
async def league_detail(league_id: str, sleeper_user_id: Optional[str] = Query(None)):
    league = await sleeper.get_league(league_id)
    if not league:
        raise HTTPException(404, "league not found")

    rosters = await sleeper.get_rosters(league_id)
    users = await sleeper.get_league_users(league_id)
    owners = {u["user_id"]: u.get("display_name") for u in users}
    settings = _settings_from_league(league)

    mine = next((r for r in rosters if r.get("owner_id") == sleeper_user_id), None)

    return {
        "league": {
            "league_id": league_id,
            "name": league.get("name"),
            "season": league.get("season"),
            "roster_positions": league.get("roster_positions"),
            "settings": settings.model_dump(),
        },
        "teams": [
            {
                "roster_id": r.get("roster_id"),
                "owner": owners.get(r.get("owner_id"), "Unclaimed"),
                "players": r.get("players") or [],
                "starters": r.get("starters") or [],
                "wins": (r.get("settings") or {}).get("wins", 0),
                "losses": (r.get("settings") or {}).get("losses", 0),
                "points_for": (r.get("settings") or {}).get("fpts", 0),
                "is_mine": r is mine,
            }
            for r in rosters
        ],
    }


# --------------------------------------------------------------------------
# rankings
# --------------------------------------------------------------------------

@router.get("/rankings")
async def rankings(
    is_dynasty: bool = Query(False),
    num_qbs: int = Query(1),
    ppr: float = Query(1.0),
    num_teams: int = Query(12),
    position: Optional[str] = Query(None, description="QB, RB, WR, TE or PICK"),
    include_picks: bool = Query(False, description="include draft picks on the board"),
    limit: int = Query(200, le=500),
):
    fmt = format_key(is_dynasty, num_qbs, ppr, num_teams)
    rows = await store.board(fmt, limit=500 if (position or not include_picks) else limit)

    # Attach this week's projection to each row. One extra query for the whole
    # board rather than one per player, and a miss just leaves the field null.
    week = None
    try:
        week = int((await sleeper.get_state()).get("week") or 0) or None
    except UpstreamError:
        pass
    if week and rows:
        projs = await store.projections(
            get_settings().season, week, [r["sleeper_id"] for r in rows]
        )
        for r in rows:
            r["projection"] = projs.get(r["sleeper_id"])

    # Draft picks are priced by FantasyCalc and belong in the trade calculator,
    # but a rankings board is a list of players — picks only show if asked for.
    if not include_picks and (position or "").upper() != "PICK":
        rows = [r for r in rows if (r.get("position") or "").upper() != "PICK"]
    if position:
        rows = [r for r in rows if (r.get("position") or "").upper() == position.upper()]
    rows = rows[:limit]

    return {
        "format": fmt,
        "week": week,
        "updated_at": await store.values_updated_at(fmt),
        "players": rows,
    }


# --------------------------------------------------------------------------
# trade
# --------------------------------------------------------------------------

@router.post("/trade", response_model=TradeVerdict)
async def analyse_trade(body: TradeRequest):
    if not body.give or not body.receive:
        raise HTTPException(400, "put at least one player on each side")

    fmt = _fmt(body.settings)
    week = None
    try:
        state = await sleeper.get_state()
        week = int(state.get("week") or 0) or None
    except UpstreamError:
        pass

    ids = list({*body.give, *body.receive, *body.roster})
    cards = await _cards(ids, fmt, week)

    missing = [i for i in (*body.give, *body.receive) if cards.get(i) and cards[i].value == 0]
    give = [cards[i] for i in body.give if i in cards]
    receive = [cards[i] for i in body.receive if i in cards]
    if not give or not receive:
        raise HTTPException(422, "could not price those players — try re-syncing the board")

    positions = {pid: c.position for pid, c in cards.items()}
    projections = {pid: c.projection for pid, c in cards.items() if c.projection is not None}

    verdict = trade_svc.evaluate(
        give=give,
        receive=receive,
        roster=body.roster,
        positions=positions,
        projections=projections,
        settings=body.settings,
    )
    verdict.values_updated_at = await store.values_updated_at(fmt)

    if missing:
        verdict.factors.append({
            "name": "Unpriced players",
            "winner": "even",
            "detail": "some players had no market value and were counted as zero",
        })

    verdict.ai_available = get_settings().ai_enabled
    if body.explain and verdict.ai_available:
        verdict.reasoning = await ai.explain(ai.trade_payload(verdict, body.settings))

    return verdict


# --------------------------------------------------------------------------
# roster grade
# --------------------------------------------------------------------------

@router.get("/roster-grade/{league_id}/{roster_id}", response_model=RosterGrade)
async def roster_grade(league_id: str, roster_id: int, explain: bool = Query(True)):
    league = await sleeper.get_league(league_id)
    if not league:
        raise HTTPException(404, "league not found")
    rosters = await sleeper.get_rosters(league_id)
    mine = next((r for r in rosters if r.get("roster_id") == roster_id), None)
    if not mine:
        raise HTTPException(404, "no team with that roster ID in this league")

    settings = _settings_from_league(league)
    fmt = _fmt(settings)

    # A league before its draft has empty rosters. Grading nothing against
    # nothing produces an F, which is worse than saying there is nothing to grade.
    if not (mine.get("players") or []):
        return RosterGrade(
            grade="—", score=0.0, total_value=0, league_rank=None, positions=[],
            summary="This league has not drafted yet, so there is no roster to grade. "
                    "Come back once picks are in.",
        )

    all_ids = list({p for r in rosters for p in (r.get("players") or [])})
    cards = await _cards(all_ids, fmt)
    positions = {pid: c.position for pid, c in cards.items()}
    values = {pid: c.value for pid, c in cards.items()}

    grade = roster_svc.grade(
        my_players=mine.get("players") or [],
        league_rosters=[r.get("players") or [] for r in rosters],
        positions=positions,
        values=values,
    )

    if explain and get_settings().ai_enabled:
        grade.summary = await ai.explain(
            ai.roster_payload(grade, roster_svc.weakest_position(grade), league.get("name"))
        )
    return grade


# --------------------------------------------------------------------------
# sit / start
# --------------------------------------------------------------------------

@router.post("/sit-start")
async def sit_start(body: SitStartRequest):
    week = body.week
    if not week:
        try:
            week = int((await sleeper.get_state()).get("week") or 1)
        except UpstreamError:
            week = 1

    fmt = _fmt(body.settings)
    cards = await _cards([body.player_a, body.player_b], fmt, week)
    a, b = cards.get(body.player_a), cards.get(body.player_b)
    if not a or not b:
        raise HTTPException(404, "could not find one of those players")

    pa, pb = a.projection or 0.0, b.projection or 0.0
    start = a if pa >= pb else b
    bench = b if start is a else a

    result = {
        "week": week,
        "start": start.model_dump(),
        "bench": bench.model_dump(),
        "margin": round(abs(pa - pb), 1),
        "close_call": abs(pa - pb) < 1.5,
        "projections_available": bool(pa or pb),
    }

    if body.explain and get_settings().ai_enabled:
        result["reasoning"] = await ai.explain(
            ai.sitstart_payload(start.model_dump(), bench.model_dump(), week)
        )
    return result


# --------------------------------------------------------------------------
# draft helper
# --------------------------------------------------------------------------

@router.post("/draft/suggest")
async def draft_suggest(body: DraftSuggestRequest):
    fmt = _fmt(body.settings)
    board = await store.board(fmt, limit=400)
    gone = set(body.drafted_by_me) | set(body.off_the_board)
    available = [r for r in board if r["sleeper_id"] not in gone]

    positions = {r["sleeper_id"]: r.get("position") for r in board}
    picks = draft.suggest(
        available=available,
        my_players=body.drafted_by_me,
        positions=positions,
        limit=body.limit,
    )
    return {"available_count": len(available), "suggestions": picks}


# --------------------------------------------------------------------------
# top producers
# --------------------------------------------------------------------------

@router.get("/top-producers")
async def top_producers(
    week: Optional[int] = Query(None, description="defaults to the last completed week"),
    per_position: int = Query(5, le=10),
):
    """Highest scorers at each position.

    In season this is actual points from the last completed week. Before the
    season starts there are no scores to rank, so it falls back to season
    projections and says so — an empty page teaches the visitor nothing, and a
    projected leaderboard labelled as actual would be a lie.
    """
    season = get_settings().season

    state = {}
    try:
        state = await sleeper.get_state() or {}
    except UpstreamError:
        pass
    in_season = (state.get("season_type") or "").lower() == "regular"

    rows: list[dict] = []
    source = "projected"
    resolved_week = None

    # No embedded join here: ff_projections and ff_stats have no foreign key to
    # ff_players, so PostgREST cannot resolve the relationship. Two small
    # queries and a dict lookup is simpler than adding constraints to a
    # production database for a read that runs once per page load.
    if in_season:
        resolved_week = week or max(1, int(state.get("week") or 1) - 1)
        rows = await store.select(
            "ff_stats",
            columns="sleeper_id,points",
            filters={"season": f"eq.{season}", "week": f"eq.{resolved_week}",
                     "points": "gt.0"},
            order="points.desc", limit=300,
        )
        if rows:
            source = "actual"

    if not rows:
        rows = await store.select(
            "ff_projections",
            columns="sleeper_id,points",
            filters={"season": f"eq.{season}", "week": "eq.0", "points": "gt.0"},
            order="points.desc", limit=300,
        )
        source = "projected"
        resolved_week = None

    players = await store.players_by_id([r["sleeper_id"] for r in rows])

    buckets: dict[str, list[dict]] = {}
    for r in rows:
        p = players.get(r["sleeper_id"])
        if not p:
            continue
        pos = (p.get("position") or "").upper()
        if pos not in {"QB", "RB", "WR", "TE"}:
            continue
        bucket = buckets.setdefault(pos, [])
        if len(bucket) < per_position:
            bucket.append({
                "sleeper_id": r["sleeper_id"],
                "name": p.get("name"),
                "team": p.get("team"),
                "position": pos,
                "points": round(float(r["points"]), 1),
            })

    return {
        "season": season,
        "week": resolved_week,
        "source": source,          # "actual" or "projected"
        "season_type": state.get("season_type"),
        "positions": [
            {"position": pos, "players": buckets.get(pos, [])}
            for pos in ("QB", "RB", "WR", "TE")
        ],
    }


# --------------------------------------------------------------------------
# playoff odds
# --------------------------------------------------------------------------

@router.get("/playoff-odds/{league_id}")
async def playoff_odds(league_id: str, runs: int = Query(4000, ge=500, le=20000)):
    """Simulate the rest of the season and report each team's chance of making
    the playoffs."""
    league = await sleeper.get_league(league_id)
    if not league:
        raise HTTPException(404, "league not found")

    settings = league.get("settings") or {}
    rosters = await sleeper.get_rosters(league_id)
    users = await sleeper.get_league_users(league_id)
    owners = {u["user_id"]: u.get("display_name") for u in users}

    try:
        current_week = int((await sleeper.get_state()).get("week") or 1)
    except UpstreamError:
        current_week = 1

    playoff_week = int(settings.get("playoff_week_start") or 15)
    if current_week >= playoff_week:
        raise HTTPException(409, "the regular season is over — odds no longer apply")

    # Weekly scores so far, so each team is modelled on its own scoring.
    scores: dict[int, list[float]] = {r["roster_id"]: [] for r in rosters}
    schedule: dict[int, list[tuple[int, int]]] = {}

    for w in range(1, playoff_week):
        try:
            matchups = await sleeper.get_matchups(league_id, w)
        except UpstreamError:
            continue
        pairs: dict[int, list[int]] = {}
        for m in matchups:
            mid, rid = m.get("matchup_id"), m.get("roster_id")
            if mid is None or rid is None:
                continue
            pairs.setdefault(mid, []).append(rid)
            if w < current_week and m.get("points"):
                scores.setdefault(rid, []).append(float(m["points"]))
        if w >= current_week:
            schedule[w] = [tuple(v) for v in pairs.values() if len(v) == 2]

    teams = [
        playoffs.Team(
            roster_id=r["roster_id"],
            owner=owners.get(r.get("owner_id"), "Unclaimed"),
            wins=(r.get("settings") or {}).get("wins", 0),
            losses=(r.get("settings") or {}).get("losses", 0),
            ties=(r.get("settings") or {}).get("ties", 0),
            points_for=float((r.get("settings") or {}).get("fpts", 0) or 0),
            weekly_scores=scores.get(r["roster_id"], []),
        )
        for r in rosters
    ]

    spots = int(settings.get("playoff_teams") or max(2, len(teams) // 2))
    return {
        "league": league.get("name"),
        "playoff_spots": spots,
        "playoff_week_start": playoff_week,
        "current_week": current_week,
        "simulations": runs,
        "teams": playoffs.simulate(teams, schedule, spots, runs=runs),
    }


# --------------------------------------------------------------------------
# news
# --------------------------------------------------------------------------

@router.get("/news")
async def news_feed(limit: int = Query(20, le=50)):
    items = await store.select(
        "ff_news", order="published_at.desc", limit=limit
    )
    trending_rows = await store.select(
        "ff_trending", order="adds.desc", limit=10
    )
    return {"items": items, "trending": trending_rows}


# --------------------------------------------------------------------------
# saved leagues (requires sign-in)
# --------------------------------------------------------------------------

@router.get("/me/leagues")
async def my_leagues(user=Depends(current_user)):
    return await store.select("ff_user_leagues", filters={"user_id": f"eq.{user['id']}"})


@router.post("/me/leagues")
async def save_league(body: dict, user=Depends(current_user)):
    if not body.get("league_id"):
        raise HTTPException(400, "league_id is required")
    row = {
        "user_id": user["id"],
        "league_id": str(body["league_id"]),
        "league_name": body.get("league_name"),
        "sleeper_user_id": body.get("sleeper_user_id"),
        "sleeper_username": body.get("sleeper_username"),
        "roster_id": body.get("roster_id"),
        "updated_at": store.now_iso(),
    }
    await store.upsert("ff_user_leagues", [row], on_conflict="user_id,league_id")
    return row


@router.get("/health")
async def health(user=Depends(optional_user)):
    s = get_settings()
    return {
        "ok": True,
        "signed_in": bool(user),
        "supabase": s.supabase_ready,
        "ai": s.ai_enabled,
        "season": s.season,
    }