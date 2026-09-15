'use client';

import type { Chess } from 'chess.js';
import type { PredictedMove, RatingCurveSeries } from '@/lib/play/types';
import RatingChart from './RatingChart';
import ComparisonPanel from './ComparisonPanel';
import IntuitionPanel from './IntuitionPanel';

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

      <ComparisonPanel game={game} topMoves={topMoves} sfTopMoves={sfTopMoves} />

      {/* Moves-by-Rating sweep graph */}
      <div data-tour="moves-by-rating" className="py-4 px-6 shrink-0">
        <RatingChart
          ratingCurveData={ratingCurveData}
          ratingCurveLoading={ratingCurveLoading}
          ratingCurveHoverIdx={ratingCurveHoverIdx}
          setRatingCurveHoverIdx={setRatingCurveHoverIdx}
        />
      </div>

      <IntuitionPanel
        game={game}
        topMoves={topMoves}
        auxIntuitionFrom={auxIntuitionFrom}
        auxIntuitionFromConf={auxIntuitionFromConf}
        auxIntuitionTo={auxIntuitionTo}
        auxIntuitionToConf={auxIntuitionToConf}
        winProbability={winProbability}
        auxCheckProb={auxCheckProb}
        auxMovingPiece={auxMovingPiece}
        auxCapturedPiece={auxCapturedPiece}
        analyzeTimeFormat={analyzeTimeFormat}
        analyzeWhiteTime={analyzeWhiteTime}
        analyzeBlackTime={analyzeBlackTime}
      />
    </div>
  );
}
