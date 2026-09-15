// Fetches team standings through standings-proxy/ (a small Cloudflare
// Worker that re-serves Lichess's real
// GET /broadcast/{tournamentId}/teams/standings with CORS allowed — the
// real endpoint has no Access-Control-Allow-Origin, confirmed live, so a
// direct browser fetch is blocked). Returns null (not a throw) whenever
// the data genuinely isn't available — proxy unset, unreachable, or the
// tournament has no standings yet — so callers can degrade gracefully
// instead of treating "no data" as an error state.

import { STANDINGS_PROXY_URL } from './config';
import type { TeamStanding } from './types';

export async function fetchTeamStandings(tournamentId: string): Promise<TeamStanding[] | null> {
  if (!STANDINGS_PROXY_URL) return null;
  try {
    const res = await fetch(`${STANDINGS_PROXY_URL}?id=${encodeURIComponent(tournamentId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((t): TeamStanding => ({
      name: t.name,
      mp: t.mp ?? 0,
      gp: t.gp ?? 0,
      averageRating: t.averageRating ?? null,
      matches: Array.isArray(t.matches) ? t.matches : [],
    }));
  } catch (_) {
    return null;
  }
}
