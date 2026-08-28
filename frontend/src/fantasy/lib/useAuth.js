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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      store(session)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    user,
    ready,
    configured: isAuthConfigured,
    signOut: () => supabase?.auth.signOut(),
  };
}
