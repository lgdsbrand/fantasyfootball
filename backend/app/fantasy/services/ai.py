"""Written analysis, via the Groq key the site already has, Gemini as fallback.

The model never decides anything. It receives the numbers our own maths produced
and writes them up in plain English. If both providers fail, endpoints return
their verdict with reasoning set to null and the UI shows the numbers alone —
the AI layer is a garnish, not a dependency.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

SYSTEM = (
    "You are a fantasy football analyst writing for a league manager. "
    "You are given the output of a trade or lineup model. Explain what it says "
    "in 2-3 short paragraphs of plain English. Lead with the recommendation. "
    "Name the single strongest reason and the single biggest risk. "
    "Never invent statistics that are not in the data you were given. "
    "No preamble, no bullet points, no headings, no markdown."
)


async def _groq(prompt: str) -> Optional[str]:
    s = get_settings()
    if not s.groq_api_key:
        return None
    async with httpx.AsyncClient(timeout=25.0) as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {s.groq_api_key}"},
            json={
                "model": s.groq_model,
                "temperature": 0.4,
                "max_tokens": 550,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


async def _gemini(prompt: str) -> Optional[str]:
    s = get_settings()
    if not s.gemini_api_key:
        return None
    async with httpx.AsyncClient(timeout=25.0) as c:
        r = await c.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{s.gemini_model}:generateContent",
            headers={"x-goog-api-key": s.gemini_api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM}]},
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.4, "maxOutputTokens": 550},
            },
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


async def explain(payload: dict) -> Optional[str]:
    prompt = json.dumps(payload, default=str, ensure_ascii=False)
    for provider in (_groq, _gemini):
        try:
            out = await provider(prompt)
            if out:
                return out
        except httpx.HTTPStatusError as e:
            # A wrong model name or a bad key looks identical from the outside
            # unless the provider's own message is logged, so log it.
            body = ""
            try:
                body = e.response.text[:300]
            except Exception:                        # noqa: BLE001
                pass
            log.warning("%s rejected the request (%s): %s",
                        provider.__name__, e.response.status_code, body)
        except Exception as e:                       # noqa: BLE001 — never break the endpoint
            log.warning("%s failed: %s", provider.__name__, e)
    return None


def trade_payload(verdict, settings) -> dict:
    delta = verdict.starter_points_delta
    n_give, n_get = len(verdict.give.players), len(verdict.receive.players)

    guidance = [
        "Explain the verdict using only the numbers below.",
        "Do not add up or compare projected points across the two packages. "
        "Most incoming players replace bench players rather than starters, so "
        "those sums are meaningless. Quote no percentages that are not given.",
    ]

    # State the direction outright. A general rule about roster spots gets
    # applied backwards about half the time, because the model reads "more
    # players" without checking which side has them.
    if n_get > n_give:
        guidance.append(
            f"This is {n_give}-for-{n_get}: you receive more players than you "
            "send, which uses up an extra roster spot and means starting fewer "
            "of them. That counts against the deal."
        )
    elif n_give > n_get:
        guidance.append(
            f"This is {n_give}-for-{n_get}: you send more players than you "
            "receive, which frees a roster spot and concentrates value into "
            "fewer, better players. That counts in favour of the deal. Do not "
            "describe it as losing roster flexibility."
        )

    if delta is None:
        guidance.append(
            "No roster was provided, so the effect on weekly starting points "
            "is unknown. Do not claim the trade gains or loses points. Say the "
            "verdict is based on market value alone."
        )
    else:
        guidance.append(
            f"The starting lineup changes by {delta} projected points; use that "
            "figure rather than describing the points effect vaguely."
        )

    return {
        "task": "Explain this trade verdict to the manager considering the deal.",
        "guidance": " ".join(guidance),
        "format": "dynasty" if settings.is_dynasty else "redraft",
        "verdict": verdict.verdict,
        "net_market_value": verdict.net_value,
        "percent_gap": verdict.percent_gap,
        "starter_points_change": verdict.starter_points_delta,
        # Per-player projections are deliberately withheld. Given them, the
        # model adds each side up and compares the totals — but that sum is
        # meaningless in a trade, because most incoming players replace bench
        # players, not starters. The only points figure that means anything is
        # starter_points_delta, which the lineup optimiser already computed.
        "you_give": [
            {"name": p.name, "pos": p.position, "value": p.value, "age": p.age}
            for p in verdict.give.players
        ],
        "you_receive": [
            {"name": p.name, "pos": p.position, "value": p.value, "age": p.age}
            for p in verdict.receive.players
        ],
        "factors": verdict.factors,
    }


def _week_view(p: dict) -> dict:
    """Only what bears on a single week.

    Trade value and the 30-day trend are deliberately withheld. They describe
    how a player's long-term market price has moved, which says nothing about
    Sunday — a player can be up hundreds in dynasty value while facing the
    league's best run defense. Given those numbers the model will reach for
    them, so it does not get them.
    """
    return {
        "name": p.get("name"),
        "position": p.get("position"),
        "team": p.get("team"),
        "projected_points": p.get("projection"),
        "injury_status": p.get("injury_status") or "no designation",
    }


def sitstart_payload(a: dict, b: dict, week: Optional[int]) -> dict:
    return {
        "task": "Say which of these two players to start this week and why.",
        "week": week,
        "guidance": (
            "Base the call on the weekly projection and any injury designation. "
            "Do not speculate about matchups, snap counts, weather or usage — "
            "you have not been given that data. If the projections are within "
            "about a point and a half, say plainly that it is close to a coin flip."
        ),
        "start_recommendation": a.get("name"),
        "player_a": _week_view(a),
        "player_b": _week_view(b),
    }


def roster_payload(grade, weakest: Optional[str], league_name: Optional[str]) -> dict:
    return {
        "task": "Summarise this roster in two short paragraphs: what it is good at, "
                "and the one position to fix.",
        "league": league_name,
        "grade": grade.grade,
        "league_rank": grade.league_rank,
        "positions": grade.positions,
        "weakest_position": weakest,
    }