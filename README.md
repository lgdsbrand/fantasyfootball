# Fantasy Football Hub

A fantasy football section for Legends Sports. Sleeper league sync, a trade
analyzer with written AI analysis, consensus player values, a live draft
helper, sit/start calls, dynasty rookie pick values, and a news feed.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind v4, Axios → Vercel |
| Backend | Python 3.12, FastAPI, httpx → Render |
| Database | Supabase (Postgres) with row level security |
| AI | Groq, Gemini fallback |
| Automation | GitHub Actions, scheduled refresh |

## How the data flows

```
GitHub Actions (nightly, plus every 4h Tue–Thu)
        │
        ├── Sleeper /players/nfl ────────► ff_players
        ├── FantasyCalc /values/current ─► ff_values  (14 league formats)
        ├── Sleeper projections ─────────► ff_projections
        └── RSS + Sleeper trending ──────► ff_news, ff_trending
                                              │
                              FastAPI reads Supabase only ──► React
```

Nothing in the request path calls a third party for reference data. Two reasons:
page loads never wait on an upstream API, and an outage means slightly stale
values rather than a broken page. Every response carries the timestamp of the
values it used.

Live Sleeper calls happen only when a user syncs or opens a league.

## Data sources

- **Sleeper** — leagues, rosters, players, weekly projections, trending adds.
  Free, no key. Their docs ask commercial users to contact them about licensing.
- **FantasyCalc** — trade values from real league trades, across 14 league
  formats. Free, no key, undocumented — hence the caching.
- **RSS** — ESPN, Rotowire and Yahoo NFL feeds for the news section.

Values cover QB, RB, WR and TE. Kickers and defenses are not priced by any
public source, because they are almost never traded.

## How a trade verdict is reached

The model never decides. It writes up a decision the maths already made.

1. **Market value** — FantasyCalc totals for each side.
2. **Consolidation discount** — each additional player in a package counts at
   90% of the one before. Three good players really are worth less than one
   great one, because only so many can start.
3. **Starting lineup impact** — rebuilds your optimal lineup before and after
   from weekly projections and reports the points difference. This is what
   separates a real analyzer from a value adder.
4. **Age curve** — dynasty only, flagged when the sides differ by a year or more.

Those numbers go to the LLM to be explained in plain English. If the AI is
unavailable the endpoint still returns the full verdict with `reasoning: null`.

## Database

Six tables, all prefixed `ff_`, all with row level security. Reference data is
world-readable and writable only by the service role; `ff_user_leagues` is
readable only by its owner. No existing table is read or modified.

Run `supabase/migrations/0001_fantasy.sql` to create them. Safe to re-run.

## Running locally

Copy `local/.env.example` to `local/.env` and `frontend/.env.example` to
`frontend/.env`, then fill in the values.

```bash
uv venv && uv pip install fastapi uvicorn httpx pyjwt "pydantic>=2" cryptography
uv run python backend/scripts/refresh_fantasy_data.py   # first data load
uv run uvicorn local.main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend, so there is no
CORS to configure in development.

`cryptography` is required — Supabase signs session tokens with ES256 and PyJWT
cannot verify them without it.

## Verifying

```bash
uv run python backend/scripts/verify_fantasy.py --sleeper-username YOUR_NAME
```

Walks the whole stack in dependency order — config, tables, upstream APIs, every
endpoint, then a live league sync — and prints PASS / FAIL / SKIP for each, so a
failure tells you which layer broke.

## Sign-in

Supabase Auth, password or email link. **Nothing is gated.** Every tool works
signed out; an account only means a synced league is restored on the next visit.

## Deploying

See [DEPLOY.md](DEPLOY.md) for the full sequence, environment variables and
rollback plan. Two things that are easy to miss:

- `cryptography` must be installed, or sign-in fails with an ES256 error.
- `FANTASY_ALLOWED_ORIGINS` must list the frontend's domain, or the browser
  blocks every API call while the backend looks perfectly healthy.

## Not built yet

- ESPN and Yahoo league sync — Sleeper first, as agreed
- NFL props feeding the projections
- Multiple saved leagues per account (the schema supports it, the UI shows one)
  
