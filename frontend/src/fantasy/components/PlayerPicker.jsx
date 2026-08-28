import { useMemo, useState } from "react";
import { Pos } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { num } from "../lib/format.js";

/**
 * Type-ahead over the already-loaded board.
 *
 * The whole player board is a few hundred rows, so it is fetched once by the
 * parent and searched in memory. That means no request per keystroke and no
 * search endpoint on the backend.
 */
export default function PlayerPicker({ board, exclude = [], onPick, placeholder = "Add a player" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const excluded = useMemo(() => new Set(exclude), [exclude]);

  // Two separate results: what you can still add, and what matched but is
  // already in the trade. Without the second, a player you just picked looks
  // like a player who does not exist.
  const { matches, alreadyPicked } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { matches: [], alreadyPicked: [] };
    const hits = board.filter((p) => (p.name || "").toLowerCase().includes(q));
    return {
      matches: hits.filter((p) => !excluded.has(p.sleeper_id)).slice(0, 8),
      alreadyPicked: hits.filter((p) => excluded.has(p.sleeper_id)).slice(0, 3),
    };
  }, [board, query, excluded]);

  function pick(player) {
    onPick(player);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) pick(matches[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full bg-deck2 border border-line rounded-lg px-3.5 py-2.5 text-sm placeholder:text-fog/70 focus:outline-none focus:border-sky transition-colors"
      />

      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1.5 bg-deck2 border border-line rounded-lg overflow-hidden shadow-2xl shadow-black/60">
          {matches.map((p) => (
            <li key={p.sleeper_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-deck transition-colors cursor-pointer"
              >
                <Avatar player={p} size="sm" />
                <Pos position={p.position} />
                <span className="text-sm font-medium truncate">{p.name}</span>
                <span className="font-mono text-[10px] text-fog">{p.team || ""}</span>
                <span className="num text-xs text-fog ml-auto">{num(p.value)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1.5 bg-deck2 border border-line rounded-lg px-3.5 py-3 text-sm text-fog">
          {alreadyPicked.length > 0 ? (
            <>
              {alreadyPicked.map((p) => p.name).join(", ")}
              {alreadyPicked.length > 1 ? " are" : " is"} already in this trade.
            </>
          ) : (
            <>
              No player called “{query}” on this board. Only players with a
              published trade value appear here — try the Dynasty board, which
              covers more players.
            </>
          )}
        </div>
      )}
    </div>
  );
}