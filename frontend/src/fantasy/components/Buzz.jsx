import { useEffect, useState } from "react";
import api from "../lib/api.js";
import { num, timeAgo } from "../lib/format.js";
import { Card, Eyebrow, Pos, Loading, ErrorNote } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";
import TwitterFeed from "../components/TwitterFeed.jsx";

// Chosen by the client. RotoWire is injury and beat news, Underdog is fantasy
// analysis — one for facts, one for takes.
const X_ACCOUNTS = ["RotoWireNFL", "UnderdogNFL"];

export default function Buzz() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    api.news(25).then(setData).catch(setError).finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <Loading label="Loading the feed" />;
  if (error) return <ErrorNote error={error} onRetry={load} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          What's going on <span className="text-turf">now</span>
        </h1>
        <p className="text-fog text-sm mt-2 max-w-xl">
          Headlines from around the league, plus the players your leagues are
          fighting over right now.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-3.5 items-start">
        <div className="flex flex-col gap-3">
          {(data?.items || []).map((item) => (
            <Card key={item.url}>
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <span className="font-mono text-[9.5px] tracking-wider uppercase text-sky border border-sky/30 rounded px-2 py-0.5">
                  {item.source}
                </span>
                <span className="font-mono text-[10px] text-fog ml-auto">
                  {timeAgo(item.published_at)}
                </span>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-[15px] font-semibold leading-snug hover:text-turf transition-colors"
              >
                {item.headline}
              </a>
              {item.body && (
                <p className="text-fog text-sm mt-1.5 leading-relaxed">{item.body}</p>
              )}
            </Card>
          ))}
          {(data?.items || []).length === 0 && (
            <Card>
              <p className="text-fog text-sm">
                No stories cached yet. Run the news refresh and they will land here.
              </p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            <Eyebrow right="live from X">On the wire</Eyebrow>
            <TwitterFeed accounts={X_ACCOUNTS} height={560} />
          </Card>

          <Card>
            <Eyebrow right="last 24h">Most added</Eyebrow>
            <div className="divide-y divide-line">
              {(data?.trending || []).map((p) => (
                <div key={p.sleeper_id} className="flex items-center gap-3 py-2.5">
                  <Avatar player={p} size="sm" />
                  <Pos position={p.position} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="font-mono text-[10px] text-fog">{p.team || ""}</p>
                  </div>
                  <span className="num text-xs text-turf ml-auto">+{num(p.adds)}</span>
                </div>
              ))}
              {(data?.trending || []).length === 0 && (
                <p className="text-fog text-xs py-3">No trending data yet.</p>
              )}
            </div>
            <p className="text-fog text-xs mt-4 leading-relaxed">
              Add counts come from Sleeper directly — real leagues making real moves
              in the last day, not an editor's opinion.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}