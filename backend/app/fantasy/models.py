"""Request and response shapes for the fantasy endpoints."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Position = Literal["QB", "RB", "WR", "TE", "K", "DEF"]


class LeagueSettings(BaseModel):
    is_dynasty: bool = False
    num_qbs: int = 1
    ppr: float = 1.0
    num_teams: int = 12


class PlayerCard(BaseModel):
    sleeper_id: str
    name: str
    position: str
    team: Optional[str] = None
    age: Optional[float] = None
    value: int = 0
    overall_rank: Optional[int] = None
    position_rank: Optional[int] = None
    trend_30d: int = 0
    projection: Optional[float] = None
    # Season-long projected total. Weekly answers "start him?"; season answers
    # "is this trade good?" — redraft trades turn on the rest of the year.
    season_projection: Optional[float] = None
    injury_status: Optional[str] = None


class SyncRequest(BaseModel):
    username: Optional[str] = None
    league_id: Optional[str] = None
    season: Optional[int] = None


class TradeRequest(BaseModel):
    give: list[str] = Field(default_factory=list, description="sleeper_ids you send away")
    receive: list[str] = Field(default_factory=list, description="sleeper_ids you get back")
    settings: LeagueSettings = LeagueSettings()
    roster: list[str] = Field(default_factory=list, description="your current roster, for lineup impact")
    explain: bool = True


class TradeSide(BaseModel):
    players: list[PlayerCard]
    raw_total: int
    adjusted_total: int


class TradeVerdict(BaseModel):
    verdict: Literal["Accept", "Lean accept", "Even", "Lean decline", "Decline"]
    confidence: float
    net_value: int
    percent_gap: float
    give: TradeSide
    receive: TradeSide
    starter_points_delta: Optional[float] = None
    factors: list[dict] = Field(default_factory=list)
    reasoning: Optional[str] = None
    # Per-player numbers behind the verdict, so the manager can see the inputs
    # rather than only the conclusion.
    stat_table: list[dict] = Field(default_factory=list)
    # True when an AI provider is configured. Lets the UI distinguish "no key"
    # from "the provider was called and failed" — very different fixes.
    ai_available: bool = False
    values_updated_at: Optional[str] = None


class RosterGrade(BaseModel):
    grade: str
    score: float
    total_value: int
    league_rank: Optional[int] = None
    positions: list[dict]
    summary: Optional[str] = None


class SitStartRequest(BaseModel):
    player_a: str
    player_b: str
    week: Optional[int] = None
    settings: LeagueSettings = LeagueSettings()
    explain: bool = True


class DraftSuggestRequest(BaseModel):
    drafted_by_me: list[str] = Field(default_factory=list)
    off_the_board: list[str] = Field(default_factory=list)
    settings: LeagueSettings = LeagueSettings()
    limit: int = 5