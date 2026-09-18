'use client';

import { useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

// Manages both Stockfish workers used by /play:
//  - the "live" one (returned via `initStockfishWorker`/`stockfishRef`), which
//    drives the eval bar and the Stockfish-vs-Otter comparison panel, running
//    continuously against whatever position is on screen; and
//  - a fully separate "background" one (`bgStockfishRef`, via
//    `ensureBgStockfishWorker` + `evaluatePositionOnce`) used only by the
//    rating-curve sweep's move-quality classification, so it never competes
//    with or interrupts the live worker's own search.
//
// `activeTurnRef`/`currentFenRef`/`ignoreSearchLinesRef` are owned by the
// caller (they're written by the shared updateGameState path used by every
// mode, not just this hook) and passed in so the live worker's message
// handler always reads the position it's actually searching.
export function useStockfish(refs: {
  activeTurnRef: React.MutableRefObject<'w' | 'b'>;
  currentFenRef: React.MutableRefObject<string>;
  ignoreSearchLinesRef: React.MutableRefObject<boolean>;
}) {
  const { activeTurnRef, currentFenRef, ignoreSearchLinesRef } = refs;

  const stockfishRef = useRef<Worker | null>(null);
  const [stockfishEvalPct, setStockfishEvalPct] = useState<number>(50);
  // Otter-vs-Stockfish comparison panel in Analyze mode.
  const [sfTopMoves, setSfTopMoves] = useState<{ san: string; evalCp: number; from: string; to: string }[]>([]);
  const sfMultiPvBufferRef = useRef<Map<number, { move: string; scoreCp: number }>>(new Map());
  const [fenScores, setFenScores] = useState<Record<string, number>>({});

  // Stockfish posts one `info ... multipv` line per candidate PER DEPTH
  // while searching — often dozens a second at higher depths. Each line
  // used to synchronously re-derive the whole displayed list right there
  // in the worker's onmessage handler: sorting the multipv buffer AND
  // re-parsing every candidate move through chess.js (a fresh `new
  // Chess(fen)` + `.move()` per candidate) AND committing React state —
  // all real main-thread work, repeated on every single message. That's
  // frequent enough to visibly compete with the main thread for frame
  // budget, making anything interactively animated (like dragging a piece
  // on the board) feel laggy while analysis is streaming in.
  //
  // The fix is to defer ALL of it, not just the state commit: the message
  // handler below only ever touches the plain Map buffer (cheap), and
  // this flush — the sort + chess.js parsing + setState — runs at most
  // once per animation frame, no matter how many messages arrived in
  // between. A human can't tell 60 real-engine-updates/sec from "however
  // fast Stockfish actually posts them," so nothing about the live feel
  // is lost; the browser just gets its frame budget back.
  // The eval bar / fenScores also used to commit on every rank-1 message —
  // same frequency problem, just without the chess.js cost. Piggybacked on
  // the same per-frame flush below rather than given their own rAF, since
  // they arrive from the same messages and there's no reason to schedule
  // twice.
  const pendingEvalPctRef = useRef<number | null>(null);
  const pendingFenScoreRef = useRef<{ fen: string; score: number } | null>(null);
  const sfFlushRafRef = useRef<number | null>(null);
  const scheduleSfFlush = () => {
    if (sfFlushRafRef.current !== null) return;
    sfFlushRafRef.current = requestAnimationFrame(() => {
      sfFlushRafRef.current = null;

      if (pendingEvalPctRef.current !== null) {
        setStockfishEvalPct(pendingEvalPctRef.current);
        pendingEvalPctRef.current = null;
      }
      if (pendingFenScoreRef.current) {
        const { fen, score } = pendingFenScoreRef.current;
        pendingFenScoreRef.current = null;
        setFenScores(prev => ({ ...prev, [fen]: score }));
      }

      const baseFen = currentFenRef.current;
      if (!baseFen) return;
      const ranked = Array.from(sfMultiPvBufferRef.current.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v);
      try {
        const sanRanked = ranked.map(({ move, scoreCp }) => {
          const c = new Chess(baseFen);
          const mv = c.move({
            from: move.slice(0, 2) as Square,
            to: move.slice(2, 4) as Square,
            promotion: move.length > 4 ? (move.slice(4) as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          return mv ? { san: mv.san, evalCp: scoreCp, from: mv.from, to: mv.to } : null;
        }).filter((m): m is NonNullable<typeof m> => m !== null);
        setSfTopMoves(sanRanked);
      } catch (_) {
        // keep the previous list rather than flashing empty on a
        // transient parse failure
      }
    });
  };

  // Dedicated background worker for the rating-curve sweep's move-quality
  // classification, fully decoupled from the live eval bar / comparison
  // panel's own Stockfish worker.
  const bgStockfishRef = useRef<Worker | null>(null);

  const initStockfishWorker = async () => {
    try {
      const cache = await caches.open('otter-model-cache');
      const response = await cache.match('/stockfish.js');
      if (!response) return;

      const blob = await response.blob();
      const workerUrl = URL.createObjectURL(blob);
      const sfWorker = new Worker(workerUrl);

      sfWorker.onmessage = (e: MessageEvent) => {
        const line = e.data;

        if (line.includes('depth 1 ') || line.includes('depth 2 ')) {
          ignoreSearchLinesRef.current = false;
        }

        if (ignoreSearchLinesRef.current) {
          return;
        }

        // MultiPV is enabled (see initStockfishWorker), so each depth reports
        // one `info` line per candidate line (multipv 1..4). Buffer every
        // rank's move as it comes in, and commit the buffer to display after
        // *every* line — not just once at the final depth. Shallow depths
        // resolve in milliseconds and often disagree with each other, so
        // the panel and eval bar visibly flicker/reorder as the search
        // deepens before settling — reads as live engine thought rather
        // than a frozen "Running..." wait.
        if (line.startsWith('info') && line.includes(' pv ')) {
          const parts = line.split(' ');
          const mpvIdx = parts.indexOf('multipv');
          const rank = mpvIdx !== -1 ? parseInt(parts[mpvIdx + 1], 10) : 1;
          const pvIdx = parts.indexOf('pv');
          const firstMoveUci = pvIdx !== -1 ? parts[pvIdx + 1] : null;
          const isMate = line.includes('score mate');
          const isBlackTurn = activeTurnRef.current === 'b';

          let scoreVal = 0;
          if (line.includes('score cp')) {
            const cpIdx = parts.indexOf('cp');
            const cp = parseInt(parts[cpIdx + 1], 10);
            // Standardize centipawns relative to White's perspective
            scoreVal = isBlackTurn ? -cp : cp;
          } else if (isMate) {
            const mateIdx = parts.indexOf('mate');
            const mate = parseInt(parts[mateIdx + 1], 10);
            const normalizedMate = isBlackTurn ? -mate : mate;
            scoreVal = normalizedMate > 0 ? 100000 - normalizedMate : -100000 - normalizedMate;
          }

          if (firstMoveUci) {
            sfMultiPvBufferRef.current.set(rank, { move: firstMoveUci, scoreCp: scoreVal });
          }

          if (rank === 1) {
            if (isMate) {
              const isWhiteWinning = scoreVal > 0;
              pendingEvalPctRef.current = isWhiteWinning ? 100 : 0;
            } else {
              const maxCp = 400;
              const bounded = Math.max(-maxCp, Math.min(maxCp, scoreVal));
              pendingEvalPctRef.current = Math.round(((bounded + maxCp) / (maxCp * 2)) * 100);
            }

            const currentFen = currentFenRef.current;
            if (currentFen) {
              pendingFenScoreRef.current = { fen: currentFen, score: scoreVal };
            }
          }

          // Live-commit whatever ranks have reported so far this depth pass
          // (not necessarily all 4 yet) as the displayed candidate list —
          // deferred to the next animation frame; see scheduleSfFlush.
          if (currentFenRef.current) scheduleSfFlush();
        }
      };

      sfWorker.postMessage('uci');
      // Ask for the top 4 candidate lines instead of just the best one, so
      // the Analyze-mode comparison panel can show Stockfish's own top
      // moves alongside Otter's, not just a single position eval.
      sfWorker.postMessage('setoption name MultiPV value 4');
      sfWorker.postMessage('isready');
      stockfishRef.current = sfWorker;
    } catch (e) {
      console.error("Failed to init stockfish worker:", e);
    }
  };

  const ensureBgStockfishWorker = async (): Promise<Worker | null> => {
    if (bgStockfishRef.current) return bgStockfishRef.current;
    try {
      const cache = await caches.open('otter-model-cache');
      const response = await cache.match('/stockfish.js');
      if (!response) return null;
      const blob = await response.blob();
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      await new Promise<void>((resolve) => {
        worker.onmessage = (e: MessageEvent) => {
          if (e.data === 'readyok') resolve();
        };
        worker.postMessage('uci');
        worker.postMessage('isready');
      });
      bgStockfishRef.current = worker;
      return worker;
    } catch (e) {
      console.error("Failed to init background stockfish worker:", e);
      return null;
    }
  };

  // Raw centipawn score (White's perspective; mate scores offset ±100000,
  // matching the live worker's convention) for a single position, via the
  // dedicated background worker. Resolves undefined on failure/timeout.
  const evaluatePositionOnce = (worker: Worker, fen: string, depth: number): Promise<number | undefined> => {
    return new Promise((resolve) => {
      const isBlackTurn = fen.split(' ')[1] === 'b';
      let lastScore: number | undefined;
      const timeout = setTimeout(() => {
        worker.onmessage = null as any;
        resolve(lastScore);
      }, 8000);
      worker.onmessage = (e: MessageEvent) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        // No MultiPV option is set on this worker (stays at engine default
        // of 1), so every ' pv ' line already is the single best line —
        // no need to additionally filter on a "multipv 1" token some
        // engine builds omit entirely when MultiPV is left at its default.
        if (line.startsWith('info') && line.includes(' pv ')) {
          const parts = line.split(' ');
          if (line.includes('score cp')) {
            const cpIdx = parts.indexOf('cp');
            const cp = parseInt(parts[cpIdx + 1], 10);
            lastScore = isBlackTurn ? -cp : cp;
          } else if (line.includes('score mate')) {
            const mateIdx = parts.indexOf('mate');
            const mate = parseInt(parts[mateIdx + 1], 10);
            const normalizedMate = isBlackTurn ? -mate : mate;
            lastScore = normalizedMate > 0 ? 100000 - normalizedMate : -100000 - normalizedMate;
          }
        }
        if (line.startsWith('bestmove')) {
          clearTimeout(timeout);
          worker.onmessage = null as any;
          resolve(lastScore);
        }
      };
      worker.postMessage('stop');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  };

  return {
    stockfishRef,
    bgStockfishRef,
    sfMultiPvBufferRef,
    stockfishEvalPct,
    setStockfishEvalPct,
    sfTopMoves,
    setSfTopMoves,
    fenScores,
    setFenScores,
    initStockfishWorker,
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  };
}
