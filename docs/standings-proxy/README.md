# Olympiad standings proxy

A tiny Cloudflare Worker that re-serves Lichess's real team-standings data
(`GET /broadcast/{tournamentId}/teams/standings`) with CORS allowed — the
real endpoint has no `Access-Control-Allow-Origin`, so the Olympiad
lobby's browser-side `fetch()` can't reach it directly. This Worker is the
whole fix: one file, no state, no ongoing maintenance.

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

Until this is done, `NEXT_PUBLIC_STANDINGS_PROXY_URL` is simply unset and
the lobby shows a link to the official chess-results.com standings page
instead of a table — nothing is broken in the meantime.

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
