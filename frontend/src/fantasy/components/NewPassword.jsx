import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { Button, Field, Eyebrow } from "./ui.jsx";

/**
 * Shown when someone arrives from a password reset email.
 *
 * Supabase signs them in with a short-lived recovery session and fires
 * PASSWORD_RECOVERY, so at this point they are technically authenticated but
 * have not chosen a password yet. Showing the normal signed-in view here would
 * leave them stuck — they came to change their password and there would be
 * nowhere to do it.
 */
export default function NewPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // Clear the recovery token out of the address bar so a refresh does not
      // drop them back into this form.
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => onDone?.(), 1600);
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-deck border border-line rounded-xl p-5">
        <Eyebrow>Password changed</Eyebrow>
        <p className="text-turf text-sm">
          You're signed in with your new password.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-deck border border-line rounded-xl p-5">
      <Eyebrow>Choose a new password</Eyebrow>

      <div className="flex flex-col gap-2.5">
        <Field
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (6+ characters)"
        />
        <Field
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
          placeholder="Type it again"
        />
        <Button onClick={submit} disabled={!canSubmit || busy}>
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </div>

      {tooShort && <p className="text-fog text-xs mt-3">Six characters or more.</p>}
      {mismatch && <p className="text-flag text-xs mt-3">Those don't match.</p>}
      {error && <p className="text-whistle text-xs mt-3">{error}</p>}
    </div>
  );
}
