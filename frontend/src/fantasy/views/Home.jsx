import { useEffect, useState } from "react";
import api from "../lib/api.js";
import { decimal } from "../lib/format.js";
import { Card, Eyebrow, Pos, Loading, ErrorNote } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";
import TwitterFeed from "../components/TwitterFeed.jsx";

const X_ACCOUNTS = ["RotoWireNFL", "UnderdogNFL"];

// What each section does, in the words a manager would use rather than
// feature-list language.
const TOURS = [
  { id: "hub", name: "League Hub", blurb: "Sync Sleeper and see your record, your roster grade and every team in the league." },
  { id: "trade", name: "Trade Analyzer", blurb: "Grade any deal on market value and what it does to your starting lineup, with the reasoning written out." },
  { id: "ranks", name: "Player Ranks", blurb: "Every player worth trading, sorted however you like, with projections and 30-day value trends." },
  { id: "draft", name: "Draft Helper", blurb: "A live board that knows what your roster still needs and when a position is about to run out." },
  { id: "sitstart", name: "Sit / Start", blurb: "Two players, one spot. Get a call rather than a shrug." },
  { id: "rookies", name: "Dynasty Rookies", blurb: "Rookie and future pick values, priced as tradeable assets." },
  { id: "buzz", name: "What's Going On Now", blurb: "Injury news, beat reports and the players your leagues are fighting over." },
];

function Producers({ data }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {data.positions.map((group) => (
        <Card key={group.position}>
          <Eyebrow>Top {group.position}</Eyebrow>
          <div className="divide-y divide-line">
            {group.players.map((p, i) => (
              <div key={p.sleeper_id} className="flex items-center gap-2.5 py-2.5 first:pt-0">
                <span className="num text-fog text-xs w-3">{i + 1}</span>
                <Avatar player={p} size="sm" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate">{p.name}</p>
                  <p className="font-mono text-[10px] text-fog">{p.team}</p>
                </div>
                <span className="num text-sm text-turf ml-auto">{decimal(p.points)}</span>
              </div>
            ))}
            {group.players.length === 0 && (
              <p className="text-fog text-xs py-3">No scores recorded yet.</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Home({ setView, league }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    api.topProducers().then(setData).catch(setError).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          Fantasy <span className="text-turf">Hub</span>
        </h1>
        <p className="text-fog text-sm mt-2 max-w-xl">
          {league
            ? `Synced to ${league.league.name}. Everything below knows your roster.`
            : "Trade values, projections and league tools, all from live data."}
        </p>
      </div>

      <div className="mb-3">
        <Eyebrow
          right={
            data
              ? data.source === "actual"
                ? `week ${data.week} scoring`
                : "season projections"
              : null
          }
        >
          {data?.source === "projected" ? "Projected leaders" : "Top producers"}
        </Eyebrow>
      </div>
      {loading && <Loading label="Loading leaders" />}
      {error && <ErrorNote error={error} onRetry={load} />}
      {data && !loading && <Producers data={data} />}
      {data?.source === "projected" && (
        <p className="text-fog text-xs mt-3 leading-relaxed max-w-2xl">
          The regular season hasn't started, so there are no scores to rank yet.
          These are projected season totals. Once games are played this switches
          to last week's actual points automatically.
        </p>
      )}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-3.5 mt-8 items-start">
        <Card>
          <Eyebrow>What's in here</Eyebrow>
          <div className="divide-y divide-line">
            {TOURS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="w-full text-left py-3 first:pt-0 group cursor-pointer"
              >
                <p className="text-sm font-semibold group-hover:text-turf transition-colors">
                  {t.name} <span className="text-fog font-normal">→</span>
                </p>
                <p className="text-fog text-xs mt-1 leading-relaxed">{t.blurb}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow right="live from X">On the wire</Eyebrow>
          <TwitterFeed accounts={X_ACCOUNTS} height={520} />
        </Card>
      </div>
    </div>
  );
}