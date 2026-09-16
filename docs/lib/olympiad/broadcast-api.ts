// Fetch functions against the public Lichess Broadcast API
// (https://lichess.org/api#tag/Broadcasts). No API key needed; confirmed
// CORS-open (Access-Control-Allow-Origin: *) so these run directly from
// the browser with no proxy — this app has no server to proxy through
// anyway (see next.config.ts's output: "export"). When
// NEXT_PUBLIC_STANDINGS_PROXY_URL IS set, both calls route through that
// same Cloudflare Worker instead (see standings-proxy/worker.js): it
// edge-caches each response for a few seconds, so every visitor polling
// the same tournament/round collapses into one real Lichess request rather
// than each browser hitting Lichess — and it's the standings support's
// name, but it's one Worker serving all three broadcast endpoints now.

import { LICHESS_API_BASE, STANDINGS_PROXY_URL } from './config';
import { enqueue } from './request-queue';
import type { RoundInfo, TournamentInfo } from './types';

// Lichess's broadcast endpoints 429 an anonymous client that's sent more
// than one request in flight (see request-queue.ts) or that's simply
// polled too much recently — both transient. One retry, honoring
// Retry-After when Lichess sends it, clears most of these without
// surfacing an error for what's really just "try again in a second."
async function fetchWithRetry(url: string): Promise<Response> {
  const res = await enqueue(() => fetch(url));
  if (res.status !== 429) return res;
  const retryAfterMs = Number(res.headers.get('Retry-After')) * 1000 || 1500;
  await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  return enqueue(() => fetch(url));
}

export async function fetchTournamentInfo(tournamentId: string): Promise<TournamentInfo> {
  const url = STANDINGS_PROXY_URL
    ? `${STANDINGS_PROXY_URL}?id=${encodeURIComponent(tournamentId)}&type=info`
    : `${LICHESS_API_BASE}/broadcast/${tournamentId}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Broadcast lookup failed (${res.status})`);
  const data = await res.json();
  return {
    id: data.tour.id,
    name: data.tour.name,
    slug: data.tour.slug,
    // Lichess broadcasts don't compute standings pages of their own for
    // most relays — this is the organizer's official external standings
    // page (chess-results.com in practice), used as the standings section's
    // fallback link whenever our own computed table isn't available.
    standingsUrl: data.tour.info?.standings ?? null,
    rounds: (data.rounds || []).map((r: { id: string; name: string; slug: string; startsAt: number; ongoing?: boolean; finished?: boolean; finishedAt?: number }): RoundInfo => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      startsAt: r.startsAt,
      ongoing: r.ongoing,
      finished: r.finished,
      finishedAt: r.finishedAt,
    })),
  };
}

export async function fetchRoundPgnSnapshot(roundId: string): Promise<string> {
  const url = STANDINGS_PROXY_URL
    ? `${STANDINGS_PROXY_URL}?round=${encodeURIComponent(roundId)}&type=pgn`
    : `${LICHESS_API_BASE}/broadcast/round/${roundId}.pgn`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Round PGN fetch failed (${res.status})`);
  return res.text();
}

// Picks the round to display: the one Lichess marks `ongoing`, else the
// most recently FINISHED round (confirmed live: a round whose `startsAt`
// has passed but was never actually started/played carries neither
// `ongoing` nor `finished` — using `startsAt` alone to pick "the latest
// round" landed on exactly that kind of empty placeholder instead of the
// last round that actually has games in it), else the very first round
// (the tournament hasn't started at all yet).
export function pickCurrentRound(rounds: RoundInfo[]): RoundInfo | null {
  if (rounds.length === 0) return null;
  const ongoing = rounds.find((r) => r.ongoing);
  if (ongoing) return ongoing;
  const finished = rounds.filter((r) => r.finished).sort((a, b) => (b.finishedAt ?? b.startsAt) - (a.finishedAt ?? a.startsAt));
  if (finished.length > 0) return finished[0];
  return [...rounds].sort((a, b) => a.startsAt - b.startsAt)[0];
}
