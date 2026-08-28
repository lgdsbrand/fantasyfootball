# Deploying into the client's stack

His stack, from the README he shared:

| Layer | What | Where |
|---|---|---|
| Frontend | React 19, Vite, Tailwind v4, Axios | Vercel, root dir `frontend` |
| Backend | Python 3.12, FastAPI, uv, Docker | Render, root dir `backend` |
| Database | Supabase | shared with the main site |
| AI | Groq, Gemini fallback | keys already set |
| Automation | GitHub Actions cron | already in use |

## Before anything ships

1. **He has approved the design.** Send the working pages, not the mockup — screenshots of the trade analyzer with a real verdict and the rankings board.
2. **You have access to the website repo.** The first invite was to an empty repo. Confirm the second one arrived and that the repo actually contains his site.
3. **He has named the live Supabase project.** He has two. Guessing is not acceptable on a production database.
4. **He knows about the disk usage.** His database was at 416 MB of the free plan's 500 MB before you add anything. The fantasy tables are small — a few MB — but he should hear it from you now, not discover it later.

Nothing below happens until all four are true.

---

## What changes in his repo

Only additions. Two lines of his code are edited.

```
backend/app/fantasy/            new
backend/scripts/refresh_fantasy_data.py   new
frontend/src/fantasy/           new
supabase/migrations/0001_fantasy.sql      new
.github/workflows/fantasy-refresh.yml     new

backend/<his app file>          + 2 lines (mount router, CORS)
backend/pyproject.toml          + 3 dependencies
frontend/src/<his router>       + 1 route
frontend/src/<his tailwind css> + the @theme token block
```

### Backend

```python
from app.fantasy.router import router as fantasy_router
from app.fantasy.cors import add_fantasy_cors

add_fantasy_cors(app)
app.include_router(fantasy_router)
```

Dependencies to add: `httpx`, `pyjwt`, `cryptography`.

### Frontend

```jsx
import FantasyHub from "./fantasy/FantasyHub.jsx";

<Route path="/fantasy" element={<FantasyHub />} />
```

Then copy the `@theme` block from `src/index.css` into his existing Tailwind
entry CSS. If his tokens collide, rename ours — every component resolves
through them, so it is one find-and-replace.

Do **not** copy `frontend/package.json`, `vite.config.js`, `index.html` or
`main.jsx`. Those exist to run the module standalone. His already exist.
Add `@supabase/supabase-js` and `axios` to his `package.json` if missing.

---

## The one thing that differs from local

Locally, Vite proxies `/api` to the backend, so both sit on one origin and CORS
never arises. **In production they are on different origins** — the frontend on
Vercel, the API on Render. Two settings make that work, and missing either one
produces a page that looks broken while the API is perfectly healthy:

- **Render:** `FANTASY_ALLOWED_ORIGINS=https://his-domain.com,https://www.his-domain.com`
- **Vercel:** `VITE_API_URL=https://his-render-service.onrender.com`

Vercel preview deployments get a new subdomain every push, so `*.vercel.app` is
matched by pattern and needs no maintenance.

---

## Order of operations

**1. Database.** Run `supabase/migrations/0001_fantasy.sql` in the SQL editor of
the project he named. Six `ff_` tables, RLS on each. It touches nothing else and
is safe to re-run.

**2. Environment variables.**

| Variable | Where | Note |
|---|---|---|
| `SUPABASE_URL` | Render + Actions secret | already set for his site |
| `SUPABASE_SERVICE_ROLE_KEY` | Render + Actions secret | server only |
| `SUPABASE_JWT_SECRET` | Render | only if his project still signs HS256 |
| `GROQ_API_KEY` | Render | his existing key |
| `GROQ_MODEL` | Render | `openai/gpt-oss-120b` |
| `FANTASY_ALLOWED_ORIGINS` | Render | his site's origins |
| `FANTASY_SEASON` | Render | `2026` |
| `VITE_API_URL` | Vercel | Render service URL |
| `VITE_SUPABASE_URL` | Vercel | project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel | publishable key, never the secret |

**3. Open a pull request. Do not merge it.** It is his repo; he merges. Give the
PR a description he can actually evaluate — a draft is below.

**4. First data load,** after he merges and Render redeploys. Trigger the
`Fantasy data refresh` workflow manually from the Actions tab. Do not wait for
the cron — you want to watch the first run. Roughly a minute; it writes about
3,300 players and 14 value formats.

**5. Verify against production.**

```
python backend/scripts/verify_fantasy.py --base https://his-render-url --sleeper-username <name>
```

Same nineteen checks you ran locally, against the deployed stack.

---

## Rollback

Cheap, because nothing shares state with his site:

- **Frontend:** Vercel keeps every deployment. Promote the previous one — instant.
- **Backend:** revert the two mounting lines. The `app/fantasy/` folder can sit
  there unmounted and inert.
- **Database:** `drop table` on the six `ff_` tables. No other table references
  them, so nothing cascades.
- **Cron:** disable the workflow in the Actions tab.

The blast radius is deliberately small. That is the reason for the `ff_` prefix
and for keeping every route under `/api/fantasy`.

---

## Draft PR description

> **Adds the fantasy football section**
>
> A new page at `/fantasy` with league sync, trade analysis, rankings, a draft
> helper, sit/start, dynasty rookie values and a news feed.
>
> **Scope of changes to existing code:** two lines in the FastAPI app file, one
> route in the frontend router, and the design tokens appended to the Tailwind
> entry CSS. Everything else is new files under `app/fantasy/`,
> `src/fantasy/`, and a migration.
>
> **Database:** six new tables, all prefixed `ff_`, all with row level security.
> No existing table is read or modified.
>
> **Data sources:** Sleeper for leagues, rosters and players; FantasyCalc for
> trade values; RSS for news. All free, no new subscriptions. The AI analysis
> uses the Groq key already configured, so it adds no cost.
>
> **How data flows:** a scheduled GitHub Action writes upstream data into
> Supabase; the API reads only from Supabase. Page loads never wait on a third
> party, and an upstream outage means slightly stale values rather than a broken
> page.
>
> **Sign-in:** Supabase Auth, password or email link. Nothing is gated — every
> tool works signed out. An account only means a synced league is remembered.
>
> **Two things to flag.** Sleeper's docs ask commercial users to contact them
> about licensing; worth a short email before launch. And X now charges per post
> read, so the news feed uses Sleeper's live add/drop data plus RSS instead —
> same signal, no recurring cost.

---

## Not built

- ESPN and Yahoo league sync — Sleeper first, as agreed
- Saving multiple leagues per account (the schema supports it; the UI shows one)
