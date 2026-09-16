// Re-serves several of Lichess's broadcast endpoints with CORS allowed and
// an edge cache in front of them.
//
// GET https://lichess.org/broadcast/{tournamentId}/teams/standings sends no
// Access-Control-Allow-Origin (confirmed live, with and without a request
// Origin header) — a browser can't fetch it directly from a static site.
// The JSON tournament-info and round-PGN endpoints (GET /api/broadcast/{id}
// and GET /api/broadcast/round/{id}.pgn) ARE CORS-open, so the app calls
// those straight from the browser when this proxy isn't configured — but
// every visitor's browser then competes for Lichess's own "one request at a
// time per client" limit (confirmed live: a second concurrent call gets
// HTTP 429 "Use an oauth token to get 120 requests per minute"), and an
// anonymous IP that does a lot of polling burns through even that quickly.
// Routing those two through this same Worker fixes both problems at once:
// fetch server-side (no CORS applies to server-to-server calls, and an
// optional LICHESS_TOKEN secret can raise the upstream quota), then cache
// the response at Cloudflare's edge so EVERY visitor asking for the same
// id within the cache window — no matter how many — collapses into one
// real Lichess request, not one per visitor.
//
// Usage:
//   ?id=<tournamentId>                    (or &type=standings) — team standings
//   ?id=<tournamentId>&type=info          — tournament info + round list
//   ?round=<roundId>&type=pgn             — a round's live PGN snapshot

const ALLOWED_ID = /^[A-Za-z0-9]+$/;

// PGN is the live game state (moves/clocks) — cached just under the app's
// own 10s poll interval so it's almost always fresh, while still
// collapsing any real concurrent traffic onto one upstream request per
// window. Tournament info changes rarely (a new round starting) so it can
// sit longer, and standings only change once a round finishes entirely.
const CACHE_TTL_SECONDS = { pgn: 8, info: 30, standings: 120 };

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'standings';
    if (type !== 'standings' && type !== 'info' && type !== 'pgn') {
      return badRequest('type must be one of: standings, info, pgn');
    }

    let upstreamUrl;
    let contentType;
    if (type === 'pgn') {
      const roundId = url.searchParams.get('round');
      if (!roundId || !ALLOWED_ID.test(roundId)) return badRequest('Missing or invalid ?round=');
      upstreamUrl = `https://lichess.org/api/broadcast/round/${roundId}.pgn`;
      contentType = 'text/plain; charset=utf-8';
    } else {
      const tournamentId = url.searchParams.get('id');
      if (!tournamentId || !ALLOWED_ID.test(tournamentId)) return badRequest('Missing or invalid ?id=');
      upstreamUrl =
        type === 'info'
          ? `https://lichess.org/api/broadcast/${tournamentId}`
          : `https://lichess.org/broadcast/${tournamentId}/teams/standings`;
      contentType = 'application/json';
    }

    const cache = caches.default;
    // Cache key is the request URL alone (id/round/type fully determine the
    // response), so every distinct request is cached separately and every
    // visitor asking for the same one shares a single cache entry.
    const cacheKey = new Request(url.toString(), { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set('X-Cache', 'HIT');
      return hit;
    }

    const upstreamHeaders = { Accept: type === 'pgn' ? 'application/x-chess-pgn' : 'application/json' };
    // Optional Cloudflare secret (`wrangler secret put LICHESS_TOKEN`) —
    // raises the upstream quota from anonymous to Lichess's per-token tier.
    // Never sent to or visible from the browser; the Worker is the only
    // thing that ever sees it.
    if (env.LICHESS_TOKEN) upstreamHeaders.Authorization = `Bearer ${env.LICHESS_TOKEN}`;

    const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders });
    const body = await upstream.text();

    // A failed upstream call (429, 5xx) must never tell the CLIENT it's
    // cacheable either — max-age here is what lets the Worker's own edge
    // cache serve repeat requests without re-hitting Lichess, and blindly
    // applying it to an error response would let the visitor's own browser
    // cache and replay that failure for the next several seconds.
    const cacheControl = upstream.ok ? `public, max-age=${CACHE_TTL_SECONDS[type]}` : 'no-store';

    const response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
        'Cache-Control': cacheControl,
        'X-Cache': 'MISS',
      },
    });

    // Only cache a real success — a transient Lichess error (or a 429 from
    // this Worker's own upstream call) shouldn't get frozen and replayed to
    // every visitor for the rest of the cache window.
    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
