'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTournamentInfo, fetchRoundPgnSnapshot, pickCurrentRound } from '@/lib/olympiad/broadcast-api';
import { parseBroadcastPgn } from '@/lib/olympiad/pgn-parser';
import { ROUND_POLL_MS, GAMES_POLL_MS } from '@/lib/olympiad/config';
import type { OlympiadGame, RoundInfo } from '@/lib/olympiad/types';

interface TournamentEntry {
  roundName: string | null;
  games: OlympiadGame[];
}

// Live data layer for a whole Olympiad section (e.g. every Open I-V
// sub-broadcast at once). Lichess's broadcast endpoints enforce "only 1
// request at a time" per client (confirmed live: a second concurrent call
// gets HTTP 429 with that exact message) — so every tournament in the
// section is polled through ONE sequential loop, never in parallel.
// Firing them with Promise.all/allSettled (the original design) meant only
// one of several tournaments actually won each cycle; the rest got 429'd
// and silently kept stale data, which is what made the game count look
// far lower than the real broadcast's.
//
// `roundNumber`, when given, pins every tournament to that specific round
// ("Round N") instead of resolving "whatever's current" — used by the
// lobby's round picker and by a deep link from it into the watch page.
// A pinned round that's already `finished` is fetched once and then left
// alone (its results can't change), rather than kept on the poll cycle.
export function useOlympiadSection(tournamentIds: string[], roundNumber?: number) {
  const idsKey = tournamentIds.join(',');
  const [entries, setEntries] = useState<Map<string, TournamentEntry>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Per-tournament cached round + when it was last resolved — round
  // metadata changes rarely, so re-resolving it every single games-poll
  // cycle (for every tournament, sequentially) would slow the whole loop
  // down for no reason. Refreshed at most every ROUND_POLL_MS.
  const roundCacheRef = useRef<Map<string, { round: RoundInfo | null; resolvedAt: number }>>(new Map());
  // Tournaments whose pinned, already-finished round has been fetched once
  // — skipped on later cycles instead of being refetched forever.
  const settledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    roundCacheRef.current = new Map();
    settledRef.current = new Set();
    setEntries(new Map());

    if (tournamentIds.length === 0) {
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const pollOnce = async () => {
      let anyOk = false;
      for (const id of tournamentIds) {
        if (cancelled) return;
        if (settledRef.current.has(id)) {
          anyOk = true;
          continue;
        }
        try {
          const cached = roundCacheRef.current.get(id);
          const needsRoundRefresh = !cached || Date.now() - cached.resolvedAt > ROUND_POLL_MS;
          let round: RoundInfo | null;
          if (needsRoundRefresh) {
            const info = await fetchTournamentInfo(id);
            if (cancelled) return;
            round = roundNumber !== undefined
              ? (info.rounds.find((r) => r.name === `Round ${roundNumber}`) ?? null)
              : pickCurrentRound(info.rounds);
            roundCacheRef.current.set(id, { round, resolvedAt: Date.now() });
          } else {
            round = cached!.round;
          }
          if (!round) continue;

          const pgn = await fetchRoundPgnSnapshot(round.id);
          if (cancelled) return;
          const games = parseBroadcastPgn(pgn);
          anyOk = true;
          setEntries((prev) => {
            const next = new Map(prev);
            next.set(id, { roundName: round!.name, games });
            return next;
          });

          if (roundNumber !== undefined && round.finished) {
            settledRef.current.add(id);
          }
        } catch (_) {
          // This tournament's fetch failed this cycle (network hiccup, or a
          // 429 from the concurrency limit above if something else on the
          // page also happened to call the API this instant) — leave its
          // previous entry in place and try again next cycle, rather than
          // clearing its boards or aborting the whole loop.
        }
      }
      if (!cancelled) {
        setError(anyOk ? null : 'Could not reach the broadcast.');
        setLoading(false);
      }
    };

    pollOnce();
    const id = setInterval(pollOnce, GAMES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, roundNumber]);

  const games = useMemo(
    () => Array.from(entries.values()).flatMap((e) => e.games),
    [entries],
  );

  // One representative round name for display — the first tournament's,
  // since every sub-broadcast in a section is on (approximately) the same
  // round number at any given time.
  const roundName = useMemo(() => {
    for (const id of tournamentIds) {
      const name = entries.get(id)?.roundName;
      if (name) return name;
    }
    return null;
  }, [entries, idsKey]);

  return { games, roundName, loading, error };
}
