// A section (Open, Women's) is split across several Lichess sub-broadcasts
// (Open I-V / Women I-IV). Whether a given team's results are split across
// several of those sub-broadcasts' standings lists, or each team appears
// whole in exactly one, is unverified (the real Samarkand event hasn't
// started, so there's nothing live to check against). Merging by team
// name and SUMMING mp/gp is correct either way: a no-op if a team only
// ever appears once, and a correct reconstruction of the total if it's
// split across several.

import type { TeamStanding } from './types';

export function mergeStandings(lists: TeamStanding[][]): TeamStanding[] {
  const byName = new Map<string, TeamStanding>();

  for (const list of lists) {
    for (const team of list) {
      const existing = byName.get(team.name);
      if (!existing) {
        byName.set(team.name, { ...team, matches: [...team.matches] });
        continue;
      }
      existing.mp += team.mp;
      existing.gp += team.gp;
      existing.matches.push(...team.matches);
      if (team.averageRating !== null) {
        existing.averageRating = existing.averageRating === null
          ? team.averageRating
          : (existing.averageRating + team.averageRating) / 2;
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => (b.mp - a.mp) || (b.gp - a.gp));
}
