import { useMemo, useState } from "react";
import api from "../lib/api.js";
import { useBoard } from "../lib/useBoard.js";
import { num, toApiSettings } from "../lib/format.js";
import { Card, Eyebrow, Pos, Loading, ErrorNote, Button } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";

// Sleeper's slot names, in the order a lineup is usually shown.
const SLOT_LABEL = {
  QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", DEF: "DEF",
  FLEX: "FLEX", WRRB_FLEX: "W/R", REC_FLEX: "W/T", WRT: "W/R/T",
  SUPER_FLEX: "SUPERFLEX", IDP_FLEX: "IDP",
};
const FLEX_ELIGIBLE = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  WRT: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const DEFAULT_SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "K", "DEF"];

/**
 * Fills drafted players into lineup slots the way Sleeper does: dedicated
 * positions first, then flex from whoever is left. Anything that does not fit
 * a starting slot falls to the bench, which is exactly how a real roster works.
 */
function fillLineup(slots, players) {
  const used = new Set();
  const filled = slots.map((slot) => {
    const eligible = FLEX_ELIGIBLE[slot];
    const match = players.find(
      (p) => !used.has(p.sleeper_id) &&
        (eligible ? eligible.includes(p.position) : p.position === slot)
    );
    if (match) used.add(match.sleeper_id);
    return { slot, player: match || null };
  });
  // Dedicated slots claim players before flex slots do.
  const bench = players.filter((p) => !used.has(p.sleeper_id));
  return { filled, bench };
}

function RosterBoard({ slots, players }) {
  const { filled, bench } = fillLineup(slots, players);
  return (
    <Card>
      <Eyebrow right={`${players.length} drafted`}>Your roster</Eyebrow>
      <div className="flex flex-col gap-1.5">
        {filled.map(({ slot, player }, i) => (
          <div
            key={`${slot}-${i}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
              player ? "bg-deck2 border-line" : "border-dashed border-line/70"
            }`}
          >
            <span className="font-mono text-[9.5px] tracking-wider uppercase text-fog w-16 shrink-0">
              {SLOT_LABEL[slot] || slot}
            </span>
            {player ? (
              <>
                <Avatar player={player} size="sm" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{player.name}</p>
                  <p className="font-mono text-[10px] text-fog">{player.team}</p>
                </div>
                <span className="num text-xs text-fog ml-auto">{num(player.value)}</span>
              </>
            ) : (
              <span className="text-fog text-[13px]">Empty</span>
            )}
          </div>
        ))}

        {bench.length > 0 && (
          <>
            <p className="font-mono text-[9.5px] tracking-wider uppercase text-fog mt-3 mb-0.5">
              Bench
            </p>
            {bench.map((p) => (
              <div key={p.sleeper_id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-deck2/50 border border-line">
                <span className="w-16 shrink-0"><Pos position={p.position} /></span>
                <Avatar player={p} size="sm" />
                <p className="text-[13px] truncate">{p.name}</p>
                <span className="num text-xs text-fog ml-auto">{num(p.value)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

export default function DraftHelper({ settings, league }) {
  const { board, loading, error, reload } = useBoard(settings);
  const [status, setStatus] = useState({});   // sleeper_id -> "mine" | "gone"
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);

  // The real league's lineup if synced, otherwise a standard one.
  const slots = useMemo(() => {
    const rp = league?.league?.roster_positions;
    const starters = (rp || []).filter((p) => !["BN", "IR", "TAXI"].includes(p));
    return starters.length ? starters : DEFAULT_SLOTS;
  }, [league]);

  const mine = useMemo(
    () => Object.entries(status).filter(([, v]) => v === "mine").map(([k]) => k),
    [status]
  );
  const gone = useMemo(
    () => Object.entries(status).filter(([, v]) => v === "gone").map(([k]) => k),
    [status]
  );
  const available = useMemo(
    () => board.filter((p) => !status[p.sleeper_id]),
    [board, status]
  );
  const myPlayers = useMemo(
    () => board.filter((p) => status[p.sleeper_id] === "mine"),
    [board, status]
  );

  function mark(id, value) {
    setStatus((s) => ({ ...s, [id]: s[id] === value ? undefined : value }));
  }

  async function suggest() {
    setBusy(true);
    try {
      const data = await api.draftSuggest({
        drafted_by_me: mine,
        off_the_board: gone,
        settings: toApiSettings(settings),
        limit: 5,
      });
      setPicks(data.suggestions || []);
    } catch {
      setPicks([]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading the board" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          Draft <span className="text-turf">helper</span>
        </h1>
        <p className="text-fog text-sm mt-2 max-w-xl">
          Green takes a player for you, red marks him gone elsewhere. Suggestions
          re-weight against what your roster still needs.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-3.5 items-start">
        <div>
        <Card className="mb-3.5">
          <Eyebrow right={league ? league.league.name : "standard lineup"}>
            Roster settings
          </Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slot, i) => (
              <span
                key={`${slot}-${i}`}
                className="font-mono text-[10px] tracking-wider uppercase text-fog border border-line rounded px-2 py-1"
              >
                {SLOT_LABEL[slot] || slot}
              </span>
            ))}
          </div>
          {!league && (
            <p className="text-fog text-xs mt-3">
              Sync a league in League Hub and this uses its actual lineup instead.
            </p>
          )}
        </Card>

        <Card>
          <Eyebrow right={`${available.length} on the board`}>Best available</Eyebrow>
          <div className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto pr-1.5">
            {available.slice(0, 120).map((p) => (
              <div
                key={p.sleeper_id}
                className="flex items-center gap-3 bg-deck2 border border-line rounded-lg px-3 py-2"
              >
                <span className="num text-[11px] text-fog w-8">{p.overall_rank}</span>
                <Avatar player={p} size="sm" />
                <Pos position={p.position} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate leading-tight">{p.name}</p>
                  <p className="font-mono text-[10px] text-fog">{p.team || ""}</p>
                </div>
                <span className="num text-xs text-fog ml-auto mr-1">{num(p.value)}</span>
                <button
                  onClick={() => mark(p.sleeper_id, "mine")}
                  aria-label={`Draft ${p.name}`}
                  title="I drafted him"
                  className="w-7 h-7 rounded-md border border-line text-turf text-lg leading-none grid place-items-center hover:bg-turf/15 hover:border-turf transition-colors cursor-pointer"
                >
                  +
                </button>
                <button
                  onClick={() => mark(p.sleeper_id, "gone")}
                  aria-label={`Mark ${p.name} taken`}
                  title="Someone else took him"
                  className="w-7 h-7 rounded-md border border-line text-whistle text-lg leading-none grid place-items-center hover:bg-whistle/12 hover:border-whistle transition-colors cursor-pointer"
                >
                  −
                </button>
              </div>
            ))}
          </div>
        </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            <Eyebrow right={mine.length ? `${mine.length} drafted` : null}>Take one of these</Eyebrow>
            <Button onClick={suggest} disabled={busy} className="w-full mb-3">
              {busy ? "Thinking…" : "Suggest my next pick"}
            </Button>
            {picks.length === 0 ? (
              <p className="text-fog text-xs text-center py-3">
                Mark a few players, then ask for a suggestion.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {picks.map((p, i) => (
                  <div key={p.sleeper_id} className="flex gap-3 py-3 first:pt-0">
                    <span className="font-display text-xl font-extrabold text-turf w-5">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {p.name} <Pos position={p.position} />
                      </p>
                      <p className="text-fog text-xs mt-1 leading-relaxed">{p.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {myPlayers.length > 0 && <RosterBoard slots={slots} players={myPlayers} />}

        </div>
      </div>
    </div>
  );
}