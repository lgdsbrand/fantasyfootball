# Testing this before it touches the client's project

Use your own Supabase project. Not his. A migration typo on a client's live
database is not a mistake you get to undo quietly.

## What you need first

- Python 3.12 and `uv`
- A free Supabase account (your own — takes two minutes)
- A free Sleeper account with at least one league (also two minutes; Sleeper
  lets you create a league instantly, and you need a real one to test sync)

## 1. Your own Supabase project

supabase.com → New project → free tier. Once it finishes provisioning:

- **SQL Editor** → paste `supabase/migrations/0001_fantasy.sql` → Run.
  Expect "Success. No rows returned."
- **Table Editor** → confirm six `ff_` tables exist.
- **Project Settings → Data API** → copy the Project URL.
- **Project Settings → API Keys** → copy the `service_role` key (the secret one).

## 2. Environment

```bash
cp local/.env.example local/.env
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Leave `GROQ_API_KEY`
empty for now — every endpoint still returns full results, just with
`reasoning: null`. Add it once the rest is green.

```bash
uv venv && uv pip install fastapi uvicorn httpx pyjwt "pydantic>=2" python-dotenv
set -a; source local/.env; set +a
```

## 3. Load real data

```bash
uv run python backend/scripts/refresh_fantasy_data.py
```

About a minute. It pulls the Sleeper player index, six FantasyCalc value sets,
and news. Check `ff_players` and `ff_values` have rows before continuing —
nothing downstream works without them.

## 4. Start the server

```bash
uv run uvicorn local.main:app --reload --port 8000
```

`http://localhost:8000/docs` gives you a live API browser where you can click
through every endpoint by hand.

## 5. Run the check

In a second terminal:

```bash
uv run python backend/scripts/verify_fantasy.py --sleeper-username YOUR_SLEEPER_NAME
```

It walks the stack in order and prints PASS / FAIL / SKIP per piece, so a
failure tells you which layer broke instead of leaving you with a 500.

```
1. Configuration      env vars present
2. Supabase           each table exists, row counts
3. Upstream APIs      Sleeper and FantasyCalc reachable
4. Endpoints          rankings, position filter, trade, draft,
                      sit/start, news, auth actually blocking
5. Live Sleeper sync  your real account, league, roster grade
```

The trade check is the one worth watching. It takes the top and bottom players
off the live board, trades one for the other, and fails unless the verdict is
Accept with positive net value. That proves values loaded, the join worked, and
the maths runs — not just that the endpoint returned 200.

## What a normal run looks like

Some SKIPs are fine and expected:

| Line | Meaning |
|---|---|
| `SKIP GROQ_API_KEY` | No key yet. Verdicts still complete. |
| `SKIP AI reasoning` | Same reason. |
| `SKIP POST /sync` | You didn't pass `--sleeper-username`. |
| `sit-start (no projections)` | Offseason. Sleeper publishes weekly projections in season only. |

Real failures and what they mean:

| Line | Fix |
|---|---|
| `FAIL ff_players HTTP 404` | Migration didn't run. Re-run the SQL. |
| `FAIL reference data` | Run the refresh script. |
| `FAIL GET /health` | Server isn't running, or wrong port. |
| `FAIL FantasyCalc` | Their endpoint moved. Cached values still serve — this is the degradation working as designed. |
| `FAIL /me/leagues, want 401` | `SUPABASE_JWT_SECRET` missing. Auth is not protecting anything. Fix before deploying. |

## 6. Only then, his project

Once everything is green on yours: run the same SQL in his project, point the
env vars at it, and re-run the verify script. Nothing else changes.
