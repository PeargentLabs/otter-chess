'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import type { Square, Move } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape, DrawBrushes } from 'chessground/draw';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import type { Piece, PredictedMove, RatingCurveSeries, MatchRecord, AnalysisMove, BranchMove } from '@/lib/play/types';
import {
  fenToGrid,
  gridToFenPlacement,
  boardToTensor,
  mirrorSquare,
  mirrorMove,
  formatUciAsSan,
  formatSfPoints,
  classifyDrop,
  getBaseSeconds,
  getIncrementSeconds,
  getExpectedHumanTime,
  timeFormatToTc,
} from '@/lib/play/chess-utils';
import { useStockfish } from '@/hooks/play/useStockfish';
import { useOtterWorker } from '@/hooks/play/useOtterWorker';
import { useRatingCurve } from '@/hooks/play/useRatingCurve';
import BoardColumn from '@/components/play/BoardColumn';
import ActiveMatchSidebar from '@/components/play/ActiveMatchSidebar';
import LobbySidebar from '@/components/play/LobbySidebar';
import AnalyzeSidebar from '@/components/play/AnalyzeSidebar';
import EditorSidebar from '@/components/play/EditorSidebar';
import NotationColumn from '@/components/play/NotationColumn';
import FenPgnModal from '@/components/play/modals/FenPgnModal';
import PromotionModal from '@/components/play/modals/PromotionModal';
import DrawDeclinedModal from '@/components/play/modals/DrawDeclinedModal';
import ResignConfirmModal from '@/components/play/modals/ResignConfirmModal';
import SetupModal from '@/components/play/modals/SetupModal';
import ConfigMatchModal from '@/components/play/modals/ConfigMatchModal';
import AnalyzeGameModal from '@/components/play/modals/AnalyzeGameModal';
import Tour, { type TourStep } from '@/components/play/Tour';

// Guided walkthrough for Analyze mode's conditioning controls + output
// panels — a module-level constant since it's static, so it isn't
// recreated on every render. Each `target` matches a data-tour attribute
// in NotationColumn.tsx / AnalyzeSidebar.tsx.
const ANALYZE_TOUR_STEPS: TourStep[] = [
  {
    target: 'rating-bracket',
    title: 'Rating Bracket',
    description: "Sets the Elo bucket Otter's predictions are conditioned on for each side. Drag White or Black independently to see how a stronger or weaker player would be expected to move here.",
  },
  {
    target: 'history-window',
    title: 'History Window (k)',
    description: 'Controls how many prior plies (up to 20) the model gets to see before predicting the next move. Lower it to test how much Otter leans on recent history versus the raw position.',
  },
  {
    target: 'time-section',
    title: 'Time Format & Clock',
    description: "Otter is also conditioned on the time control and how much time is left on the clock. Pick a format and drag the sliders to see how time pressure shifts its predictions.",
  },
  {
    target: 'comparison-table',
    title: 'Otter vs Stockfish',
    description: "Side-by-side candidate moves: Otter's human-like predictions on the left, Stockfish's objective best lines (depth 13, no rating cap) on the right.",
  },
  {
    target: 'moves-by-rating',
    title: 'Moves by Rating',
    description: "Sweeps Otter's top candidate move across every rating bracket for this exact position, so you can see how the best move shifts — or doesn't — as playing strength increases.",
  },
  {
    target: 'ai-intuition',
    title: 'Otter AI Intuition',
    description: "A second, independently-trained output head: Otter's own from/to square guess, plus its subjective evaluation, check probability, and estimated human think time for this position.",
  },
];

