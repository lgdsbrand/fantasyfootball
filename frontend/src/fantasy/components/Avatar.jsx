import { useState } from "react";

/**
 * Player headshot from Sleeper's CDN.
 *
 * Free, no key, keyed by the same sleeper_id we already store. Photos are
 * missing for plenty of players and for every draft pick, so this falls back
 * twice: to the team logo, then to initials. It never renders a broken image
 * and never leaves a hole in the layout.
 */
const SIZES = { sm: 30, md: 40, lg: 56, xl: 76 };

export default function Avatar({ player, size = "md", className = "" }) {
  const [stage, setStage] = useState(0); // 0 photo · 1 team logo · 2 initials
  const px = SIZES[size] || SIZES.md;
  const id = player?.sleeper_id;
  const isPick = player?.position === "PICK";

  const initials = (player?.name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const box = `rounded-full bg-deck2 border border-line shrink-0 overflow-hidden ${className}`;

  // Picks are not people. Show the round marker instead of a face.
  if (isPick) {
    return (
      <div
        className={`${box} grid place-items-center font-mono text-sky`}
        style={{ width: px, height: px, fontSize: px * 0.28 }}
      >
        {(player.name || "").split(" ")[0]?.slice(0, 4) || "PICK"}
      </div>
    );
  }

  if (stage === 2 || !id) {
    return (
      <div
        className={`${box} grid place-items-center font-display font-bold text-fog`}
        style={{ width: px, height: px, fontSize: px * 0.38 }}
      >
        {initials}
      </div>
    );
  }

  const src =
    stage === 0
      ? `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`
      : `https://sleepercdn.com/images/team_logos/nfl/${(player.team || "").toLowerCase()}.png`;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={px}
      height={px}
      onError={() => setStage((s) => (s === 0 && player.team ? 1 : 2))}
      className={`${box} object-cover ${stage === 1 ? "p-1.5 object-contain" : ""}`}
      style={{ width: px, height: px }}
    />
  );
}
