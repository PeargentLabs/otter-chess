// Layers a provisional estimate of the CURRENT round on top of the last
// official standings snapshot (see hooks/olympiad/useStandings.ts), using
// the live board results we're already polling — the official source
// (chess-results.com, and Lichess's own standings endpoint it's usually
// ahead of) can lag several hours behind the actual games, so this gives
// "roughly where things stand right now" instead of waiting.
//
// Never double-counts: each team's `matches` array from the official
// snapshot is one entry per round they've been scored for, so a team with
// N official match entries has been scored through (at least) round N —
// if that's already >= the round we're estimating, the official number is
// trusted as-is and nothing is added.

import { sideScore } from './result';
import { groupIntoPairings } from './grouping';
import type { OlympiadGame, TeamStanding } from './types';

export interface EstimatedStanding extends TeamStanding {
  // True once this round's own points were added by us rather than coming
  // straight from the official snapshot — callers use this to badge the
  // row as provisional.
  estimated: boolean;
}

function applyProvisional(
  byName: Map<string, EstimatedStanding>,
  teamName: string,
  roundNumber: number,
  mpDelta: number,
  gpDelta: number,
) {
  const existing = byName.get(teamName);
  const officialRoundsPlayed = existing?.matches.length ?? 0;
  if (officialRoundsPlayed >= roundNumber) return;
  const base: EstimatedStanding = existing ?? { name: teamName, mp: 0, gp: 0, averageRating: null, matches: [], estimated: false };
  byName.set(teamName, { ...base, mp: base.mp + mpDelta, gp: base.gp + gpDelta, estimated: true });
}

export function estimateStandings(
  baseline: TeamStanding[] | null,
  roundNumber: number,
  games: OlympiadGame[],
): EstimatedStanding[] {
  const byName = new Map<string, EstimatedStanding>();
  for (const team of baseline ?? []) {
    byName.set(team.name, { ...team, matches: [...team.matches], estimated: false });
  }

  for (const pairing of groupIntoPairings(games)) {
    const { whiteTeam, blackTeam, boards } = pairing;
    // Boards within one match alternate colours, so each board's own
    // whiteTeam/blackTeam (not the pairing's canonical assignment) decides
    // which side of THIS board's result belongs to which team.
    let whiteTeamGp = 0;
    let blackTeamGp = 0;
    let anyDecided = false;
    for (const board of boards) {
      const whiteScore = sideScore(board.result, 'w');
      if (whiteScore === null) continue;
      anyDecided = true;
      const scoreForWhiteTeam = board.whiteTeam === whiteTeam ? whiteScore : 1 - whiteScore;
      whiteTeamGp += scoreForWhiteTeam;
      blackTeamGp += 1 - scoreForWhiteTeam;
    }
    if (!anyDecided) continue;

    // Match points (2/1/0) only get awarded once every board's actually
    // finished — a game-point lead can still flip while boards remain in
    // progress, so awarding them early could hand out a match win that
    // becomes a loss a few moves later. Game points so far are shown as
    // they land instead, same as a real live standings feed would.
    const allBoardsFinished = boards.every((b) => b.result !== '*');
    let whiteMp = 0;
    let blackMp = 0;
    if (allBoardsFinished) {
      if (whiteTeamGp > blackTeamGp) whiteMp = 2;
      else if (whiteTeamGp < blackTeamGp) blackMp = 2;
      else { whiteMp = 1; blackMp = 1; }
    }

    applyProvisional(byName, whiteTeam, roundNumber, whiteMp, whiteTeamGp);
    applyProvisional(byName, blackTeam, roundNumber, blackMp, blackTeamGp);
  }

  return Array.from(byName.values()).sort((a, b) => (b.mp - a.mp) || (b.gp - a.gp));
}