export default function PlayPage() {
  // Engine & Asset Availability
  const [modelAvailable, setModelAvailable] = useState<boolean>(false);
  const [stockfishAvailable, setStockfishAvailable] = useState<boolean>(false);

  // Downloading States
  const [isDownloadingModel, setIsDownloadingModel] = useState<boolean>(false);
  const [modelProgress, setModelProgress] = useState<number>(0);
  const [isDownloadingSf, setIsDownloadingSf] = useState<boolean>(false);
  const [sfProgress, setSfProgress] = useState<number>(0);
  
  // Game Setup & Lobby States
  const [isMatchActive, setIsMatchActive] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [chosenSide, setChosenSide] = useState<'w' | 'b' | 'random'>('w');
  const [thinkingMode, setThinkingMode] = useState<'instant' | 'human'>('human');
  const [isThinking, setIsThinking] = useState<boolean>(false);

  // Active Game State
  const [game, setGame] = useState<Chess | null>(() => new Chess());
  const [board, setBoard] = useState<(Piece | null)[][]>(() => new Chess().board() as (Piece | null)[][]);
  const [historyMoves, setHistoryMoves] = useState<string[]>([]);
  const [historyMovesSan, setHistoryMovesSan] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleSquares, setPossibleSquares] = useState<string[]>([]);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [gameStatus, setGameStatus] = useState<string>("White to move");

  // Model Parameters
  const [playerRating, setPlayerRating] = useState<number>(1500);
  const [playerElo, setPlayerElo] = useState<number>(1500);
  const [opponentElo, setOpponentElo] = useState<number>(1500);
  const [timeControl, setTimeControl] = useState<string>("600+0");
  const [clockFraction, setClockFraction] = useState<number>(50); // percentage
  const [playerTime, setPlayerTime] = useState<number>(600);
  const [otterTime, setOtterTime] = useState<number>(600);

  // Model Loading & Execution State
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [showEngineLockedHint, setShowEngineLockedHint] = useState<boolean>(false);
  const [liveFenInput, setLiveFenInput] = useState<string>("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [livePgnInput, setLivePgnInput] = useState<string>("");
  const [ortLoaded, setOrtLoaded] = useState<boolean>(false);
  const [provider, setProvider] = useState<'webgpu' | 'wasm'>('wasm');
  const [webgpuSupported, setWebgpuSupported] = useState<boolean>(false);

  // Model Outputs
  const [winProbability, setWinProbability] = useState<number>(0.0);
  const [topMoves, setTopMoves] = useState<PredictedMove[]>([]);
  const [auxMovingPiece, setAuxMovingPiece] = useState<string>("-");
  const [auxCapturedPiece, setAuxCapturedPiece] = useState<string>("-");
  const [auxCheckProb, setAuxCheckProb] = useState<string>("-");
  const [auxFromTo, setAuxFromTo] = useState<string>("-");
  // The aux head's own 64-way from-square and 64-way to-square predictions
  // (aux_logits[13:77] and [77:141]) — 128 of the model's 141 auxiliary
  // output dims that were computed on every inference but never decoded or
  // shown anywhere. Trained independently from the policy head, so it can
  // (and sometimes does) point at a different move than Otter's own top
  // pick — that disagreement is itself a signal, not just a duplicate of
  // topMoves[0].
  const [auxIntuitionFrom, setAuxIntuitionFrom] = useState<string | null>(null);
  const [auxIntuitionFromConf, setAuxIntuitionFromConf] = useState<number>(0);
  const [auxIntuitionTo, setAuxIntuitionTo] = useState<string | null>(null);
  const [auxIntuitionToConf, setAuxIntuitionToConf] = useState<number>(0);
  const [modelPredMove, setModelPredMove] = useState<{ from: string; to: string } | null> (null);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [mobileNotationOpen, setMobileNotationOpen] = useState<boolean>(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ orig: string; dest: string; color: 'w' | 'b' } | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);
  const [drawDeclined, setDrawDeclined] = useState<boolean>(false);
  const [editorPositionError, setEditorPositionError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showFenPgnModal, setShowFenPgnModal] = useState<boolean>(false);
  // Player names/ratings parsed from a loaded PGN's headers, for Analyze
  // mode's board cards. Kept as separate state (not read off `game.header()`)
  // because `game` gets reconstructed from a bare FEN on every navigation
  // step (goToAnalysisMove), which would otherwise silently drop them.
  const [analysisWhiteName, setAnalysisWhiteName] = useState<string | null>(null);
  const [analysisBlackName, setAnalysisBlackName] = useState<string | null>(null);
  const [analysisWhiteElo, setAnalysisWhiteElo] = useState<string | null>(null);
  const [analysisBlackElo, setAnalysisBlackElo] = useState<string | null>(null);

  // Rating bracket Otter's predictions are conditioned on for each side
  // while in Analyze mode — independent of the Challenge Otter match
  // sliders. Defaulted (see applyDefaultAnalyzeElos) from the loaded PGN's
  // WhiteElo/BlackElo headers, or from the just-played match's configured
  // ratings when there's no PGN to read them from, then adjustable via the
  // two sliders at the top of the Analyze sidebar.
  const [analyzeWhiteElo, setAnalyzeWhiteElo] = useState<number>(1500);
  const [analyzeBlackElo, setAnalyzeBlackElo] = useState<number>(1500);

  // Analyze mode's guided walkthrough (see components/play/Tour.tsx) —
  // spotlights each conditioning control / output panel in turn.
  const [tourActive, setTourActive] = useState<boolean>(false);
  const [tourStepIdx, setTourStepIdx] = useState<number>(0);

  // Analyze mode's history-window (k) and time-control conditioning — same
  // reasoning as the rating brackets above: Analyze mode has no live match
  // clock or config to read a history length / time control from, so these
  // get their own sliders instead of silently reusing the (possibly stale)
  // Challenge Otter match state.
  const [analyzeHistoryK, setAnalyzeHistoryK] = useState<number>(20);
  const [analyzeTimeFormat, setAnalyzeTimeFormat] = useState<'blitz' | 'rapid' | 'classical'>('rapid');
  const [analyzeWhiteTime, setAnalyzeWhiteTime] = useState<number>(600);
  const [analyzeBlackTime, setAnalyzeBlackTime] = useState<number>(600);

  // Analysis Mode States
  const [isAnalyzeMode, setIsAnalyzeMode] = useState<boolean>(false);
  const [analysisMoves, setAnalysisMoves] = useState<AnalysisMove[]>([]);
  const [currentMoveIdx, setCurrentMoveIdx] = useState<number>(-1);
  // Variations played while stepped back into the middle of the loaded
  // game instead of at the end of it. The real line (analysisMoves) is
  // never touched by these — each branch is keyed by the real-line ply
  // index it diverged from (analysisMoves[baseIdx], or -1 for "before the
  // first move"). Unlike scratch state, these are kept around across
  // navigation — going back to the real line only changes which one (if
  // any) is being *viewed*, via activeBranchBase/branchViewIdx; the data
  // itself survives until a new game is loaded. Only one branch per
  // divergence point is kept (playing a different move from the same spot
  // again replaces it, rather than stacking sibling variations).
  const [branchesByBase, setBranchesByBase] = useState<Map<number, BranchMove[]>>(new Map());
  const [activeBranchBase, setActiveBranchBase] = useState<number | null>(null);
  const [branchViewIdx, setBranchViewIdx] = useState<number>(-1);
  // The currently-viewed branch's moves, if any — derived rather than its
  // own state so it can never drift out of sync with branchesByBase.
  const branchMoves = activeBranchBase !== null ? (branchesByBase.get(activeBranchBase) ?? []) : [];
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState<boolean>(false);
  const [analyzeInput, setAnalyzeInput] = useState<string>("");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisStartingFen, setAnalysisStartingFen] = useState<string>("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
  const [fenPredictions, setFenPredictions] = useState<Record<string, PredictedMove[]>>({});
  const [playedMoveEvaluation, setPlayedMoveEvaluation] = useState<string>("");
  const [similarityPct, setSimilarityPct] = useState<number>(0);

  // Board Editor States
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  // Defaults to 'move' (drag existing pieces around), not a piece-stamp
  // tool — otherwise every click/short-drag on entering the editor plants
  // a new pawn wherever you clicked, which reads as "I can't touch the
  // board without corrupting it."
  const [editorSelectedPiece, setEditorSelectedPiece] = useState<'erase' | 'move' | 'wK' | 'wQ' | 'wR' | 'wB' | 'wN' | 'wP' | 'bK' | 'bQ' | 'bR' | 'bB' | 'bN' | 'bP'>('move');
  const [editorMoveSource, setEditorMoveSource] = useState<string | null>(null);
  const [editorTurn, setEditorTurn] = useState<'w' | 'b'>('w');
  const [editorCastling, setEditorCastling] = useState({ wK: true, wQ: true, bK: true, bQ: true });
  const [isFreeform, setIsFreeform] = useState<boolean>(true);

  // refs to avoid stale closure bindings
  const activeTurnRef = useRef<'w' | 'b'>('w');
  const currentFenRef = useRef<string>("");
  const ignoreSearchLinesRef = useRef<boolean>(true);

  const {
    stockfishRef,
    bgStockfishRef,
    sfMultiPvBufferRef,
    stockfishEvalPct,
    sfTopMoves,
    setSfTopMoves,
    fenScores,
    initStockfishWorker,
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  } = useStockfish({ activeTurnRef, currentFenRef, ignoreSearchLinesRef });

  const {
    otterWorkerRef,
    policyMoveToIdRef,
    idToMoveRef,
    historyMoveToIdRef,
    modelLoaded,
    setModelLoaded,
    callOtterWorker,
    loadAndInitModelFromCache,
  } = useOtterWorker({ provider, initStockfishWorker });

  const containerRef = useRef<HTMLDivElement>(null);
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const [boardPx, setBoardPx] = useState<number | null>(null);
  const cgRef = useRef<Api | null>(null);
  const mouseDownCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const lastInferenceSeqRef = useRef<number>(0);
  // Always mirrors the latest `game`, readable from async callbacks (like
  // Otter's delayed move) without the staleness a captured closure would have.
  const gameRef = useRef<Chess | null>(null);

  // 1. Check cached engines & load match history on mount
  useEffect(() => {
    const initializePage = async () => {
      // Load Player Rating
      const savedRating = localStorage.getItem('otter-player-rating');
      if (savedRating) {
        setPlayerRating(parseInt(savedRating, 10));
      }

      // Check WebGPU support
      if (typeof window !== 'undefined' && (navigator as Navigator & { gpu?: unknown }).gpu) {
        setWebgpuSupported(true);
        setProvider('webgpu');
      }

      // Load Match History
      const history = localStorage.getItem('otter-match-history');
      if (history) {
        try {
          setMatchHistory(JSON.parse(history));
        } catch (e) {
          console.error(e);
        }
      }

      // Check Cache Storage
      try {
        const cache = await caches.open('otter-model-cache');
        const modelRes = await cache.match('/policy_model.onnx');
        const sfRes = await cache.match('/stockfish.js');
        
        const hasModel = !!modelRes;
        const hasSf = !!sfRes;
        
        setModelAvailable(hasModel);
        setStockfishAvailable(hasSf);

        if (!hasModel || !hasSf) {
          // Engines missing — open the download dialog immediately instead
          // of leaving it to a small bottom-corner toast that's easy to
          // miss (especially on mobile, where it's not even in view until
          // you scroll).
          setShowSetupModal(true);
        }
        // Session warm-up itself happens in the effect below, which reacts
        // to modelAvailable/stockfishAvailable once they're both true —
        // that covers both this already-cached case and the fresh-download
        // case in one place.
      } catch (err) {
        console.error("Cache check failed:", err);
      }
    };

    initializePage();
  }, []);

  // Warm up the Otter worker exactly once both assets are available. This
  // used to be triggered ad hoc from inside downloadOtterModel/
  // downloadStockfish (each checking "is the other one already done?"),
  // but those checks read the *other* download's state through a stale
  // closure — when both downloads run concurrently (the normal case: the
  // setup modal has both "Download" buttons right there to click in a row),
  // each one's snapshot of the other's availability was still false, so
  // neither ever called it and the worker was never created. Reacting to
  // the state here always sees the current values.
  const modelInitStartedRef = useRef(false);
  useEffect(() => {
    if (modelAvailable && stockfishAvailable && !modelInitStartedRef.current) {
      modelInitStartedRef.current = true;
      loadAndInitModelFromCache();
    }
  }, [modelAvailable, stockfishAvailable]);

  // Keep gameRef mirroring the latest `game` on every render.
  useEffect(() => {
    gameRef.current = game;
  });

  // 3. Automated Otter Game Loop
  useEffect(() => {
    if (!isMatchActive || !game || !modelLoaded || isThinking) return;

    const turn = game.turn();
    if (turn !== playerColor) {
      const fenAtStart = game.fen();

      const runOtterTurn = async () => {
        setIsThinking(true);
        try {
          const currentMoves = game.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
          const inferenceResult = await runModelInference(game, currentMoves);

          // The board may have moved on while inference was running — e.g. a
          // takeback, or the match ending via resign/draw. Applying Otter's
          // move to a position it was never computed for would corrupt the
          // game, so bail out instead.
          if (gameRef.current?.fen() !== fenAtStart) {
            setIsThinking(false);
            return;
          }

          if (inferenceResult && inferenceResult.length > 0) {
            const bestMove = inferenceResult[0].move;
            const delaySec = getExpectedHumanTime(
              inferenceResult,
              timeControl,
              otterTime,
              currentMoves.length,
              game.moves().length,
            );
            // Humans don't move on a metronome, and they can't physically move
            // a piece instantly either — scatter the estimate, then floor it.
            const jitter = 0.8 + Math.random() * 0.45;
            const minimumDelayMs = 200 + Math.random() * 100;
            const thinkingDelay = thinkingMode === 'human'
              ? Math.max(delaySec * 1000 * jitter, minimumDelayMs)
              : 50;

            setTimeout(() => {
              // Re-check right before applying too — the position could have
              // changed during the thinking delay itself.
              if (gameRef.current?.fen() === fenAtStart) {
                playModelMove(bestMove);
              }
              setIsThinking(false);
            }, thinkingDelay);
          } else {
            setIsThinking(false);
          }
        } catch (e) {
          console.error("Otter move generation failed:", e);
          setIsThinking(false);
        }
      };

      runOtterTurn();
    }
  }, [historyMoves, isMatchActive, modelLoaded, playerColor, thinkingMode, otterTime, timeControl]);

  // Re-run inference when Elo, time control, or clock fraction changes
  useEffect(() => {
    if (game && modelLoaded && isMatchActive && game.turn() === playerColor) {
      runModelInference(game, historyMoves);
    }
  }, [playerElo, opponentElo, timeControl, clockFraction, modelLoaded]);

  // Same, but for Analyze mode's own rating-bracket, history-window, and
  // time-control sliders — refreshes the Otter · Human panel immediately as
  // any of them move, instead of waiting for the next move/navigation to
  // pick up the new conditioning.
  useEffect(() => {
    if (game && modelLoaded && isAnalyzeMode) {
      runModelInference(game, historyMoves);
    }
  }, [analyzeWhiteElo, analyzeBlackElo, analyzeHistoryK, analyzeTimeFormat, analyzeWhiteTime, analyzeBlackTime, isAnalyzeMode, modelLoaded]);

  // Switching time formats resets both clocks to a full bar for the new
  // format, rather than carrying over a raw-second value that wouldn't make
  // sense against the new base (e.g. "550s left" in Classical right after
  // switching from Blitz's 300s base).
  useEffect(() => {
    const base = getBaseSeconds(timeFormatToTc(analyzeTimeFormat));
    setAnalyzeWhiteTime(base);
    setAnalyzeBlackTime(base);
  }, [analyzeTimeFormat]);

  // First-time visitors get the guided tour automatically on their first
  // trip into Analyze mode — a short delay lets the panels finish laying
  // out so the tour's first spotlight measures the right position. Gated
  // on a localStorage flag so it only ever fires once per browser; the "?"
  // button in AnalyzeSidebar's header re-runs it on demand after that.
  useEffect(() => {
    if (!isAnalyzeMode) return;
    let seen = true;
    try {
      seen = localStorage.getItem('otter-analyze-tour-seen') === '1';
    } catch (_) {
      // localStorage unavailable (e.g. private browsing) — skip auto-tour
    }
    if (seen) return;
    const t = setTimeout(() => {
      setTourStepIdx(0);
      setTourActive(true);
      // The tour's left-panel targets live inside the mobile collapse —
      // display:none while closed, so the spotlight can't measure them.
      // No-op on desktop where the panel is always visible.
      setMobileNotationOpen(true);
      try {
        localStorage.setItem('otter-analyze-tour-seen', '1');
      } catch (_) {
        // ignore — worst case the tour re-triggers next visit
      }
    }, 700);
    return () => clearTimeout(t);
  }, [isAnalyzeMode]);

  // Real-time ticking clock loop. Reads gameRef instead of closing over
  // `game` directly (and doesn't list `game` as a dependency), so the
  // interval runs continuously for the whole match instead of tearing down
  // and rebuilding on every move — which used to reset setInterval's 1s
  // phase each time, losing up to ~1s of ticking after every move and
  // making the displayed clock drift slower than real elapsed time.
  useEffect(() => {
    if (!isMatchActive) return;

    const interval = setInterval(() => {
      const currentGame = gameRef.current;
      if (!currentGame || currentGame.isGameOver()) return;

      const turn = currentGame.turn();
      if (turn === playerColor) {
        setPlayerTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setGameStatus("Time's up — you lost on time.");
            setTimeout(() => recordMatch('loss'), 1800);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setOtterTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setGameStatus("Time's up — Otter lost on time.");
            setTimeout(() => recordMatch('win'), 1800);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMatchActive, playerColor]);

  // Helper to parse destinations for Chessground
  const getDests = (c: Chess): Map<Key, Key[]> => {
    const dests = new Map<Key, Key[]>();
    c.moves({ verbose: true }).forEach(m => {
      if (!dests.has(m.from as Key)) {
        dests.set(m.from as Key, []);
      }
      dests.get(m.from as Key)!.push(m.to as Key);
    });
    return dests;
  };

  // Handle move events fired by Chessground drag-and-drop
  const handleMoveFromCg = (orig: string, dest: string) => {
    if (!game) return;

    // Detect promotion — defer to the themed picker modal instead of
    // blocking synchronously on window.prompt(). The rest of the move
    // logic resumes in applyMove() once the user picks a piece (or reverts
    // the optimistic Chessground move if the picker is cancelled).
    const pieceObj = game.get(orig as Square);
    const isPawn = pieceObj && pieceObj.type === 'p';
    const isPromoRank = dest[1] === '8' || dest[1] === '1';

    if (isPawn && isPromoRank) {
      setPendingPromotion({ orig, dest, color: pieceObj!.color });
      return;
    }

    applyMove(orig, dest, undefined);
  };

  const resolvePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { orig, dest } = pendingPromotion;
    setPendingPromotion(null);
    applyMove(orig, dest, piece);
  };

  const cancelPromotion = () => {
    if (!pendingPromotion) return;
    setPendingPromotion(null);
    // Chessground already optimistically moved the pawn visually; revert it
    // since no move was actually committed to game state.
    if (cgRef.current && game) {
      cgRef.current.set({ fen: game.fen() });
    }
  };

  const applyMove = (orig: string, dest: string, promotionPiece: 'q' | 'r' | 'b' | 'n' | undefined) => {
    if (!game) return;

    const isLobbyOrAnalysis = !isMatchActive;
    if (isLobbyOrAnalysis) {
      if (isEditorMode && isFreeform) {
        const currentFen = currentFenRef.current || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        const grid = fenToGrid(currentFen);
        
        const origFile = orig.charCodeAt(0) - 97;
        const origRank = 8 - parseInt(orig[1], 10);
        const destFile = dest.charCodeAt(0) - 97;
        const destRank = 8 - parseInt(dest[1], 10);
        
        const piece = grid[origRank]?.[origFile];
        if (piece) {
          grid[origRank][origFile] = "";
          
          const isPawn = piece[1] === 'p';
          if (isPawn && (destRank === 0 || destRank === 7)) {
            const promo = promotionPiece || 'q';
            grid[destRank][destFile] = piece[0] + promo;
          } else {
            grid[destRank][destFile] = piece;
          }
          
          const fields = currentFen.split(' ');
          fields[0] = gridToFenPlacement(grid);
          const newFen = fields.join(' ');
          
          currentFenRef.current = newFen;
          setLiveFenInput(newFen);
          setAnalysisMoves([]);
          setCurrentMoveIdx(-1);
          setBranchesByBase(new Map());
          setActiveBranchBase(null);
          setBranchViewIdx(-1);
          setEditorMoveSource(null);

          try {
            const newGame = new Chess(newFen);
            setGame(newGame);
          } catch (_) {}
        }
        return;
      }

      if (branchViewIdx !== -1 && activeBranchBase !== null) {
        // Already on a branch — extend it, or re-branch again from a point
        // further back inside it. Only that saved branch changes; the
        // real line (analysisMoves) still isn't touched.
        const branchBase = branchMoves.slice(0, branchViewIdx + 1);
        const beforeFen = branchBase[branchBase.length - 1].fen;
        const temp = new Chess(beforeFen);
        let moveObj: Move | null = null;
        try {
          moveObj = temp.move({ from: orig, to: dest, promotion: promotionPiece });
        } catch (e) {
          // Illegal move
        }
        if (moveObj) {
          const newMove = {
            san: moveObj.san,
            uci: moveObj.from + moveObj.to + (moveObj.promotion || ''),
            fen: temp.fen(),
            from: moveObj.from,
            to: moveObj.to,
          };
          const updatedBranch = [...branchBase, newMove];
          const baseIdx = activeBranchBase;
          setBranchesByBase(prev => {
            const next = new Map(prev);
            next.set(baseIdx, updatedBranch);
            return next;
          });
          setBranchViewIdx(updatedBranch.length - 1);
          setGame(temp);
          updateGameState(temp);
        } else {
          if (cgRef.current) {
            cgRef.current.set({ fen: game.fen() });
          }
        }
        return;
      }

      if (currentMoveIdx < analysisMoves.length - 1) {
        // Stepped back into the middle of the real line. If this is
        // exactly the move that was actually played next, just continue
        // along the real line instead of forking off a redundant branch
        // that duplicates it.
        const nextRealMove = analysisMoves[currentMoveIdx + 1];
        const playedUci = orig + dest + (promotionPiece || '');
        if (nextRealMove && nextRealMove.uci === playedUci) {
          goToAnalysisMove(currentMoveIdx + 1);
          return;
        }

        // Otherwise it's genuinely different — branch off instead of
        // overwriting the real continuation.
        const beforeFen = currentMoveIdx === -1 ? analysisStartingFen : analysisMoves[currentMoveIdx].fen;
        const temp = new Chess(beforeFen);
        let moveObj: Move | null = null;
        try {
          moveObj = temp.move({
            from: orig,
            to: dest,
            promotion: promotionPiece
          });
        } catch (e) {
          // Illegal move
        }
        if (moveObj) {
          const newMove = {
            san: moveObj.san,
            uci: moveObj.from + moveObj.to + (moveObj.promotion || ''),
            fen: temp.fen(),
            from: moveObj.from,
            to: moveObj.to,
          };
          const baseIdx = currentMoveIdx;
          setBranchesByBase(prev => {
            const next = new Map(prev);
            next.set(baseIdx, [newMove]);
            return next;
          });
          setActiveBranchBase(baseIdx);
          setBranchViewIdx(0);
          setGame(temp);
          updateGameState(temp);
        } else {
          if (cgRef.current) {
            cgRef.current.set({ fen: game.fen() });
          }
        }
        return;
      }
    }

    let moveObj: Move | null = null;
    let newGame: Chess | null = null;
    try {
      newGame = cloneGameWithHistory(game);
      moveObj = newGame.move({
        from: orig,
        to: dest,
        promotion: promotionPiece
      });
    } catch (e) {
      // Illegal move
    }

    if (moveObj && newGame) {
      if (isLobbyOrAnalysis) {
        const newMove = {
          san: moveObj.san,
          uci: moveObj.from + moveObj.to + (moveObj.promotion || ''),
          fen: newGame.fen(),
          from: moveObj.from,
          to: moveObj.to,
        };
        const updatedMoves = [...analysisMoves, newMove];
        setAnalysisMoves(updatedMoves);
        setCurrentMoveIdx(updatedMoves.length - 1);
      }
      setGame(newGame);
      updateGameState(newGame);
    } else {
      if (cgRef.current) {
        cgRef.current.set({ fen: game.fen() });
      }
    }
  };

  const handleMoveFromCgRef = useRef(handleMoveFromCg);
  useEffect(() => {
    handleMoveFromCgRef.current = handleMoveFromCg;
  });

  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownCoordsRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleBoardMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditorMode || !containerRef.current || !game || !mouseDownCoordsRef.current) return;
    
    const dx = e.clientX - mouseDownCoordsRef.current.x;
    const dy = e.clientY - mouseDownCoordsRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    mouseDownCoordsRef.current = null;
    
    // If it was a drag, ignore it
    if (distance > 5) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let fileIdx = Math.floor((x / rect.width) * 8);
    let rankIdx = Math.floor((y / rect.height) * 8);
    
    fileIdx = Math.max(0, Math.min(7, fileIdx));
    rankIdx = Math.max(0, Math.min(7, rankIdx));
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const file = isFlipped ? files[7 - fileIdx] : files[fileIdx];
    const rank = isFlipped ? (rankIdx + 1) : (8 - rankIdx);
    
    const square = `${file}${rank}`;
    handleEditorSquareClick(square);
  };

  const validateAndApplyEditorPosition = (): boolean => {
    const currentFen = liveFenInput || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    try {
      const cleanChess = new Chess(currentFen);
      setGame(cleanChess);
      setLiveFenInput(cleanChess.fen());
      updateGameState(cleanChess);
      setEditorPositionError(null);
      return true;
    } catch (e) {
      setEditorPositionError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  // Chess.js only tracks .history() for moves made via .move()/.undo() on
  // that exact instance — reconstructing via `new Chess(fen)` starts fresh
  // with an empty history, which is why the match move list kept resetting
  // to show only the latest move. This clones `source` with its move
  // history intact (matches always start from the standard position, so
  // replaying its PGN reconstructs it faithfully) so callers can branch off
  // it — via .move() or .undo() — without losing everything before it.
  const cloneGameWithHistory = (source: Chess): Chess => {
    const clone = new Chess();
    const pgn = source.pgn().trim();
    if (pgn) {
      try {
        clone.loadPgn(pgn);
        return clone;
      } catch (_) {
        // fall through to FEN-only clone below
      }
    }
    clone.load(source.fen());
    return clone;
  };

  const syncGameFromFen = (fen: string) => {
    try {
      const c = new Chess(fen);
      setGame(c);
      if (cgRef.current) {
        cgRef.current.set({ fen });
      }
    } catch (_) {}
  };

  const handleEditorSquareClick = (square: string) => {
    if (!isFreeform) return;
    
    const currentFen = currentFenRef.current || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const grid = fenToGrid(currentFen);
    
    const fileIdx = square.charCodeAt(0) - 97;
    const rankIdx = 8 - parseInt(square[1], 10);

    if (editorSelectedPiece === 'move') {
      if (editorMoveSource === null) {
        if (grid[rankIdx][fileIdx] !== "") {
          setEditorMoveSource(square);
        }
      } else if (editorMoveSource === square) {
        setEditorMoveSource(null);
      } else {
        const srcFileIdx = editorMoveSource.charCodeAt(0) - 97;
        const srcRankIdx = 8 - parseInt(editorMoveSource[1], 10);
        const piece = grid[srcRankIdx][srcFileIdx];
        if (piece) {
          grid[srcRankIdx][srcFileIdx] = "";
          grid[rankIdx][fileIdx] = piece;
          const fields = currentFen.split(' ');
          fields[0] = gridToFenPlacement(grid);
          const newFen = fields.join(' ');
          currentFenRef.current = newFen;
          setLiveFenInput(newFen);
          setEditorMoveSource(null);
          syncGameFromFen(newFen);
        }
      }
      return;
    }
    
    if (editorSelectedPiece === 'erase') {
      grid[rankIdx][fileIdx] = "";
    } else {
      const type = editorSelectedPiece.slice(1).toLowerCase();
      const color = editorSelectedPiece[0];
      grid[rankIdx][fileIdx] = color + type;
    }
    
    const fields = currentFen.split(' ');
    fields[0] = gridToFenPlacement(grid);
    const newFen = fields.join(' ');
    
    currentFenRef.current = newFen;
    setLiveFenInput(newFen);
    setAnalysisMoves([]);
    setCurrentMoveIdx(-1);
    setBranchesByBase(new Map());
    setActiveBranchBase(null);
    setBranchViewIdx(-1);
    setEditorMoveSource(null);
    syncGameFromFen(newFen);
  };

  // 1. Initial Chessground instantiation
  useEffect(() => {
    if (containerRef.current && game && !cgRef.current) {
      const history = game.history({ verbose: true });
      const lastMove = history.length > 0
        ? [history[history.length - 1].from, history[history.length - 1].to]
        : undefined;

      const cg = Chessground(containerRef.current, {
        fen: game.fen(),
        lastMove: lastMove as Key[] | undefined,
        orientation: isFlipped ? 'black' : 'white',
        turnColor: game.turn() === 'w' ? 'white' : 'black',
        movable: {
          free: isEditorMode && isFreeform && editorSelectedPiece === 'move',
          color: (isMatchActive || isAnalyzeMode || isEditorMode)
            ? (isMatchActive ? (playerColor === 'w' ? 'white' : 'black') : 'both')
            : undefined,
          dests: (isMatchActive || isAnalyzeMode || isEditorMode)
            ? (isEditorMode 
                ? (isFreeform ? undefined : getDests(game)) 
                : (isMatchActive 
                    ? (game.turn() === playerColor ? getDests(game) : new Map()) 
                    : getDests(game)))
            : new Map(),
        },
        events: {
          move: (orig, dest) => {
            handleMoveFromCgRef.current(orig, dest);
          }
        },
        drawable: {
          // Manual right-click-drag arrows live in `drawable.shapes` and
          // are expected to clear on the next board click — that's normal
          // chess-site UX. Otter's predicted-move arrows and the checkmate
          // king highlights are programmatic, so they're kept in the
          // separate `drawable.autoShapes` array instead (see the sync
          // effect below): chessground's click-clear only ever touches
          // `shapes`, never `autoShapes`, so ours survive clicks that
          // wipe the user's own hand-drawn ones.
          enabled: true,
          // Custom brushes so each arrow source reads as itself at a
          // glance: Otter in brand green, Stockfish in a light, friendly
          // red (visible without reading as an alarm/error colour), and
          // the player's actual move (when reviewing a finished/loaded
          // game) in yellow.
          brushes: {
            otter: { key: 'otter', color: '#5C8A2E', opacity: 1, lineWidth: 10 },
            stockfish: { key: 'stockfish', color: '#F0605F', opacity: 1, lineWidth: 10 },
            played: { key: 'played', color: '#EAB308', opacity: 1, lineWidth: 10 },
          } as Partial<DrawBrushes> as DrawBrushes,
        }
      });
      cgRef.current = cg;
    }
  }, [game]);

  // 1b. Chessground always snaps its rendered board to a multiple of 8
  // device pixels (see node_modules/chessground/src/render.ts updateBounds)
  // to keep squares crisp. If its container isn't already sized to a
  // multiple of 8, that snap leaves a visible gap on the right/bottom edges
  // — this is what shows up as "extra padding" around the board. Rather
  // than fight that, we measure the wrapper's actual content-box size and
  // pin it to the nearest multiple of 8 ourselves, so chessground's own
  // snap becomes a no-op. This also keeps chessground's memoized bounds
  // fresh (redrawAll below) whenever that size changes, e.g. on window
  // resize, which is otherwise never re-measured on its own.
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

  // 2. Keep Chessground options in sync with external game changes and draw shapes (predictions & checkmate)
  useEffect(() => {
    if (cgRef.current && game) {
      const finalShapes: DrawShape[] = [];

      if (isEditorMode && isFreeform && editorSelectedPiece === 'move' && editorMoveSource) {
        finalShapes.push({ orig: editorMoveSource as Key, brush: 'blue' });
      }

      if (game.isGameOver()) {
        if (game.isCheckmate()) {
          const squares: Square[] = [
            'a1','b1','c1','d1','e1','f1','g1','h1',
            'a2','b2','c2','d2','e2','f2','g2','h2',
            'a3','b3','c3','d3','e3','f3','g3','h3',
            'a4','b4','c4','d4','e4','f4','g4','h4',
            'a5','b5','c5','d5','e5','f5','g5','h5',
            'a6','b6','c6','d6','e6','f6','g6','h6',
            'a7','b7','c7','d7','e7','f7','g7','h7',
            'a8','b8','c8','d8','e8','f8','g8','h8'
          ];
          let whiteKing: string | undefined;
          let blackKing: string | undefined;
          for (const sq of squares) {
            const piece = game.get(sq);
            if (piece && piece.type === 'k') {
              if (piece.color === 'w') whiteKing = sq;
              else blackKing = sq;
            }
          }
          const loserColor = game.turn();
          const loserKing = loserColor === 'w' ? whiteKing : blackKing;
          const winnerKing = loserColor === 'w' ? blackKing : whiteKing;
          if (loserKing) finalShapes.push({ orig: loserKing as Key, brush: 'red' });
          if (winnerKing) finalShapes.push({ orig: winnerKing as Key, brush: 'green' });
        }
      } else if (isAnalyzeMode) {
        // One arrow per source instead of Otter's whole top-3 — each in its
        // own colour so it's obvious at a glance who's suggesting what:
        // Otter's own top pick, Stockfish's own top pick, and (when
        // reviewing an already-played game, not mid-branch) the move that
        // was actually played next.
        if (topMoves.length > 0) {
          const m = topMoves[0];
          finalShapes.push({
            orig: m.move.slice(0, 2) as Key,
            dest: m.move.slice(2, 4) as Key,
            brush: 'otter',
          });
        }
        if (sfTopMoves.length > 0) {
          const m = sfTopMoves[0];
          finalShapes.push({ orig: m.from as Key, dest: m.to as Key, brush: 'stockfish' });
        }
        if (branchViewIdx === -1 && currentMoveIdx < analysisMoves.length - 1) {
          const actual = analysisMoves[currentMoveIdx + 1];
          if (actual) {
            finalShapes.push({ orig: actual.from as Key, dest: actual.to as Key, brush: 'played' });
          }
        }
      }

      const history = game.history({ verbose: true });
      const lastMove = history.length > 0
        ? [history[history.length - 1].from, history[history.length - 1].to]
        : undefined;

      cgRef.current.set({
        fen: (isEditorMode && isFreeform) ? liveFenInput : game.fen(),
        lastMove: lastMove as Key[] | undefined,
        orientation: isFlipped ? 'black' : 'white',
        turnColor: game.turn() === 'w' ? 'white' : 'black',
        movable: {
          free: isEditorMode && isFreeform && editorSelectedPiece === 'move',
          color: (isMatchActive || isAnalyzeMode || isEditorMode)
            ? (isMatchActive ? (playerColor === 'w' ? 'white' : 'black') : 'both')
            : undefined,
          dests: (isMatchActive || isAnalyzeMode || isEditorMode)
            ? (isEditorMode 
                ? (isFreeform ? undefined : getDests(game)) 
                : (isMatchActive 
                    ? (game.turn() === playerColor ? getDests(game) : new Map()) 
                    : getDests(game)))
            : new Map(),
        },
        drawable: {
          autoShapes: finalShapes
        }
      });
    }
  }, [historyMoves, isFlipped, playerColor, topMoves, sfTopMoves, analysisMoves, currentMoveIdx, branchViewIdx, isMatchActive, isAnalyzeMode, isEditorMode, isFreeform, game, liveFenInput, editorSelectedPiece, editorMoveSource]);

  // Check if both engines are fully ready
  const enginesReady = modelAvailable && stockfishAvailable;

  // Brief hint shown when a gated lobby action is clicked before the
  // engines have finished downloading.
  const engineLockedHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showEngineLockedNotice = () => {
    setShowEngineLockedHint(true);
    if (engineLockedHintTimeout.current) clearTimeout(engineLockedHintTimeout.current);
    engineLockedHintTimeout.current = setTimeout(() => setShowEngineLockedHint(false), 2800);
  };
  useEffect(() => () => {
    if (engineLockedHintTimeout.current) clearTimeout(engineLockedHintTimeout.current);
  }, []);

  // Download Otter Model (31MB)
  const downloadOtterModel = async () => {
    if (isDownloadingModel) return;
    setIsDownloadingModel(true);
    setDownloadError(null);
    setModelProgress(0);
    try {
      const cache = await caches.open('otter-model-cache');
      const res = await fetch('https://huggingface.co/peargentlabs/otter-chess/resolve/main/model_fp16.onnx');
      if (!res.body) throw new Error("Null response body");

      const contentLength = res.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 31 * 1024 * 1024;
      const reader = res.body.getReader();
      let loaded = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setModelProgress(Math.min(99, Math.round((loaded / total) * 100)));
      }

      const blob = new Blob(chunks as BlobPart[]);
      const cacheResponse = new Response(blob, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': blob.size.toString() }
      });
      await cache.put('/policy_model.onnx', cacheResponse);
      
      setModelAvailable(true);
      setModelProgress(100);
    } catch (err) {
      console.error("Otter download failed:", err);
      setDownloadError("Failed to download the Otter Chess model. Please check your connection and try again.");
    } finally {
      setIsDownloadingModel(false);
    }
  };

  // Download Stockfish Engine (1.5MB)
  const downloadStockfish = async () => {
    if (isDownloadingSf) return;
    setIsDownloadingSf(true);
    setDownloadError(null);
    setSfProgress(0);
    try {
      const cache = await caches.open('otter-model-cache');
      const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
      if (!res.body) throw new Error("Null response body");

      const contentLength = res.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 1.5 * 1024 * 1024;
      const reader = res.body.getReader();
      let loaded = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setSfProgress(Math.min(99, Math.round((loaded / total) * 100)));
      }

      const blob = new Blob(chunks as BlobPart[]);
      const cacheResponse = new Response(blob, {
        headers: { 'content-type': 'application/javascript', 'content-length': blob.size.toString() }
      });
      await cache.put('/stockfish.js', cacheResponse);
      
      setStockfishAvailable(true);
      setSfProgress(100);
    } catch (err) {
      console.error("Stockfish download failed:", err);
      setDownloadError("Failed to download Stockfish. Please check your connection and try again.");
    } finally {
      setIsDownloadingSf(false);
    }
  };

  // Start configured match
  const startMatch = () => {
    if (!game) return;
    
    // Resolve color
    const side: 'w' | 'b' = chosenSide === 'random' 
      ? (Math.random() < 0.5 ? 'w' : 'b') 
      : chosenSide;
    setPlayerColor(side);
    setIsFlipped(side === 'b');

    const baseSec = getBaseSeconds(timeControl);
    setPlayerTime(baseSec);
    setOtterTime(baseSec);
    
    // Reset game state
    const cleanChess = new Chess();
    setGame(cleanChess);
    setHistoryMoves([]);
    setHistoryMovesSan([]);
    setSelectedSquare(null);
    setPossibleSquares([]);
    setTopMoves([]);
    setWinProbability(0.0);
    setAuxMovingPiece("-");
    setAuxCapturedPiece("-");
    setAuxCheckProb("-");
    setAuxFromTo("-");
    setModelPredMove(null);
    
    updateGameState(cleanChess);
    setIsConfigModalOpen(false);
    setIsMatchActive(true);
    if (cgRef.current) {
      cgRef.current.set({
        lastMove: undefined,
        drawable: {
          shapes: [],
          autoShapes: []
        }
      });
    }
  };

  // Resign match
  const resignMatch = () => {
    setShowResignConfirm(false);
    recordMatch('loss');
  };

  // Shared exit handlers — used by both the in-app Exit/Cancel buttons and
  // the browser/mobile back-button handling below, so the two paths can
  // never drift out of sync with each other.
  const exitAnalyzeMode = () => {
    setIsAnalyzeMode(false);
    setAnalysisMoves([]);
    setCurrentMoveIdx(-1);
    setBranchesByBase(new Map());
    setActiveBranchBase(null);
    setBranchViewIdx(-1);
    resetBoard();
  };

  const exitEditorMode = () => {
    setIsEditorMode(false);
    resetBoard();
  };

  // Browser/mobile back-button handling. Without this, pressing back while
  // in Analyze/Match/Editor mode leaves /play entirely (e.g. straight to
  // Home) instead of first backing out to the Lobby, which isn't how any of
  // these sub-views feel like they should behave. Approach: push a history
  // checkpoint (same URL, just a new entry) whenever entering one of these
  // modes; a back-press then lands on that checkpoint as a popstate event
  // instead of actually leaving the page, and we use it to trigger the same
  // exit each mode's own button already performs. If the user exits via that
  // button instead of the back button, we consume the now-unneeded
  // checkpoint ourselves via history.back() so it doesn't linger and eat an
  // extra back-press later.
  const wasInSubViewRef = useRef(false);
  const suppressNextPopRef = useRef(false);

  useEffect(() => {
    const inSubView = isAnalyzeMode || isMatchActive || isEditorMode;
    const wasInSubView = wasInSubViewRef.current;

    if (inSubView && !wasInSubView) {
      window.history.pushState({ otterSubView: true }, '', window.location.href);
    } else if (!inSubView && wasInSubView) {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false;
      } else {
        window.history.back();
      }
    }
    wasInSubViewRef.current = inSubView;
  }, [isAnalyzeMode, isMatchActive, isEditorMode]);

  useEffect(() => {
    const handlePopState = () => {
      if (!wasInSubViewRef.current) {
        // Already in the Lobby — this is a real back-navigation away from
        // /play (e.g. to Home). Let it proceed untouched.
        return;
      }
      suppressNextPopRef.current = true;
      if (isMatchActive) {
        resignMatch(); // auto-resign, no confirmation — matches "back" intent
      } else if (isAnalyzeMode) {
        exitAnalyzeMode();
      } else if (isEditorMode) {
        exitEditorMode();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAnalyzeMode, isMatchActive, isEditorMode]);

  // Otter's own subjective win probability, regardless of whose turn it
  // currently is. `winProbability` (range -1..+1) is computed each move from
  // the perspective of the active mover, so it needs flipping when it isn't
  // currently Otter's turn.
  const getOtterWinProbability = (): number => {
    if (!game) return 0;
    const otterColor = playerColor === 'w' ? 'b' : 'w';
    return game.turn() === otterColor ? winProbability : -winProbability;
  };

  const offerDraw = () => {
    // Otter won't consider a draw before move 15 (30 plies).
    if (historyMoves.length < 30) {
      setDrawDeclined(true);
      return;
    }
    const otterEval = getOtterWinProbability();
    // Accept if the position is roughly balanced, or if Otter is clearly
    // losing. Reject if Otter is clearly winning (or anything in between).
    const accepts = Math.abs(otterEval) < 0.2 || otterEval <= -0.4;
    if (accepts) {
      recordMatch('draw');
    } else {
      setDrawDeclined(true);
    }
  };

  const takeback = () => {
    if (!game || historyMoves.length === 0) return;
    // "Take back" always means undo the PLAYER's last move. If Otter has
    // already replied (it's the player's turn again), that reply needs
    // undoing too so the player lands back at their own turn to reconsider
    // — otherwise only the player's own move needs undoing. Check whose
    // turn it is BEFORE undoing anything, since undoing changes game.turn().
    const otterAlreadyReplied = game.turn() === playerColor;

    // Undo on the live `game` instance — it's the one with real move
    // history from the .move() calls made during play. Reconstructing via
    // `new Chess(game.fen())` would start with an empty history stack,
    // making .undo() a silent no-op.
    game.undo();
    if (otterAlreadyReplied) {
      game.undo();
    }
    // Clone with history preserved (via cloneGameWithHistory) rather than
    // `new Chess(game.fen())`, so the move list reflects the remaining
    // moves after the takeback instead of resetting to empty.
    const newGame = cloneGameWithHistory(game);
    setGame(newGame);
    updateGameState(newGame);
    if (cgRef.current) {
      cgRef.current.set({ fen: newGame.fen() });
    }
  };

  // Record completed match in history
  function recordMatch(result: 'win' | 'loss' | 'draw') {
    // Clear top predictions
    setTopMoves([]);

    // Highlight winning/losing kings
    if (cgRef.current && game) {
      const squares: Square[] = [
        'a1','b1','c1','d1','e1','f1','g1','h1',
        'a2','b2','c2','d2','e2','f2','g2','h2',
        'a3','b3','c3','d3','e3','f3','g3','h3',
        'a4','b4','c4','d4','e4','f4','g4','h4',
        'a5','b5','c5','d5','e5','f5','g5','h5',
        'a6','b6','c6','d6','e6','f6','g6','h6',
        'a7','b7','c7','d7','e7','f7','g7','h7',
        'a8','b8','c8','d8','e8','f8','g8','h8'
      ];
      let whiteKing: string | undefined;
      let blackKing: string | undefined;
      for (const sq of squares) {
        const piece = game.get(sq);
        if (piece && piece.type === 'k') {
          if (piece.color === 'w') whiteKing = sq;
          else blackKing = sq;
        }
      }

      if (result === 'win' || result === 'loss') {
        const isWhiteWinner = (result === 'win' && playerColor === 'w') || (result === 'loss' && playerColor === 'b');
        const winnerKing = isWhiteWinner ? whiteKing : blackKing;
        const loserKing = isWhiteWinner ? blackKing : whiteKing;
        const shapes: DrawShape[] = [];
        if (loserKing) shapes.push({ orig: loserKing as Key, brush: 'red' });
        if (winnerKing) shapes.push({ orig: winnerKing as Key, brush: 'green' });
        cgRef.current.set({ drawable: { autoShapes: shapes } });
      }
    }
    
    // Update PGN Result Header on the game object before final render
    if (game) {
      const pgnResult = result === 'win' ? (playerColor === 'w' ? '1-0' : '0-1') :
                        result === 'loss' ? (playerColor === 'w' ? '0-1' : '1-0') :
                        '1/2-1/2';
      game.header('Result', pgnResult);
      setLivePgnInput(game.pgn());
    }

    // Calculate new ELO rating
    const outcome = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    const expected = 1 / (1 + Math.pow(10, (playerElo - playerRating) / 400));
    const newRating = Math.round(playerRating + 32 * (outcome - expected));
    setPlayerRating(newRating);
    localStorage.setItem('otter-player-rating', newRating.toString());

    const record: MatchRecord = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString(),
      opponentElo: playerElo, // challenging target rating
      timeControl: timeControl,
      playerColor: playerColor,
      result: result,
      movesCount: historyMoves.length,
      pgn: game?.pgn() || ''
    };

    const newHistory = [record, ...matchHistory];
    setMatchHistory(newHistory);
    localStorage.setItem('otter-match-history', JSON.stringify(newHistory));
    
    setIsMatchActive(false);
    resetBoard();
  }

  const handleFenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isMatchActive) return;
    const val = e.target.value;
    setLiveFenInput(val);

    try {
      const tempChess = new Chess();
      tempChess.load(val);
      setAnalysisStartingFen(val);
      setAnalysisMoves([]);
      setCurrentMoveIdx(-1);
      setBranchesByBase(new Map());
      setActiveBranchBase(null);
      setBranchViewIdx(-1);
      setGame(tempChess);
      updateGameState(tempChess);
    } catch (err) {
      // Allow partial typings
    }
  };

  const handlePgnInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isMatchActive) return;
    const val = e.target.value;
    setLivePgnInput(val);

    try {
      const tempChess = new Chess();
      tempChess.loadPgn(val);
      const verboseMoves = tempChess.history({ verbose: true });
      const chronologicalMoves: AnalysisMove[] = [];
      const timelineChess = new Chess();
      const initialFen = timelineChess.fen();

      for (const m of verboseMoves) {
        timelineChess.move(m.san);
        chronologicalMoves.push({
          san: m.san,
          uci: m.from + m.to + (m.promotion || ''),
          fen: timelineChess.fen(),
          from: m.from,
          to: m.to,
        });
      }

      setAnalysisMoves(chronologicalMoves);
      setCurrentMoveIdx(chronologicalMoves.length - 1);
      setBranchesByBase(new Map());
      setActiveBranchBase(null);
      setBranchViewIdx(-1);
      setAnalysisStartingFen(initialFen);
      setGame(timelineChess);
      updateGameState(timelineChess);
    } catch (err) {
      // Allow partial typings
    }
  };

  const handleAnalyzeClick = () => {
    if (!game) return;
    const isStartingFen = game.fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const hasCustomPosition = !isStartingFen || analysisMoves.length > 0;

    // Always surface the modal — pre-filled with the current game so
    // "Load Analysis" is still one click when there's a position worth
    // continuing with, but "Start From Initial Position" is right there
    // too instead of only being reachable when the board happens to be
    // empty.
    setAnalyzeError(null);
    setAnalyzeInput(hasCustomPosition ? (game.pgn().trim() || game.fen()) : "");
    setIsAnalyzeModalOpen(true);
  };

  const openEditor = () => {
    if (!game) return;
    const currentFen = game.fen();
    const fields = currentFen.split(' ');
    setEditorTurn(fields[1] as 'w' | 'b');
    
    const cStr = fields[2];
    setEditorCastling({
      wK: cStr.includes('K'),
      wQ: cStr.includes('Q'),
      bK: cStr.includes('k'),
      bQ: cStr.includes('q'),
    });
    
    currentFenRef.current = currentFen;
    setLiveFenInput(currentFen);
    setIsEditorMode(true);
  };

  const updateEditorFen = (turn: 'w' | 'b', castling: typeof editorCastling) => {
    const currentFen = currentFenRef.current || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const fields = currentFen.split(' ');
    fields[1] = turn;
    
    let castlingStr = "";
    if (castling.wK) castlingStr += "K";
    if (castling.wQ) castlingStr += "Q";
    if (castling.bK) castlingStr += "k";
    if (castling.bQ) castlingStr += "q";
    fields[2] = castlingStr || "-";
    
    const targetFen = fields.join(' ');
    currentFenRef.current = targetFen;
    setLiveFenInput(targetFen);
    // Keep `game` (and therefore Chessground's movable.dests) in sync — without
    // this, toggling turn/castling updates the FEN text but the board keeps
    // enforcing the previous turn's legal moves until something else resyncs it.
    syncGameFromFen(targetFen);
  };

  // 4. Game Analysis Logic
  // Seeds the two Analyze-mode rating-bracket sliders. Prefers the PGN's
  // own WhiteElo/BlackElo headers (when both parse); otherwise falls back
  // to the ratings from the match just played — the human's configured
  // playerRating for whichever color they had, Otter's configured
  // playerElo for the other — so jumping into Analyze mode straight off
  // an active/finished match starts from the ratings that were actually
  // in play rather than a generic 1500/1500.
  const applyDefaultAnalyzeElos = (whiteHeader: string | null, blackHeader: string | null) => {
    const snap = (n: number) => Math.max(800, Math.min(2600, Math.round(n / 100) * 100));
    const hw = whiteHeader ? parseInt(whiteHeader, 10) : NaN;
    const hb = blackHeader ? parseInt(blackHeader, 10) : NaN;
    if (!isNaN(hw) && !isNaN(hb)) {
      setAnalyzeWhiteElo(snap(hw));
      setAnalyzeBlackElo(snap(hb));
    } else {
      setAnalyzeWhiteElo(snap(playerColor === 'w' ? playerRating : playerElo));
      setAnalyzeBlackElo(snap(playerColor === 'b' ? playerRating : playerElo));
    }
  };

  const loadGameForAnalysis = (input: string) => {
    const cleanInput = input.trim();
    if (!cleanInput) return;

    const tempChess = new Chess();
    setAnalyzeError(null);
    // Board defaults to White-at-bottom (standard convention) for every
    // freshly loaded analysis game — Flip still works manually afterward.
    setIsFlipped(false);

    // Try reading as FEN first
    try {
      tempChess.load(cleanInput);
      setAnalysisMoves([]);
      setCurrentMoveIdx(-1);
      setBranchesByBase(new Map());
      setActiveBranchBase(null);
      setBranchViewIdx(-1);
      setAnalysisStartingFen(cleanInput);
      setGame(tempChess);
      setIsAnalyzeMode(true);
      setIsAnalyzeModalOpen(false);
      updateGameState(tempChess);
      // A bare FEN has no player names/ratings to show.
      setAnalysisWhiteName(null);
      setAnalysisBlackName(null);
      setAnalysisWhiteElo(null);
      setAnalysisBlackElo(null);
      applyDefaultAnalyzeElos(null, null);
      return;
    } catch (e) {}

    // Try loading as PGN
    try {
      const tempPgnChess = new Chess();
      tempPgnChess.loadPgn(cleanInput);
      const moves = tempPgnChess.history({ verbose: true });
      const chronologicalMoves: AnalysisMove[] = [];
      const timelineChess = new Chess();
      const initialFen = timelineChess.fen();

      for (const m of moves) {
        timelineChess.move(m.san);
        chronologicalMoves.push({
          san: m.san,
          uci: m.from + m.to + (m.promotion || ''),
          fen: timelineChess.fen(),
          from: m.from,
          to: m.to,
        });
      }

      setAnalysisMoves(chronologicalMoves);
      setCurrentMoveIdx(-1);
      setBranchesByBase(new Map());
      setActiveBranchBase(null);
      setBranchViewIdx(-1);
      setAnalysisStartingFen(initialFen);

      const startChess = new Chess();
      setGame(startChess);
      setIsAnalyzeMode(true);
      setIsAnalyzeModalOpen(false);
      updateGameState(startChess);

      // Pull player names/ratings straight from the PGN headers — `game`
      // itself won't retain them since navigation reloads it from bare FENs.
      const headers = tempPgnChess.header();
      const cleanHeader = (v: string | null | undefined) => (v && v !== '?' ? v : null);
      const whiteEloHeader = cleanHeader(headers.WhiteElo);
      const blackEloHeader = cleanHeader(headers.BlackElo);
      setAnalysisWhiteName(cleanHeader(headers.White));
      setAnalysisBlackName(cleanHeader(headers.Black));
      setAnalysisWhiteElo(whiteEloHeader);
      setAnalysisBlackElo(blackEloHeader);
      applyDefaultAnalyzeElos(whiteEloHeader, blackEloHeader);
      return;
    } catch (e) {}

    setAnalyzeError("Invalid FEN or PGN. Please verify the format.");
  };

  const goToAnalysisMove = (idx: number) => {
    if (isMatchActive || !game) return;
    if (idx < -1 || idx >= analysisMoves.length) return;

    // Jumping to a real-line move exits whatever branch was being viewed —
    // but the branch itself stays saved in branchesByBase and reappears if
    // you navigate back to where it diverged.
    setActiveBranchBase(null);
    setBranchViewIdx(-1);
    setCurrentMoveIdx(idx);

    const c = new Chess();
    if (idx === -1) {
      c.load(analysisStartingFen);
    } else {
      c.load(analysisMoves[idx].fen);
    }

    setGame(c);
    updateGameState(c);
  };

  const goToBranchMove = (idx: number) => {
    if (isMatchActive || !game) return;
    if (idx < 0 || idx >= branchMoves.length) return;

    setBranchViewIdx(idx);
    const c = new Chess();
    c.load(branchMoves[idx].fen);
    setGame(c);
    updateGameState(c);
  };

  // Switches to a saved branch that isn't the one currently being viewed —
  // clicking into it from the move list. Unlike goToBranchMove (which
  // steps within whichever branch is already active), this also has to
  // pick which branch becomes active and re-pin currentMoveIdx to its
  // divergence point.
  const activateBranch = (baseIdx: number, idx: number) => {
    if (isMatchActive || !game) return;
    const branch = branchesByBase.get(baseIdx);
    if (!branch || idx < 0 || idx >= branch.length) return;

    setActiveBranchBase(baseIdx);
    setBranchViewIdx(idx);
    setCurrentMoveIdx(baseIdx);
    const c = new Chess();
    c.load(branch[idx].fen);
    setGame(c);
    updateGameState(c);
  };

  // Single "next/previous" that works whether you're on the real line or a
  // branch. Stepping past the branch's first move exits it and lands back
  // on the real line at the point it diverged from — from there, stepping
  // forward again just continues the real line, per the "branching is
  // temporary" rule.
  const stepAnalysis = (direction: 1 | -1) => {
    if (isMatchActive || !game) return;

    if (branchViewIdx !== -1) {
      const nextBranchIdx = branchViewIdx + direction;
      if (direction === 1) {
        if (nextBranchIdx < branchMoves.length) goToBranchMove(nextBranchIdx);
        return;
      }
      if (nextBranchIdx >= 0) {
        goToBranchMove(nextBranchIdx);
        return;
      }
      // Stepped back past the branch's first move — exit to the real line
      // at the divergence point. The branch stays saved (see
      // branchesByBase) and reappears if you come back to this point.
      setActiveBranchBase(null);
      setBranchViewIdx(-1);
      const c = new Chess();
      c.load(currentMoveIdx === -1 ? analysisStartingFen : analysisMoves[currentMoveIdx].fen);
      setGame(c);
      updateGameState(c);
      return;
    }

    goToAnalysisMove(currentMoveIdx + direction);
  };

  // "Go to start" always means the real game's actual start — exits any
  // branch. "Go to end" stays on whichever you're currently viewing: the
  // end of the branch if you're on one, otherwise the end of the real line.
  const jumpToAnalysisStart = () => goToAnalysisMove(-1);
  const jumpToAnalysisEnd = () => {
    if (branchViewIdx !== -1) {
      if (branchMoves.length > 0) goToBranchMove(branchMoves.length - 1);
    } else {
      goToAnalysisMove(analysisMoves.length - 1);
    }
  };

  // Keyboard navigation for analysis
  useEffect(() => {
    if (isMatchActive || analysisMoves.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepAnalysis(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepAnalysis(-1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        jumpToAnalysisStart();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        jumpToAnalysisEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnalyzeMode, analysisMoves, currentMoveIdx, branchesByBase, activeBranchBase, branchViewIdx]);

  // Dynamically compute played move quality and Otter human predictions match
  useEffect(() => {
    const resetEvaluation = () => {
      setPlayedMoveEvaluation("");
      setSimilarityPct(0);
    };

    const computeEvaluation = () => {
      const idx = currentMoveIdx;
      const playedMove = analysisMoves[idx];
      const fenBefore = idx === 0 ? analysisStartingFen : analysisMoves[idx - 1].fen;
      const fenAfter = playedMove.fen;

      const scoreBefore = fenScores[fenBefore];
      const scoreAfter = fenScores[fenAfter];

      // 1. Label Stockfish move accuracy drops
      if (scoreBefore !== undefined && scoreAfter !== undefined) {
        const whiteMoved = idx % 2 === 0;
        const playerDrop = whiteMoved ? (scoreBefore - scoreAfter) : (scoreAfter - scoreBefore);

        let evalLabel = "Good Move";
        if (playerDrop > 200) {
          evalLabel = "Blunder";
        } else if (playerDrop > 100) {
          evalLabel = "Mistake";
        } else if (playerDrop > 50) {
          evalLabel = "Inaccuracy";
        } else if (playerDrop < -30) {
          evalLabel = "Best Move";
        }
        setPlayedMoveEvaluation(evalLabel);

        setAnalysisMoves(prev => {
          if (prev[idx] && prev[idx].classification !== evalLabel) {
            const next = [...prev];
            next[idx] = { ...next[idx], classification: evalLabel };
            return next;
          }
          return prev;
        });
      } else {
        setPlayedMoveEvaluation("Evaluating...");
      }

      // 2. Resolve Otter Human predictions similarity
      const prevPreds = fenPredictions[fenBefore] || [];
      const match = prevPreds.find(pm => pm.move === playedMove.uci);
      if (match) {
        setSimilarityPct(Math.round(match.probability * 100));
      } else {
        setSimilarityPct(0);
        if (modelLoaded) {
          try {
            const prevChess = new Chess(fenBefore);
            runModelInference(prevChess, []);
          } catch (e) {
            console.warn("Skipping similarity calculations for invalid FEN:", fenBefore);
          }
        }
      }
    };

    if (!isAnalyzeMode || currentMoveIdx < 0 || analysisMoves.length === 0) {
      resetEvaluation();
      return;
    }

    computeEvaluation();
  }, [currentMoveIdx, fenScores, fenPredictions, isAnalyzeMode, analysisMoves, analysisStartingFen]);

  // Update board grid and game status
  function updateGameState(c: Chess) {
    setBoard(c.board() as (Piece | null)[][]);
    const verboseHistory = c.history({ verbose: true });
    const moves = verboseHistory.map(m => m.from + m.to + (m.promotion || ''));
    setHistoryMoves(moves);
    setHistoryMovesSan(verboseHistory.map(m => m.san));
    
    // Set standard PGN metadata headers if they are missing or contain default '?' placeholders
    const currentHeaders = c.header();
    const needsHeaders = !currentHeaders.Event || currentHeaders.Event === '?' || currentHeaders.White === '?';
    if (needsHeaders) {
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '.');
      c.header(
        'Event', isMatchActive ? 'Otter Chess Match' : 'Otter Chess Analysis',
        'Site', typeof window !== 'undefined' ? window.location.host : 'Otter Chess Web',
        'Date', dateStr,
        'Round', '1',
        'White', playerColor === 'w' ? 'Guest' : `Otter AI (${playerElo})`,
        'Black', playerColor === 'b' ? 'Guest' : `Otter AI (${playerElo})`,
        'Result', c.isGameOver() ? (c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2') : '*'
      );
    } else {
      const expectedResult = c.isGameOver() ? (c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2') : '*';
      if (currentHeaders.Result !== expectedResult) {
        c.header('Result', expectedResult);
      }
    }

    setLiveFenInput(c.fen());
    setLivePgnInput(c.pgn());
    
    currentFenRef.current = c.fen();
    activeTurnRef.current = c.turn();
    ignoreSearchLinesRef.current = true;
    // Drop the previous position's candidates immediately so the live
    // depth-by-depth updates for the new position don't briefly show
    // stale moves left over from the last one.
    sfMultiPvBufferRef.current.clear();
    setSfTopMoves([]);

    if (stockfishRef.current) {
      stockfishRef.current.postMessage('stop');
      stockfishRef.current.postMessage(`position fen ${c.fen()}`);
      stockfishRef.current.postMessage('go depth 13');
    }

    if (modelLoaded && (isAnalyzeMode || !isMatchActive || c.turn() === playerColor)) {
      runModelInference(c, moves);
    }
    
    // Calculate highlights on checkmate
    const endOfGameShapes: DrawShape[] = [];
    if (c.isCheckmate() || c.isDraw()) {
      setTopMoves([]); // Clear predictions upon game end

      if (c.isCheckmate()) {
        const squares: Square[] = [
          'a1','b1','c1','d1','e1','f1','g1','h1',
          'a2','b2','c2','d2','e2','f2','g2','h2',
          'a3','b3','c3','d3','e3','f3','g3','h3',
          'a4','b4','c4','d4','e4','f4','g4','h4',
          'a5','b5','c5','d5','e5','f5','g5','h5',
          'a6','b6','c6','d6','e6','f6','g6','h6',
          'a7','b7','c7','d7','e7','f7','g7','h7',
          'a8','b8','c8','d8','e8','f8','g8','h8'
        ];
        let whiteKing: string | undefined;
        let blackKing: string | undefined;
        for (const sq of squares) {
          const piece = c.get(sq);
          if (piece && piece.type === 'k') {
            if (piece.color === 'w') whiteKing = sq;
            else blackKing = sq;
          }
        }
        const loserColor = c.turn();
        const loserKing = loserColor === 'w' ? whiteKing : blackKing;
        const winnerKing = loserColor === 'w' ? blackKing : whiteKing;
        if (loserKing) endOfGameShapes.push({ orig: loserKing as Key, brush: 'red' });
        if (winnerKing) endOfGameShapes.push({ orig: winnerKing as Key, brush: 'green' });
      }
    }

    if (cgRef.current) {
      cgRef.current.set({
        drawable: {
          autoShapes: endOfGameShapes
        }
      });
    }

    if (c.isCheckmate()) {
      const winnerColor = c.turn() === 'w' ? 'b' : 'w';
      setGameStatus(`Checkmate! ${winnerColor === 'w' ? 'White' : 'Black'} wins.`);
      if (isMatchActive && !isAnalyzeMode) {
        const outcome = winnerColor === playerColor ? 'win' : 'loss';
        setTimeout(() => recordMatch(outcome), 2500);
      }
    } else if (c.isDraw()) {
      setGameStatus("Game Over - Draw.");
      if (isMatchActive && !isAnalyzeMode) {
        setTimeout(() => recordMatch('draw'), 2500);
      }
    } else if (c.inCheck()) {
      setGameStatus(`Check! ${c.turn() === 'w' ? "White" : "Black"}'s turn.`);
    } else {
      setGameStatus(`${c.turn() === 'w' ? "White" : "Black"}'s turn.`);
    }
    setSelectedSquare(null);
    setPossibleSquares([]);
  }

  // Run model prediction via ONNX
  async function runModelInference(c: Chess, history: string[]): Promise<PredictedMove[] | null> {
    // Validate FEN compatibility with chess.js to avoid throws during editing
    try {
      new Chess(c.fen());
    } catch (e) {
      console.warn("Skipping model inference for invalid FEN:", c.fen());
      return null;
    }

    if (!otterWorkerRef.current || !modelLoaded) return null;

    const currentSeq = ++lastInferenceSeqRef.current;

    try {
      // 1. Board Tensor mapping
      const boardData = boardToTensor(c);

      // 2. Map history sequence (canonicalize moves made by Black)
      const canonicalHistory: string[] = [];
      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const canon = (i % 2 === 1) ? mirrorMove(move) : move;
        canonicalHistory.push(canon);
      }

      const historyIds = new BigInt64Array(20);
      const historyMask = new Uint8Array(20);
      // How far back the model gets to see — Analyze mode's k slider (1-20),
      // or the full window everywhere else. Truncating k right-aligns fewer
      // moves inside the same fixed 20-slot buffer rather than shrinking it,
      // so slots before startIdx just stay masked out.
      const k = isAnalyzeMode ? analyzeHistoryK : 20;
      const windowMoves = canonicalHistory.slice(-k);
      const startIdx = 20 - windowMoves.length;

      for (let i = 0; i < windowMoves.length; i++) {
        const move = windowMoves[i];
        const token = historyMoveToIdRef.current[move] || 0;
        historyIds[startIdx + i] = BigInt(token);
        historyMask[startIdx + i] = 1;
      }

      // 3. Resolve rating brackets
      const eloToBucket = (elo: number) => {
        if (elo < 1100) return 0;
        if (elo >= 2000) return 10;
        return 1 + Math.floor((elo - 1100) / 100);
      };

      // In Analyze mode, both sides' ratings come from the two bracket
      // sliders at the top of the sidebar instead of the Challenge Otter
      // match config — "active" is whoever's turn it is right now.
      let activeElo: number;
      let opponentEloVal: number;
      if (isAnalyzeMode) {
        const whiteBucket = eloToBucket(analyzeWhiteElo);
        const blackBucket = eloToBucket(analyzeBlackElo);
        activeElo = c.turn() === 'w' ? whiteBucket : blackBucket;
        opponentEloVal = c.turn() === 'w' ? blackBucket : whiteBucket;
      } else {
        const isActivePlayerTurn = c.turn() === playerColor;
        activeElo = eloToBucket(isActivePlayerTurn ? playerRating : playerElo);
        opponentEloVal = eloToBucket(isActivePlayerTurn ? playerElo : playerRating);
      }

      // 4. Time format mapping
      const tcToBucket = (tc: string) => {
        if (!tc || !tc.includes('+')) return 4;
        try {
          const parts = tc.split('+');
          const base = parseInt(parts[0], 10);
          const inc = parseInt(parts[1], 10);
          const eff = base + 40 * inc;
          if (eff < 60) return 0;
          if (eff < 180) return 1;
          if (eff < 600) return 2;
          if (eff < 1800) return 3;
          return 4;
        } catch {
          return 4;
        }
      };
      // Analyze mode has no live match clock/config, so it conditions on
      // its own time-format toggle + white/black remaining-time sliders
      // instead of the Challenge Otter match's timeControl/playerTime/
      // otterTime.
      const effectiveTimeControl = isAnalyzeMode ? timeFormatToTc(analyzeTimeFormat) : timeControl;
      const timeControlBucket = tcToBucket(effectiveTimeControl);
      const activeTimeRemaining = isAnalyzeMode
        ? (c.turn() === 'w' ? analyzeWhiteTime : analyzeBlackTime)
        : (c.turn() === playerColor ? playerTime : otterTime);
      const baseSec = getBaseSeconds(effectiveTimeControl);
      const normalizedClockFraction = baseSec > 0 ? activeTimeRemaining / baseSec : 0.5;

      // 5. Run on the Otter worker (off the main thread)
      const { policyLogits, auxLogits, valuePred } = await callOtterWorker('live', {
        board: boardData,
        historyIds,
        historyMask,
        activeElo,
        opponentElo: opponentEloVal,
        tc: timeControlBucket,
        clock: [normalizedClockFraction, 0.0],
      }, true);

      // A newer inference started while this one was in flight — its
      // result is stale, drop it instead of clobbering fresher state.
      if (currentSeq !== lastInferenceSeqRef.current) {
        return null;
      }

      // Set win evaluation
      setWinProbability(valuePred as number);

      // Filter legal moves
      const legalMoves = c.history({ verbose: true }).length > 0
        ? c.history({ verbose: true }) // placeholder
        : [];
      
      const legalUcis = c.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
      const unsorted: PredictedMove[] = [];

      const isBlackTurn = c.turn() === 'b';
      legalUcis.forEach((moveUci) => {
        // Test if this move is mate in 1
        const temp = new Chess(c.fen());
        try {
          temp.move({
            from: moveUci.slice(0, 2),
            to: moveUci.slice(2, 4),
            promotion: moveUci.length > 4 ? moveUci.slice(4) : undefined
          });
          if (temp.isCheckmate()) {
            unsorted.push({
              move: moveUci,
              probability: 999.0
            });
            return;
          }
        } catch {}

        const canonMove = isBlackTurn ? mirrorMove(moveUci) : moveUci;
        const id = policyMoveToIdRef.current[canonMove];
        if (id !== undefined) {
          const logit = policyLogits[id];
          unsorted.push({
            move: moveUci,
            probability: logit
          });
        } else {
          unsorted.push({ move: moveUci, probability: -999.0 });
        }
      });

      // Apply softmax approximations on legal moves logit slice
      const maxLogit = Math.max(...unsorted.map(m => m.probability));
      const expSum = unsorted.reduce((acc, m) => acc + Math.exp(m.probability - maxLogit), 0);
      const sortedMoves = unsorted.map((m) => ({
        move: m.move,
        probability: Math.exp(m.probability - maxLogit) / expSum
      })).sort((a, b) => b.probability - a.probability);

      setTopMoves(sortedMoves);
      
      // Populate predictions cache
      setFenPredictions(prev => ({ ...prev, [c.fen()]: sortedMoves }));

      // Decode auxiliary metrics
      const sigmoid = (val: number) => 1 / (1 + Math.exp(-val));
      const softmax = (arr: number[]) => {
        const maxVal = Math.max(...arr);
        const exps = arr.map(v => Math.exp(v - maxVal));
        const sum = exps.reduce((a, b) => a + b, 0);
        return exps.map(v => v / sum);
      };

      const pieceNames = ["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"];

      const mvProbs = softmax(Array.from(auxLogits!.slice(0, 6)) as number[]);
      const mvIdx = mvProbs.indexOf(Math.max(...mvProbs));
      setAuxMovingPiece(`${pieceNames[mvIdx]} (${(mvProbs[mvIdx] * 100).toFixed(0)}%)`);

      let capText = "None";
      if (sortedMoves.length > 0) {
        const topMove = sortedMoves[0].move;
        const toSq = topMove.slice(2, 4);
        const targetPiece = c.get(toSq as Square);
        if (targetPiece) {
          const capProbs = softmax(Array.from(auxLogits!.slice(6, 12)) as number[]);
          const capIdx = capProbs.indexOf(Math.max(...capProbs));
          capText = `${pieceNames[capIdx]} (${(capProbs[capIdx] * 100).toFixed(0)}%)`;
        }
      }
      setAuxCapturedPiece(capText);

      const checkProb = sigmoid(auxLogits![12] as number);
      setAuxCheckProb(`${(checkProb * 100).toFixed(0)}%`);

      // The aux head's own from/to square guess — independent of the
      // policy head above, decoded from the 128 dims (13:77 from-square,
      // 77:141 to-square) that were previously computed but never used.
      // Squares come out in the same canonical (rank-mirrored for Black)
      // space as policy moves, so they need the same un-mirror step.
      const squareFromAuxIndex = (idx: number): string => {
        const file = idx % 8;
        const rank0 = Math.floor(idx / 8);
        const canonicalSq = `${String.fromCharCode(97 + file)}${rank0 + 1}`;
        return isBlackTurn ? mirrorSquare(canonicalSq) : canonicalSq;
      };
      const fromProbs = softmax(Array.from(auxLogits!.slice(13, 77)) as number[]);
      const fromIdx = fromProbs.indexOf(Math.max(...fromProbs));
      setAuxIntuitionFrom(squareFromAuxIndex(fromIdx));
      setAuxIntuitionFromConf(fromProbs[fromIdx]);

      const toProbs = softmax(Array.from(auxLogits!.slice(77, 141)) as number[]);
      const toIdx = toProbs.indexOf(Math.max(...toProbs));
      setAuxIntuitionTo(squareFromAuxIndex(toIdx));
      setAuxIntuitionToConf(toProbs[toIdx]);

      if (sortedMoves.length > 0) {
        const topMove = sortedMoves[0].move;
        setAuxFromTo(`${topMove.slice(0, 2)} → ${topMove.slice(2, 4)}`);
        setModelPredMove({ from: topMove.slice(0, 2), to: topMove.slice(2, 4) });
      }

      return sortedMoves;

    } catch (err) {
      console.error("ORT evaluation error:", err);
      return null;
    }
  }

  // Side-effect-free variant of runModelInference for the "Moves by
  // Rating" curve: same tensors, but active_elo is pinned to whichever
  // bucket the caller asks about instead of the configured player rating,
  // and nothing here touches the live prediction state (topMoves, eval
  // bar, aux panels) — this is a background "what if" query, run in a
  // loop across every rating bucket for a single position.
  const runModelInferenceAtElo = async (c: Chess, history: string[], activeEloBucket: number): Promise<PredictedMove[] | null> => {
    if (!otterWorkerRef.current || !modelLoaded) return null;

    try {
      const boardData = boardToTensor(c);

      const canonicalHistory: string[] = [];
      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        canonicalHistory.push((i % 2 === 1) ? mirrorMove(move) : move);
      }
      const historyIds = new BigInt64Array(20);
      const historyMask = new Uint8Array(20);
      const k = analyzeHistoryK;
      const windowMoves = canonicalHistory.slice(-k);
      const startIdx = 20 - windowMoves.length;
      for (let i = 0; i < windowMoves.length; i++) {
        const token = historyMoveToIdRef.current[windowMoves[i]] || 0;
        historyIds[startIdx + i] = BigInt(token);
        historyMask[startIdx + i] = 1;
      }

      const eloToBucket = (elo: number) => {
        if (elo < 1100) return 0;
        if (elo >= 2000) return 10;
        return 1 + Math.floor((elo - 1100) / 100);
      };
      // Analyze-only helper (used by the rating-curve sweep) — the
      // opponent's rating comes from whichever slider belongs to the
      // *other* side, since activeEloBucket here is the value being swept.
      const opponentEloVal = eloToBucket(c.turn() === 'w' ? analyzeBlackElo : analyzeWhiteElo);

      const tcToBucket = (tc: string) => {
        if (!tc || !tc.includes('+')) return 4;
        try {
          const parts = tc.split('+');
          const base = parseInt(parts[0], 10);
          const inc = parseInt(parts[1], 10);
          const eff = base + 40 * inc;
          if (eff < 60) return 0;
          if (eff < 180) return 1;
          if (eff < 600) return 2;
          if (eff < 1800) return 3;
          return 4;
        } catch {
          return 4;
        }
      };
      const effectiveTimeControl = timeFormatToTc(analyzeTimeFormat);
      const timeControlBucket = tcToBucket(effectiveTimeControl);
      const activeTimeRemaining = c.turn() === 'w' ? analyzeWhiteTime : analyzeBlackTime;
      const baseSec = getBaseSeconds(effectiveTimeControl);
      const normalizedClockFraction = baseSec > 0 ? activeTimeRemaining / baseSec : 0.5;

      const { policyLogits } = await callOtterWorker('sweep', {
        board: boardData,
        historyIds,
        historyMask,
        activeElo: activeEloBucket,
        opponentElo: opponentEloVal,
        tc: timeControlBucket,
        clock: [normalizedClockFraction, 0.0],
      }, false);
      const legalUcis = c.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
      const isBlackTurn = c.turn() === 'b';
      const unsorted: PredictedMove[] = legalUcis.map((moveUci) => {
        const canonMove = isBlackTurn ? mirrorMove(moveUci) : moveUci;
        const id = policyMoveToIdRef.current[canonMove];
        return { move: moveUci, probability: id !== undefined ? (policyLogits[id] as number) : -999.0 };
      });
      const maxLogit = Math.max(...unsorted.map(m => m.probability));
      const expSum = unsorted.reduce((acc, m) => acc + Math.exp(m.probability - maxLogit), 0);
      return unsorted
        .map((m) => ({ move: m.move, probability: Math.exp(m.probability - maxLogit) / expSum }))
        .sort((a, b) => b.probability - a.probability);
    } catch (err) {
      console.error("Rating-curve inference error:", err);
      return null;
    }
  };

  const {
    ratingCurveData,
    ratingCurveLoading,
    ratingCurveHoverIdx,
    setRatingCurveHoverIdx,
  } = useRatingCurve({
    otterWorkerRef,
    modelLoaded,
    isAnalyzeMode,
    game,
    historyMoves,
    analyzeWhiteElo,
    analyzeBlackElo,
    analyzeHistoryK,
    analyzeTimeFormat,
    analyzeWhiteTime,
    analyzeBlackTime,
    runModelInferenceAtElo,
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  });

  // Handle board square click
  const handleSquareClick = (square: string) => {
    if (!game || !isMatchActive || isThinking) return;
    if (game.turn() !== playerColor) return;

    // Check if player is clicking their own piece
    const piece = game.get(square as Square);
    const expectedColor = game.turn();

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setPossibleSquares([]);
      return;
    }

    if (piece && piece.color === expectedColor) {
      // Selecting own piece -> highlight moves
      const moves = game.moves({ square: square as Square, verbose: true });
      const destinations = moves.map(m => m.to);
      setSelectedSquare(square);
      setPossibleSquares(destinations);
    } else if (selectedSquare) {
      // Trying to play a move
      if (possibleSquares.includes(square)) {
        const currentHistory = [...historyMoves];
        let moveObj: Move | null = null;
        let newGame: Chess | null = null;
        try {
          newGame = cloneGameWithHistory(game);
          moveObj = newGame.move({ from: selectedSquare, to: square, promotion: 'q' });
        } catch (_) {}
        
        if (moveObj && newGame) {
          const moveUci = moveObj.from + moveObj.to + (moveObj.promotion || '');
          const newHistory = [...currentHistory, moveUci];
          setGame(newGame);
          updateGameState(newGame);
          
          if (modelLoaded) {
            runModelInference(newGame, newHistory);
          }
        }
      } else {
        setSelectedSquare(null);
        setPossibleSquares([]);
      }
    }
  };

  // Make Otter play its top predicted move automatically
  function playModelMove(moveUci: string) {
    if (!game || !modelLoaded) return;
    const currentHistory = [...historyMoves];
    let moveObj: Move | null = null;
    let newGame: Chess | null = null;
    try {
      newGame = cloneGameWithHistory(game);
      moveObj = newGame.move({
        from: moveUci.slice(0, 2),
        to: moveUci.slice(2, 4),
        promotion: moveUci.length > 4 ? moveUci.slice(4) : undefined
      });
    } catch (e) {
      console.warn("Invalid model predicted move attempted:", moveUci);
    }
    if (moveObj && newGame) {
      const newHistory = [...currentHistory, moveUci];
      setGame(newGame);
      updateGameState(newGame);
    }
  }

  function resetBoard() {
    const cleanChess = new Chess();
    setGame(cleanChess);
    updateGameState(cleanChess);
    setTopMoves([]);
    setWinProbability(0.0);
    setAuxMovingPiece("-");
    setAuxCapturedPiece("-");
    setAuxCheckProb("-");
    setAuxFromTo("-");
    setModelPredMove(null);
    if (cgRef.current) {
      cgRef.current.set({
        lastMove: undefined,
        drawable: {
          shapes: [],
          autoShapes: []
        }
      });
    }
  }

  const getOtterWhiteWinPct = (): number => {
    if (!game) return 50;
    const activeTurn = game.turn();
    const normalized = (winProbability + 1) / 2;
    const whiteWinPct = activeTurn === 'w' ? normalized : (1 - normalized);
    return Math.round(whiteWinPct * 100);
  };
  const otterWinPct = getOtterWhiteWinPct();

  const whitePct = stockfishEvalPct;

  // A saved alternate line, shown indented with a connector under the ply
  // it diverged from, like a lichess-style variation, instead of vanishing
  // once you step off it. Branches are kept in branchesByBase (one per
  // divergence point) and stay visible whether or not they're the one
  // currently being viewed — clicking into a non-active one activates it.
  const renderBranchVariation = (baseIdx: number) => {
    const branch = branchesByBase.get(baseIdx);
    if (!branch || branch.length === 0) return null;
    const isActive = activeBranchBase === baseIdx;
    const branchStartPly = baseIdx + 2; // 1-based ply number of branch[0]
    return (
      <div className="relative pl-2.5 my-0.5 border-l-2 border-rose-500/50">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px] font-mono">
          {branch.map((bm, i) => {
            const plyNumber = branchStartPly + i;
            const moveNumber = Math.ceil(plyNumber / 2);
            const isWhite = plyNumber % 2 === 1;
            const label = isWhite ? `${moveNumber}. ${bm.san}` : `${moveNumber}... ${bm.san}`;
            return (
              <button
                key={i}
                onClick={() => (isActive ? goToBranchMove(i) : activateBranch(baseIdx, i))}
                className={`cursor-pointer truncate transition-colors ${
                  isActive && branchViewIdx === i ? 'text-rose-400 font-bold' : 'text-rose-500/70 hover:text-rose-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    // Mobile stacks engine status -> board -> mode sidebar -> notation/history
    // (order classes). Desktop keeps the DOM order as visual order
    // (notation | board | sidebar). Section separators are explicit
    // border-t's on the reordered children rather than divide-y, which
    // follows DOM order and would draw them in the wrong places.
    //
    // Height-capped at every breakpoint, not just lg: the mobile stack used to
    // run ~1170px tall on a 667px phone, pushing the lobby actions and the
    // engine-setup control below the fold. Now the board is capped (see
    // BoardColumn) and the sidebar takes the remainder with its own scroll, so
    // the default view fits one screen. overflow-y-auto rather than -hidden is
    // the escape hatch: expanding the notation drawer, or a viewport too short
    // for the whole budget, scrolls here instead of clipping.
    <div className="flex-grow flex flex-col lg:flex-row min-h-0 h-[calc(100dvh-68px)] overflow-y-auto lg:divide-x divide-line lg:h-[calc(100vh-68px)] lg:overflow-visible">

      <NotationColumn
        mobileNotationOpen={mobileNotationOpen}
        setMobileNotationOpen={setMobileNotationOpen}
        isAnalyzeMode={isAnalyzeMode}
        setShowFenPgnModal={setShowFenPgnModal}
        analysisMoves={analysisMoves}
        branchesByBase={branchesByBase}
        branchViewIdx={branchViewIdx}
        currentMoveIdx={currentMoveIdx}
        branchMoves={branchMoves}
        renderBranchVariation={renderBranchVariation}
        goToAnalysisMove={goToAnalysisMove}
        jumpToAnalysisStart={jumpToAnalysisStart}
        jumpToAnalysisEnd={jumpToAnalysisEnd}
        stepAnalysis={stepAnalysis}
        game={game}
        liveFenInput={liveFenInput}
        handleFenInputChange={handleFenInputChange}
        isMatchActive={isMatchActive}
        isEditorMode={isEditorMode}
        isFreeform={isFreeform}
        livePgnInput={livePgnInput}
        handlePgnInputChange={handlePgnInputChange}
        playerRating={playerRating}
        analyzeWhiteElo={analyzeWhiteElo}
        setAnalyzeWhiteElo={setAnalyzeWhiteElo}
        analyzeBlackElo={analyzeBlackElo}
        setAnalyzeBlackElo={setAnalyzeBlackElo}
        analyzeHistoryK={analyzeHistoryK}
        setAnalyzeHistoryK={setAnalyzeHistoryK}
        analyzeTimeFormat={analyzeTimeFormat}
        setAnalyzeTimeFormat={setAnalyzeTimeFormat}
        analyzeWhiteTime={analyzeWhiteTime}
        setAnalyzeWhiteTime={setAnalyzeWhiteTime}
        analyzeBlackTime={analyzeBlackTime}
        setAnalyzeBlackTime={setAnalyzeBlackTime}
      />

      {/* COLUMN 2 (MIDDLE): Chessboard Column */}
      <BoardColumn
        isFlipped={isFlipped}
        setIsFlipped={setIsFlipped}
        isAnalyzeMode={isAnalyzeMode}
        analysisWhiteName={analysisWhiteName}
        analysisWhiteElo={analysisWhiteElo}
        analysisBlackName={analysisBlackName}
        analysisBlackElo={analysisBlackElo}
        game={game}
        playerColor={playerColor}
        playerElo={playerElo}
        otterTime={otterTime}
        playerRating={playerRating}
        playerTime={playerTime}
        isMatchActive={isMatchActive}
        boardWrapperRef={boardWrapperRef}
        containerRef={containerRef}
        handleBoardMouseDown={handleBoardMouseDown}
        handleBoardMouseUp={handleBoardMouseUp}
        boardPx={boardPx}
        otterWinPct={otterWinPct}
        whitePct={whitePct}
        sfTopMoves={sfTopMoves}
      />

      {/* COLUMN 3 (RIGHT): Controls & Move History.
          Below lg this is the flexible child — it absorbs whatever height the
          board column leaves and scrolls its own overflow, keeping the primary
          actions (Challenge / Analyze / Editor) on screen. min-h keeps it from
          being squeezed to nothing when the notation drawer is expanded. */}
      <div className="order-2 lg:order-3 border-t border-line lg:border-t-0 w-full lg:w-[400px] flex-1 min-h-[150px] lg:flex-none lg:min-h-0 flex flex-col bg-panel divide-y divide-line overflow-y-auto">
        
        {/* Move History / Lobby Middle Area */}
        {isAnalyzeMode ? (
          <AnalyzeSidebar
            game={game}
            exitAnalyzeMode={exitAnalyzeMode}
            onStartTour={() => { setTourStepIdx(0); setTourActive(true); setMobileNotationOpen(true); }}
            topMoves={topMoves}
            sfTopMoves={sfTopMoves}
            ratingCurveData={ratingCurveData}
            ratingCurveLoading={ratingCurveLoading}
            ratingCurveHoverIdx={ratingCurveHoverIdx}
            setRatingCurveHoverIdx={setRatingCurveHoverIdx}
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
        ) : isEditorMode ? (
          <EditorSidebar
            exitEditorMode={exitEditorMode}
            isFreeform={isFreeform}
            onFreeformClick={() => {
              setIsFreeform(true);
              setEditorMoveSource(null);
              const fen = currentFenRef.current || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
              try {
                const c = new Chess(fen);
                setGame(c);
              } catch (_) {}
              setAnalysisMoves([]);
              setCurrentMoveIdx(-1);
              setBranchesByBase(new Map());
              setActiveBranchBase(null);
              setBranchViewIdx(-1);
            }}
            onRecordPgnClick={() => {
              setIsFreeform(false);
              setEditorMoveSource(null);
              const fen = currentFenRef.current || (game ? game.fen() : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
              try {
                const c = new Chess(fen);
                setGame(c);
                updateGameState(c);
              } catch (_) {}
            }}
            editorSelectedPiece={editorSelectedPiece}
            setEditorSelectedPiece={setEditorSelectedPiece}
            editorMoveSource={editorMoveSource}
            analysisMoves={analysisMoves}
            editorTurn={editorTurn}
            onTurnChange={(turn) => {
              setEditorTurn(turn);
              updateEditorFen(turn, editorCastling);
            }}
            editorCastling={editorCastling}
            onCastlingChange={(next) => {
              setEditorCastling(next);
              updateEditorFen(editorTurn, next);
            }}
            onResetBoard={() => {
              const cleanChess = new Chess();
              setGame(cleanChess);
              currentFenRef.current = cleanChess.fen();
              setLiveFenInput(cleanChess.fen());
              updateGameState(cleanChess);
              setEditorTurn('w');
              setEditorCastling({ wK: true, wQ: true, bK: true, bQ: true });
            }}
            onClearBoard={() => {
              try {
                const cleanChess = new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
                setGame(cleanChess);
                currentFenRef.current = cleanChess.fen();
                setLiveFenInput(cleanChess.fen());
                updateGameState(cleanChess);
                setEditorTurn('w');
                setEditorCastling({ wK: false, wQ: false, bK: false, bQ: false });
              } catch (e) {
                console.error(e);
              }
            }}
            editorPositionError={editorPositionError}
            onAnalyzeClick={() => {
              if (validateAndApplyEditorPosition()) {
                setIsAnalyzeMode(true);
                setIsEditorMode(false);
              }
            }}
            onPlayOtterClick={() => {
              if (validateAndApplyEditorPosition()) {
                setIsEditorMode(false);
                setIsConfigModalOpen(true);
              }
            }}
            onCancelClick={() => {
              const cleanChess = new Chess();
              setGame(cleanChess);
              setLiveFenInput(cleanChess.fen());
              updateGameState(cleanChess);
              setIsEditorMode(false);
            }}
          />
        ) : !isMatchActive ? (
          <LobbySidebar
            enginesReady={enginesReady}
            matchHistory={matchHistory}
            onChallengeClick={() => setIsConfigModalOpen(true)}
            onAnalyzeClick={handleAnalyzeClick}
            onEditorClick={openEditor}
            onSetupClick={() => setShowSetupModal(true)}
            onLockedClick={showEngineLockedNotice}
            loadGameForAnalysis={loadGameForAnalysis}
          />
        ) : (
          <ActiveMatchSidebar
            isThinking={isThinking}
            gameStatus={gameStatus}
            historyMovesSan={historyMovesSan}
            historyMoves={historyMoves}
            takeback={takeback}
            offerDraw={offerDraw}
            onResignClick={() => setShowResignConfirm(true)}
          />
        )}

      </div>

      {/* Floating hint (Bottom Right): nudges toward the sidebar's own
          "Set Up Engines" button when a gated action is clicked too early. */}
      {showEngineLockedHint && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 py-2.5 px-4 bg-panel border border-orange-500/50 rounded-sm shadow-2xl text-paper text-xs font-mono max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500 shrink-0"></span>
          <span className="text-paper/85">Download the engine first, then you can play.</span>
        </div>
      )}

      {/* ================= MODAL: FEN / PGN (Analyze mode) ================= */}
      {showFenPgnModal && (
        <FenPgnModal onClose={() => setShowFenPgnModal(false)} game={game} />
      )}

      {/* ================= MODAL: PAWN PROMOTION ================= */}
      {pendingPromotion && (
        <PromotionModal
          pendingPromotion={pendingPromotion}
          cancelPromotion={cancelPromotion}
          resolvePromotion={resolvePromotion}
        />
      )}

      {/* ================= MODAL: DRAW OFFER DECLINED ================= */}
      {drawDeclined && (
        <DrawDeclinedModal
          historyMovesLength={historyMoves.length}
          onContinue={() => setDrawDeclined(false)}
        />
      )}

      {/* ================= MODAL: RESIGN CONFIRMATION ================= */}
      {showResignConfirm && (
        <ResignConfirmModal
          onCancel={() => setShowResignConfirm(false)}
          onResign={resignMatch}
        />
      )}

      {/* ================= MODAL: INITIALIZE / DOWNLOAD ENGINES ================= */}
      {showSetupModal && (
        <SetupModal
          onClose={() => setShowSetupModal(false)}
          modelAvailable={modelAvailable}
          isDownloadingModel={isDownloadingModel}
          modelProgress={modelProgress}
          downloadOtterModel={downloadOtterModel}
          stockfishAvailable={stockfishAvailable}
          isDownloadingSf={isDownloadingSf}
          sfProgress={sfProgress}
          downloadStockfish={downloadStockfish}
          downloadError={downloadError}
        />
      )}

      {/* ================= MODAL: CONFIGURE MATCH ================= */}
      {isConfigModalOpen && (
        <ConfigMatchModal
          playerElo={playerElo}
          setPlayerElo={setPlayerElo}
          setOpponentElo={setOpponentElo}
          timeControl={timeControl}
          setTimeControl={setTimeControl}
          thinkingMode={thinkingMode}
          setThinkingMode={setThinkingMode}
          chosenSide={chosenSide}
          setChosenSide={setChosenSide}
          onCancel={() => setIsConfigModalOpen(false)}
          startMatch={startMatch}
        />
      )}

      {/* ================= MODAL: ANALYZE GAME ================= */}
      {isAnalyzeModalOpen && (
        <AnalyzeGameModal
          analyzeInput={analyzeInput}
          setAnalyzeInput={setAnalyzeInput}
          analyzeError={analyzeError}
          onCancel={() => {
            setIsAnalyzeModalOpen(false);
            setAnalyzeError(null);
          }}
          loadGameForAnalysis={loadGameForAnalysis}
        />
      )}

      {/* ================= ANALYZE MODE: GUIDED TOUR ================= */}
      {tourActive && isAnalyzeMode && (
        <Tour
          steps={ANALYZE_TOUR_STEPS}
          stepIdx={tourStepIdx}
          onStepChange={setTourStepIdx}
          onClose={() => setTourActive(false)}
        />
      )}

    </div>
  );
}
