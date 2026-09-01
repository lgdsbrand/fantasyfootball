import { useEffect, useState } from "react";
import { supabase, isAuthConfigured } from "./supabase.js";

/**
 * Session state, plus the one side effect the API client depends on: the
 * access token is mirrored into localStorage so axios can attach it without
 * every call needing to await a Supabase session lookup.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!isAuthConfigured);
  // Set when the visitor arrives from a password reset email. Supabase signs
  // them in with a short-lived recovery session and fires this event, which is
  // the only reliable signal that they should be shown a "set a new password"
  // form rather than the normal signed-in view.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    function store(session) {
      if (session?.access_token) {
        localStorage.setItem("sb-access-token", session.access_token);
      } else {
        localStorage.removeItem("sb-access-token");
      }
      setUser(session?.user ?? null);
    }

    supabase.auth.getSession().then(({ data }) => {
      store(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      store(session);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    user,
    ready,
    recovering,
    endRecovery: () => setRecovering(false),
    configured: isAuthConfigured,
    signOut: () => supabase?.auth.signOut(),
  };
}
