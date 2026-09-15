'use client';

import type { TeamStanding } from '@/lib/olympiad/types';
import { teamFlagUrl } from '@/lib/olympiad/flags';

// One section's standings table (Open or Women's). Computed from Lichess's
// own real per-round results (see hooks/olympiad/useStandings.ts) — match
// points then game points, same as the official ranking, but tie-broken
// only by game points rather than the full Sonneborn-Berger/Buchholz
// system FIDE uses, so it's flagged as computed rather than official, with
// a link to the real thing alongside it.
export default function StandingsTable({
  title,
  standings,
  loading,
  officialUrl,
}: {
  title: string;
  standings: TeamStanding[] | null;
  loading: boolean;
  officialUrl: string | null;
}) {
  return (
    <div className="flex-1 min-w-0 border border-line rounded-[3px] overflow-hidden">
      <div className="p-3 px-4 bg-panel/40 border-b border-line flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-pear uppercase font-bold tracking-wider">{title}</span>
        {officialUrl && (
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-muted hover:text-pear uppercase tracking-wide transition-colors"
          >
            Official &rarr;
          </a>
        )}
      </div>

      {standings && standings.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] font-mono">
              <thead>
                <tr className="text-muted uppercase text-[10px] border-b border-line/60">
                  <th className="text-left font-bold py-2 px-3 w-8">#</th>
                  <th className="text-left font-bold py-2 px-3">Team</th>
                  <th className="text-right font-bold py-2 px-3">MP</th>
                  <th className="text-right font-bold py-2 px-3">GP</th>
                </tr>
              </thead>
              <tbody>
                {standings.slice(0, 15).map((team, idx) => {
                  const flagUrl = teamFlagUrl(team.name);
                  return (
                    <tr key={team.name} className="border-b border-line/30 last:border-0">
                      <td className="py-1.5 px-3 text-muted">{idx + 1}</td>
                      <td className="py-1.5 px-3 text-paper">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {flagUrl && <img src={flagUrl} alt="" className="w-4 h-3 object-cover rounded-[1px] shrink-0" />}
                          <span className="truncate">{team.name}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right text-pear font-bold">{team.mp}</td>
                      <td className="py-1.5 px-3 text-right text-muted">{team.gp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-line/60 text-[9.5px] text-muted font-mono">
            Computed from live results — official tie-breaks may differ slightly.
          </div>
        </>
      ) : (
        <div className="p-4 text-[12px] font-mono text-muted">
          {loading
            ? 'Loading standings…'
            : officialUrl
              ? <>Standings aren&apos;t available here yet — see the <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="text-pear hover:underline">official page</a>.</>
              : 'Standings aren’t available yet.'}
        </div>
      )}
    </div>
  );
}
