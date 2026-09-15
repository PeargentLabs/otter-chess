'use client';

import React from 'react';
import type { BranchMove } from '@/lib/play/types';

// Left-side move history for the Olympiad main board — the same move-pair
// grid + bottom-pinned nav controls as /play's NotationColumn (Analyze
// mode), stripped of that column's rating-bracket/history-window/
// time-control conditioning sliders, which have no meaning for reviewing
// someone else's already-played live game.
export default function OlympiadHistoryPanel({
  white,
  black,
  moves,
  currentMoveIdx,
  goToMove,
  jumpToStart,
  jumpToEnd,
  stepMove,
}: {
  white: string;
  black: string;
  moves: BranchMove[];
  currentMoveIdx: number;
  goToMove: (idx: number) => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  stepMove: (direction: 1 | -1) => void;
}) {
  return (
    <div className="order-3 lg:order-1 border-t border-line lg:border-t-0 w-full lg:w-[300px] shrink-0 max-h-[45dvh] lg:max-h-none flex flex-col bg-panel min-h-0 divide-y divide-line">
      <div className="flex-grow overflow-y-auto min-h-0 flex flex-col">
        <div className="hidden lg:flex p-5 px-6 bg-panel/30 items-center justify-between shrink-0">
          <span className="block-label font-mono text-[12px] text-pear tracking-[0.12em] uppercase font-bold">
            Move History <span className="text-muted normal-case font-normal">({moves.length})</span>
          </span>
        </div>
        <div className="p-4 px-6 pb-2 shrink-0 text-[12px] font-mono text-muted truncate">
          <span className="text-paper font-semibold">{white}</span> vs <span className="text-paper font-semibold">{black}</span>
        </div>

        <div className="p-4 px-6 pt-0 shrink-0 flex-grow flex flex-col min-h-0">
          <div className="flex-grow overflow-y-auto pr-1 min-h-0">
            {moves.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[14px] font-mono">
                {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, movePairIdx) => {
                  const move1Idx = movePairIdx * 2;
                  const move2Idx = movePairIdx * 2 + 1;
                  const m1 = moves[move1Idx];
                  const m2 = moves[move2Idx];
                  const move1Active = currentMoveIdx === move1Idx;
                  const move2Active = currentMoveIdx === move2Idx;

                  return (
                    <React.Fragment key={movePairIdx}>
                      <button
                        onClick={() => goToMove(move1Idx)}
                        className={`text-left truncate cursor-pointer px-2 py-1 rounded-[3px] border-l-2 transition-all ${
                          move1Active
                            ? 'bg-pear-tint/15 text-pear font-bold border-pear'
                            : 'text-paper/90 border-transparent hover:bg-bg hover:border-line hover:text-pear'
                        }`}
                      >
                        <span className={`text-[11px] mr-1 ${move1Active ? 'text-pear/70' : 'text-muted'}`}>{movePairIdx + 1}.</span>
                        {m1.san}
                      </button>
                      {m2 ? (
                        <button
                          onClick={() => goToMove(move2Idx)}
                          className={`text-left truncate cursor-pointer px-2 py-1 rounded-[3px] border-l-2 transition-all ${
                            move2Active
                              ? 'bg-pear-tint/15 text-pear font-bold border-pear'
                              : 'text-paper/90 border-transparent hover:bg-bg hover:border-line hover:text-pear'
                          }`}
                        >
                          {m2.san}
                        </button>
                      ) : (
                        <div className="py-1" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted italic text-center py-4 border border-dashed border-[#7a856f]/35 rounded-[3px]">
                Waiting for the round to start.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation controls — anchored to the bottom of the column. */}
      <div className="p-4 px-6 bg-panel/10 border-t border-line flex flex-col gap-2 shrink-0">
        <div className="flex justify-between items-center gap-2">
          <button
            onClick={jumpToStart}
            disabled={currentMoveIdx === -1}
            className="flex-1 py-1.5 bg-bg border border-[#7a856f]/35 hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/35 disabled:hover:text-paper font-mono text-center font-bold rounded-[3px] transition-all cursor-pointer text-xs"
            title="Go to Start"
          >
            &lt;&lt;
          </button>
          <button
            onClick={() => stepMove(-1)}
            disabled={currentMoveIdx === -1}
            className="flex-1 py-1.5 bg-bg border border-[#7a856f]/35 hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/35 disabled:hover:text-paper font-mono text-center font-bold rounded-[3px] transition-all cursor-pointer text-xs"
            title="Previous Move"
          >
            &lt;
          </button>
          <button
            onClick={() => stepMove(1)}
            disabled={currentMoveIdx === moves.length - 1}
            className="flex-1 py-1.5 bg-bg border border-[#7a856f]/35 hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/35 disabled:hover:text-paper font-mono text-center font-bold rounded-[3px] transition-all cursor-pointer text-xs"
            title="Next Move"
          >
            &gt;
          </button>
          <button
            onClick={jumpToEnd}
            disabled={currentMoveIdx === moves.length - 1}
            className="flex-1 py-1.5 bg-bg border border-[#7a856f]/35 hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/35 disabled:hover:text-paper font-mono text-center font-bold rounded-[3px] transition-all cursor-pointer text-xs"
            title="Go to End (live)"
          >
            &gt;&gt;
          </button>
        </div>
        <div className="text-[9px] text-muted text-center font-mono uppercase tracking-wide leading-none">
          Use Arrow keys to step through moves
        </div>
      </div>
    </div>
  );
}
