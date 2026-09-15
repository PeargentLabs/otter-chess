'use client';

import type { Chess } from 'chess.js';
import type { PredictedMove, RatingCurveSeries } from '@/lib/play/types';
import ComparisonPanel from '@/components/play/ComparisonPanel';
import IntuitionPanel from '@/components/play/IntuitionPanel';
import RatingChart from '@/components/play/RatingChart';

// Right-side stats column for the Olympiad main board — the same
// Otter-vs-Stockfish comparison + AI Intuition dashboard /play's Analyze
// mode shows, composed from the same two panel components so both pages
// share one literal source of truth for that markup.
export default function OlympiadStatsPanel({
  game,
  roundName,
  topMoves,
  sfTopMoves,
  auxIntuitionFrom,
  auxIntuitionFromConf,
  auxIntuitionTo,
  auxIntuitionToConf,
  winProbability,
  auxCheckProb,
  auxMovingPiece,
  auxCapturedPiece,
  ratingCurveData,
  ratingCurveLoading,
  ratingCurveHoverIdx,
  setRatingCurveHoverIdx,
}: {
  game: Chess | null;
  roundName: string | null;
  topMoves: PredictedMove[];
  sfTopMoves: { san: string; evalCp: number; from: string; to: string }[];
  auxIntuitionFrom: string | null;
  auxIntuitionFromConf: number;
  auxIntuitionTo: string | null;
  auxIntuitionToConf: number;
  winProbability: number;
  auxCheckProb: string;
  auxMovingPiece: string;
  auxCapturedPiece: string;
  ratingCurveData: RatingCurveSeries[];
  ratingCurveLoading: boolean;
  ratingCurveHoverIdx: number | null;
  setRatingCurveHoverIdx: (idx: number | null) => void;
}) {
  return (
    <div className="flex-grow flex flex-col min-h-0 divide-y divide-line">
      <div className="p-4 px-6 bg-panel/30 flex justify-between items-center">
        <div>
          <span className="font-mono text-[10.5px] text-pear uppercase font-bold tracking-wider">Live Analysis</span>
          <h3 className="font-space font-medium text-[15px] text-paper mt-0.5">
            {roundName || 'Olympiad Broadcast'}
          </h3>
        </div>
      </div>

      <ComparisonPanel game={game} topMoves={topMoves} sfTopMoves={sfTopMoves} />

      <div className="py-4 px-6 shrink-0">
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
      />
    </div>
  );
}
