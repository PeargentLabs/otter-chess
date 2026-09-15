'use client';

import { useEffect, useState } from 'react';
import { fetchTournamentInfo, pickCurrentRound } from '@/lib/olympiad/broadcast-api';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, ROUND_POLL_MS } from '@/lib/olympiad/config';
import type { RoundInfo } from '@/lib/olympiad/types';

const roundNumberFromName = (name: string): number => {
  const n = parseInt(name.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 1 : n;
};

// A section's round LIST for the lobby's round picker (numbers + status
// badges) — reads just one representative sub-tournament (they're all on
// the same round schedule), unlike useOlympiadSection which pulls actual
// game data from every sub-tournament in the section.
//
// Polls on the same cadence as round resolution elsewhere (ROUND_POLL_MS)
// rather than fetching once: a transient failure (network blip, or a 429
// from Lichess's "one request at a time" limit if something else on the
// page happens to call it at the same instant) used to leave the picker
// permanently stuck on "Loading rounds…" with no recovery — this retries
// on its own and surfaces a distinct error instead of looking like a
// stuck spinner.
export function useSectionRounds(section: 'open' | 'women') {
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRounds([]);
    setLoading(true);
    setError(null);
    const ids = section === 'open' ? OPEN_TOURNAMENT_IDS : WOMENS_TOURNAMENT_IDS;

    const load = () => {
      fetchTournamentInfo(ids[0])
        .then((info) => {
          if (cancelled) return;
          setRounds(info.rounds);
          setError(null);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError('Could not load rounds — retrying…');
          setLoading(false);
        });
    };

    load();
    const id = setInterval(load, ROUND_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [section]);

  // A sensible default round number to preselect: whichever pickCurrentRound
  // (ongoing, else last finished, else the first round) resolves to.
  const defaultRoundNumber = rounds.length > 0 ? roundNumberFromName(pickCurrentRound(rounds)!.name) : null;

  return { rounds, loading, error, defaultRoundNumber, roundNumberFromName };
}
