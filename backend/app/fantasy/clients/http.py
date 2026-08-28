"""One shared async HTTP client with retries, so every upstream call behaves the same."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)
_client: Optional[httpx.AsyncClient] = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        s = get_settings()
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(s.http_timeout),
            headers={"User-Agent": s.user_agent, "Accept": "application/json"},
            follow_redirects=True,
        )
    return _client


async def aclose() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None


async def get_json(url: str, *, params: dict | None = None, attempts: int = 3) -> Any:
    """GET returning parsed JSON. Returns None on a 404 rather than raising —
    Sleeper answers 404 for a username that does not exist, which is not an error
    from our side, it is an answer."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            r = await client().get(url, params=params)
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                await asyncio.sleep(1.5 * (i + 1))
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as e:   # ValueError covers bad JSON
            last = e
            if i < attempts - 1:
                await asyncio.sleep(0.6 * (i + 1))
    log.warning("GET failed after %s attempts: %s (%s)", attempts, url, last)
    raise UpstreamError(f"upstream request failed: {url}") from last


class UpstreamError(RuntimeError):
    """An upstream API we do not control did not answer."""
