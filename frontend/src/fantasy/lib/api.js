import axios from "axios";

// Relative base URL. In development Vite proxies /api to FastAPI; in production
// the frontend and backend sit behind the same origin. Nothing to configure.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 30000,
});

// Supabase puts the signed-in user's token here; attach it when present so the
// saved-leagues endpoints work. Anonymous visitors just get no header.
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("sb-access-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function unwrap(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return new Error(detail);
  if (error?.code === "ECONNABORTED") return new Error("The server took too long to answer.");
  if (!error?.response) return new Error("Could not reach the server. Is the backend running?");
  return new Error(`Something went wrong (${error.response.status}).`);
}

async function call(promise) {
  try {
    const { data } = await promise;
    return data;
  } catch (error) {
    throw unwrap(error);
  }
}

export const api = {
  health: () => call(http.get("/api/fantasy/health")),

  syncUsername: (username) =>
    call(http.post("/api/fantasy/sync", { username })),

  league: (leagueId, sleeperUserId) =>
    call(
      http.get(`/api/fantasy/league/${leagueId}`, {
        params: sleeperUserId ? { sleeper_user_id: sleeperUserId } : {},
      })
    ),

  rankings: ({ isDynasty = false, numQbs = 1, ppr = 1, numTeams = 12, position, includePicks = false, limit = 200 } = {}) =>
    call(
      http.get("/api/fantasy/rankings", {
        params: {
          is_dynasty: isDynasty,
          num_qbs: numQbs,
          ppr,
          num_teams: numTeams,
          position: position || undefined,
          include_picks: includePicks,
          limit,
        },
      })
    ),

  trade: (body) => call(http.post("/api/fantasy/trade", body)),

  rosterGrade: (leagueId, rosterId, explain = true) =>
    call(
      http.get(`/api/fantasy/roster-grade/${leagueId}/${rosterId}`, {
        params: { explain },
      })
    ),

  sitStart: (body) => call(http.post("/api/fantasy/sit-start", body)),

  draftSuggest: (body) => call(http.post("/api/fantasy/draft/suggest", body)),

  topProducers: (week) =>
    call(http.get("/api/fantasy/top-producers", { params: week ? { week } : {} })),

  playoffOdds: (leagueId) =>
    call(http.get(`/api/fantasy/playoff-odds/${leagueId}`)),

  news: (limit = 20) => call(http.get("/api/fantasy/news", { params: { limit } })),

  // Signed-in only. The bearer token is attached by the interceptor above.
  myLeagues: () => call(http.get("/api/fantasy/me/leagues")),

  saveLeague: (body) => call(http.post("/api/fantasy/me/leagues", body)),
};

export default api;