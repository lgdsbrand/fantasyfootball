import { useState } from "react";
import { useAuth } from "./lib/useAuth.js";
import AuthPanel from "./components/AuthPanel.jsx";
import Nav from "./components/Nav.jsx";
import { DEFAULT_SETTINGS } from "./lib/format.js";
import Home from "./views/Home.jsx";
import LeagueHub from "./views/LeagueHub.jsx";
import TradeAnalyzer from "./views/TradeAnalyzer.jsx";
import Rankings from "./views/Rankings.jsx";
import DraftHelper from "./views/DraftHelper.jsx";
import SitStart from "./views/SitStart.jsx";
import Rookies from "./views/Rookies.jsx";
import Buzz from "./views/Buzz.jsx";

const NAV = [
  { id: "home", label: "Home" },
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
  const [view, setView] = useState("home");
  const [showAuth, setShowAuth] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [league, setLeague] = useState(null);
  const [roster, setRoster] = useState([]);

  const auth = useAuth();
  const shared = { settings, setSettings, league, setLeague, roster, setRoster, auth };

  return (
    <div className="min-h-screen field-wash lg:grid lg:grid-cols-[232px_1fr]">
      <Nav
        items={NAV}
        view={view}
        setView={setView}
        league={league}
        auth={auth}
        onSignIn={() => setShowAuth(true)}
      />

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
        {view === "home" && <Home setView={setView} league={league} />}
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