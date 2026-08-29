import { useEffect, useRef, useState } from "react";

/**
 * Embedded X timeline.
 *
 * Renders the anchor markup X's own embed generator produces, then asks the
 * widget script to scan for it. Free — no API key, no per-read billing. The
 * trade-off is that it renders inside X's iframe, so it looks like X rather
 * than like the rest of the page.
 *
 * Three things this has to survive:
 *   - React StrictMode runs effects twice in development, so the container is
 *     rebuilt from scratch each run and a generation counter ignores results
 *     from a superseded run.
 *   - The script sets window.twttr before its widgets API is usable, so
 *     twttr.ready() is what we wait on, not the load event.
 *   - Blockers swallow the request without erroring, so there is a deadline.
 *     State is tracked in a ref because a setTimeout closure would otherwise
 *     capture a stale value and fire after a successful load.
 */
const SCRIPT_SRC = "https://platform.twitter.com/widgets.js";
const TIMEOUT_MS = 12000;

function ensureScript() {
  return new Promise((resolve, reject) => {
    const ready = () => {
      const t = window.twttr;
      if (!t) return reject(new Error("window.twttr missing after load"));
      if (typeof t.ready === "function") t.ready(() => resolve(t));
      else if (t.widgets) resolve(t);
      else reject(new Error("widgets api never appeared"));
    };

    if (window.twttr?.widgets) return resolve(window.twttr);

    let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (script) {
      if (window.twttr) return ready();
      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", () => reject(new Error("script blocked")), { once: true });
      return;
    }

    script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.charset = "utf-8";
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("script blocked")), { once: true });
    document.head.appendChild(script);
  });
}

export default function TwitterFeed({ accounts, height = 620 }) {
  const [active, setActive] = useState(accounts[0]);
  const [state, setState] = useState("loading");   // loading | ready | failed
  const [reason, setReason] = useState("");

  const host = useRef(null);
  const stateRef = useRef("loading");              // read by the timeout
  const runId = useRef(0);                         // ignores superseded runs

  useEffect(() => {
    const myRun = ++runId.current;
    const node = host.current;
    if (!node) return;

    const settle = (next, why = "") => {
      if (runId.current !== myRun) return;          // a newer run took over
      stateRef.current = next;
      setState(next);
      if (why) setReason(why);
    };

    stateRef.current = "loading";
    setState("loading");
    setReason("");

    // Rebuild the anchor every run. It doubles as the fallback: a real link to
    // the profile if the script never arrives.
    node.innerHTML = "";
    const anchor = document.createElement("a");
    anchor.className = "twitter-timeline";
    anchor.href = `https://twitter.com/${active}`;
    anchor.setAttribute("data-theme", "dark");
    anchor.setAttribute("data-height", String(height));
    anchor.setAttribute("data-chrome", "noheader nofooter transparent");
    anchor.textContent = `Posts from @${active}`;
    node.appendChild(anchor);

    const timer = setTimeout(() => {
      if (stateRef.current !== "ready") settle("failed", "timed out waiting for X");
    }, TIMEOUT_MS);

    ensureScript()
      .then((twttr) => {
        if (runId.current !== myRun) return null;
        return twttr.widgets.load(node);
      })
      .then(() => {
        if (runId.current !== myRun) return;
        clearTimeout(timer);
        // A successful load replaces the anchor with an iframe. Give the DOM a
        // tick to settle before checking.
        setTimeout(() => {
          if (runId.current !== myRun) return;
          if (node.querySelector("iframe")) settle("ready");
          else settle("failed", "X returned no timeline for @" + active);
        }, 300);
      })
      .catch((e) => {
        clearTimeout(timer);
        settle("failed", e?.message || "unknown error");
      });

    return () => clearTimeout(timer);
  }, [active, height]);

  return (
    <div>
      {accounts.length > 1 && (
        <div className="flex gap-1.5 mb-3">
          {accounts.map((a) => (
            <button
              key={a}
              onClick={() => setActive(a)}
              aria-pressed={a === active}
              className={`font-mono text-[10.5px] tracking-wider uppercase px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                a === active
                  ? "bg-turf border-turf text-ink font-semibold"
                  : "border-line text-fog hover:text-chalk hover:border-fog"
              }`}
            >
              @{a}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-line bg-deck2" style={{ minHeight: 180 }}>
        <div ref={host} className={state === "failed" ? "px-5 pt-4 text-[13px] text-turf" : ""} />

        {state === "loading" && (
          <div className="flex items-center gap-2.5 text-fog text-sm py-8 justify-center">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-turf animate-spin" />
            Loading @{active}…
          </div>
        )}

        {state === "failed" && (
          <div className="px-5 pb-5 pt-2 text-sm">
            <p className="text-fog leading-relaxed">
              The live feed didn't load. The link above opens the account
              directly, and the news and trending sections come from our own
              data either way.
            </p>
            <p className="font-mono text-[10px] text-fog/70 mt-2">reason: {reason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
