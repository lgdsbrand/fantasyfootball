#!/usr/bin/env python3
"""End-to-end check of the fantasy backend.

Walks the whole stack in dependency order and prints PASS / FAIL / SKIP for each
piece, so when something breaks you know which layer broke rather than staring
at a 500.

Start the server first, then:

    uv run python scripts/verify_fantasy.py --sleeper-username YOUR_USERNAME

Exit code is 0 only if nothing failed.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fantasy.config import get_settings  # noqa: E402

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
results: list[tuple[str, str, str]] = []


def record(status: str, name: str, detail: str = "") -> None:
    colour = {"PASS": GREEN, "FAIL": RED, "SKIP": YELLOW}[status]
    print(f"  {colour}{status:<4}{RESET} {name}" + (f"  {DIM}{detail}{RESET}" if detail else ""))
    results.append((status, name, detail))


def section(title: str) -> None:
    print(f"\n{title}")
    print("  " + "-" * (len(title) + 8))


TABLES = ["ff_players", "ff_values", "ff_projections", "ff_news", "ff_trending", "ff_user_leagues"]


async def check_env() -> bool:
    section("1. Configuration")
    s = get_settings()
    ok = True
    for name, value, required in [
        ("SUPABASE_URL", s.supabase_url, True),
        ("SUPABASE_SERVICE_ROLE_KEY", s.supabase_service_key, True),
        ("SUPABASE_JWT_SECRET", s.supabase_jwt_secret, False),
        ("GROQ_API_KEY", s.groq_api_key, False),
    ]:
        if value:
            record("PASS", name, "set")
        elif required:
            record("FAIL", name, "missing — nothing else will work")
            ok = False
        else:
            record("SKIP", name, "not set — that feature is off, not broken")
    return ok


async def check_supabase(c: httpx.AsyncClient) -> bool:
    section("2. Supabase — tables and data")
    s = get_settings()
    headers = {"apikey": s.supabase_service_key,
               "Authorization": f"Bearer {s.supabase_service_key}"}
    ok = True
    counts: dict[str, int] = {}

    for table in TABLES:
        try:
            r = await c.get(
                f"{s.supabase_url.rstrip('/')}/rest/v1/{table}",
                headers=headers | {"Prefer": "count=exact"},
                params={"select": "*", "limit": 1},
            )
            if r.status_code >= 400:
                record("FAIL", table, f"HTTP {r.status_code} — did the migration run?")
                ok = False
                continue
            total = r.headers.get("content-range", "*/0").split("/")[-1]
            counts[table] = int(total) if total.isdigit() else 0
            record("PASS", table, f"{counts[table]:,} rows")
        except Exception as e:                       # noqa: BLE001
            record("FAIL", table, str(e)[:70])
            ok = False

    if counts.get("ff_players", 0) == 0 or counts.get("ff_values", 0) == 0:
        record("FAIL", "reference data", "run: uv run python scripts/refresh_fantasy_data.py")
        ok = False
    return ok


async def check_upstream(c: httpx.AsyncClient) -> None:
    section("3. Upstream APIs")
    s = get_settings()
    try:
        r = await c.get(f"{s.sleeper_base}/state/nfl")
        r.raise_for_status()
        state = r.json()
        record("PASS", "Sleeper", f"season {state.get('season')}, week {state.get('week')}")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "Sleeper", str(e)[:70])

    try:
        r = await c.get(f"{s.fantasycalc_base}/values/current",
                        params={"isDynasty": "true", "numQbs": 1, "numTeams": 12, "ppr": 1})
        r.raise_for_status()
        rows = r.json()
        top = (rows[0].get("player") or {}).get("name") if rows else "?"
        record("PASS", "FantasyCalc", f"{len(rows):,} players, #1 is {top}")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "FantasyCalc", f"{str(e)[:60]} — cached values still serve")


async def check_api(c: httpx.AsyncClient, base: str, username: str | None) -> None:
    section("4. Endpoints")

    try:
        r = await c.get(f"{base}/api/fantasy/health")
        r.raise_for_status()
        record("PASS", "GET /health", str(r.json()))
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "GET /health", f"{str(e)[:60]} — is the server running?")
        return

    # rankings
    board = []
    try:
        r = await c.get(f"{base}/api/fantasy/rankings",
                        params={"is_dynasty": "true", "limit": 25})
        r.raise_for_status()
        data = r.json()
        board = data.get("players") or []
        if not board:
            record("FAIL", "GET /rankings", "empty board — reference data not loaded")
        else:
            record("PASS", "GET /rankings",
                   f"{len(board)} players, top: {board[0].get('name')}, "
                   f"values from {str(data.get('updated_at'))[:16]}")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "GET /rankings", str(e)[:70])

    # position filter
    try:
        r = await c.get(f"{base}/api/fantasy/rankings",
                        params={"is_dynasty": "true", "position": "RB", "limit": 10})
        r.raise_for_status()
        rows = r.json().get("players") or []
        bad = [p for p in rows if (p.get("position") or "").upper() != "RB"]
        record("PASS" if rows and not bad else "FAIL", "GET /rankings?position=RB",
               f"{len(rows)} rows, {len(bad)} wrong position")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "GET /rankings?position=RB", str(e)[:70])

    # trade — build a lopsided deal from the live board so we know the verdict
    if len(board) >= 4:
        best, worst = board[0], board[-1]
        try:
            r = await c.post(f"{base}/api/fantasy/trade", json={
                "give": [worst["sleeper_id"]],
                "receive": [best["sleeper_id"]],
                "settings": {"is_dynasty": True, "num_qbs": 1, "ppr": 1.0, "num_teams": 12},
                "explain": True,
            })
            r.raise_for_status()
            v = r.json()
            sane = v["verdict"] in ("Accept", "Lean accept") and v["net_value"] > 0
            record("PASS" if sane else "FAIL", "POST /trade",
                   f"{worst['name']} for {best['name']} -> {v['verdict']} "
                   f"({v['net_value']:+,}) — should be Accept")
            record("PASS" if v.get("reasoning") else "SKIP", "  AI reasoning",
                   (v.get("reasoning") or "no key set, verdict still returned")[:70])
        except Exception as e:                       # noqa: BLE001
            record("FAIL", "POST /trade", str(e)[:70])

        # draft helper
        try:
            r = await c.post(f"{base}/api/fantasy/draft/suggest", json={
                "drafted_by_me": [], "off_the_board": [],
                "settings": {"is_dynasty": False}, "limit": 5,
            })
            r.raise_for_status()
            picks = r.json().get("suggestions") or []
            record("PASS" if picks else "FAIL", "POST /draft/suggest",
                   ", ".join(f"{p['position']} {p['name']}" for p in picks[:3]))
        except Exception as e:                       # noqa: BLE001
            record("FAIL", "POST /draft/suggest", str(e)[:70])

        # sit / start
        try:
            r = await c.post(f"{base}/api/fantasy/sit-start", json={
                "player_a": board[0]["sleeper_id"], "player_b": board[3]["sleeper_id"],
                "settings": {"is_dynasty": False}, "explain": False,
            })
            r.raise_for_status()
            d = r.json()
            note = "start " + d["start"]["name"]
            if not d.get("projections_available"):
                note += " (no projections this week — offseason is normal)"
            record("PASS", "POST /sit-start", note)
        except Exception as e:                       # noqa: BLE001
            record("FAIL", "POST /sit-start", str(e)[:70])

    # news
    try:
        r = await c.get(f"{base}/api/fantasy/news")
        r.raise_for_status()
        d = r.json()
        record("PASS", "GET /news",
               f"{len(d.get('items', []))} stories, {len(d.get('trending', []))} trending")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "GET /news", str(e)[:70])

    # auth must actually block
    try:
        r = await c.get(f"{base}/api/fantasy/me/leagues")
        record("PASS" if r.status_code == 401 else "FAIL", "GET /me/leagues (no token)",
               f"HTTP {r.status_code} — must be 401")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "GET /me/leagues", str(e)[:70])

    # live league sync
    section("5. Live Sleeper sync")
    if not username:
        record("SKIP", "POST /sync", "pass --sleeper-username to test this")
        return
    try:
        r = await c.post(f"{base}/api/fantasy/sync", json={"username": username})
        if r.status_code == 404:
            record("FAIL", "POST /sync", f"Sleeper has no user '{username}'")
            return
        r.raise_for_status()
        d = r.json()
        leagues = d.get("leagues") or []
        record("PASS", "POST /sync", f"{len(leagues)} league(s) for {username}")
        if not leagues:
            record("SKIP", "GET /league", "account has no leagues this season")
            return

        lg = leagues[0]
        r = await c.get(f"{base}/api/fantasy/league/{lg['league_id']}")
        r.raise_for_status()
        detail = r.json()
        teams = detail.get("teams") or []
        record("PASS", "GET /league/{id}", f"{lg.get('name')}: {len(teams)} teams")

        if teams:
            rid = teams[0]["roster_id"]
            r = await c.get(
                f"{base}/api/fantasy/roster-grade/{lg['league_id']}/{rid}",
                params={"explain": "false"})
            r.raise_for_status()
            g = r.json()
            # A league before its draft grades nothing and returns no positions,
            # so min() over that list would blow up on a perfectly valid response.
            if g.get("positions"):
                weakest = min(g["positions"], key=lambda p: p["percentile"])["position"]
                record("PASS", "GET /roster-grade",
                       f"grade {g['grade']}, rank {g['league_rank']}, weakest {weakest}")
            else:
                record("SKIP", "GET /roster-grade",
                       "league has not drafted yet — nothing to grade")
    except Exception as e:                           # noqa: BLE001
        record("FAIL", "live sync", str(e)[:70])


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("API_BASE", "http://127.0.0.1:8000"))
    ap.add_argument("--sleeper-username", default=os.getenv("SLEEPER_USERNAME"))
    args = ap.parse_args()

    print(f"\nVerifying fantasy backend at {args.base}")

    async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as c:
        env_ok = await check_env()
        if env_ok:
            await check_supabase(c)
        await check_upstream(c)
        await check_api(c, args.base.rstrip("/"), args.sleeper_username)

    failed = [r for r in results if r[0] == "FAIL"]
    skipped = [r for r in results if r[0] == "SKIP"]
    passed = [r for r in results if r[0] == "PASS"]

    print(f"\n{'=' * 52}")
    print(f"  {GREEN}{len(passed)} passed{RESET}   "
          f"{RED if failed else DIM}{len(failed)} failed{RESET}   "
          f"{DIM}{len(skipped)} skipped{RESET}")
    if failed:
        print("\n  Fix these first:")
        for _, name, detail in failed:
            print(f"    - {name}: {detail}")
    print()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))