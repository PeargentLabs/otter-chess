'use client';

import type { Chess } from 'chess.js';
import type { PredictedMove, RatingCurveSeries } from '@/lib/play/types';
import { formatUciAsSan, getExpectedHumanTime, timeFormatToTc } from '@/lib/play/chess-utils';
import RatingChart from './RatingChart';

export default function AnalyzeSidebar({
  game,
  exitAnalyzeMode,
  onStartTour,
  topMoves,
  sfTopMoves,
  ratingCurveData,
  ratingCurveLoading,
  ratingCurveHoverIdx,
  setRatingCurveHoverIdx,
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
  exitAnalyzeMode: () => void;
  onStartTour: () => void;
  topMoves: PredictedMove[];
  sfTopMoves: { san: string; evalCp: number; from: string; to: string }[];
  ratingCurveData: RatingCurveSeries[];
  ratingCurveLoading: boolean;
  ratingCurveHoverIdx: number | null;
  setRatingCurveHoverIdx: (idx: number | null) => void;
  auxIntuitionFrom: string | null;
  auxIntuitionFromConf: number;
  auxIntuitionTo: string | null;
  auxIntuitionToConf: number;
  winProbability: number;
  auxCheckProb: string;
  auxMovingPiece: string;
  auxCapturedPiece: string;
  analyzeTimeFormat: 'blitz' | 'rapid' | 'classical';
  analyzeWhiteTime: number;
  analyzeBlackTime: number;
}) {
  return (
    <div className="flex-grow flex flex-col min-h-0 divide-y divide-line">
      {/* Header info */}
      <div className="p-4 px-6 bg-panel/30 flex justify-between items-center">
        <div>
          <span className="font-mono text-[10.5px] text-pear uppercase font-bold tracking-wider">Analysis Mode</span>
          <h3 className="font-space font-medium text-[15px] text-paper mt-0.5">
            Game Review
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartTour}
            title="Take a guided tour of this panel"
            className="w-5 h-5 rounded-full border border-[#7a856f]/50 text-muted hover:text-pear hover:border-pear flex items-center justify-center text-[10px] font-bold font-mono transition-all cursor-pointer"
          >
            ?
          </button>
          <button
            onClick={exitAnalyzeMode}
            className="font-mono text-[10px] text-rose-500 uppercase font-bold hover:underline cursor-pointer border border-red-500/20 px-2 py-0.5 rounded hover:bg-rose-500/5 transition-all"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Otter vs Stockfish comparison, plus the arrow-colour legend that
          explains the board arrows those two columns drive. */}
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
            registered on the board (see the Chessground init in
            page.tsx): green for Otter, light red for Stockfish, yellow
            for the player's actual move. */}
        <div className="flex items-center justify-center gap-3 flex-wrap whitespace-nowrap text-[11.5px] font-mono text-muted mt-3 pt-3 border-t border-line/50">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#5C8A2E' }} />
            Otter
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#F0605F' }} />
            Stockfish
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#EAB308' }} />
            Player
          </span>
        </div>
      </div>

      {/* Moves-by-Rating sweep graph */}
      <div data-tour="moves-by-rating" className="py-4 px-6 shrink-0">
        <RatingChart
          ratingCurveData={ratingCurveData}
          ratingCurveLoading={ratingCurveLoading}
          ratingCurveHoverIdx={ratingCurveHoverIdx}
          setRatingCurveHoverIdx={setRatingCurveHoverIdx}
        />
      </div>

      {/* AI Intuition Dashboard */}
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
            prediction (aux_logits[13:141], 128 dims computed on every
            inference but never decoded before now). Trained independently
            from the policy head, so it's a genuine second opinion from the
            model itself, not a restatement of topMoves[0] — flagged when
            the two disagree. */}
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
          <div className="col-span-2 p-1.5 border border-line bg-bg rounded-[3px] flex justify-between items-center text-[11.5px]">
            <div className="text-muted uppercase font-bold">Est. Human Think Time</div>
            <div className="font-bold text-pear">
              {getExpectedHumanTime(
                topMoves,
                timeFormatToTc(analyzeTimeFormat),
                game?.turn() === 'w' ? analyzeWhiteTime : analyzeBlackTime,
                game?.history().length ?? 0,
                game?.moves().length ?? 0,
              )}s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
