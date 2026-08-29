import { useEffect, useMemo, useState } from "react";
import api from "../lib/api.js";
import { num, decimal } from "../lib/format.js";
import { useBoard } from "../lib/useBoard.js";
import { Card, Eyebrow, Button, Field, Loading, ErrorNote, Empty, Reasoning, Pos } from "../components/ui.jsx";

/** 1st, 2nd, 3rd, 4th — including the 11th–13th exceptions. */
function ordinal(n) {
  if (n == null) return "—";
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
}

/** Every team in the league, expandable. The data already comes back from
 *  /league/{id}, it just was not being shown. */
function LeagueTable({ league, board }) {
  const [openId, setOpenId] = useState(null);
  const byId = useMemo(
    () => Object.fromEntries((board || []).map((p) => [p.sleeper_id, p])),
    [board]
  );

  // Rank by points scored, falling back to wins before a season has started.
  const teams = useMemo(
    () => [...(league.teams || [])].sort(
      (a, b) => (b.points_for - a.points_for) || (b.wins - a.wins)
    ),
    [league]
  );

  return (
    <Card className="mt-3.5">
      <Eyebrow right={`${teams.length} teams`}>The league</Eyebrow>
      <div className="divide-y divide-line">
        {teams.map((t, i) => {
          const players = (t.players || [])
            .map((id) => byId[id])
            .filter(Boolean)
            .sort((a, b) => (b.value || 0) - (a.value || 0));
          const total = players.reduce((n, p) => n + (p.value || 0), 0);
          const isOpen = openId === t.roster_id;

          return (
            <div key={t.roster_id}>
              <button
                onClick={() => setOpenId(isOpen ? null : t.roster_id)}
                className="w-full flex items-center gap-3 py-3 text-left cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className="num text-fog text-xs w-5">{i + 1}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${t.is_mine ? "text-turf" : ""}`}>
                    {t.owner}{t.is_mine ? " (you)" : ""}
                  </p>
                  <p className="font-mono text-[10px] text-fog mt-0.5">
                    {t.wins}–{t.losses} · {num(t.points_for)} pts · {(t.players || []).length} players
                  </p>
                </div>
                <span className="num text-sm ml-auto">{num(total)}</span>
                <span className={`text-fog text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>

              {isOpen && (
                <div className="pb-3 pl-8 flex flex-col gap-1.5">
                  {players.length === 0 && (
                    <p className="text-fog text-xs py-2">No drafted players yet.</p>
                  )}
                  {players.map((p) => (
                    <div key={p.sleeper_id} className="flex items-center gap-2.5">
                      <Pos position={p.position} />
                      <span className="text-[13px] truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-fog">{p.team}</span>
                      <span className="num text-xs text-fog ml-auto">{num(p.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-fog text-xs mt-4 leading-relaxed">
        Totals are the sum of every rostered player's trade value — a rough measure
        of talent held, not of how the season is going.
      </p>
    </Card>
  );
}

/** Playoff odds from the simulation. Shown as a bar because a percentage on
 *  its own invites false precision — the shape of the field is the point. */
function PlayoffOdds({ leagueId }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    api.playoffOdds(leagueId)
      .then((d) => !cancelled && (setData(d), setState("ready")))
      .catch(() => !cancelled && setState("unavailable"));
    return () => { cancelled = true; };
  }, [leagueId]);

  if (state === "loading") return null;
  if (state === "unavailable") return null;

  return (
    <Card className="mt-3.5">
      <Eyebrow right={`${data.playoff_spots} spots · ${data.simulations.toLocaleString()} sims`}>
        Playoff odds
      </Eyebrow>
      <div className="flex flex-col gap-2.5">
        {data.teams.map((t) => (
          <div key={t.roster_id} className="flex items-center gap-3">
            <span className="text-[13px] truncate w-28 shrink-0">{t.owner}</span>
            <span className="num text-[10px] text-fog w-12 shrink-0">
              {t.wins}–{t.losses}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(1.5, t.playoff_odds)}%`,
                  background:
                    t.playoff_odds >= 66 ? "var(--color-turf)"
                    : t.playoff_odds >= 25 ? "var(--color-flag)"
                    : "var(--color-whistle)",
                }}
              />
            </div>
            <span className="num text-xs w-12 text-right">{t.playoff_odds}%</span>
            <span className="num text-[10px] text-fog w-14 text-right hidden sm:block">
              {t.projected_wins} W
            </span>
          </div>
        ))}
      </div>
      <p className="text-fog text-xs mt-4 leading-relaxed">
        Each team is simulated on its own scoring so far, playing out its actual
        remaining schedule {data.simulations.toLocaleString()} times. Early in a
        season there is little history to go on, so the numbers lean toward the
        league average until real scores accumulate.
      </p>
    </Card>
  );
}

