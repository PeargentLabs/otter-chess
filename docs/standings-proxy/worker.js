// Re-serves Lichess's real team-standings data with CORS allowed.
//
// GET https://lichess.org/broadcast/{tournamentId}/teams/standings has
// exactly the data the Olympiad lobby needs (match points, game points,
// per-round results) but sends no Access-Control-Allow-Origin — confirmed
// live, with and without a request Origin header — so a browser can't
// fetch it directly from a static site. This Worker is the whole fix:
// fetch it server-side (no CORS applies to server-to-server calls), then
// hand the same JSON back with CORS opened up.
//
// Every visitor's standings request funnels through this one Worker (unlike
// game/round data, which each browser fetches directly from Lichess on its
// own IP) — so as traffic grows, this is the one place many different
// people's requests could collide into Lichess's "one request at a time"
// limit. Fixed with an explicit Cloudflare edge cache (not just a
// Cache-Control response header, which alone doesn't stop the Worker from
// re-hitting Lichess): the first request for a given tournament id fetches
// from Lichess, every other request for that same id within the cache
// window — from any visitor, anywhere — is served straight from
// Cloudflare's edge without touching Lichess again.
//
// Usage: GET https://<this-worker>.workers.dev/?id=<tournamentId>

const ALLOWED_ID = /^[A-Za-z0-9]+$/;
const CACHE_TTL_SECONDS = 120; // standings only change once a round finishes

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get('id');

    if (!tournamentId || !ALLOWED_ID.test(tournamentId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid ?id=' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const cache = caches.default;
    // Cache key is the request URL alone (this Worker has no other inputs
    // that affect the response), so ?id=X and ?id=Y are cached separately
    // and every visitor asking for the same id shares one cache entry.
    const cacheKey = new Request(url.toString(), { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set('X-Cache', 'HIT');
      return hit;
    }

    const upstream = await fetch(
      `https://lichess.org/broadcast/${tournamentId}/teams/standings`,
      { headers: { Accept: 'application/json' } },
    );
    const body = await upstream.text();

    const response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Cache': 'MISS',
      },
    });

    // Only cache a real success — a transient Lichess error shouldn't get
    // frozen and replayed to every visitor for the next two minutes.
    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
