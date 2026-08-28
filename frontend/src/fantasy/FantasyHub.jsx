import { useState } from "react";
import { useAuth } from "./lib/useAuth.js";
import AuthPanel from "./components/AuthPanel.jsx";
import { DEFAULT_SETTINGS } from "./lib/format.js";
import LeagueHub from "./views/LeagueHub.jsx";
import TradeAnalyzer from "./views/TradeAnalyzer.jsx";
import Rankings from "./views/Rankings.jsx";
import DraftHelper from "./views/DraftHelper.jsx";
import SitStart from "./views/SitStart.jsx";
import Rookies from "./views/Rookies.jsx";
import Buzz from "./views/Buzz.jsx";

const NAV = [
  { id: "hub", label: "League Hub" },
  { id: "trade", label: "Trade Analyzer", tag: "AI" },
  { id: "ranks", label: "Player Ranks" },
  { id: "draft", label: "Draft Helper" },
  { id: "sitstart", label: "Sit / Start" },
  { id: "rookies", label: "Dynasty Rookies" },
  { id: "buzz", label: "What's Going On Now" },
];

/**
 * The whole fantasy section.
 *
 * League settings and the synced roster live here rather than in each view,
 * because they are what every tool needs: settings decide which value set the
 * backend reads, and the roster is what makes trade and lineup advice specific
 * to the person asking rather than generic.
 *
 * To mount inside an existing app, render <FantasyHub /> on a route. It brings
 * its own layout and holds no global state.
 */
export default function FantasyHub() {
  const [view, setView] = useState("hub");
  const [showAuth, setShowAuth] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [league, setLeague] = useState(null);
  const [roster, setRoster] = useState([]);

  const auth = useAuth();
  const shared = { settings, setSettings, league, setLeague, roster, setRoster, auth };

  return (
    <div className="min-h-screen field-wash grid lg:grid-cols-[232px_1fr]">
      <nav
        aria-label="Fantasy sections"
        className="border-b lg:border-b-0 lg:border-r border-line bg-ink/90 p-3 lg:p-5 lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-1 overflow-x-auto"
      >
        <div className="hidden lg:flex items-baseline gap-2 px-2.5 pb-5">
          <span className="font-display text-[23px] font-extrabold uppercase tracking-wide">
            Fantasy<span className="text-turf">Hub</span>
          </span>
          <span className="font-mono text-[9px] text-fog tracking-widest">2026</span>
        </div>

        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            aria-current={view === item.id}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-left whitespace-nowrap transition-colors cursor-pointer ${
              view === item.id
                ? "bg-deck2 text-chalk font-semibold"
                : "text-fog hover:bg-deck hover:text-chalk"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                view === item.id ? "bg-turf" : "bg-line"
              }`}
            />
            {item.label}
            {item.tag && (
              <span className="hidden lg:inline ml-auto font-mono text-[9px] text-sky border border-sky/30 rounded px-1.5">
                {item.tag}
              </span>
            )}
          </button>
        ))}

        <div className="hidden lg:block mt-auto pt-3.5 border-t border-line px-3 space-y-3">
          {league && (
            <div>
              <p className="font-mono text-[9px] tracking-widest uppercase text-fog">
                Synced
              </p>
              <p className="text-[13px] font-semibold leading-tight mt-1 truncate">
                {league.league.name}
              </p>
            </div>
          )}

          {auth.configured && auth.ready && (
            auth.user ? (
              <div>
                <p className="font-mono text-[9px] tracking-widest uppercase text-fog">
                  Signed in
                </p>
                <p className="text-[12px] leading-tight mt-1 truncate">{auth.user.email}</p>
                <button
                  onClick={auth.signOut}
                  className="text-fog hover:text-chalk text-[11px] mt-1.5 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-turf hover:brightness-125 text-[12px] font-semibold cursor-pointer"
              >
                Sign in to save your league
              </button>
            )
          )}
        </div>
      </nav>

      {showAuth && auth.configured && !auth.user && (
        <div
          className="fixed inset-0 z-50 bg-ink/80 grid place-items-center p-5"
          onClick={(e) => e.target === e.currentTarget && setShowAuth(false)}
        >
          <div className="w-full max-w-sm">
            <AuthPanel onClose={() => setShowAuth(false)} />
          </div>
        </div>
      )}

      <main className="p-5 lg:px-8 lg:py-7 pb-16 max-w-[1180px] w-full">
        {view === "hub" && <LeagueHub {...shared} />}
        {view === "trade" && <TradeAnalyzer {...shared} />}
        {view === "ranks" && <Rankings {...shared} />}
        {view === "draft" && <DraftHelper {...shared} />}
        {view === "sitstart" && <SitStart {...shared} />}
        {view === "rookies" && <Rookies {...shared} />}
        {view === "buzz" && <Buzz />}
      </main>
    </div>
  );
}
