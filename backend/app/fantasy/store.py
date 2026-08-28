"""Supabase read/write layer.

Every table is prefixed ff_ and lives alongside the main site's tables in the
same project. Nothing here touches anything that is not ff_.

The request path reads from these tables only. Upstream APIs are called by the
nightly job (values, player index) or on explicit user action (league sync).
That keeps page loads fast even when Render has just cold-started.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

import httpx

from .config import get_settings

log = logging.getLogger(__name__)


def _headers() -> dict:
    s = get_settings()
    return {
        "apikey": s.supabase_service_key,
        "Authorization": f"Bearer {s.supabase_service_key}",
        "Content-Type": "application/json",
    }


def _rest(path: str) -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/rest/v1/{path}"


async def select(
    table: str,
    *,
    columns: str = "*",
    filters: Optional[dict[str, str]] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[dict]:
    params: dict[str, Any] = {"select": columns}
    params.update(filters or {})
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit
    async with httpx.AsyncClient(timeout=get_settings().http_timeout) as c:
        r = await c.get(_rest(table), headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def dedupe(rows: list[dict], key_columns: str) -> list[dict]:
    """Keep one row per primary key, last occurrence wins.

    Postgres refuses an ON CONFLICT batch that touches the same key twice
    ("cannot affect row a second time"), and upstream feeds do occasionally
    repeat a player, so a single duplicate would otherwise fail the whole batch.
    """
    keys = [k.strip() for k in key_columns.split(",")]
    seen: dict[tuple, dict] = {}
    for row in rows:
        seen[tuple(row.get(k) for k in keys)] = row
    return list(seen.values())


async def upsert(table: str, rows: list[dict], *, on_conflict: str) -> int:
    """Upsert in chunks. PostgREST will happily take a few thousand rows but
    chunking keeps each request small enough to retry cheaply."""
    if not rows:
        return 0
    rows = dedupe(rows, on_conflict)
    written = 0
    headers = _headers() | {"Prefer": "resolution=merge-duplicates,return=minimal"}
    async with httpx.AsyncClient(timeout=60.0) as c:
        for chunk in _chunks(rows, 500):
            r = await c.post(
                _rest(table), headers=headers, params={"on_conflict": on_conflict}, json=chunk
            )
            if r.status_code >= 400:
                # PostgREST puts the actual cause in the body — which constraint,
                # which key. Without this you get a bare 409 and have to guess.
                raise UpsertError(
                    f"{table} upsert failed ({r.status_code}): {r.text[:400]}"
                )
            written += len(chunk)
    return written


class UpsertError(RuntimeError):
    """A write to Supabase was rejected, with the reason PostgREST gave."""


def _chunks(rows: list[dict], n: int) -> Iterable[list[dict]]:
    for i in range(0, len(rows), n):
        yield rows[i : i + n]


# --- convenience readers used by the services -------------------------------

async def players_by_id(sleeper_ids: list[str]) -> dict[str, dict]:
    if not sleeper_ids:
        return {}
    ids = ",".join(f'"{i}"' for i in sleeper_ids)
    rows = await select("ff_players", filters={"sleeper_id": f"in.({ids})"})
    return {r["sleeper_id"]: r for r in rows}


async def values_for(fmt: str, sleeper_ids: Optional[list[str]] = None) -> dict[str, dict]:
    filters = {"format": f"eq.{fmt}"}
    if sleeper_ids:
        filters["sleeper_id"] = "in.(" + ",".join(f'"{i}"' for i in sleeper_ids) + ")"
    rows = await select("ff_values", filters=filters)
    return {r["sleeper_id"]: r for r in rows}


async def board(fmt: str, limit: int = 400) -> list[dict]:
    """The full ranked board for a format, joined to player details."""
    rows = await select(
        "ff_values",
        columns="*,ff_players(name,position,team,age,search_rank,injury_status)",
        filters={"format": f"eq.{fmt}"},
        order="overall_rank.asc",
        limit=limit,
    )
    out = []
    for r in rows:
        p = r.pop("ff_players", None) or {}
        out.append(r | {k: v for k, v in p.items() if v is not None})
    return out


async def projections(season: int, week: int, sleeper_ids: Optional[list[str]] = None) -> dict[str, float]:
    filters = {"season": f"eq.{season}", "week": f"eq.{week}"}
    if sleeper_ids:
        filters["sleeper_id"] = "in.(" + ",".join(f'"{i}"' for i in sleeper_ids) + ")"
    rows = await select("ff_projections", columns="sleeper_id,points", filters=filters)
    return {r["sleeper_id"]: float(r["points"]) for r in rows if r.get("points") is not None}


async def values_updated_at(fmt: str) -> Optional[str]:
    rows = await select(
        "ff_values", columns="updated_at", filters={"format": f"eq.{fmt}"},
        order="updated_at.desc", limit=1,
    )
    return rows[0]["updated_at"] if rows else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
