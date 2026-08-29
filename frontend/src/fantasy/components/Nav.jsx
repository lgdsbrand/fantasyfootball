import { useEffect, useState } from "react";

/**
 * Navigation.
 *
 * Desktop keeps the fixed rail. Mobile gets a header with a hamburger, because
 * a sidebar on a phone either eats the screen or hides things that matter — the
 * account block was previously desktop-only, which meant sign-in simply did not
 * exist on a phone.
 */
export default function Nav({ items, view, setView, league, auth, onSignIn }) {
  const [open, setOpen] = useState(false);

  // Close on Escape, and lock the page behind the open menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function go(id) {
    setView(id);
    setOpen(false);
  }

  const Brand = (
    <span className="font-display text-[21px] font-extrabold uppercase tracking-wide">
      Fantasy<span className="text-turf">Hub</span>
    </span>
  );

  const Account = auth?.configured && auth?.ready && (
    auth.user ? (
      <div className="min-w-0">
        <p className="font-mono text-[9px] tracking-widest uppercase text-fog">Signed in</p>
        <p className="text-[12px] leading-tight mt-0.5 truncate">{auth.user.email}</p>
        <button onClick={auth.signOut} className="text-fog hover:text-chalk text-[11px] mt-1 cursor-pointer">
          Sign out
        </button>
      </div>
    ) : (
      <button
        onClick={() => { setOpen(false); onSignIn(); }}
        className="text-turf hover:brightness-125 text-[12.5px] font-semibold cursor-pointer"
      >
        Sign in to save your league
      </button>
    )
  );

  const NavList = ({ compact }) => (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => go(item.id)}
          aria-current={view === item.id}
          className={`flex items-center gap-2.5 rounded-lg px-3 text-left w-full transition-colors cursor-pointer ${
            compact ? "py-3 text-[15px]" : "py-2 text-[13.5px]"
          } ${
            view === item.id
              ? "bg-deck2 text-chalk font-semibold"
              : "text-fog hover:bg-deck hover:text-chalk"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${view === item.id ? "bg-turf" : "bg-line"}`} />
          {item.label}
          {item.tag && (
            <span className="ml-auto font-mono text-[9px] text-sky border border-sky/30 rounded px-1.5">
              {item.tag}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <>
      {/* ---------- mobile header ---------- */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-line bg-ink/95 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="w-9 h-9 -ml-1.5 grid place-items-center rounded-lg hover:bg-deck transition-colors cursor-pointer"
        >
          <span className="flex flex-col gap-[5px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block w-[18px] h-[2px] bg-chalk rounded-full" />
            ))}
          </span>
        </button>
        {Brand}
        <span className="ml-auto font-mono text-[10px] text-fog truncate max-w-[38%]">
          {league?.league?.name || items.find((i) => i.id === view)?.label}
        </span>
      </header>

      {/* ---------- mobile drawer ---------- */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <nav
            aria-label="Fantasy sections"
            className="absolute inset-y-0 left-0 w-[82%] max-w-[320px] bg-ink border-r border-line p-4 flex flex-col gap-1 overflow-y-auto"
          >
            <div className="flex items-center justify-between px-2 pb-4">
              {Brand}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="w-8 h-8 grid place-items-center text-fog hover:text-chalk text-2xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <NavList compact />
            {Account && (
              <div className="mt-auto pt-4 border-t border-line px-3">{Account}</div>
            )}
          </nav>
        </div>
      )}

      {/* ---------- desktop rail ---------- */}
      <nav
        aria-label="Fantasy sections"
        className="hidden lg:flex flex-col gap-1 border-r border-line bg-ink/90 p-5 sticky top-0 h-screen"
      >
        <div className="flex items-baseline gap-2 px-2.5 pb-5">
          {Brand}
          <span className="font-mono text-[9px] text-fog tracking-widest">2026</span>
        </div>
        <NavList />
        <div className="mt-auto pt-3.5 border-t border-line px-3 space-y-3">
          {league && (
            <div>
              <p className="font-mono text-[9px] tracking-widest uppercase text-fog">Synced</p>
              <p className="text-[13px] font-semibold leading-tight mt-1 truncate">
                {league.league.name}
              </p>
            </div>
          )}
          {Account}
        </div>
      </nav>
    </>
  );
}