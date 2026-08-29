#!/usr/bin/env python3
"""Nightly refresh: pull upstream data into Supabase.

Run by GitHub Actions on a schedule, exactly like the existing board job.
Everything the site serves at request time comes from these tables, so if an
upstream API is down the site keeps working on yesterday's data and shows how
old it is.

    uv run python scripts/refresh_fantasy_data.py
    uv run python scripts/refresh_fantasy_data.py --only values
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fantasy import store                                    # noqa: E402
from app.fantasy.clients import fantasycalc, sleeper             # noqa: E402
from app.fantasy.clients.http import aclose                      # noqa: E402
from app.fantasy.config import REFRESH_FORMATS, format_key, get_settings  # noqa: E402
from app.fantasy.services import news                            # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("refresh")

KEEP_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}


async def refresh_players() -> dict[str, dict]:
    log.info("fetching Sleeper player index (~5MB, once a day)")
    raw = await sleeper.get_all_players()
    rows = []
    for pid, p in raw.items():
        if p.get("position") not in KEEP_POSITIONS:
            continue
        if not p.get("active") and not p.get("team"):
            continue
        rows.append(sleeper.slim_player(pid, p) | {"updated_at": store.now_iso()})
    n = await store.upsert("ff_players", rows, on_conflict="sleeper_id")
    log.info("players: %s rows", n)
    return {r["sleeper_id"]: r for r in rows}


async def ensure_players_exist(stubs: list[dict]) -> int:
    """Add any player referenced by a value row but absent from ff_players."""
    stubs = store.dedupe(stubs, "sleeper_id")
    ids = [s["sleeper_id"] for s in stubs]
    known: set[str] = set()
    for i in range(0, len(ids), 300):
        batch = ids[i : i + 300]
        rows = await store.select(
            "ff_players", columns="sleeper_id",
            filters={"sleeper_id": "in.(" + ",".join(f'"{x}"' for x in batch) + ")"},
        )
        known.update(r["sleeper_id"] for r in rows)

    missing = [s for s in stubs if s["sleeper_id"] not in known]
    if missing:
        await store.upsert("ff_players", missing, on_conflict="sleeper_id")
    return len(missing)


async def refresh_values() -> None:
    for is_dynasty, num_qbs, ppr, num_teams in REFRESH_FORMATS:
        fmt = format_key(is_dynasty, num_qbs, ppr, num_teams)
        try:
            raw = await fantasycalc.get_values(
                is_dynasty=is_dynasty, num_qbs=num_qbs, num_teams=num_teams, ppr=ppr
            )
        except Exception as e:                       # noqa: BLE001
            log.error("values %s failed, keeping previous data: %s", fmt, e)
            continue

        rows, stubs = [], []
        for r in raw:
            n = fantasycalc.normalise(r)
            if not n:
                continue
            rows.append({
                "sleeper_id": n["sleeper_id"],
                "format": fmt,
                "value": n["value"],
                "overall_rank": n["overall_rank"],
                "position_rank": n["position_rank"],
                "trend_30d": n["trend_30d"],
                "redraft_value": n["redraft_value"],
                "name": n["name"],
                "position": n["position"],
                "updated_at": store.now_iso(),
            })
            stubs.append({
                "sleeper_id": n["sleeper_id"],
                "name": n["name"] or f"Player {n['sleeper_id']}",
                "position": n["position"],
                "team": n["team"],
                "age": n["age"],
                "active": True,
                "updated_at": store.now_iso(),
            })

        # ff_values has a foreign key to ff_players. FantasyCalc prices a slightly
        # different population than the Sleeper index we keep (rookies, players
        # Sleeper marks inactive), so any value row whose player is missing would
        # fail the whole batch. Insert those players first, from FantasyCalc's own
        # metadata, and no value is lost.
        added = await ensure_players_exist(stubs)
        if added:
            log.info("  added %s players FantasyCalc prices but Sleeper did not list", added)

        written = await store.upsert("ff_values", rows, on_conflict="sleeper_id,format")
        log.info("values %s: %s rows", fmt, written)


async def refresh_projections() -> None:
    s = get_settings()
    try:
        state = await sleeper.get_state()
        week = int(state.get("week") or 0)
    except Exception as e:                           # noqa: BLE001
        log.warning("could not read NFL state: %s", e)
        return
    if week < 1:
        log.info("offseason, skipping projections")
        return

    try:
        raw = await sleeper.get_projections(s.season, week)
    except Exception as e:                           # noqa: BLE001
        log.warning("projections unavailable (undocumented endpoint): %s", e)
        return

    rows = []
    for item in raw or []:
        pid = str(item.get("player_id") or "")
        stats = item.get("stats") or {}
        pts = stats.get("pts_half_ppr") or stats.get("pts_ppr") or stats.get("pts_std")
        if not pid or pts is None:
            continue
        rows.append({
            "sleeper_id": pid, "season": s.season, "week": week,
            "points": float(pts), "updated_at": store.now_iso(),
        })
    n = await store.upsert("ff_projections", rows, on_conflict="sleeper_id,season,week")
    log.info("projections week %s: %s rows", week, n)


async def refresh_season_projections() -> None:
    """Season-long projected totals, stored under week 0."""
    s = get_settings()
    try:
        raw = await sleeper.get_season_projections(s.season)
    except Exception as e:                           # noqa: BLE001
        log.warning("season projections unavailable: %s", e)
        return

    rows = []
    for item in raw or []:
        pid = str(item.get("player_id") or "")
        stats = item.get("stats") or {}
        pts = stats.get("pts_half_ppr") or stats.get("pts_ppr") or stats.get("pts_std")
        if pid and pts is not None:
            rows.append({"sleeper_id": pid, "season": s.season, "week": 0,
                         "points": float(pts), "updated_at": store.now_iso()})
    n = await store.upsert("ff_projections", rows, on_conflict="sleeper_id,season,week")
    log.info("season projections: %s rows", n)


async def refresh_stats() -> None:
    """Actual points scored, for every week played so far this season."""
    s = get_settings()
    try:
        week = int((await sleeper.get_state()).get("week") or 0)
    except Exception as e:                           # noqa: BLE001
        log.warning("could not read NFL state: %s", e)
        return
    if week < 1:
        log.info("offseason, no stats to pull")
        return
    # Preseason games do not count, and Sleeper returns nothing for them.
    # Saying so beats logging "0 rows" and looking like a failure.
    try:
        season_type = ((await sleeper.get_state()).get("season_type") or "").lower()
    except Exception:                                # noqa: BLE001
        season_type = ""
    if season_type and season_type != "regular":
        log.info("season type is %r, no regular-season stats yet", season_type)
        return

    total = 0
    # Completed weeks only — the current week is still in progress.
    for w in range(1, week):
        try:
            raw = await sleeper.get_stats(s.season, w)
        except Exception as e:                       # noqa: BLE001
            log.warning("stats week %s unavailable: %s", w, e)
            continue
        rows = []
        for item in raw or []:
            pid = str(item.get("player_id") or "")
            st = item.get("stats") or {}
            pts = st.get("pts_half_ppr") or st.get("pts_ppr") or st.get("pts_std")
            if pid and pts is not None:
                rows.append({"sleeper_id": pid, "season": s.season, "week": w,
                             "points": float(pts), "updated_at": store.now_iso()})
        total += await store.upsert("ff_stats", rows, on_conflict="sleeper_id,season,week")
    log.info("stats through week %s: %s rows", week - 1, total)


async def refresh_news(players: dict[str, dict] | None = None) -> None:
    if players is None:
        players = {r["sleeper_id"]: r for r in await store.select(
            "ff_players", columns="sleeper_id,name,position,team")}

    items = await news.fetch_rss()
    if items:
        await store.upsert("ff_news", items, on_conflict="url")
        log.info("news: %s items", len(items))

    rows = await news.trending(players, limit=15)
    if rows:
        await store.upsert(
            "ff_trending",
            [r | {"updated_at": store.now_iso()} for r in rows],
            on_conflict="sleeper_id",
        )
        log.info("trending: %s players", len(rows))


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["players", "values", "projections", "stats", "news"])
    args = ap.parse_args()

    if not get_settings().supabase_ready:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return 1

    failures = 0
    players: dict[str, dict] | None = None
    try:
        if args.only in (None, "players"):
            players = await refresh_players()
        if args.only in (None, "values"):
            await refresh_values()
        if args.only in (None, "projections"):
            await refresh_projections()
            await refresh_season_projections()
        if args.only in (None, "stats"):
            await refresh_stats()
        if args.only in (None, "news"):
            await refresh_news(players)
    except Exception:                                # noqa: BLE001
        log.exception("refresh failed")
        failures = 1
    finally:
        await aclose()

    log.info("done")
    return failures


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))