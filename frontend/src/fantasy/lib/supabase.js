import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Null when the keys are absent, which is a supported state rather than a
 * crash: every tool works signed out, so a build without auth configured is
 * still a working site. Components check `isAuthConfigured` and hide the
 * account UI instead of erroring.
 */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isAuthConfigured = Boolean(supabase);
