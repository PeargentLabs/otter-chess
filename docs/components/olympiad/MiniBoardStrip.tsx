'use client';

import { memo } from 'react';
import type { OlympiadGame } from '@/lib/olympiad/types';
import MiniBoardCard from './MiniBoardCard';

// One page of live boards, as a fixed grid (4 columns on desktop, fewer on
// narrower screens — 4x2 = 8 per page, matching GridPagination's page
// size) styled after Lichess's own broadcast grid. Pagination itself lives
// upstream in page.tsx; this just renders whichever boards it's handed.
//
// Memoized: the watch page re-renders every second (the ticking clock) and
// on every Otter/Stockfish tick, neither of which this grid's own props
// (boards/focusedBoardKey/onSelectBoard) actually depend on — without this,
// every one of those unrelated ticks was re-diffing up to 8 full mini
// boards (each with its own player rows/flags) for nothing.
function MiniBoardStrip({
  boards,
  focusedBoardKey,
  onSelectBoard,
}: {
  boards: OlympiadGame[];
  focusedBoardKey: string | null;
  onSelectBoard: (boardKey: string) => void;
}) {
  if (boards.length === 0) {
    return (
      <div className="px-4 lg:px-6 py-6 text-center text-xs text-muted italic border border-dashed border-[#7a856f]/35 rounded-[3px] mx-4 lg:mx-6">
        No other live boards right now.
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6 pb-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {boards.map((game) => (
        <MiniBoardCard
          key={game.boardKey}
          game={game}
          isFocused={game.boardKey === focusedBoardKey}
          onClick={() => onSelectBoard(game.boardKey)}
        />
      ))}
    </div>
  );
}

export default memo(MiniBoardStrip);
