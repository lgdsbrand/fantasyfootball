"""Patch router.py in place.

Replaces the PostgREST embedded joins in top_producers with a Python-side
join. Run from the project root:

    python fix_router.py
"""
import pathlib, sys, re

p = pathlib.Path("backend/app/fantasy/router.py")
if not p.exists():
    sys.exit("Run this from C:\\dev\\ff (backend/app/fantasy/router.py not found)")

s = p.read_text(encoding="utf-8")

if "ff_players(name" not in s:
    sys.exit("Already patched — nothing to do.")

# 1. ff_stats query: drop the embed
s = s.replace(
    'columns="sleeper_id,points,ff_players(name,position,team)",\n'
    '            filters={"season": f"eq.{season}", "week": f"eq.{resolved_week}",\n'
    '                     "points": "gt.0"},',
    'columns="sleeper_id,points",\n'
    '            filters={"season": f"eq.{season}", "week": f"eq.{resolved_week}",\n'
    '                     "points": "gt.0"},')

# 2. ff_projections query: drop the embed
s = s.replace(
    'columns="sleeper_id,points,ff_players(name,position,team)",\n'
    '            filters={"season": f"eq.{season}", "week": "eq.0", "points": "gt.0"},',
    'columns="sleeper_id,points",\n'
    '            filters={"season": f"eq.{season}", "week": "eq.0", "points": "gt.0"},')

# 3. Join in Python instead of reading an embedded object
old_loop = '''    buckets: dict[str, list[dict]] = {}
    for r in rows:
        p = r.pop("ff_players", None) or {}
        pos = (p.get("position") or "").upper()'''
new_loop = '''    # ff_projections and ff_stats have no foreign key to ff_players, so
    # PostgREST cannot embed them. Fetch the players separately and join here.
    players = await store.players_by_id([r["sleeper_id"] for r in rows])

    buckets: dict[str, list[dict]] = {}
    for r in rows:
        p = players.get(r["sleeper_id"])
        if not p:
            continue
        pos = (p.get("position") or "").upper()'''

if old_loop not in s:
    sys.exit("Could not find the loop to patch — send me lines 400-460 of router.py")
s = s.replace(old_loop, new_loop)

if "ff_players(name" in s:
    sys.exit("One of the queries did not match — send me lines 400-440 of router.py")

p.write_text(s, encoding="utf-8")

import ast
ast.parse(s)
print("router.py patched successfully.")
print("  embedded joins removed:", "ff_players(name" not in s)
print("  python join added     :", s.count("players_by_id"), "call(s)")
print("\nNow restart the backend.")
