'use client';

import { useEffect, useRef, useState } from 'react';

// Turns the broadcast's periodic %clk readings (see useFocusedGame) into a
// clock that actually ticks between polls, the way a real chess clock
// does: only the side to move counts down, the side who just moved is
// frozen at their last reading. Each new authoritative reading resets the
// tick's zero-point, so it never drifts far from the broadcast's own
// numbers — it's just filling in the seconds between them.
//
// `asOf` is when that reading was actually true — Date.now() for one that
// just came from a live poll, but potentially many minutes ago for one
// seeded from useOlympiadSection's stale-cache fallback on page load. This
// used to always assume "just now" (whenever this hook first SAW a given
// reading), which was fine before that cache existed — every reading really
// did just arrive — but treated an old cached reading as freshly captured
// too, ticking down from it as if no time had passed and showing an
// inflated clock next to Lichess's own correctly-ticked one until the next
// live poll happened to land.
//
// Ticking is disabled entirely (frozen display) when `isLive` is false —
// there's nothing to tick towards while reviewing history or before a game
// has moves.
export function useTickingClock(
  whiteClockSeconds: number | null,
  blackClockSeconds: number | null,
  turn: 'w' | 'b',
  isLive: boolean,
  asOf: number,
) {
  const baseRef = useRef({ white: whiteClockSeconds, black: blackClockSeconds, capturedAt: asOf });
  const [, forceTick] = useState(0);

  useEffect(() => {
    // Only the reading itself (not `asOf` alone) should reset the
    // zero-point — every poll cycle re-confirms the same %clk value with a
    // fresh `asOf` even when no new move happened, and resetting on that
    // would make the displayed clock visibly jump back up every ~10s.
    baseRef.current = { white: whiteClockSeconds, black: blackClockSeconds, capturedAt: asOf };
    forceTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteClockSeconds, blackClockSeconds]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const elapsed = isLive ? Math.floor((Date.now() - baseRef.current.capturedAt) / 1000) : 0;
  const whiteDisplay = baseRef.current.white === null
    ? null
    : Math.max(0, baseRef.current.white - (turn === 'w' ? elapsed : 0));
  const blackDisplay = baseRef.current.black === null
    ? null
    : Math.max(0, baseRef.current.black - (turn === 'b' ? elapsed : 0));

  return { whiteDisplay, blackDisplay };
}
