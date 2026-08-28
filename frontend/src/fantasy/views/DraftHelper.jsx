import { useMemo, useState } from "react";
import api from "../lib/api.js";
import { useBoard } from "../lib/useBoard.js";
import { num, toApiSettings } from "../lib/format.js";
import { Card, Eyebrow, Pos, Loading, ErrorNote, Button } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";

export default function DraftHelper({ settings }) {
  const { board, loading, error, reload } = useBoard(settings);
  const [status, setStatus] = useState({});   // sleeper_id -> "mine" | "gone"
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);

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

          {mine.length > 0 && (
            <Card>
              <Eyebrow>Your picks</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {mine.map((id) => {
                  const p = board.find((b) => b.sleeper_id === id);
                  return (
                    <span
                      key={id}
                      className="text-xs bg-turf/10 border border-turf/30 rounded px-2 py-1"
                    >
                      {p?.name || id}
                    </span>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
