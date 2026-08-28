import { useMemo } from "react";
import { useBoard } from "../lib/useBoard.js";
import { num } from "../lib/format.js";
import { Card, Eyebrow, Loading, ErrorNote, Empty } from "../components/ui.jsx";

/** FantasyCalc's synthetic ids decode into readable pick names. */
function pickLabel(id, fallback) {
  const dynasty = /^DP_(\d+)_(\d+)$/.exec(id);
  if (dynasty) return `${Number(dynasty[1]) + 1}.${String(Number(dynasty[2]) + 1).padStart(2, "0")}`;
  const future = /^FP_(\d{4})_(early|mid|late)?_?(\d+)$/.exec(id);
  if (future) {
    const round = Number(future[3]) + (future[2] ? 1 : 0);
    return `${future[1]} ${future[2] ? `${future[2]} ` : ""}${round}${round === 1 ? "st" : round === 2 ? "nd" : round === 3 ? "rd" : "th"}`;
  }
  return fallback || id;
}

export default function Rookies({ settings }) {
  const dynasty = { ...settings, is_dynasty: true };
  const { board, loading, error, reload } = useBoard(dynasty, { includePicks: true });

  const picks = useMemo(
    () => board.filter((p) => (p.position || "").toUpperCase() === "PICK"),
    [board]
  );

  if (loading) return <Loading label="Loading pick values" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          Dynasty <span className="text-turf">rookies</span>
        </h1>
        <p className="text-fog text-sm mt-2 max-w-xl">
          Rookie and future picks priced as tradeable assets. Anything here can be
          dropped straight into the trade analyzer.
        </p>
      </div>

      {picks.length === 0 ? (
        <Empty title="No pick values loaded">
          The nightly refresh pulls pick values along with players. Run the refresh
          script and they will appear here.
        </Empty>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(215px,1fr))]">
          {picks.map((p) => (
            <Card key={p.sleeper_id} className="hover:border-sky/40 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-display text-xl font-bold leading-tight">
                  {pickLabel(p.sleeper_id, p.name)}
                </p>
                <span className="font-mono text-[10px] text-sky">#{p.overall_rank}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[9.5px] tracking-widest uppercase text-fog">
                  Value
                </span>
                <span className="num text-lg font-semibold">{num(p.value)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-line">
                <span className="font-mono text-[9.5px] tracking-widest uppercase text-fog">
                  30 day
                </span>
                <span
                  className={`num text-xs ${
                    p.trend_30d > 0 ? "text-turf" : p.trend_30d < 0 ? "text-whistle" : "text-fog"
                  }`}
                >
                  {p.trend_30d > 0 ? "+" : ""}
                  {num(p.trend_30d)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
