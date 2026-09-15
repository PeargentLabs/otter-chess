// Hardcoded identifiers for the Lichess broadcast of the 46th FIDE Chess
// Olympiad (Samarkand 2026) — confirmed live via the Lichess Broadcast API
// (https://lichess.org/api/broadcast/{tournamentId}), which needs no key
// and is CORS-open.
//
// The Olympiad's Open and Women's sections are each split across several
// parallel Lichess broadcasts (Open I-V, Women I-IV) — one per board-range
// group, since a single broadcast can't hold every board in an event this
// large. Following a full section (all of its sub-broadcasts at once) is
// what powers the Men's/Women's/All toggle and the team dropdown.
export const OLYMPIAD_BROADCAST_GROUP_ID = '32sSzO6S';

// "Open" (Men's) section — five parallel 11-round Swiss broadcasts, one
// per board-range group. Round 1 starts 2026-09-16; before then each
// feed has no games/moves yet, and the page shows a "waiting for the
// round to start" state rather than a live position.
export const OPEN_TOURNAMENT_IDS = ['n1pPI5Q0', 'MSQXIzkK', 'Uvg2Lyjt', 'sfWvd9Pd', 'MyBFv3Ha'];

// "Women" section — four parallel broadcasts, same structure as Open.
export const WOMENS_TOURNAMENT_IDS = ['HtMn014k', 'UjEVXNHv', 'JyQqARgN', 'oQuU2arG'];

export const OLYMPIAD_TOURNAMENT_NAME = '46th FIDE Chess Olympiad Samarkand 2026';

export const LICHESS_API_BASE = 'https://lichess.org/api';

// Lichess's team-standings endpoint (GET /broadcast/{tournamentId}/teams/standings
// — tournament id only, no slug) has real, complete data (match points, game
// points, per-round results, rosters) but confirmed via live header inspection
// to send no Access-Control-Allow-Origin — a direct browser fetch is CORS-
// blocked. standings-proxy/ is a small separate Cloudflare Worker that
// re-serves it with CORS allowed; this only has a value once that's deployed
// and NEXT_PUBLIC_STANDINGS_PROXY_URL is set at build time. Unset (the
// default until then) means useStandings degrades to null, and the lobby
// shows a chess-results.com link instead of a table — never a broken fetch.
export const STANDINGS_PROXY_URL = process.env.NEXT_PUBLIC_STANDINGS_PROXY_URL ?? null;

// How often to re-check which round is "current" for each tournament —
// round ids change daily across an 11-round event, and this is a static
// export with no server to trigger a rebuild when they do.
export const ROUND_POLL_MS = 90_000;

// How often to re-fetch each tracked round's live PGN snapshot. Uses the
// plain (non-streaming) snapshot endpoint, polled per tournament — the
// simplest correct thing to wire up first; a later pass can upgrade to
// the chunked streaming endpoint per round, with polling kept as its
// automatic fallback. "All" mode polls up to 9 tournaments in parallel
// every cycle, so this errs conservative rather than tuned to a single
// tournament's traffic.
export const GAMES_POLL_MS = 10_000;
