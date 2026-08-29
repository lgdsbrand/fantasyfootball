import { useEffect, useState } from "react";
import api from "./api.js";
import { toQuerySettings } from "./format.js";

/**
 * Loads the full ranked board for a league format, once per format.
 *
 * Nearly every view needs the same list — search, rankings, draft, trades — so
 * fetching it here keeps one copy in memory instead of four round trips.
 */
export function useBoard(settings, { includePicks = false, limit = 500 } = {}) {
  const [board, setBoard] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const key = `${settings.is_dynasty}|${settings.num_qbs}|${settings.ppr}|${settings.num_teams}|${includePicks}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .rankings({ ...toQuerySettings(settings), includePicks, limit })
      .then((data) => {
        if (cancelled) return;
        setBoard(data.players || []);
        setUpdatedAt(data.updated_at || null);
        setWeek(data.week || null);
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit, reloadKey]);

  return { board, updatedAt, week, loading, error, reload: () => setReloadKey((k) => k + 1) };
}