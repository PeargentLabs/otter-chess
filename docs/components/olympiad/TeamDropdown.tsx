'use client';

import { useMemo } from 'react';

// Most of this app's traffic is India-based — pinned to the top of the
// list (ahead of the otherwise-alphabetical rest) so it's never a scroll
// away, without changing what's actually selected by default.
const PRIORITY_TEAM = 'India';

// Team filter — jumps the mini-board strip to one team's pairing, or back
// to every pairing in the current section via "All Teams".
export default function TeamDropdown({
  teams,
  selectedTeam,
  setSelectedTeam,
}: {
  teams: string[];
  selectedTeam: string | null;
  setSelectedTeam: (team: string | null) => void;
}) {
  const orderedTeams = useMemo(() => {
    if (!teams.includes(PRIORITY_TEAM)) return teams;
    return [PRIORITY_TEAM, ...teams.filter((t) => t !== PRIORITY_TEAM)];
  }, [teams]);

  return (
    <select
      value={selectedTeam ?? ''}
      onChange={(e) => setSelectedTeam(e.target.value || null)}
      className="px-2.5 py-1.5 bg-bg border border-[#7a856f]/40 text-[12px] font-mono text-paper rounded-[2px] focus:outline-none focus:border-pear/50 cursor-pointer"
    >
      <option value="">All Teams</option>
      {orderedTeams.map((team) => (
        <option key={team} value={team}>{team}</option>
      ))}
    </select>
  );
}
