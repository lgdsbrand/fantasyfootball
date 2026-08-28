import { useState } from "react";
import api from "../lib/api.js";
import { useBoard } from "../lib/useBoard.js";
import { decimal, toApiSettings } from "../lib/format.js";
import { Card, Eyebrow, Button, Loading, ErrorNote, Reasoning } from "../components/ui.jsx";
import PlayerPicker from "../components/PlayerPicker.jsx";
import Avatar from "../components/Avatar.jsx";

function Side({ player, points, winner }) {
  if (!player) return null;
  return (
    <div
      className={`rounded-xl border p-4 text-center ${
        winner ? "border-turf/45 bg-turf/8" : "border-line bg-deck2"
      }`}
    >
      <Avatar player={player} size="xl" className="mx-auto mb-3" />
      <p className="font-display text-2xl font-bold leading-tight">{player.name}</p>
      <p className="font-mono text-[10px] text-fog mt-1 mb-3">
        {[player.position, player.team].filter(Boolean).join(" · ")}
      </p>
      <p className={`num text-3xl font-semibold ${winner ? "text-turf" : ""}`}>
        {decimal(points)}
      </p>
      <p className="font-mono text-[9px] tracking-widest uppercase text-fog mt-1">
        Projected
      </p>
      {winner && (
        <p className="inline-block mt-3 font-mono text-[10.5px] tracking-wider uppercase text-turf border border-turf/35 rounded-md px-3 py-1">
          Start him
        </p>
      )}
    </div>
  );
}

export default function SitStart({ settings }) {
  const { board, loading, error, reload } = useBoard(settings);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState(null);

  async function decide() {
    setBusy(true); setRunError(null); setResult(null);
    try {
      setResult(
        await api.sitStart({
          player_a: a.sleeper_id,
          player_b: b.sleeper_id,
          settings: toApiSettings(settings),
          explain: true,
        })
      );
    } catch (e) {
      setRunError(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading players" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          Sit or <span className="text-turf">start</span>
        </h1>
        <p className="text-fog text-sm mt-2 max-w-lg">
          Two players, one lineup spot. Get a call, not a shrug.
        </p>
      </div>

      <Card>
        <div className="grid md:grid-cols-2 gap-3.5">
          {[
            { label: "Player A", value: a, set: setA },
            { label: "Player B", value: b, set: setB },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <Eyebrow>{label}</Eyebrow>
              <PlayerPicker
                board={board}
                exclude={[a?.sleeper_id, b?.sleeper_id].filter(Boolean)}
                onPick={set}
                placeholder="Search a player"
              />
              {value && (
                <p className="text-sm mt-2.5 text-fog">
                  Selected: <span className="text-chalk font-semibold">{value.name}</span>
                </p>
              )}
            </div>
          ))}
        </div>
        <Button onClick={decide} disabled={!a || !b || busy} className="mt-4">
          {busy ? "Working…" : "Who do I start?"}
        </Button>
      </Card>

      {runError && <div className="mt-4"><ErrorNote error={runError} onRetry={decide} /></div>}

      {result && (
        <Card className="mt-3.5">
          <Eyebrow right={`week ${result.week}`}>The call</Eyebrow>
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <Side player={result.start} points={result.start.projection} winner />
            <span className="font-display text-sm font-bold text-fog tracking-wider text-center">
              VS
            </span>
            <Side player={result.bench} points={result.bench.projection} />
          </div>

          {!result.projections_available && (
            <p className="text-flag text-xs mt-4 border border-flag/30 rounded-lg p-3">
              No projections published for this week yet, so this call falls back to
              season-long value. It sharpens once the week's projections land.
            </p>
          )}
          {result.close_call && result.projections_available && (
            <p className="text-flag text-xs mt-4">
              Close one — {decimal(result.margin)} points apart. Either is defensible.
            </p>
          )}
          <Reasoning text={result.reasoning} />
        </Card>
      )}
    </div>
  );
}