function GradeRing({ grade, score }) {
  const circumference = 2 * Math.PI * 39;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative w-[92px] h-[92px] shrink-0">
      <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90">
        <circle cx="46" cy="46" r="39" fill="none" strokeWidth="7" stroke="var(--color-line)" />
        <circle
          cx="46" cy="46" r="39" fill="none" strokeWidth="7" strokeLinecap="round"
          stroke="var(--color-turf)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-3xl font-extrabold">
        {grade}
      </div>
    </div>
  );
}

export default function LeagueHub({ league, setLeague, settings, setSettings, setRoster, auth }) {
  const [username, setUsername] = useState("");
  const [leagues, setLeagues] = useState(null);
  const [sleeperUser, setSleeperUser] = useState(null);
  const [grade, setGrade] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { board } = useBoard(settings, { limit: 500 });

  async function sync() {
    if (!username.trim()) return;
    setBusy(true); setError(null); setGrade(null);
    try {
      const data = await api.syncUsername(username.trim());
      setLeagues(data.leagues || []);
      setSleeperUser(data.user || null);
      if (!data.leagues?.length) setError(new Error(`${username} has no leagues for this season.`));
    } catch (e) {
      setError(e); setLeagues(null);
    } finally {
      setBusy(false);
    }
  }

  async function open(entry) {
    setBusy(true); setError(null);
    try {
      const detail = await api.league(entry.league_id, sleeperUser?.user_id);
      setLeague(detail);
      if (detail.league?.settings) setSettings({ ...settings, ...detail.league.settings });

      // Signed in? Remember this league so the next visit skips the sync step,
      // which is the whole point of having an account here. A failure to save
      // must not break opening the league, so it is fire-and-forget.
      if (auth?.user) {
        api.saveLeague({
          league_id: entry.league_id,
          league_name: entry.name,
          sleeper_user_id: sleeperUser?.user_id,
          sleeper_username: sleeperUser?.username,
        }).catch(() => {});
      }

      const mine = detail.teams.find((t) => t.is_mine) || detail.teams[0];
      if (mine) {
        setRoster(mine.players || []);
        // A league before its draft has no players, so there is nothing to grade.
        if ((mine.players || []).length > 0) {
          setGrade(await api.rosterGrade(entry.league_id, mine.roster_id, true));
        }
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // On sign-in, pull the saved league back without asking for the username again.
  useEffect(() => {
    if (!auth?.user || league) return;
    let cancelled = false;
    api.myLeagues()
      .then((rows) => {
        if (cancelled || !rows?.length) return;
        const saved = rows[0];
        setUsername(saved.sleeper_username || "");
        setSleeperUser(
          saved.sleeper_user_id
            ? { user_id: saved.sleeper_user_id, username: saved.sleeper_username }
            : null
        );
        return open({ league_id: saved.league_id, name: saved.league_name });
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user]);

  const mine = league?.teams?.find((t) => t.is_mine) || league?.teams?.[0];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          Let's win your <span className="text-turf">league</span>.
        </h1>
        <p className="text-fog text-sm mt-2 max-w-lg">
          Connect Sleeper and your roster, record and grade are here every time you visit.
        </p>
      </div>

      <Card>
        <Eyebrow right={league ? "connected" : "not connected"}>League sync</Eyebrow>
        <div className="flex flex-wrap gap-2.5">
          <Field
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sync()}
            placeholder="Your Sleeper username"
            className="flex-1 min-w-[220px]"
          />
          <Button onClick={sync} disabled={busy || !username.trim()}>
            {busy ? "Checking…" : "Find my leagues"}
          </Button>
        </div>
        <p className="text-fog text-xs mt-2.5">
          Sleeper needs no password — a username is enough to read your leagues.
          {auth?.configured && !auth?.user && " Sign in and we'll remember it next time."}
        </p>
      </Card>

      {error && <div className="mt-4"><ErrorNote error={error} /></div>}

      {leagues?.length > 0 && !league && (
        <Card className="mt-3.5">
          <Eyebrow>Pick a league</Eyebrow>
          <div className="flex flex-col gap-2">
            {leagues.map((l) => (
              <button
                key={l.league_id}
                onClick={() => open(l)}
                className="flex items-center gap-3 bg-deck2 border border-line rounded-lg px-3.5 py-3 text-left hover:border-turf/50 transition-colors cursor-pointer"
              >
                <div>
                  <p className="font-display text-lg font-bold leading-tight">{l.name}</p>
                  <p className="font-mono text-[10px] text-fog mt-0.5">
                    {l.total_rosters} teams
                    {l.settings?.is_dynasty ? " · dynasty" : " · redraft"}
                    {l.settings?.num_qbs > 1 ? " · superflex" : ""}
                  </p>
                </div>
                <span className="ml-auto text-fog text-lg">›</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {busy && league == null && leagues?.length > 0 && <Loading label="Opening league" />}

      {league && (
        <>
          <Card className="mt-3.5 border-turf/25 bg-gradient-to-br from-turf/8 to-transparent">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl font-bold">{league.league.name}</p>
                <p className="font-mono text-[10px] tracking-wide text-fog mt-1 uppercase">
                  {league.teams.length} teams
                  {league.league.settings?.is_dynasty ? " · dynasty" : " · redraft"}
                  {league.league.settings?.ppr ? ` · ${league.league.settings.ppr} ppr` : ""}
                </p>
              </div>
              <Button variant="ghost" onClick={() => { setLeague(null); setGrade(null); setRoster([]); }}>
                Change league
              </Button>
            </div>

            {![10, 12, 14].includes(league.teams.length) && (
              <p className="text-flag text-xs mt-4 border border-flag/30 rounded-lg p-3 leading-relaxed">
                Trade values are published for 10, 12 and 14-team leagues, so this{" "}
                {league.teams.length}-team league uses the closest set. Rankings hold
                up; the raw numbers are approximate at this size.
              </p>
            )}

            {mine && (mine.players || []).length === 0 && (
              <p className="text-fog text-xs mt-4 border border-line rounded-lg p-3 leading-relaxed">
                This league has not drafted yet, so there is no roster to grade. The
                trade analyzer, rankings and draft helper all work in the meantime —
                the draft helper is the one built for exactly this moment.
              </p>
            )}

            {mine && (
              <div className="flex flex-wrap gap-8 mt-5 pt-4 border-t border-line">
                {[
                  ["Record", `${mine.wins}–${mine.losses}`],
                  ["Points for", num(mine.points_for)],
                  ["Roster size", num((mine.players || []).length)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="font-mono text-[9.5px] tracking-widest uppercase text-fog">{k}</p>
                    <p className="num font-display text-2xl font-bold leading-tight">{v}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {grade && (
            <Card className="mt-3.5">
              <Eyebrow right={grade.league_rank ? `${grade.league_rank} of ${league.teams.length}` : null}>
                Roster grade
              </Eyebrow>
              <div className="flex items-center gap-5">
                <GradeRing grade={grade.grade} score={grade.score} />
                <div className="flex-1 flex flex-col gap-2.5">
                  {grade.positions.map((p) => (
                    <div key={p.position} className="flex items-center gap-3">
                      <Pos position={p.position} />
                      <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.max(3, p.percentile)}%`,
                            background:
                              p.percentile >= 66
                                ? "var(--color-turf)"
                                : p.percentile >= 33
                                ? "var(--color-flag)"
                                : "var(--color-whistle)",
                          }}
                        />
                      </div>
                      <span className="num text-[11px] text-fog w-16 text-right">
                        {ordinal(p.rank)} · {p.grade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Reasoning title="What this says" text={grade.summary} />
            </Card>
          )}

          <PlayoffOdds leagueId={league.league.league_id} />

          <LeagueTable league={league} board={board} />
        </>
      )}

      {!leagues && !league && (
        <Empty title="Nothing synced yet">
          Enter a Sleeper username above. Everything else in the hub — trades, roster
          grading, sit or start — gets sharper once it knows your actual team.
        </Empty>
      )}
    </div>
  );
}