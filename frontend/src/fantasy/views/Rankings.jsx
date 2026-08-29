import { useMemo, useState } from "react";
import { useBoard } from "../lib/useBoard.js";
import { num, decimal, timeAgo } from "../lib/format.js";
import { Card, Eyebrow, Chip, Pos, Loading, ErrorNote, Segmented } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";

const COLUMNS = [
  { key: "overall_rank", label: "#", align: "left", width: "w-12" },
  { key: "name", label: "Player", align: "left" },
  { key: "position", label: "Pos", align: "left" },
  { key: "team", label: "Team", align: "left" },
  { key: "projection", label: "Proj", align: "right" },
  { key: "value", label: "Value", align: "right" },
  { key: "redraft_value", label: "Redraft", align: "right" },
  { key: "trend_30d", label: "30d", align: "right" },
];

export default function Rankings({ settings, setSettings }) {
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState({ key: "overall_rank", dir: 1 });
  const { board, updatedAt, week, loading, error, reload } = useBoard(settings);

  const rows = useMemo(() => {
    const filtered =
      position === "ALL"
        ? board
        : board.filter((p) => (p.position || "").toUpperCase() === position);

    return [...filtered].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sort.dir * av.localeCompare(bv);
      return sort.dir * (av - bv);
    });
  }, [board, position, sort]);

  function toggleSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: -s.dir } : { key, dir: key === "overall_rank" ? 1 : -1 }
    );
  }

  if (loading) return <Loading label="Loading rankings" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5 mb-6">
        <div>
          <h1 className="font-display text-4xl font-bold leading-none">
            Player <span className="text-turf">ranks</span>
          </h1>
          <p className="text-fog text-sm mt-2 max-w-lg">
            Crowd-sourced trade values from real leagues. Sort any column.
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

      <div className="flex flex-wrap gap-2 mb-4">
        {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
          <Chip key={p} active={position === p} onClick={() => setPosition(p)}>
            {p === "ALL" ? "All" : p}
          </Chip>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <Eyebrow
            right={[
              week ? `proj = week ${week}` : null,
              updatedAt ? `updated ${timeAgo(updatedAt)}` : null,
            ].filter(Boolean).join(" · ")}
          >
            {rows.length} players
          </Eyebrow>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`font-mono text-[9.5px] tracking-wider uppercase text-fog font-medium px-3 pb-3 whitespace-nowrap cursor-pointer hover:text-chalk transition-colors ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${c.width || ""}`}
                  >
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? " ↑" : " ↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.sleeper_id} className="border-t border-line/60 hover:bg-deck2/60">
                  <td className="num px-3 py-2.5 text-fog text-xs">{p.overall_rank}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar player={p} size="sm" />
                      <span className="text-sm font-semibold">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Pos position={p.position} /></td>
                  <td className="num px-3 py-2.5 text-fog text-xs">{p.team || "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-sm text-sky">
                    {p.projection == null ? "—" : decimal(p.projection)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-sm">{num(p.value)}</td>
                  <td className="num px-3 py-2.5 text-right text-fog text-xs">
                    {num(p.redraft_value)}
                  </td>
                  <td
                    className={`num px-3 py-2.5 text-right text-xs ${
                      p.trend_30d > 0 ? "text-turf" : p.trend_30d < 0 ? "text-whistle" : "text-fog"
                    }`}
                  >
                    {p.trend_30d > 0 ? "+" : ""}
                    {num(p.trend_30d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-fog text-xs mt-4 leading-relaxed max-w-2xl">
        The 30-day column is where the value hides. A player climbing fast is one the
        market has already re-rated; a player falling is one you can still buy at
        yesterday's price.
      </p>
    </div>
  );
}