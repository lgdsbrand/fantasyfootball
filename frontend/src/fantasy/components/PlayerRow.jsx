import { Pos } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { num, decimal } from "../lib/format.js";

export default function PlayerRow({ player, onRemove, accent = false }) {
  return (
    <div className="flex items-center gap-3 bg-deck2 border border-line rounded-lg px-3 py-2.5">
      <Avatar player={player} size="md" />
      <Pos position={player.position} />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight truncate">{player.name}</p>
        <p className="font-mono text-[10px] text-fog mt-0.5">
          {[player.team, player.age ? `${decimal(player.age)} y/o` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className={`num text-[15px] font-semibold ${accent ? "text-turf" : ""}`}>
          {num(player.value)}
        </p>
        {player.projection != null && (
          <p className="num text-[10px] text-sky">{decimal(player.projection)} proj</p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${player.name}`}
          className="text-fog hover:text-whistle transition-colors text-lg leading-none px-1 cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}
