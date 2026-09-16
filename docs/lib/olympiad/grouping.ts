// Groups a flat list of boards into team-vs-team pairings — an Olympiad
// round is team Swiss, so every board sharing the same two teams (in
// either colour) belongs to the same match.

import { WOMENS_TOURNAMENT_IDS } from './config';
import type { OlympiadGame, TeamPairing } from './types';

export function groupIntoPairings(games: OlympiadGame[]): TeamPairing[] {
  const byKey = new Map<string, TeamPairing>();

  for (const game of games) {
    const white = game.whiteTeam || 'Unknown';
    const black = game.blackTeam || 'Unknown';
    // Unordered pair key, so a board with the teams' colours swapped
    // (happens across rounds, or between two same-broadcast entries) still
    // lands in the same pairing card. Section-prefixed — the same two
    // countries can face each other in Open AND Women's in the same round
    // (independent Swiss pairings per section), and without this a caller
    // viewing "All" would merge both into one card showing up to 8 boards
    // for what's actually two separate matches.
    const section = WOMENS_TOURNAMENT_IDS.includes(game.tournamentId) ? 'women' : 'open';
    const key = `${section}:${[white, black].sort().join(' vs ')}`;

    const existing = byKey.get(key);
    if (existing) {
      existing.boards.push(game);
    } else {
      byKey.set(key, { key, whiteTeam: white, blackTeam: black, boards: [game] });
    }
  }

  for (const pairing of byKey.values()) {
    pairing.boards.sort((a, b) => (a.boardNumber ?? 999) - (b.boardNumber ?? 999));
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function uniqueTeams(games: OlympiadGame[]): string[] {
  const set = new Set<string>();
  for (const game of games) {
    if (game.whiteTeam) set.add(game.whiteTeam);
    if (game.blackTeam) set.add(game.blackTeam);
  }
  return Array.from(set).sort();
}
