import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { Button, Field, Eyebrow } from "./ui.jsx";

/**
 * Sign in with a password or a one-time email link.
 *
 * Nothing on the site is gated behind this. Signing in only means the league
 * you synced is waiting for you next visit, which is exactly what it was asked
 * for — so the copy says that rather than pretending an account unlocks features.
 */
export default function AuthPanel({ onClose }) {
  const [mode, setMode] = useState("password");   // password | link | reset
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (mode === "reset") {
        // Supabase sends a recovery link; clicking it returns here with a
        // short-lived session, which useAuth turns into the new-password form.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNote(`If there's an account for ${email}, a reset link is on its way.`);
      } else if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNote(`Check ${email} for a sign-in link.`);
      } else if (isNew) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNote("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose?.();
      }
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.includes("@") && (mode !== "password" || password.length >= 6);

  return (
    <div className="bg-deck border border-line rounded-xl p-5">
      <Eyebrow right={onClose ? <button onClick={onClose} className="cursor-pointer hover:text-chalk">close</button> : null}>
        {mode === "reset"
          ? "Reset your password"
          : mode === "link"
          ? "Email a sign-in link"
          : isNew
          ? "Create an account"
          : "Sign in"}
      </Eyebrow>

      <div className="flex flex-col gap-2.5">
        <Field
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {mode === "password" && (
          <Field
            type="password"
            autoComplete={isNew ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            placeholder="Password (6+ characters)"
          />
        )}
        <Button onClick={submit} disabled={!canSubmit || busy}>
          {busy
            ? "Working…"
            : mode === "reset"
            ? "Send reset link"
            : mode === "link"
            ? "Send me a link"
            : isNew
            ? "Create account"
            : "Sign in"}
        </Button>
      </div>

      {note && <p className="text-turf text-xs mt-3">{note}</p>}
      {error && <p className="text-whistle text-xs mt-3">{error}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-line text-xs">
        {mode === "password" && (
          <>
            <button
              onClick={() => setIsNew((v) => !v)}
              className="text-fog hover:text-chalk cursor-pointer"
            >
              {isNew ? "I already have an account" : "Create an account"}
            </button>
            {!isNew && (
              <button
                onClick={() => { setMode("reset"); setError(null); setNote(null); }}
                className="text-fog hover:text-chalk cursor-pointer"
              >
                Forgot your password?
              </button>
            )}
            <button
              onClick={() => { setMode("link"); setError(null); setNote(null); }}
              className="text-fog hover:text-chalk cursor-pointer"
            >
              Email me a link instead
            </button>
          </>
        )}
        {mode !== "password" && (
          <button
            onClick={() => { setMode("password"); setError(null); setNote(null); }}
            className="text-fog hover:text-chalk cursor-pointer"
          >
            Back to sign in
          </button>
        )}
      </div>

      <p className="text-fog text-[11px] mt-3 leading-relaxed">
        Every tool works without an account. Signing in just means your synced
        league is waiting for you next time.
      </p>
    </div>
  );
}
