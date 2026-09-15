'use client';

import type { Chess } from 'chess.js';
import type { PredictedMove } from '@/lib/play/types';
import { formatUciAsSan, ARROW_BRUSH_COLORS } from '@/lib/play/chess-utils';

// Otter-vs-Stockfish candidate move comparison, plus the arrow-colour
// legend that explains the board arrows those two columns drive. Extracted
// out of AnalyzeSidebar so /olympiad's main board can show the identical
// panel without dragging along AnalyzeSidebar's /play-only chrome (Exit
// button, guided Tour, rating-curve sweep, player clock).
export default function ComparisonPanel({
  game,
  topMoves,
  sfTopMoves,
}: {
  game: Chess | null;
  topMoves: PredictedMove[];
  sfTopMoves: { san: string; evalCp: number; from: string; to: string }[];
}) {
  return (
    <div data-tour="comparison-table" className="py-4 px-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] font-mono font-bold text-pear uppercase tracking-wide mb-2.5 truncate" title="Otter — human-like predicted moves">
            Otter · Human
          </div>
          <div className="flex justify-between text-[10.5px] text-muted uppercase font-bold font-mono pb-1 mb-1 border-b border-line/50">
            <span>Move</span><span>Prob</span>
          </div>
          <div className="space-y-1 min-h-[92px]">
            {topMoves.slice(0, 4).map((pm) => (
              <div key={pm.move} className="flex justify-between items-center h-5 text-[14px] font-mono">
                <span className="text-paper font-semibold">{formatUciAsSan(pm.move, game?.fen())}</span>
                <span className="text-pear font-bold">{((pm.probability ?? 0) * 100).toFixed(1)}%</span>
              </div>
            ))}
            {topMoves.length === 0 && (
              <div className="flex items-center h-5 text-[12.5px] text-muted italic">Running...</div>
            )}
          </div>
        </div>
        <div className="border-l border-line pl-3">
          <div className="flex items-center gap-1 mb-2.5 relative group">
            <div className="text-[12px] font-mono font-bold text-[#F0605F] uppercase tracking-wide truncate" title="Stockfish — engine's top candidate lines, searched to depth 13">
              Stockfish · d13
            </div>
            <span className="w-[13px] h-[13px] rounded-full border border-muted/60 text-muted group-hover:border-[#F0605F] group-hover:text-[#F0605F] flex items-center justify-center text-[9px] font-bold leading-none transition-colors shrink-0">
              i
            </span>
            <div className="absolute top-full mt-2 right-0 z-20 w-[220px] px-2.5 py-2 border border-line/60 bg-panel shadow-lg rounded-[3px] text-left normal-case whitespace-normal opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
              <p className="text-[11.5px] text-paper leading-[1.5]">
                Stockfish runs at full throttle here, no rating cap, so every eval and move-quality call stays objective. At depth 13 it plays like a ~3000+ Elo engine — well past super-grandmaster strength.
              </p>
            </div>
          </div>
          <div className="flex justify-between text-[10.5px] text-muted uppercase font-bold font-mono pb-1 mb-1 border-b border-line/50">
            <span>Move</span><span>Eval</span>
          </div>
          <div className="space-y-1 min-h-[92px]">
            {sfTopMoves.slice(0, 4).map((m, idx) => (
              <div key={idx} className="flex justify-between items-center h-5 text-[14px] font-mono">
                <span className="text-paper font-semibold">{m.san}</span>
                <span className={`font-bold ${(m.evalCp ?? 0) >= 0 ? 'text-pear' : 'text-rose-500'}`}>
                  {(m.evalCp ?? 0) > 0 ? '+' : ''}{((m.evalCp ?? 0) / 100).toFixed(2)}
                </span>
              </div>
            ))}
            {sfTopMoves.length === 0 && (
              <div className="flex items-center h-5 text-[12.5px] text-muted italic">Running...</div>
            )}
          </div>
        </div>
      </div>

      {/* Arrow colour legend — matches the custom chessground brushes
          registered on the board: green for Otter, light red for
          Stockfish, yellow for the player's actual move. */}
      <div className="flex items-center justify-center gap-3 flex-wrap whitespace-nowrap text-[11.5px] font-mono text-muted mt-3 pt-3 border-t border-line/50">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ARROW_BRUSH_COLORS.otter }} />
          Otter
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ARROW_BRUSH_COLORS.stockfish }} />
          Stockfish
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ARROW_BRUSH_COLORS.played }} />
          Player
        </span>
      </div>
    </div>
  );
}
