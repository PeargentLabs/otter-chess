# Olympiad broadcast proxy

A tiny Cloudflare Worker that re-serves three Lichess broadcast endpoints
with CORS allowed and an edge cache in front of them:

- `?id=<tournamentId>` (or `&type=standings`) — team standings (`GET
  /broadcast/{tournamentId}/teams/standings`), which sends no
  `Access-Control-Allow-Origin` at all — the Olympiad lobby's browser-side
  `fetch()` can't reach it directly without this proxy.
- `?id=<tournamentId>&type=info` — tournament info + round list.
- `?round=<roundId>&type=pgn` — a round's live PGN snapshot.

The info/pgn endpoints ARE CORS-open, so the app calls Lichess directly for
those when this proxy isn't configured — but every visitor's browser then
competes for Lichess's own "one request at a time per client" limit, and an
anonymous IP polling every few seconds burns through its quota fast. Routing
them through this Worker instead means every visitor asking for the same
data within the cache window shares one real Lichess request, not one each.

## One-time setup (needs a free Cloudflare account)

```bash
cd docs/standings-proxy
npm install
npx wrangler login        # opens a browser to connect your Cloudflare account
npm run deploy             # deploys and prints your Worker's URL, e.g.:
                            # https://otter-standings-proxy.<your-subdomain>.workers.dev
```

Then tell the Next app about it:

- **Local dev:** add `NEXT_PUBLIC_STANDINGS_PROXY_URL=<that URL>` to
  `docs/.env.local`.
- **Production (GitHub Pages build):** add the same value as a repository
  **variable** named `STANDINGS_PROXY_URL` (Settings → Secrets and
  variables → Actions → Variables) — `.github/workflows/deploy-docs.yml`
  already reads it into the build.

Until this is done, `NEXT_PUBLIC_STANDINGS_PROXY_URL` is simply unset:
standings fall back to a chess-results.com link instead of a table, and
game/round data is fetched straight from Lichess by each visitor's own
browser (more prone to the rate-limit collisions described above under
load, but functional) — nothing is broken in the meantime.

## Optional: raise the upstream rate limit further

By default the Worker calls Lichess anonymously. Lichess's own error
message for that tier is "Use an oauth token to get 120 requests per
minute" — to actually get that tier, create a Lichess personal access
token (Lichess → Preferences → API access tokens, no scopes needed for
these public endpoints) and set it as a Worker secret:

```bash
cd docs/standings-proxy
npx wrangler secret put LICHESS_TOKEN
```

This is optional — the edge cache alone already collapses every visitor's
requests into a handful of upstream calls regardless. The token just raises
the ceiling for cache *misses*. It's stored as a Cloudflare secret and never
sent to or visible from the browser.

## Automatic redeploys

`.github/workflows/deploy-standings-proxy.yml` redeploys this Worker on
every push that touches `docs/standings-proxy/**`. It needs two repository
**secrets** (Settings → Secrets and variables → Actions → Secrets):

- `CLOUDFLARE_API_TOKEN` — create one at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  using the "Edit Cloudflare Workers" template.
- `CLOUDFLARE_ACCOUNT_ID` — found on the right-hand side of the Cloudflare
  dashboard's Workers & Pages overview page.

Without these secrets the workflow simply fails (and the manually-deployed
Worker above keeps working fine) — they're only needed for CI to redeploy
automatically after that first manual deploy.
