# Running this on Windows (PowerShell)

## 0. Check where the files landed

The zip has a top-level `ff` folder, so after extracting to `C:\dev\fantasy`
your paths are probably `C:\dev\fantasy\ff\backend\...`. Confirm before running
anything:

```powershell
cd C:\dev\fantasy
dir
```

If you see a folder called `ff`, `cd ff` first. Every command below assumes you
are in the folder that directly contains `backend`, `local` and `supabase`.

```powershell
dir     # should list: backend, local, supabase, .github, TESTING.md
```

## 1. Install uv

The client's backend uses `uv`, so match it — that way your local setup and his
deployment behave identically.

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**Close PowerShell and open a new window.** The installer edits PATH and the old
window won't see it. Then:

```powershell
uv --version
```

If that still fails, `pip install uv` works too.

## 2. Create the environment

```powershell
uv venv
.\.venv\Scripts\Activate.ps1
uv pip install fastapi uvicorn httpx pyjwt "pydantic>=2"
```

If PowerShell blocks the activate script, run this once and try again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 3. Configure

```powershell
copy local\.env.example local\.env
notepad local\.env
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your own Supabase
project (Project Settings → Data API, and → API Keys → `service_role`). Save.

No export command needed — the code reads `local\.env` itself.

## 4. Load real data

```powershell
uv run python backend\scripts\refresh_fantasy_data.py
```

Expect lines like:

```
INFO fetching Sleeper player index (~5MB, once a day)
INFO players: 2847 rows
INFO values dynasty_1qb_ppr1_12: 512 rows
...
INFO done
```

## 5. Start the server

```powershell
uv run uvicorn local.main:app --reload --port 8000
```

Leave it running. Open http://localhost:8000/docs to click through the API.

## 6. Verify, in a second PowerShell window

```powershell
cd C:\dev\fantasy\ff
.\.venv\Scripts\Activate.ps1
uv run python backend\scripts\verify_fantasy.py --sleeper-username YOUR_SLEEPER_NAME
```

---

## Without uv

Everything works on plain Python too:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn httpx pyjwt "pydantic>=2"

python backend\scripts\refresh_fantasy_data.py
python -m uvicorn local.main:app --reload --port 8000
python backend\scripts\verify_fantasy.py --sleeper-username YOUR_SLEEPER_NAME
```

Same result. Install `uv` anyway before you touch the client's repo, since his
backend uses it and you'll need it there.

## Windows notes

- Backslashes in paths, forward slashes also work in Python arguments.
- `export VAR=value` is bash. PowerShell is `$env:VAR = "value"` — but you don't
  need either, the `.env` file is read automatically.
- `source` doesn't exist. Use `.\.venv\Scripts\Activate.ps1`.
- If port 8000 is taken, add `--port 8001` and pass
  `--base http://127.0.0.1:8001` to the verify script.
