'use client';

import type { OlympiadGame } from '@/lib/olympiad/types';
import MiniBoardCard from './MiniBoardCard';

// One page of live boards, as a fixed grid (4 columns on desktop, fewer on
// narrower screens — 4x2 = 8 per page, matching GridPagination's page
// size) styled after Lichess's own broadcast grid. Pagination itself lives
// upstream in page.tsx; this just renders whichever boards it's handed.
export default function MiniBoardStrip({
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
