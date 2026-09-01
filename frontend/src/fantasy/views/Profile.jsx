import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import api from "../lib/api.js";
import { Card, Eyebrow, Button, Field, Empty } from "../components/ui.jsx";

/**
 * Account settings.
 *
 * Supabase identifies people by email, not by a username, so there is no
 * username to change. What people usually mean by that is a display name, which
 * lives in user metadata and is added here, plus the ability to change the
 * email itself and the password.
 *
 * Changing an email is deliberately two-step on Supabase's side: it sends a
 * confirmation to the new address and only switches once that is clicked. The
 * copy says so, because otherwise it looks like nothing happened.
 */
function Row({ label, hint, children }) {
  return (
    <div className="py-4 border-b border-line last:border-0">
      <p className="text-sm font-semibold mb-1">{label}</p>
      {hint && <p className="text-fog text-xs mb-2.5 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

export default function Profile({ auth, setView }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [leagues, setLeagues] = useState([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth?.user) return;
    setDisplayName(auth.user.user_metadata?.display_name || "");
    setEmail(auth.user.email || "");
    api.myLeagues().then(setLeagues).catch(() => setLeagues([]));
  }, [auth?.user]);

  async function run(kind, fn, successNote) {
    setBusy(kind);
    setNote(null);
    setError(null);
    try {
      const { error } = await fn();
      if (error) throw error;
      setNote(successNote);
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusy("");
    }
  }

  if (!auth?.user) {
    return (
      <div>
        <h1 className="font-display text-4xl font-bold leading-none mb-6">
          <span className="text-turf">Profile</span>
        </h1>
        <Empty title="Not signed in">
          Sign in from the menu to change your details. Every tool works without
          an account — signing in just means your league is remembered.
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold leading-none">
          <span className="text-turf">Profile</span>
        </h1>
        <p className="text-fog text-sm mt-2">Signed in as {auth.user.email}</p>
      </div>

      <Card>
        <Eyebrow>Details</Eyebrow>

        <Row
          label="Display name"
          hint="What the site calls you. Optional — leave it blank and we'll use your email."
        >
          <div className="flex flex-wrap gap-2">
            <Field
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="flex-1 min-w-[200px]"
            />
            <Button
              disabled={busy === "name"}
              onClick={() =>
                run(
                  "name",
                  () => supabase.auth.updateUser({ data: { display_name: displayName.trim() } }),
                  "Display name saved."
                )
              }
            >
              {busy === "name" ? "Saving…" : "Save"}
            </Button>
          </div>
        </Row>

        <Row
          label="Email"
          hint="Changing this sends a confirmation to the new address. The change only takes effect once you click that link."
        >
          <div className="flex flex-wrap gap-2">
            <Field
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button
              variant="ghost"
              disabled={busy === "email" || !email.includes("@") || email === auth.user.email}
              onClick={() =>
                run(
                  "email",
                  () => supabase.auth.updateUser({ email: email.trim() }),
                  `Check ${email} for a confirmation link.`
                )
              }
            >
              {busy === "email" ? "Sending…" : "Change email"}
            </Button>
          </div>
        </Row>

        <Row label="Password" hint="Six characters or more.">
          <div className="flex flex-col gap-2 max-w-sm">
            <Field
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
            />
            <Field
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
            <Button
              variant="ghost"
              disabled={busy === "pw" || password.length < 6 || password !== confirm}
              onClick={() =>
                run("pw", () => supabase.auth.updateUser({ password }), "Password changed.").then(
                  () => { setPassword(""); setConfirm(""); }
                )
              }
            >
              {busy === "pw" ? "Saving…" : "Change password"}
            </Button>
            {confirm && password !== confirm && (
              <p className="text-flag text-xs">Those don't match.</p>
            )}
          </div>
        </Row>

        {note && <p className="text-turf text-sm mt-4">{note}</p>}
        {error && <p className="text-whistle text-sm mt-4">{error}</p>}
      </Card>

      <Card className="mt-3.5">
        <Eyebrow right={leagues.length ? `${leagues.length} saved` : null}>
          Your leagues
        </Eyebrow>
        {leagues.length === 0 ? (
          <p className="text-fog text-sm">
            Nothing saved yet. Sync a league in the League Hub and it'll be
            remembered here.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {leagues.map((l) => (
              <div key={l.league_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{l.league_name}</p>
                  {l.sleeper_username && (
                    <p className="font-mono text-[10px] text-fog mt-0.5">
                      sleeper: {l.sleeper_username}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setView("hub")}
                  className="ml-auto text-turf hover:brightness-125 text-xs cursor-pointer"
                >
                  Open →
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-3.5">
        <Eyebrow>Session</Eyebrow>
        <Button variant="danger" onClick={auth.signOut}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
