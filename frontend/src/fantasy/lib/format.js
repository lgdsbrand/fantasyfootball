export const num = (v) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString();

export const signed = (v) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toLocaleString()}`;

export const decimal = (v, places = 1) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(places);

export function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const POSITION_STYLE = {
  QB: "text-[#FF8FB1] border-[#FF8FB1]/30",
  RB: "text-turf border-turf/30",
  WR: "text-sky border-sky/30",
  TE: "text-flag border-flag/30",
  PICK: "text-fog border-line",
};

// A league's format decides which value set the backend reads, so the whole app
// passes this object around rather than four loose numbers.
export const DEFAULT_SETTINGS = {
  is_dynasty: false,
  num_qbs: 1,
  ppr: 1.0,
  num_teams: 12,
};

export const toApiSettings = (s) => ({
  is_dynasty: s.is_dynasty,
  num_qbs: s.num_qbs,
  ppr: s.ppr,
  num_teams: s.num_teams,
});

export const toQuerySettings = (s) => ({
  isDynasty: s.is_dynasty,
  numQbs: s.num_qbs,
  ppr: s.ppr,
  numTeams: s.num_teams,
});
