'use client';

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
  return (
    <select
      value={selectedTeam ?? ''}
      onChange={(e) => setSelectedTeam(e.target.value || null)}
      className="px-2.5 py-1.5 bg-bg border border-[#7a856f]/40 text-[12px] font-mono text-paper rounded-[2px] focus:outline-none focus:border-pear/50 cursor-pointer"
    >
      <option value="">All Teams</option>
      {teams.map((team) => (
        <option key={team} value={team}>{team}</option>
      ))}
    </select>
  );
}
