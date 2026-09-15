'use client';

import type { Chess } from 'chess.js';
import type { PredictedMove } from '@/lib/play/types';
import { getExpectedHumanTime, timeFormatToTc } from '@/lib/play/chess-utils';

// Otter's auxiliary prediction head dashboard — moving piece, captured
// piece, check probability, subjective eval, and the aux head's own
// from/to square guess. Extracted out of AnalyzeSidebar (same reasoning as
// ComparisonPanel) so /olympiad can reuse it.
//
// `analyzeTimeFormat`/`analyzeWhiteTime`/`analyzeBlackTime` are optional:
// /play always has a time-format + clock to condition the "Est. Human
// Think Time" stat on, but a live broadcast game has no such slider in
// Phase 1 — omitting them just hides that one row rather than fabricating
// a clock reading.
export default function IntuitionPanel({
  game,
  topMoves,
  auxIntuitionFrom,
  auxIntuitionFromConf,
  auxIntuitionTo,
  auxIntuitionToConf,
  winProbability,
  auxCheckProb,
  auxMovingPiece,
  auxCapturedPiece,
  analyzeTimeFormat,
  analyzeWhiteTime,
  analyzeBlackTime,
}: {
  game: Chess | null;
  topMoves: PredictedMove[];
  auxIntuitionFrom: string | null;
  auxIntuitionFromConf: number;
  auxIntuitionTo: string | null;
  auxIntuitionToConf: number;
  winProbability: number;
  auxCheckProb: string;
  auxMovingPiece: string;
  auxCapturedPiece: string;
  analyzeTimeFormat?: 'blitz' | 'rapid' | 'classical';
  analyzeWhiteTime?: number;
  analyzeBlackTime?: number;
}) {
  const showThinkTime = analyzeTimeFormat !== undefined && analyzeWhiteTime !== undefined && analyzeBlackTime !== undefined;

  return (
    <div data-tour="ai-intuition" className="py-4 px-6">
      <div className="flex items-center gap-1 mb-2.5 relative group">
        <div className="block-label font-mono text-[12px] text-pear tracking-[0.12em] uppercase font-bold">
          Otter AI Intuition
        </div>
        <span className="w-[13px] h-[13px] rounded-full border border-muted/60 text-muted group-hover:border-pear group-hover:text-pear flex items-center justify-center text-[9px] font-bold leading-none transition-colors shrink-0">
          i
        </span>
        <div className="absolute top-full mt-2 left-0 z-20 w-[240px] px-2.5 py-2 border border-line/60 bg-panel shadow-lg rounded-[3px] text-left normal-case whitespace-normal opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
          <p className="text-[11.5px] text-paper leading-[1.5]">
            Otter's auxiliary prediction head — a second set of outputs the model computes alongside its main move choice: which piece is moving, what it captures, check probability, and (in the meter below) its own independent guess at the from/to squares, which can occasionally disagree with Otter's top move.
          </p>
        </div>
      </div>

      {/* Otter's Intuition Squares — the aux head's own from/to square
          prediction, trained independently from the policy head, so it's a
          genuine second opinion from the model itself, not a restatement
          of topMoves[0] — flagged when the two disagree. */}
      {auxIntuitionFrom && auxIntuitionTo && (() => {
        const topMove = topMoves[0]?.move;
        const agrees = !!topMove && topMove.slice(0, 2) === auxIntuitionFrom && topMove.slice(2, 4) === auxIntuitionTo;
        return (
          <div className="p-2.5 border border-line bg-bg rounded-[3px] flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <div className="flex items-baseline gap-1.5 text-[13px] font-mono">
              <span className="font-bold text-paper">{auxIntuitionFrom}</span>
              <span className="text-muted text-[10px]">{((auxIntuitionFromConf ?? 0) * 100).toFixed(0)}%</span>
              <span className="text-muted">→</span>
              <span className="font-bold text-paper">{auxIntuitionTo}</span>
              <span className="text-muted text-[10px]">{((auxIntuitionToConf ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <span className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
              agrees ? 'text-pear border-pear/30 bg-pear-tint/10' : 'text-orange-400 border-orange-400/30 bg-orange-400/10'
            }`}>
              {agrees ? 'Matches top move' : 'Independent guess'}
            </span>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-1.5 text-[12.5px] font-mono">
        <div className="p-1.5 border border-line bg-bg rounded-[3px]">
          <div className="text-muted text-[10px] uppercase font-bold mb-0.5">Subjective Eval</div>
          <div className={`text-[13px] font-bold ${(winProbability ?? 0) > 0.15 ? 'text-pear' : (winProbability ?? 0) < -0.15 ? 'text-rose-500' : 'text-paper'}`}>
            {(winProbability ?? 0) > 0 ? '+' : ''}{(winProbability ?? 0).toFixed(2)}
          </div>
        </div>
        <div className="p-1.5 border border-line bg-bg rounded-[3px]">
          <div className="text-muted text-[10px] uppercase font-bold mb-0.5">Check Prob</div>
          <div className="text-[13px] font-bold text-paper">
            {auxCheckProb}
          </div>
        </div>
        <div className="p-1.5 border border-line bg-bg rounded-[3px]">
          <div className="text-muted text-[10px] uppercase font-bold mb-0.5">Moving Piece</div>
          <div className="text-[12.5px] font-bold text-paper truncate" title={auxMovingPiece}>
            {auxMovingPiece}
          </div>
        </div>
        <div className="p-1.5 border border-line bg-bg rounded-[3px]">
          <div className="text-muted text-[10px] uppercase font-bold mb-0.5">Target Capture</div>
          <div className="text-[12.5px] font-bold text-paper truncate" title={auxCapturedPiece}>
            {auxCapturedPiece}
          </div>
        </div>
        {showThinkTime && (
          <div className="col-span-2 p-1.5 border border-line bg-bg rounded-[3px] flex justify-between items-center text-[11.5px]">
            <div className="text-muted uppercase font-bold">Est. Human Think Time</div>
            <div className="font-bold text-pear">
              {getExpectedHumanTime(
                topMoves,
                timeFormatToTc(analyzeTimeFormat!),
                game?.turn() === 'w' ? analyzeWhiteTime! : analyzeBlackTime!,
                game?.history().length ?? 0,
                game?.moves().length ?? 0,
              )}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
