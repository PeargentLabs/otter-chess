'use client';

import { useEffect, useRef, useState } from 'react';

// Turns the broadcast's periodic %clk readings (see useFocusedGame) into a
// clock that actually ticks between polls, the way a real chess clock
// does: only the side to move counts down, the side who just moved is
// frozen at their last reading. Each new authoritative reading resets the
// tick's zero-point, so it never drifts far from the broadcast's own
// numbers — it's just filling in the seconds between them.
//
// Ticking is disabled entirely (frozen display) when `isLive` is false —
// there's nothing to tick towards while reviewing history or before a game
// has moves.
export function useTickingClock(
  whiteClockSeconds: number | null,
  blackClockSeconds: number | null,
  turn: 'w' | 'b',
  isLive: boolean,
) {
  const baseRef = useRef({ white: whiteClockSeconds, black: blackClockSeconds, capturedAt: Date.now() });
  const [, forceTick] = useState(0);

  useEffect(() => {
    baseRef.current = { white: whiteClockSeconds, black: blackClockSeconds, capturedAt: Date.now() };
    forceTick((n) => n + 1);
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
