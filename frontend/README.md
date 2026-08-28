# Fantasy Hub — frontend

React 19 + Vite + Tailwind v4, matching the backend's stack.

## Run it

The backend must already be running on port 8000.

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

Vite proxies `/api` to `http://127.0.0.1:8000`, so the frontend calls relative
URLs and there is no CORS to configure in development.

## Try it in this order

1. **League Hub** — enter your Sleeper username, pick a league. Record, roster and
   grade appear. This also stores your roster in memory, which sharpens the other tools.
2. **Player Ranks** — sort any column. The 30-day trend is the interesting one.
3. **Trade Analyzer** — search two players, hit analyse. Watch the beam tilt.
4. **Draft Helper** — mark a few players with + and −, then ask for a suggestion.
   Take three RBs and it stops suggesting RBs.
5. **Sit / Start**, **Rookies**, **What's Going On Now**.

## Layout

```
src/
  index.css                 design tokens (@theme) — Tailwind v4 has no config file
  fantasy/
    FantasyHub.jsx          shell, nav, shared state
    lib/
      api.js                axios client, one function per endpoint
      format.js             number/date helpers, league settings shape
      useBoard.js           loads the ranked board once per format
    components/
      ui.jsx                Card, Eyebrow, Button, Loading, ErrorNote, Reasoning…
      PlayerPicker.jsx      type-ahead search
      PlayerRow.jsx         one player line
    views/                  one file per section
```

## Mounting into the existing site

`FantasyHub` brings its own layout and holds no global state, so it drops onto a
route:

```jsx
import FantasyHub from "./fantasy/FantasyHub.jsx";

<Route path="/fantasy" element={<FantasyHub />} />
```

Then copy the `@theme` block from `src/index.css` into the site's existing
Tailwind entry CSS. If the site already defines colours, rename the tokens rather
than overwriting — every component resolves through them, so a rename is a
find-and-replace in one file.

Set `VITE_API_URL` only if the API lives on a different origin in production.

## Two deliberate decisions

**The board loads once, not per keystroke.** A league format's board is a few
hundred rows, so `useBoard` fetches it once and every search filters it in
memory. No search endpoint, no request per character typed.

**Model prose never looks like computed numbers.** Anything written by the AI
renders in the `Reasoning` component with a distinct blue rule. Verdicts,
values and point totals come from the backend's own maths and are styled as
data. Nobody should have to wonder which is which — and when the AI key is
absent, the numbers still render and a note explains the missing prose.

## Sign-in

The API accepts a Supabase JWT from `localStorage["sb-access-token"]` and uses
it only for saving leagues to an account. Every tool works signed out, which
matters for a public page — people can try the trade calculator before deciding
to make an account. Wiring `@supabase/supabase-js` on the client is the
remaining piece.

## Sign-in

Add `frontend/.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
```

Use the **publishable** key, never the secret one. It is safe in a browser
because row level security decides what it can reach, and `ff_user_leagues` is
readable only by its owner.

Restart `npm run dev` after adding it — Vite reads env only at startup.

Password and email-link sign-in are both available; the panel switches between
them. If the two variables are absent the account UI simply does not render and
the site works exactly as before, which keeps a misconfigured build from being a
broken one.

**Nothing is gated.** Every tool works signed out. Signing in only means the
league you synced is restored automatically next visit — which is what the
client asked accounts for.

### Backend note

Supabase signs session tokens with ES256 on projects created since 2025, and
with HS256 on older ones. `auth.py` reads the algorithm from the token header
and verifies asymmetric tokens against the project's JWKS endpoint (cached, and
refetched when a new key id appears, so key rotation needs no redeploy).
`SUPABASE_JWT_SECRET` is only needed for legacy HS256 projects.

Verifying ES256 requires the `cryptography` package:

```
uv pip install cryptography
```
