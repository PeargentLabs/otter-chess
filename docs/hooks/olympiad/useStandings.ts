'use client';

import { useEffect, useState } from 'react';
import { fetchTeamStandings } from '@/lib/olympiad/standings-api';
import { mergeStandings } from '@/lib/olympiad/standings-merge';
import { fetchTournamentInfo } from '@/lib/olympiad/broadcast-api';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, STANDINGS_PROXY_URL } from '@/lib/olympiad/config';
import type { TeamStanding } from '@/lib/olympiad/types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (section: 'open' | 'women') => `otter-standings-${section}`;

// Fetches + merges a section's team standings via standings-proxy/ (see
// lib/olympiad/standings-api.ts for why a proxy is needed at all).
// localStorage-cached so a repeat visit paints instantly and only a stale
// (>5min) cache triggers a background refetch — fetching every sub-
// tournament's standings sequentially isn't free, so this avoids paying
// that cost on every page load.
//
// `available` is false whenever the proxy simply isn't configured
// (STANDINGS_PROXY_URL unset) — the lobby uses this to show a
// chess-results.com link instead of an empty/broken table, never an error.
export function useStandings(section: 'open' | 'women') {
  const [standings, setStandings] = useState<TeamStanding[] | null>(null);
  const [loading, setLoading] = useState(true);
  // The organizer's official external standings page — fetched regardless
  // of whether our own computed table is available, so the lobby always
  // has somewhere to point to for the authoritative numbers.
  const [officialUrl, setOfficialUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ids = section === 'open' ? OPEN_TOURNAMENT_IDS : WOMENS_TOURNAMENT_IDS;

    fetchTournamentInfo(ids[0]).then((info) => {
      if (!cancelled) setOfficialUrl(info.standingsUrl);
    }).catch(() => {});

    if (!STANDINGS_PROXY_URL) {
      setStandings(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      try {
        const cached = localStorage.getItem(cacheKey(section));
        if (cached) {
          const parsed = JSON.parse(cached) as { at: number; data: TeamStanding[] };
          setStandings(parsed.data);
          if (Date.now() - parsed.at < CACHE_TTL_MS) {
            setLoading(false);
            return;
          }
        }
      } catch (_) {
        // corrupt/unavailable cache — fall through to a fresh fetch
      }

      const lists: TeamStanding[][] = [];
      for (const id of ids) {
        if (cancelled) return;
        const list = await fetchTeamStandings(id);
        if (list) lists.push(list);
      }
      if (cancelled) return;

      if (lists.length > 0) {
        const merged = mergeStandings(lists);
        setStandings(merged);
        try {
          localStorage.setItem(cacheKey(section), JSON.stringify({ at: Date.now(), data: merged }));
        } catch (_) {
          // storage full/unavailable — standings still rendered this visit
        }
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [section]);

  return { standings, loading, available: !!STANDINGS_PROXY_URL, officialUrl };
}
