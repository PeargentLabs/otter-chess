'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OlympiadGame } from '@/lib/olympiad/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Owns move-navigation state (currentMoveIdx) for whichever OlympiadGame is
// currently focused, and keeps it pinned to the live tip of the game as
// new moves arrive UNLESS the viewer has manually stepped back to review
// history — mirrors /play Analyze mode's navigation model, but adds the
// "stay glued to the live edge" behavior a static loaded PGN doesn't need.
export function useFocusedGame(game: OlympiadGame | null) {
  const [currentMoveIdx, setCurrentMoveIdx] = useState<number>(-1);
  const autoFollowRef = useRef(true);
  const prevBoardKeyRef = useRef<string | null>(null);
  const prevMovesLenRef = useRef(0);

  useEffect(() => {
    if (!game) return;

    // Switched to a different game entirely — always jump to its live tip.
    if (prevBoardKeyRef.current !== game.boardKey) {
      prevBoardKeyRef.current = game.boardKey;
      prevMovesLenRef.current = game.moves.length;
      autoFollowRef.current = true;
      setCurrentMoveIdx(game.moves.length - 1);
      return;
    }

    // Same game, but new moves arrived — only follow if the viewer was
    // already at the live edge, so someone reviewing an earlier position
    // isn't yanked forward mid-look.
    if (game.moves.length !== prevMovesLenRef.current) {
      prevMovesLenRef.current = game.moves.length;
      if (autoFollowRef.current) {
        setCurrentMoveIdx(game.moves.length - 1);
      }
    }
  }, [game]);

  const goToMove = (idx: number) => {
    if (!game) return;
    const clamped = Math.max(-1, Math.min(game.moves.length - 1, idx));
    autoFollowRef.current = clamped === game.moves.length - 1;
    setCurrentMoveIdx(clamped);
  };

  const stepMove = (direction: 1 | -1) => goToMove(currentMoveIdx + direction);
  const jumpToStart = () => goToMove(-1);
  const jumpToEnd = () => {
    if (game) goToMove(game.moves.length - 1);
  };

  // Clamped defensively against `game` itself, not just trusted from state:
  // when the focused game changes (switching boards via the strip/dropdown,
  // or a poll swapping in a shorter game) the new `game` prop arrives on the
  // same render as the OLD currentMoveIdx — the effect above that resets it
  // doesn't run until after this render commits. Every derived value below
  // reads through this clamped index instead of raw state, so a stale index
  // briefly pointing past the end of a shorter `moves` array can't produce
  // an out-of-bounds `undefined` access mid-render.
  const safeIdx = game ? Math.min(currentMoveIdx, game.moves.length - 1) : -1;

  const displayFen = !game || safeIdx === -1
    ? START_FEN
    : (game.moves[safeIdx]?.fen ?? game.fen);

  // Memoized on the underlying moves array + index, not recreated on every
  // render — `game` itself only gets a new reference when the broadcast
  // poll actually produces new data, but .slice()/array-literal results
  // are otherwise brand new objects every render, and several consumers
  // (useRatingCurve's effect deps, MainBoard's Chessground sync effect)
  // compare these by reference. An unmemoized array here previously caused
  // an infinite update loop: new array -> effect refires -> setState ->
  // re-render -> new array again.
  const displayMoves = useMemo(
    () => (game ? game.moves.slice(0, safeIdx + 1) : []),
    [game, safeIdx],
  );

  const lastMove: [string, string] | undefined = useMemo(() => {
    if (!game || safeIdx < 0) return undefined;
    const m = game.moves[safeIdx];
    return m ? [m.from, m.to] : undefined;
  }, [game, safeIdx]);

  // The move that was actually played next, for the main board's "played"
  // arrow when reviewing history instead of the live edge.
  const nextPlayedMove = useMemo(
    () => (game && safeIdx < game.moves.length - 1 ? game.moves[safeIdx + 1] : null),
    [game, safeIdx],
  );

  // Each side's remaining clock at the displayed position, read straight
  // off the broadcast's own %clk annotations (see lib/olympiad/pgn-parser.ts)
  // rather than simulated — White's plies sit at even indices, Black's at
  // odd, so the most recent clock reading for a side is the nearest ply of
  // its own parity at or before currentMoveIdx.
  const latestClock = (parity: 0 | 1): number | null => {
    if (!game) return null;
    for (let i = safeIdx; i >= 0; i--) {
      if (i % 2 === parity) return game.moves[i]?.clockSeconds ?? null;
    }
    return null;
  };
  const whiteClockSeconds = latestClock(0);
  const blackClockSeconds = latestClock(1);

  return {
    currentMoveIdx: safeIdx,
    goToMove,
    stepMove,
    jumpToStart,
    jumpToEnd,
    displayFen,
    displayMoves,
    lastMove,
    nextPlayedMove,
    whiteClockSeconds,
    blackClockSeconds,
    isAtLiveEdge: autoFollowRef.current,
  };
}
