import { POSITION_STYLE } from "../lib/format.js";

export function Card({ className = "", children, ...rest }) {
  return (
    <div
      className={`bg-deck border border-line rounded-xl p-5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Section label with yard-marker hashes. Right side is optional metadata. */
export function Eyebrow({ children, right }) {
  return (
    <div className="hash flex items-center gap-2.5 font-mono text-[10px] tracking-[1.6px] uppercase text-fog mb-3">
      <span>{children}</span>
      {right && (
        <span className="ml-auto tracking-normal normal-case text-[10.5px]">
          {right}
        </span>
      )}
    </div>
  );
}

export function Pos({ position }) {
  const style = POSITION_STYLE[position] || "text-fog border-line";
  return (
    <span
      className={`font-mono text-[9.5px] font-semibold tracking-wide px-1.5 py-0.5 rounded border ${style}`}
    >
      {position || "—"}
    </span>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 bg-deck2 p-1 rounded-lg"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`font-mono text-[10.5px] tracking-wider uppercase px-3.5 py-1.5 rounded-md transition-colors cursor-pointer ${
            value === o.value
              ? "bg-turf text-ink font-semibold"
              : "text-fog hover:text-chalk"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      className={`font-mono text-[10.5px] tracking-wider uppercase px-3.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
        active
          ? "bg-turf border-turf text-ink font-semibold"
          : "border-line text-fog hover:text-chalk hover:border-fog"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Button({ variant = "solid", className = "", ...rest }) {
  const styles = {
    solid: "bg-turf text-ink font-semibold hover:brightness-110",
    ghost: "border border-line text-chalk hover:border-fog",
    danger: "border border-whistle/40 text-whistle hover:bg-whistle/10",
  };
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Field({ className = "", ...rest }) {
  return (
    <input
      className={`bg-deck2 border border-line rounded-lg px-3.5 py-2 text-sm text-chalk placeholder:text-fog/70 focus:outline-none focus:border-sky transition-colors ${className}`}
      {...rest}
    />
  );
}

/** Three states every data view needs, so no view invents its own. */
export function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-2.5 text-fog text-sm py-10 justify-center">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-turf animate-spin" />
      {label}…
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="border border-whistle/35 bg-whistle/5 rounded-xl p-4 text-sm">
      <p className="text-whistle font-medium mb-1">That didn't work</p>
      <p className="text-fog">{error.message || String(error)}</p>
      {onRetry && (
        <Button variant="ghost" className="mt-3 text-xs" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="font-display text-2xl font-bold mb-1.5">{title}</p>
      <p className="text-fog text-sm max-w-md mx-auto leading-relaxed">{children}</p>
    </div>
  );
}

/** Model-written analysis. Always visually distinct from computed numbers, so
 *  nobody mistakes prose for arithmetic. */
export function Reasoning({ title = "The reasoning", text }) {
  if (!text) return null;
  return (
    <div className="border-l-2 border-sky pl-4 mt-4">
      <p className="font-mono text-[10px] tracking-[1.4px] uppercase text-sky mb-2">
        {title}
      </p>
      {String(text)
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-chalk/90 mb-2.5 last:mb-0">
            {p}
          </p>
        ))}
    </div>
  );
}
