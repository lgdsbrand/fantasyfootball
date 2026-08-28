import { useMemo, useState } from "react";
import api from "../lib/api.js";
import { useBoard } from "../lib/useBoard.js";
import { num, signed, decimal, toApiSettings } from "../lib/format.js";
import { Card, Eyebrow, Button, Loading, ErrorNote, Reasoning, Segmented } from "../components/ui.jsx";
import PlayerPicker from "../components/PlayerPicker.jsx";
import PlayerRow from "../components/PlayerRow.jsx";

/** The balance beam: it physically tilts toward whichever side is heavier. */
function Beam({ give, receive, verdict }) {
  const diff = receive - give;
  const tilt = Math.max(-9, Math.min(9, diff / 110));
  const colour =
    verdict?.startsWith("Accept") || verdict === "Lean accept"
      ? "text-turf"
      : verdict === "Even"
      ? "text-flag"
      : "text-whistle";

  return (
    <div className="pt-6 pb-2 overflow-hidden">
      <div className="relative h-[118px] mx-auto max-w-[560px]">
        <div
          className="absolute top-0 left-0 w-[132px] text-center transition-transform duration-500"
          style={{ transform: `translateY(${tilt * 1.7}px)` }}
        >
          <p className="font-mono text-[9.5px] tracking-widest uppercase text-fog">You give</p>
          <p className={`num text-[33px] font-extrabold leading-tight ${diff < 0 ? "text-whistle" : ""}`}>
            {num(give)}
          </p>
        </div>

        <div
          className="absolute top-0 right-0 w-[132px] text-center transition-transform duration-500"
          style={{ transform: `translateY(${-tilt * 1.7}px)` }}
        >
          <p className="font-mono text-[9.5px] tracking-widest uppercase text-fog">You get</p>
          <p className={`num text-[33px] font-extrabold leading-tight ${diff > 0 ? "text-turf" : ""}`}>
            {num(receive)}
          </p>
        </div>

        <div
          className="absolute left-0 right-0 top-[34px] h-[5px] rounded-full transition-transform duration-500"
          style={{
            transform: `rotate(${-tilt}deg)`,
            background:
              "linear-gradient(90deg, var(--color-whistle), var(--color-line) 42%, var(--color-line) 58%, var(--color-turf))",
          }}
        />
        <div
          className="absolute left-1/2 top-[39px] -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: "13px solid transparent",
            borderRight: "13px solid transparent",
            borderTop: "30px solid var(--color-deck2)",
          }}
        />
      </div>

      <p className={`text-center font-display text-[38px] font-extrabold leading-none ${colour}`}>
        {verdict}
      </p>
    </div>
  );
}

export default function TradeAnalyzer({ settings, setSettings, roster = [] }) {
  const { board, loading, error, reload } = useBoard(settings, { includePicks: true });
  const [give, setGive] = useState([]);
  const [receive, setReceive] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState(null);

  const chosen = useMemo(
    () => [...give, ...receive].map((p) => p.sleeper_id),
    [give, receive]
  );

  async function analyse() {
    setBusy(true);
    setRunError(null);
    setResult(null);
    try {
      const data = await api.trade({
        give: give.map((p) => p.sleeper_id),
        receive: receive.map((p) => p.sleeper_id),
        settings: toApiSettings(settings),
        roster,
        explain: true,
      });
      setResult(data);
    } catch (e) {
      setRunError(e);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setGive([]);
    setReceive([]);
    setResult(null);
    setRunError(null);
  }

  if (loading) return <Loading label="Loading the board" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const ready = give.length > 0 && receive.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5 mb-6">
        <div>
          <h1 className="font-display text-4xl font-bold leading-none">
            Trade <span className="text-turf">Analyzer</span>
          </h1>
          <p className="text-fog text-sm mt-2 max-w-lg">
            Market value on one side, what it does to your starting lineup on the other.
          </p>
        </div>
        <Segmented
          label="League format"
          value={settings.is_dynasty ? "dynasty" : "redraft"}
          onChange={(v) => setSettings({ ...settings, is_dynasty: v === "dynasty" })}
          options={[
            { value: "dynasty", label: "Dynasty" },
            { value: "redraft", label: "Redraft" },
          ]}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3.5">
        {[
          { key: "give", title: "You give up", list: give, set: setGive },
          { key: "receive", title: "You receive", list: receive, set: setReceive },
        ].map(({ key, title, list, set }) => (
          <Card key={key}>
            <Eyebrow right={list.length ? `${list.length} player${list.length > 1 ? "s" : ""}` : null}>
              {title}
            </Eyebrow>
            <PlayerPicker
              board={board}
              exclude={chosen}
              onPick={(p) => set([...list, p])}
              placeholder="Search a player or pick"
            />
            <div className="flex flex-col gap-2 mt-3">
              {list.map((p) => (
                <PlayerRow
                  key={p.sleeper_id}
                  player={p}
                  accent={key === "receive"}
                  onRemove={() => set(list.filter((x) => x.sleeper_id !== p.sleeper_id))}
                />
              ))}
              {list.length === 0 && (
                <p className="text-fog text-xs py-3 text-center">Nothing on this side yet.</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2.5 mt-4">
        <Button onClick={analyse} disabled={!ready || busy}>
          {busy ? "Working…" : "Analyse this trade"}
        </Button>
        {(give.length > 0 || receive.length > 0) && (
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {runError && (
        <div className="mt-4">
          <ErrorNote error={runError} onRetry={analyse} />
        </div>
      )}

      {result && (
        <>
          <Card className="mt-4">
            <Beam
              give={result.give.adjusted_total}
              receive={result.receive.adjusted_total}
              verdict={result.verdict}
            />
            <p className="text-center text-fog text-sm">
              <span className="num">{signed(result.net_value)}</span> in market value ·{" "}
              <span className="num">{decimal(result.confidence)}%</span> confidence
              {result.starter_points_delta != null && (
                <>
                  {" · "}
                  <span className="num">{signed(result.starter_points_delta)}</span> projected
                  points in your starters
                </>
              )}
            </p>
          </Card>

          <Card className="mt-3.5">
            <Eyebrow
              right={
                result.values_updated_at
                  ? `values ${String(result.values_updated_at).slice(0, 10)}`
                  : null
              }
            >
              The breakdown
            </Eyebrow>
            <div className="divide-y divide-line">
              {result.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="text-fog text-xs mt-0.5 leading-relaxed">{f.detail}</p>
                  </div>
                  <span
                    className={`ml-auto shrink-0 font-mono text-[9.5px] tracking-wider uppercase px-2 py-1 rounded border ${
                      f.winner === "you"
                        ? "text-turf border-turf/40"
                        : f.winner === "them"
                        ? "text-whistle border-whistle/40"
                        : "text-fog border-line"
                    }`}
                  >
                    {f.winner}
                  </span>
                </div>
              ))}
            </div>
            <Reasoning text={result.reasoning} />
            {!result.reasoning && (
              <p className="text-fog text-xs mt-4 border-l-2 border-line pl-4">
                {result.ai_available
                  ? "The AI provider did not answer this time — check the server log for the reason it gave. The verdict above is computed either way."
                  : "Written analysis is off: no GROQ_API_KEY in local/.env. The verdict above is computed either way."}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}