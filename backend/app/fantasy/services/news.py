"""The 'What's going on now' feed.

Built from free sources on purpose. X removed its free API tier in February 2026
and now bills per post read, and scraping it breaks without warning, so a
Twitter-backed feed is either a monthly bill or a support ticket waiting to
happen. These two sources give the same signal for nothing:

  * Sleeper trending adds/drops — what leagues are actually reacting to
  * Fantasy news RSS — the reporting behind those reactions

If the client later wants a real X feed, it slots in as another source here
without touching anything else.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional
from xml.etree import ElementTree as ET

import httpx

from ..clients import sleeper

log = logging.getLogger(__name__)

# More sources than needed on purpose. Feeds move and go dead without warning —
# Yahoo's fantasy feed 404'd in testing — so a broken one is logged, skipped, and
# the feed keeps filling from the rest.
# Verified working against live feeds. CBS and NFL.com were tried and both
# 404'd, so they are gone rather than left to log a warning every night.
# A feed that dies later is logged, skipped, and the rest still fill the page.
RSS_SOURCES = [
    ("ESPN NFL", "https://www.espn.com/espn/rss/nfl/news"),
    ("Rotowire NFL", "https://www.rotowire.com/rss/news.php?sport=NFL"),
    ("Yahoo NFL", "https://sports.yahoo.com/nfl/rss.xml"),
]

_TAG = re.compile(r"<[^>]+>")


def _clean(text: Optional[str], limit: int = 320) -> str:
    if not text:
        return ""
    out = _TAG.sub("", text).strip()
    return out[: limit - 1] + "\u2026" if len(out) > limit else out


def _parse_rss(source: str, xml: str) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        log.warning("bad RSS from %s: %s", source, e)
        return items

    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        published = item.findtext("pubDate")
        try:
            ts = parsedate_to_datetime(published).astimezone(timezone.utc) if published else None
        except (TypeError, ValueError):
            ts = None
        items.append({
            "source": source,
            "headline": title,
            "body": _clean(item.findtext("description")),
            "url": (item.findtext("link") or "").strip() or None,
            "published_at": (ts or datetime.now(timezone.utc)).isoformat(),
        })
    return items


async def fetch_rss() -> list[dict]:
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as c:
        for name, url in RSS_SOURCES:
            try:
                r = await c.get(url)
                r.raise_for_status()
                out.extend(_parse_rss(name, r.text)[:15])
            except Exception as e:                  # noqa: BLE001 — one bad feed must not kill the rest
                log.warning("RSS source %s failed: %s", name, e)
    out.sort(key=lambda x: x["published_at"], reverse=True)
    return out


async def trending(players: dict[str, dict], limit: int = 10) -> list[dict]:
    """Sleeper's most-added, resolved to real names."""
    raw = await sleeper.get_trending("add", hours=24, limit=limit)
    out = []
    for row in raw:
        pid = str(row.get("player_id"))
        p = players.get(pid)
        if not p or p.get("position") not in {"QB", "RB", "WR", "TE"}:
            continue
        out.append({
            "sleeper_id": pid,
            "name": p.get("name"),
            "position": p.get("position"),
            "team": p.get("team"),
            "adds": int(row.get("count") or 0),
        })
    return out
