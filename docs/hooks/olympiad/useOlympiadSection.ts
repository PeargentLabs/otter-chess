'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTournamentInfo, fetchRoundPgnSnapshot, pickCurrentRound } from '@/lib/olympiad/broadcast-api';
import { parseBroadcastPgn } from '@/lib/olympiad/pgn-parser';
import { ROUND_POLL_MS, GAMES_POLL_MS } from '@/lib/olympiad/config';
import type { OlympiadGame, RoundInfo } from '@/lib/olympiad/types';

interface TournamentEntry {
  roundName: string | null;
  games: OlympiadGame[];
  // Wall-clock time this exact snapshot was actually true as of — Date.now()
  // for one that just came from a real poll, or the ORIGINAL fetch time for
  // one seeded from the stale-cache fallback below. useTickingClock (see
  // hooks/olympiad/useTickingClock.ts) needs this to correctly account for
  // however much real time has passed since a %clk reading was taken —
  // without it, a 20-minute-old cached reading looked "freshly captured"
  // just because it was the first value React saw this mount, which is what
  // made a stale reload show an inflated clock next to Lichess's own,
  // correctly-ticked one.
  asOf: number;
}

// Last-known-good snapshot per tournament+round, so a reload (or a fetch
// that's failing right now — see the "couldn't reach the broadcast" retry
// loop below) paints the last real boards instantly instead of a blank
// error state while the network catches up. 30 minutes is long enough to
// bridge a reload or a short outage without ever showing a truly stale
// board — anything older is discarded rather than shown.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cacheKey = (tournamentId: string, roundNumber?: number) =>
  `otter-olympiad-games-${tournamentId}-${roundNumber ?? 'current'}`;

function readCachedEntry(tournamentId: string, roundNumber?: number): TournamentEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(tournamentId, roundNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; roundName: string | null; games: OlympiadGame[] };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return { roundName: parsed.roundName, games: parsed.games, asOf: parsed.at };
  } catch (_) {
    return null;
  }
}

function writeCachedEntry(tournamentId: string, roundNumber: number | undefined, entry: TournamentEntry) {
  try {
    localStorage.setItem(cacheKey(tournamentId, roundNumber), JSON.stringify({ at: entry.asOf, roundName: entry.roundName, games: entry.games }));
  } catch (_) {
    // storage full/unavailable — in-memory state still works this visit
  }
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

    // Seed from each tournament's last-known-good cache so the grid shows
    // real boards immediately instead of the "Could not reach the
    // broadcast" empty state while the first live fetch is still in
    // flight (or retrying).
    const seeded = new Map<string, TournamentEntry>();
    for (const id of tournamentIds) {
      const cached = readCachedEntry(id, roundNumber);
      if (cached) seeded.set(id, cached);
    }
    setEntries(seeded);

    if (tournamentIds.length === 0) {
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // A poll cycle now goes through the request queue (see broadcast-api.ts)
    // alongside every OTHER hook on the page (standings, round list) —
    // serialized against them, it can take longer than GAMES_POLL_MS to
    // work through every tournament in a big section ("All" polls up to 9).
    // A plain setInterval would then fire a second overlapping pollOnce on
    // top of the first, doubling the queue depth every cycle it happens —
    // this guard skips a tick instead, and the schedule-after-completion
    // below (rather than a fixed-tick interval) keeps the loop from ever
    // falling behind itself.
    let inFlight = false;

    const pollOnce = async () => {
      if (inFlight) return;
      inFlight = true;
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
          const games = parseBroadcastPgn(pgn, id);
          anyOk = true;
          const entry = { roundName: round!.name, games, asOf: Date.now() };
          setEntries((prev) => {
            const next = new Map(prev);
            next.set(id, entry);
            return next;
          });
          writeCachedEntry(id, roundNumber, entry);

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
      inFlight = false;
      if (!cancelled) {
        // "No data at all" (neither a live entry nor a seeded cache one)
        // is the only real error state — see the lobby/watch pages, which
        // only render this when there are zero boards to show.
        setError(anyOk ? null : 'Could not reach the broadcast.');
        setLoading(false);
      }
    };

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await pollOnce();
        if (!cancelled) scheduleNext();
      }, GAMES_POLL_MS);
    };
    pollOnce().then(() => {
      if (!cancelled) scheduleNext();
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, roundNumber]);

  const games = useMemo(
    () => Array.from(entries.values()).flatMap((e) => e.games),
    [entries],
  );

  // Per-tournament breakdown — callers that poll a superset of ids (e.g.
  // every Open + Women's sub-broadcast at once, so switching between them
  // is a free client-side filter instead of a new fetch) use this to pull
  // out just the games belonging to whichever subset they want to display.
  const gamesByTournamentId = useMemo(() => {
    const map = new Map<string, OlympiadGame[]>();
    for (const [id, entry] of entries) map.set(id, entry.games);
    return map;
  }, [entries]);

  // Companion to gamesByTournamentId — see the asOf field comment above.
  const asOfByTournamentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, entry] of entries) map.set(id, entry.asOf);
    return map;
  }, [entries]);

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

  return { games, gamesByTournamentId, asOfByTournamentId, roundName, loading, error };
}
