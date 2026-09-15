'use client';

import type { RoundInfo } from '@/lib/olympiad/types';

// Round dropdown — Round 1..N, status-badged (Live / Upcoming / plain for
// an already-finished round), driving which round's games the lobby's
// grid shows.
export default function RoundPicker({
  rounds,
  selectedRound,
  setSelectedRound,
  roundNumberFromName,
  error,
}: {
  rounds: RoundInfo[];
  selectedRound: number | null;
  setSelectedRound: (n: number) => void;
  roundNumberFromName: (name: string) => number;
  error?: string | null;
}) {
  if (rounds.length === 0) {
    return (
      <select disabled className={`px-2.5 py-1.5 bg-bg border rounded-[2px] text-[12px] font-mono opacity-80 ${error ? 'border-rose-500/40 text-rose-500' : 'border-[#7a856f]/40 text-muted'}`}>
        <option>{error ?? 'Loading rounds…'}</option>
      </select>
    );
  }

  return (
    <select
      value={selectedRound ?? ''}
      onChange={(e) => setSelectedRound(parseInt(e.target.value, 10))}
      className="px-2.5 py-1.5 bg-bg border border-[#7a856f]/40 text-[12px] font-mono text-paper rounded-[2px] focus:outline-none focus:border-pear/50 cursor-pointer"
    >
      {rounds.map((r) => {
        const n = roundNumberFromName(r.name);
        const status = r.ongoing ? ' — Live' : !r.finished ? ' — Upcoming' : '';
        return (
          <option key={r.id} value={n}>
            {r.name}{status}
          </option>
        );
      })}
    </select>
  );
}
