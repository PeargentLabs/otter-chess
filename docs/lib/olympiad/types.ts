// Shared types for the /olympiad page and its hooks/components.

import type { BranchMove } from '@/lib/play/types';

// A ply of an Olympiad game — a BranchMove plus the mover's remaining
// clock time, when the broadcast relay includes `%clk` PGN comments (most
// official relays do; not guaranteed for every feed).
export interface OlympiadMove extends BranchMove {
  clockSeconds: number | null;
}

// One game from a Lichess broadcast round feed, fully parsed (headers +
// per-ply move history with FEN snapshots).
export interface OlympiadGame {
  // Stable per-game identity (Lichess's GameURL header) — doesn't change
  // as the game progresses, unlike an array index into the round's games.
  boardKey: string;
  boardNumber: number | null;
  white: string;
  black: string;
  whiteTeam: string | null;
  blackTeam: string | null;
  whiteElo: number | null;
  blackElo: number | null;
  whiteTitle: string | null;
  blackTitle: string | null;
  result: string;
  moves: OlympiadMove[];
  // Current (most advanced) position — same as moves.at(-1).fen, or the
  // start position when the game hasn't begun yet.
  fen: string;
}

// Every individual board being played between the same two teams this
// round — an Olympiad round pairing is team-vs-team, with each side
// fielding several players (boards) simultaneously.
export interface TeamPairing {
  key: string;
  whiteTeam: string;
  blackTeam: string;
  boards: OlympiadGame[];
}

export interface RoundInfo {
  id: string;
  name: string;
  slug: string;
  startsAt: number;
  ongoing?: boolean;
  // Present (and true) only once a round has actually been played through
  // to completion — confirmed via the live API: a round that's merely
  // scheduled (startsAt in the past, but never started) has neither this
  // nor `ongoing` set, which is exactly what distinguishes a real "last
  // round played" from a placeholder round nobody ever used.
  finished?: boolean;
  finishedAt?: number;
}

export interface TournamentInfo {
  id: string;
  name: string;
  slug: string;
  standingsUrl: string | null;
  rounds: RoundInfo[];
}

// One team's row from Lichess's own standings endpoint (real official data
// — match points, game points, per-round results) — see
// lib/olympiad/standings-api.ts for why this needs a small CORS proxy.
export interface TeamStanding {
  name: string;
  // Match points (2 win / 1 draw / 0 loss per round) and game points (sum
  // of individual board results) — Lichess's own field names, kept as-is.
  mp: number;
  gp: number;
  averageRating: number | null;
  matches: { roundId: string; opponent: string; points: string; mp: number; gp: number }[];
}
