// Pure fetch functions against the public Lichess Broadcast API
// (https://lichess.org/api#tag/Broadcasts). No API key needed; confirmed
// CORS-open (Access-Control-Allow-Origin: *) so these run directly from
// the browser with no proxy — this app has no server to proxy through
// anyway (see next.config.ts's output: "export").

import { LICHESS_API_BASE } from './config';
import type { RoundInfo, TournamentInfo } from './types';

export async function fetchTournamentInfo(tournamentId: string): Promise<TournamentInfo> {
  const res = await fetch(`${LICHESS_API_BASE}/broadcast/${tournamentId}`);
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
  const res = await fetch(`${LICHESS_API_BASE}/broadcast/round/${roundId}.pgn`);
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
