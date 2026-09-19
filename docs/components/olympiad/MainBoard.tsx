'use client';

import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Key, Dests } from 'chessground/types';
import type { DrawShape, DrawBrushes } from 'chessground/draw';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import type { PredictedMove } from '@/lib/play/types';
import { ARROW_BRUSH_COLORS, formatSfPoints, formatClock } from '@/lib/play/chess-utils';
import EvalBar from '@/components/play/EvalBar';
import PromotionModal from '@/components/play/modals/PromotionModal';
import { teamFlagUrl } from '@/lib/olympiad/flags';
import { sideScore, formatScore } from '@/lib/olympiad/result';

type SfTopMove = { san: string; evalCp: number; from: string; to: string };

// The Olympiad main board — a Chessground board for spectating someone
// else's already-played game, with the same Otter/Stockfish/played-move
// arrows and dual eval bars as /play's Analyze mode. Piece dragging is
// always on (legal moves only, via chess.js) so a viewer can explore "what
// if" continuations from any position; onUserMove reports each such move
// up to the parent, which owns tracking/unwinding that exploration branch
// (the "Back to Live Board" control lives in OlympiadHistoryPanel, not
// here). Owns its own Chessground instance and sizing, mirroring BoardColumn.tsx's board
// wrapper and page.tsx's Chessground init/sync effects, trimmed of every
// /play-only mode (match/editor/lobby).
export default function MainBoard({
  fen,
  lastMove,
  isFlipped,
  setIsFlipped,
  topMoves,
  sfTopMoves,
  playedMove,
  otterWinPct,
  otterWinPctText,
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
  onUserMove,
}: {
  fen: string;
  lastMove?: [string, string];
  isFlipped: boolean;
  setIsFlipped: (fn: (v: boolean) => boolean) => void;
  topMoves: PredictedMove[];
  sfTopMoves: SfTopMove[];
  playedMove?: { from: string; to: string } | null;
  // Single White-perspective eval bar, matching /play's BoardColumn — see
  // getOtterWhiteScore's derivation in page.tsx.
  otterWinPct: number;
  otterWinPctText: string;
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
  // Called after a manually dragged move is fully legal (and, for a
  // promotion, resolved) — hands the parent the resulting FEN plus the
  // move's UCI so it can track its own "exploration" branch off whatever
  // position was on screen. MainBoard owns the chess.js validation,
  // legal-dests computation and the promotion picker itself; the parent
  // never sees an illegal attempt.
  onUserMove: (newFen: string, moveUci: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const [boardPx, setBoardPx] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ orig: string; dest: string; color: 'w' | 'b' } | null>(null);

  // Applies a fully-resolved (legal, promotion-decided) move — used both
  // for ordinary moves and once a promotion piece has been picked. Always
  // re-derives the "before" position from the CURRENT `fen` prop (not a
  // stale closure) since this can fire well after the drag, once the
  // promotion modal resolves.
  const commitMove = (orig: string, dest: string, promotion: 'q' | 'r' | 'b' | 'n' | undefined) => {
    try {
      const c = new Chess(fen);
      const moveObj = c.move({ from: orig as Square, to: dest as Square, promotion });
      if (!moveObj) {
        cgRef.current?.set({ fen });
        return;
      }
      onUserMove(c.fen(), moveObj.from + moveObj.to + (moveObj.promotion || ''));
    } catch (_) {
      // Shouldn't happen — Chessground only offers drops chess.js already
      // certified as legal dests — but revert the optimistic drag rather
      // than leave the board showing an uncommitted position either way.
      cgRef.current?.set({ fen });
    }
  };

  // Chessground's own `after` event fires once a legal-per-dests move is
  // dropped; a pawn landing on the back rank still needs a piece choice
  // before it's actually legal, so that case detours through the modal
  // instead of committing immediately.
  const handleAfterMove = (orig: Key, dest: Key) => {
    let c: Chess;
    try {
      c = new Chess(fen);
    } catch (_) {
      return;
    }
    const piece = c.get(orig as unknown as Square);
    const isPromoRank = dest.endsWith('8') || dest.endsWith('1');
    if (piece?.type === 'p' && isPromoRank) {
      setPendingPromotion({ orig, dest, color: piece.color });
      return;
    }
    commitMove(orig, dest, undefined);
  };

  const resolvePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { orig, dest } = pendingPromotion;
    setPendingPromotion(null);
    commitMove(orig, dest, piece);
  };

  const cancelPromotion = () => {
    if (!pendingPromotion) return;
    setPendingPromotion(null);
    // Chessground already optimistically moved the pawn visually; revert.
    cgRef.current?.set({ fen });
  };

  // Initial Chessground instantiation. Movable state (dests/color/events)
  // is set here as an inert placeholder and kept live by the sync effect
  // below, same pattern as the drawable autoShapes.
  useEffect(() => {
    if (containerRef.current && !cgRef.current) {
      const cg = Chessground(containerRef.current, {
        fen,
        lastMove: lastMove as Key[] | undefined,
        orientation: isFlipped ? 'black' : 'white',
        viewOnly: false,
        movable: { free: false, color: undefined, dests: new Map(), events: {} },
        // 0, not chessground's own default of 3px — a picked-up piece
        // should snap to be centered under the cursor immediately on
        // mousedown, not only once the drag has already moved a few
        // pixels (the default also only drops to 0 automatically after
        // the FIRST drag of the session via autoDistance, so the very
        // first move always lagged without this).
        draggable: { distance: 0 },
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

  // Keep Chessground's POSITION in sync — fen/orientation plus the legal
  // destinations a manual drag is allowed to land on. Deliberately split
  // from the arrows effect below: this one runs chess.js move generation,
  // which only needs to happen when the position itself actually changes
  // (a real move, a history step, or a dragged exploration move), not on
  // every Otter/Stockfish tick — Stockfish alone can post many `info`
  // lines a second while searching, and re-running move generation plus a
  // full movable.dests rebuild on each one was exactly what made dragging
  // feel laggy while analysis was streaming in.
  useEffect(() => {
    if (!cgRef.current) return;

    // Board dragging is always on: this is a spectator board for someone
    // else's already-played game, but nothing stops exploring "what if"
    // continuations from any position, same as an analysis board — only
    // real chess moves (per chess.js) are ever accepted as dests.
    const dests: Dests = new Map();
    let turnColor: 'white' | 'black' = 'white';
    try {
      const c = new Chess(fen);
      turnColor = c.turn() === 'b' ? 'black' : 'white';
      c.moves({ verbose: true }).forEach((m) => {
        const orig = m.from as Key;
        if (!dests.has(orig)) dests.set(orig, []);
        dests.get(orig)!.push(m.to as Key);
      });
    } catch (_) {
      // Malformed fen (shouldn't happen) — leave movable disabled.
    }

    cgRef.current.set({
      fen,
      lastMove: lastMove as Key[] | undefined,
      orientation: isFlipped ? 'black' : 'white',
      turnColor,
      movable: { free: false, color: turnColor, dests, events: { after: handleAfterMove } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, lastMove, isFlipped]);

  // Keep the ANALYSIS ARROWS in sync — one per source, each its own brush,
  // matching /play's Analyze mode exactly: Otter's own top pick,
  // Stockfish's own top pick, and (when reviewing history instead of the
  // live edge) the move that was actually played next. This is the effect
  // that fires on every engine tick, so it does nothing beyond a cheap
  // drawable.autoShapes set — no chess.js, no movable rebuild — and never
  // touches the position Chessground is mid-drag on.
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

    cgRef.current.set({ drawable: { autoShapes: finalShapes } });
  }, [topMoves, sfTopMoves, playedMove]);

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
          text={otterWinPctText}
          title={`Otter win probability: ${otterWinPctText}`}
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

      {pendingPromotion && (
        <PromotionModal
          pendingPromotion={pendingPromotion}
          cancelPromotion={cancelPromotion}
          resolvePromotion={resolvePromotion}
        />
      )}
    </div>
  );
}
