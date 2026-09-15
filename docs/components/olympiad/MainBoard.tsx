'use client';

import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape, DrawBrushes } from 'chessground/draw';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import type { PredictedMove } from '@/lib/play/types';
import { ARROW_BRUSH_COLORS, formatSfPoints, formatClock } from '@/lib/play/chess-utils';
import EvalBar from '@/components/play/EvalBar';
import { teamFlagUrl } from '@/lib/olympiad/flags';
import { sideScore, formatScore } from '@/lib/olympiad/result';

type SfTopMove = { san: string; evalCp: number; from: string; to: string };

// The Olympiad main board — a spectator-only Chessground board (no piece
// dragging; this is someone else's already-played game) with the same
// Otter/Stockfish/played-move arrows and dual eval bars as /play's Analyze
// mode. Owns its own Chessground instance and sizing, mirroring
// BoardColumn.tsx's board wrapper and page.tsx's Chessground init/sync
// effects, trimmed of every /play-only mode (match/editor/lobby).
export default function MainBoard({
  fen,
  lastMove,
  isFlipped,
  setIsFlipped,
  topMoves,
  sfTopMoves,
  playedMove,
  otterWinPct,
  stockfishEvalPct,
  whiteLabel,
  blackLabel,
  whiteTeam,
  blackTeam,
  whiteElo,
  blackElo,
  result,
  whiteClockSeconds,
  blackClockSeconds,
  isLive,
}: {
  fen: string;
  lastMove?: [string, string];
  isFlipped: boolean;
  setIsFlipped: (fn: (v: boolean) => boolean) => void;
  topMoves: PredictedMove[];
  sfTopMoves: SfTopMove[];
  playedMove?: { from: string; to: string } | null;
  otterWinPct: number;
  stockfishEvalPct: number;
  whiteLabel: string;
  blackLabel: string;
  whiteTeam: string | null;
  blackTeam: string | null;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  whiteClockSeconds: number | null;
  blackClockSeconds: number | null;
  isLive: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const [boardPx, setBoardPx] = useState<number | null>(null);

  // Initial Chessground instantiation — spectator-only board, so
  // `movable` never enables dragging or reports destinations.
  useEffect(() => {
    if (containerRef.current && !cgRef.current) {
      const cg = Chessground(containerRef.current, {
        fen,
        lastMove: lastMove as Key[] | undefined,
        orientation: isFlipped ? 'black' : 'white',
        viewOnly: false,
        movable: { free: false, color: undefined, dests: new Map() },
        drawable: {
          enabled: true,
          brushes: {
            otter: { key: 'otter', color: ARROW_BRUSH_COLORS.otter, opacity: 1, lineWidth: 10 },
            stockfish: { key: 'stockfish', color: ARROW_BRUSH_COLORS.stockfish, opacity: 1, lineWidth: 10 },
            played: { key: 'played', color: ARROW_BRUSH_COLORS.played, opacity: 1, lineWidth: 10 },
          } as Partial<DrawBrushes> as DrawBrushes,
        },
      });
      cgRef.current = cg;
    }
    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin the board's rendered size to a multiple of 8 device pixels, same
  // reasoning as BoardColumn.tsx (chessground snaps to a multiple of 8
  // itself; measuring and pinning here keeps that snap a no-op instead of
  // leaving a visible gap on the right/bottom edges).
  useEffect(() => {
    const wrapper = boardWrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const size = Math.max(200, Math.floor(Math.min(width, height) / 8) * 8);
      setBoardPx((prev) => (prev === size ? prev : size));
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (boardPx === null) return;
    requestAnimationFrame(() => cgRef.current?.redrawAll());
  }, [boardPx]);

  // Keep Chessground in sync with the live position + arrows. One arrow
  // per source, each its own brush, matching /play's Analyze mode exactly:
  // Otter's own top pick, Stockfish's own top pick, and (when reviewing
  // history instead of the live edge) the move that was actually played
  // next.
  useEffect(() => {
    if (!cgRef.current) return;

    const finalShapes: DrawShape[] = [];
    if (topMoves.length > 0) {
      const m = topMoves[0];
      finalShapes.push({ orig: m.move.slice(0, 2) as Key, dest: m.move.slice(2, 4) as Key, brush: 'otter' });
    }
    if (sfTopMoves.length > 0) {
      const m = sfTopMoves[0];
      finalShapes.push({ orig: m.from as Key, dest: m.to as Key, brush: 'stockfish' });
    }
    if (playedMove) {
      finalShapes.push({ orig: playedMove.from as Key, dest: playedMove.to as Key, brush: 'played' });
    }

    cgRef.current.set({
      fen,
      lastMove: lastMove as Key[] | undefined,
      orientation: isFlipped ? 'black' : 'white',
      drawable: { autoShapes: finalShapes },
    });
  }, [fen, lastMove, isFlipped, topMoves, sfTopMoves, playedMove]);

  const desktopBoardW = 'lg:w-[min(calc(100vw-830px),82vh,720px)]';
  const cardStyle = boardPx !== null ? { width: boardPx } : undefined;
  const cardClasses = `w-full max-w-[min(80vh,720px)] ${desktopBoardW}`;

  const renderCard = (
    label: string,
    team: string | null,
    elo: number | null,
    score: number | null,
    clockSeconds: number | null,
    dotBlack: boolean,
    inRow = false,
  ) => {
    const flagUrl = teamFlagUrl(team);
    const won = score === 1;
    const lost = score === 0;
    const draw = score === 0.5;
    return (
      <div
        style={inRow ? undefined : cardStyle}
        className={`${inRow ? 'flex-1 min-w-0' : cardClasses} flex justify-between items-center px-4 py-2 border border-[#7a856f]/30 bg-panel/30 rounded-[3px]`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-3 h-3 rounded-full border border-[#7a856f]/40 shrink-0 ${dotBlack ? 'bg-[#1a1b15]' : 'bg-[#FFFFFF]'}`} />
          {flagUrl && <img src={flagUrl} alt="" className="w-4 h-3 object-cover rounded-[1px] shrink-0" />}
          <div className="font-mono text-xs text-paper font-semibold truncate">
            {label} {elo !== null && <span className="text-muted">({elo})</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {score !== null && (
            <span className={`font-mono font-bold flex items-center justify-center ${
              draw ? 'text-[13px] w-6 h-6 rounded-[2px] bg-line/40 text-muted' : `text-[13px] w-5 h-5 ${won ? 'text-pear' : 'text-rose-500'}`
            }`}>
              {formatScore(score)}
            </span>
          )}
          {clockSeconds !== null && (
            <div className="font-mono text-[13px] font-bold px-2 py-0.5 border border-line bg-bg/50 text-paper/85 rounded-[2px]">
              {formatClock(clockSeconds)}
            </div>
          )}
        </div>
      </div>
    );
  };

  const topIsBlack = !isFlipped;
  const topLabel = topIsBlack ? blackLabel : whiteLabel;
  const topTeam = topIsBlack ? blackTeam : whiteTeam;
  const topElo = topIsBlack ? blackElo : whiteElo;
  const topScore = sideScore(result, topIsBlack ? 'b' : 'w');
  const topClock = topIsBlack ? blackClockSeconds : whiteClockSeconds;
  const bottomLabel = topIsBlack ? whiteLabel : blackLabel;
  const bottomTeam = topIsBlack ? whiteTeam : blackTeam;
  const bottomElo = topIsBlack ? whiteElo : blackElo;
  const bottomScore = sideScore(result, topIsBlack ? 'w' : 'b');
  const bottomClock = topIsBlack ? whiteClockSeconds : blackClockSeconds;

  return (
    <div className="shrink-0 flex flex-col items-center justify-center bg-bg relative min-h-0 px-4 py-3 lg:p-6 space-y-2.5 lg:space-y-3.5">
      {isLive && (
        <div className="hidden lg:flex absolute top-2 left-2.5 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-pear z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-pear animate-pulse" />
          Live
        </div>
      )}
      <button
        onClick={() => setIsFlipped((prev) => !prev)}
        className="hidden lg:flex absolute top-2 right-2.5 font-mono text-[10px] uppercase tracking-wider text-muted border border-line px-2 py-1 hover:text-pear hover:border-pear transition-all cursor-pointer items-center gap-1.5 z-10"
        title="Flip board"
      >
        <span>&#x27F3;</span>
        <span>Flip</span>
      </button>

      {renderCard(topLabel, topTeam, topElo, topScore, topClock, topIsBlack)}

      <div className="flex items-center justify-center gap-2 lg:gap-4 relative w-full lg:w-auto">
        <EvalBar
          pct={otterWinPct}
          color="#7CB342"
          text={`${otterWinPct.toFixed(1)}%`}
          title={`Otter Win Prob: ${otterWinPct}%`}
          isFlipped={isFlipped}
          isAnalyzeMode={true}
          boardPx={boardPx}
        />

        <div
          ref={boardWrapperRef}
          className={`flex-1 min-w-0 max-w-[min(80vh,720px)] max-h-[max(200px,calc(100dvh-400px))] lg:flex-none lg:max-w-none lg:max-h-none ${desktopBoardW} aspect-square flex items-center justify-center`}
        >
          <div
            style={boardPx !== null ? { width: boardPx, height: boardPx } : { width: '100%', height: '100%' }}
            className="relative outline outline-1 outline-line bg-sq-dark overflow-hidden"
          >
            <div ref={containerRef} className="w-full h-full" />
          </div>
        </div>

        <EvalBar
          pct={stockfishEvalPct}
          color="#F0605F"
          text={formatSfPoints(sfTopMoves[0]?.evalCp)}
          title={`Stockfish eval: ${formatSfPoints(sfTopMoves[0]?.evalCp)}`}
          isFlipped={isFlipped}
          isAnalyzeMode={true}
          boardPx={boardPx}
        />
      </div>

      <div style={cardStyle} className={`${cardClasses} flex items-stretch gap-2`}>
        {renderCard(bottomLabel, bottomTeam, bottomElo, bottomScore, bottomClock, !topIsBlack, true)}
        <button
          onClick={() => setIsFlipped((prev) => !prev)}
          className="lg:hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted border border-[#7a856f]/30 bg-panel/30 rounded-[3px] px-2.5 hover:text-pear hover:border-pear active:text-pear transition-all cursor-pointer flex items-center gap-1.5"
          title="Flip board"
          aria-label="Flip board"
        >
          <span className="text-[13px] leading-none">&#x27F3;</span>
          <span className="hidden min-[400px]:inline">Flip</span>
        </button>
      </div>
    </div>
  );
}
