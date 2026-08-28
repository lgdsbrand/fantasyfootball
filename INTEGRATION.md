# Fantasy Hub — backend integration

Drops into the existing repo. Nothing outside these paths is touched.

```
backend/app/fantasy/          ← the module
backend/scripts/refresh_fantasy_data.py
supabase/migrations/0001_fantasy.sql
.github/workflows/fantasy-refresh.yml
```

## 1. Database

Run `supabase/migrations/0001_fantasy.sql` in the Supabase SQL editor. It creates
six tables, all prefixed `ff_`, and enables row level security on every one.
Reference data is world-readable; `ff_user_leagues` is readable only by its owner.
It is safe to re-run.

## 2. Dependencies

Add to `backend/pyproject.toml`:

```toml
dependencies = [
  # ... existing ...
  "httpx>=0.27",
  "pyjwt>=2.8",
]
```

Then `uv sync`.

## 3. Mount the router

In the existing FastAPI app file:

```python
from app.fantasy.router import router as fantasy_router
app.include_router(fantasy_router)
```

Everything lives under `/api/fantasy`, so it cannot collide with existing routes.

## 4. Environment variables

On Render, and as GitHub Actions secrets for the scheduled job:

| Variable | Where | Notes |
|---|---|---|
| `SUPABASE_URL` | Render + Actions | already set for the main site |
| `SUPABASE_SERVICE_ROLE_KEY` | Render + Actions | server only, never in the frontend |
| `SUPABASE_JWT_SECRET` | Render | Settings → API → JWT Secret |
| `GROQ_API_KEY` | Render | the key already in use |
| `GROQ_MODEL` | optional | defaults to `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | optional | fallback, same key as the main site |
| `FANTASY_SEASON` | optional | defaults to 2026 |

## 5. First data load

```bash
cd backend
uv run python scripts/refresh_fantasy_data.py
```

Roughly a minute — it pulls the Sleeper player index once, then six FantasyCalc
value sets, then news. After that the workflow keeps it current.

## 6. Check it

```bash
curl "$API/api/fantasy/health"
curl -X POST "$API/api/fantasy/sync" -H 'content-type: application/json' \
     -d '{"username":"any_sleeper_username"}'
curl "$API/api/fantasy/rankings?is_dynasty=true&limit=10"
```

---

## How data flows

Nothing in the request path calls an upstream API for reference data.

```
GitHub Actions (nightly + every 4h Tue–Thu)
        │
        ├── Sleeper /players/nfl ──► ff_players      (~5MB, once a day, as Sleeper asks)
        ├── FantasyCalc /values/current ──► ff_values (6 league formats)
        ├── Sleeper projections ──► ff_projections
        └── RSS + Sleeper trending ──► ff_news, ff_trending
                                          │
                            FastAPI reads Supabase only ──► React
```

Live Sleeper calls happen only when a user syncs a league or opens one, which is
a handful of requests. Two reasons this matters:

- **Render cold starts.** A sleeping instance plus a 5MB upstream fetch would be a
  30-second first page load. Reading cached rows is fast.
- **Upstream outages degrade instead of breaking.** FantasyCalc is undocumented
  and can change without notice. If a refresh fails the job logs it, keeps the
  previous rows, and every response carries `values_updated_at` so the UI can
  show how fresh the numbers are.

## Endpoints

| Method | Path | Auth | Does |
|---|---|---|---|
| POST | `/api/fantasy/sync` | – | Sleeper username → their leagues |
| GET | `/api/fantasy/league/{id}` | – | league, teams, rosters, records |
| GET | `/api/fantasy/rankings` | – | consensus board, filter by position |
| POST | `/api/fantasy/trade` | – | verdict, factors, AI reasoning |
| GET | `/api/fantasy/roster-grade/{league}/{roster}` | – | letter grade vs the league |
| POST | `/api/fantasy/sit-start` | – | which of two to start |
| POST | `/api/fantasy/draft/suggest` | – | roster-aware picks |
| GET | `/api/fantasy/news` | – | feed + trending adds |
| GET/POST | `/api/fantasy/me/leagues` | **yes** | save a league to the account |

Only the last one needs sign-in. Every tool works for a logged-out visitor,
which matters for a public site — people can try the trade calculator before
deciding to make an account.

## How the trade verdict is reached

The model never decides. It writes up a decision the maths already made.

1. **Market value** — FantasyCalc totals for each side.
2. **Consolidation discount** — each additional player in a package counts at
   90% of the one before it. Three good players genuinely are worth less than
   one great one, because only so many can start.
3. **Starting lineup impact** — builds your optimal lineup before and after the
   trade from weekly projections and reports the points difference. This is what
   separates a real analyzer from a value adder.
4. **Age curve** — dynasty only, flagged when the two sides differ by a year or more.

The verdict and confidence come from the resulting percentage gap. Those numbers
are then handed to Groq to write in plain English. If Groq and Gemini both fail,
the endpoint still returns the full verdict with `reasoning: null`.

## Two decisions for the client

**The social feed.** X removed its free API tier in February 2026 and now charges
per post read, so a scraped Twitter feed is either a recurring bill or something
that breaks silently. The feed here is built from Sleeper's live add/drop data
plus fantasy news RSS — same signal, no recurring cost. A real X source can be
added to `services/news.py` later without touching anything else.

**Sleeper's terms.** Their docs say the API is free for non-commercial use and
ask you to contact them about licensing for commercial use. Worth a short email
to Sleeper before launch so it is his decision, not a surprise.

## Not built yet

- React components (`frontend/src/fantasy/`) — next
- ESPN and Yahoo league sync — Sleeper first, as agreed
- Rookie pick values as tradeable assets in the analyzer
