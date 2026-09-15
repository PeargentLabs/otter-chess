'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { PredictedMove } from '@/lib/play/types';
import { boardToTensor, mirrorMove, mirrorSquare } from '@/lib/play/chess-utils';
import { useStockfish } from '@/hooks/play/useStockfish';
import { useOtterWorker } from '@/hooks/play/useOtterWorker';
import { useRatingCurve } from '@/hooks/play/useRatingCurve';
import { useOlympiadSection } from '@/hooks/olympiad/useOlympiadSection';
import { useFocusedGame } from '@/hooks/olympiad/useFocusedGame';
import { useTickingClock } from '@/hooks/olympiad/useTickingClock';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, OLYMPIAD_TOURNAMENT_NAME } from '@/lib/olympiad/config';
import { groupIntoPairings, uniqueTeams } from '@/lib/olympiad/grouping';
import { DEMO_GAMES } from '@/lib/olympiad/demo-data';
import MainBoard from '@/components/olympiad/MainBoard';
import OlympiadHistoryPanel from '@/components/olympiad/OlympiadHistoryPanel';
import OlympiadStatsPanel from '@/components/olympiad/OlympiadStatsPanel';
import MiniBoardStrip from '@/components/olympiad/MiniBoardStrip';
import GridPagination from '@/components/olympiad/GridPagination';
import TeamDropdown from '@/components/olympiad/TeamDropdown';
import SectionToggle, { type OlympiadSection } from '@/components/olympiad/SectionToggle';

// Real Olympiad games are classical time control ("90 min/40 moves + 30
// min + 30s/move"). When the broadcast includes real %clk data (see
// useFocusedGame), that drives Otter's clock conditioning directly; when
// it doesn't, this is the fallback fraction (a neutral "middle of the
// clock" reading) and this is the nominal base used to normalize a real
// clock reading into a 0..1 fraction — the first phase's 90 minutes, since
// modelling the exact multi-phase increment schedule isn't worth it for a
// conditioning input that only nudges a "think time" estimate.
const OLYMPIAD_TC_BUCKET = 4;
const OLYMPIAD_CLOCK_BASE_SECONDS = 90 * 60;
const OLYMPIAD_DEFAULT_CLOCK_FRACTION = 0.5;
// Players without a parsed WhiteElo/BlackElo header (some broadcast feeds
// omit them for the first minutes of a round) default to a mid-GM bucket,
// since Olympiad boards are titled-player games almost without exception.
const DEFAULT_OLYMPIAD_ELO = 2400;

const isValidSection = (v: string | null): v is OlympiadSection => v === 'open' || v === 'women' || v === 'all';

export default function OlympiadWatchPage() {
  return (
    <Suspense fallback={null}>
      <OlympiadWatchPageInner />
    </Suspense>
  );
}

function OlympiadWatchPageInner() {
  // ?demo=1 shows a hand-authored, always-available position instead of
  // the live broadcast — for reviewing the page's design without waiting
  // for a real Olympiad round to go live (see lib/olympiad/demo-data.ts).
  // ?tournament=<id> overrides which single Lichess broadcast tournament
  // is followed (bypassing the section toggle), for checking against any
  // other live team broadcast without touching the shipped defaults in
  // lib/olympiad/config.ts.
  // ?section=&round=&focus=<boardKey> — arriving from the lobby: which
  // section/round to pin to, and which specific game to focus on load
  // instead of defaulting to the first pairing's first board.
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') !== null;
  const tournamentOverride = searchParams.get('tournament');
  const sectionParam = searchParams.get('section');
  const roundParam = searchParams.get('round');
  const focusParam = searchParams.get('focus');
  const roundNumber = roundParam ? parseInt(roundParam, 10) : undefined;

  const [section, setSection] = useState<OlympiadSection>(isValidSection(sectionParam) ? sectionParam : 'open');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  // Explicitly clicked (or deep-linked) board, if any — otherwise the page
  // defaults to the first board of the first (or selected-team's) pairing.
  const [focusedBoardKey, setFocusedBoardKey] = useState<string | null>(focusParam);

  const tournamentIds = useMemo(() => {
    if (isDemo) return [];
    if (tournamentOverride) return [tournamentOverride];
    if (section === 'open') return OPEN_TOURNAMENT_IDS;
    if (section === 'women') return WOMENS_TOURNAMENT_IDS;
    return [...OPEN_TOURNAMENT_IDS, ...WOMENS_TOURNAMENT_IDS];
  }, [isDemo, tournamentOverride, section]);

  const { games: liveGames, roundName, loading: gamesLoading, error: gamesError } = useOlympiadSection(tournamentIds, roundNumber);
  // ?demo=1 also feeds the mini-board strip / team dropdown / section
  // toggle from lib/olympiad/demo-data.ts's several dummy pairings, so
  // that part of the design is reviewable with no network dependency too.
  const games = isDemo ? DEMO_GAMES : liveGames;

  const pairings = useMemo(() => groupIntoPairings(games), [games]);
  const teams = useMemo(() => uniqueTeams(games), [games]);
  const filteredPairings = useMemo(
    () => (selectedTeam ? pairings.filter((p) => p.whiteTeam === selectedTeam || p.blackTeam === selectedTeam) : pairings),
    [pairings, selectedTeam],
  );
  const filteredBoards = useMemo(() => filteredPairings.flatMap((p) => p.boards), [filteredPairings]);

  // Grid pagination — 8 boards per page (2 rows of 4 at desktop width).
  // Reset to page 1 whenever the underlying board SET changes identity
  // (section/team), but not just because the live poll refreshed the same
  // set with new moves.
  const [gridPage, setGridPage] = useState(0);
  useEffect(() => {
    setGridPage(0);
  }, [section, selectedTeam]);
  const GRID_PAGE_SIZE = 8;
  const gridTotalPages = Math.max(1, Math.ceil(filteredBoards.length / GRID_PAGE_SIZE));
  const clampedGridPage = Math.min(gridPage, gridTotalPages - 1);
  const gridPageStart = clampedGridPage * GRID_PAGE_SIZE;
  const pagedBoards = filteredBoards.slice(gridPageStart, gridPageStart + GRID_PAGE_SIZE);

  // A team selection is an explicit "take me to their board" action, so it
  // resets the pin. Section (Open/Women's/All) is deliberately NOT in this
  // list — switching sections while watching a board shouldn't yank focus
  // back to board 1; if the pinned board genuinely isn't in the new
  // section's games, `focusedGame` below already falls back to the first
  // available board on its own (via the `.find()` returning nothing).
  useEffect(() => {
    setFocusedBoardKey(null);
  }, [selectedTeam]);

  const focusedGame = useMemo(() => {
    if (focusedBoardKey) {
      const found = games.find((g) => g.boardKey === focusedBoardKey);
      if (found) return found;
    }
    const pool = filteredPairings.length > 0 ? filteredPairings : pairings;
    return pool[0]?.boards[0] ?? null;
  }, [focusedBoardKey, games, filteredPairings, pairings]);

  const {
    currentMoveIdx,
    goToMove,
    stepMove,
    jumpToStart,
    jumpToEnd,
    displayFen,
    displayMoves,
    lastMove,
    nextPlayedMove,
    whiteClockSeconds,
    blackClockSeconds,
    isAtLiveEdge,
  } = useFocusedGame(focusedGame);

  const [isFlipped, setIsFlipped] = useState(false);

  // Engine availability / download gating — trimmed version of /play's
  // engine bootstrap (same cache, same asset URLs), without the match/
  // editor-mode UI that doesn't apply here.
  const [modelAvailable, setModelAvailable] = useState(false);
  const [stockfishAvailable, setStockfishAvailable] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [isDownloadingSf, setIsDownloadingSf] = useState(false);
  const [sfProgress, setSfProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'webgpu' | 'wasm'>('wasm');

  // Otter output state (mirrors the subset of /play's page-level state that
  // AnalyzeSidebar's extracted panels read).
  const [topMoves, setTopMoves] = useState<PredictedMove[]>([]);
  const [winProbability, setWinProbability] = useState(0);
  // Which position winProbability was actually computed for — the eval bar
  // reads through this instead of recomputing straight off winProbability +
  // displayFen's turn on every render. Without it, the moment a new move
  // lands, displayFen's turn flips immediately but winProbability is still
  // the PREVIOUS position's value (inference takes a debounce + a round
  // trip to resolve) — reinterpreting that stale value under the new
  // turn's perspective inverts the bar for a frame (a visible dip-then-
  // rise flicker) before the fresh result arrives and corrects it.
  const [winProbFen, setWinProbFen] = useState('');
  const [auxMovingPiece, setAuxMovingPiece] = useState('-');
  const [auxCapturedPiece, setAuxCapturedPiece] = useState('-');
  const [auxCheckProb, setAuxCheckProb] = useState('-');
  const [auxIntuitionFrom, setAuxIntuitionFrom] = useState<string | null>(null);
  const [auxIntuitionFromConf, setAuxIntuitionFromConf] = useState(0);
  const [auxIntuitionTo, setAuxIntuitionTo] = useState<string | null>(null);
  const [auxIntuitionToConf, setAuxIntuitionToConf] = useState(0);

  const activeTurnRef = useRef<'w' | 'b'>('w');
  const currentFenRef = useRef<string>('');
  const ignoreSearchLinesRef = useRef<boolean>(true);
  const lastInferenceSeqRef = useRef(0);

  const {
    stockfishRef,
    sfMultiPvBufferRef,
    stockfishEvalPct,
    sfTopMoves,
    setSfTopMoves,
    initStockfishWorker,
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  } = useStockfish({ activeTurnRef, currentFenRef, ignoreSearchLinesRef });

  const {
    otterWorkerRef,
    policyMoveToIdRef,
    historyMoveToIdRef,
    modelLoaded,
    callOtterWorker,
    loadAndInitModelFromCache,
  } = useOtterWorker({ provider, initStockfishWorker });

  // 1. Check cached engines + WebGPU support on mount.
  useEffect(() => {
    if (typeof window !== 'undefined' && (navigator as Navigator & { gpu?: unknown }).gpu) {
      setProvider('webgpu');
    }
    (async () => {
      try {
        const cache = await caches.open('otter-model-cache');
        const modelRes = await cache.match('/policy_model.onnx');
        const sfRes = await cache.match('/stockfish.js');
        setModelAvailable(!!modelRes);
        setStockfishAvailable(!!sfRes);
      } catch (err) {
        console.error('Cache check failed:', err);
      }
    })();
  }, []);

  // 2. Warm up the Otter worker exactly once both assets are available.
  const modelInitStartedRef = useRef(false);
  useEffect(() => {
    if (modelAvailable && stockfishAvailable && !modelInitStartedRef.current) {
      modelInitStartedRef.current = true;
      loadAndInitModelFromCache();
    }
  }, [modelAvailable, stockfishAvailable]);

  const downloadOtterModel = async () => {
    if (isDownloadingModel) return;
    setIsDownloadingModel(true);
    setDownloadError(null);
    setModelProgress(0);
    try {
      const cache = await caches.open('otter-model-cache');
      const res = await fetch('https://huggingface.co/peargentlabs/otter-chess/resolve/main/model_fp16.onnx');
      if (!res.body) throw new Error('Null response body');
      const total = parseInt(res.headers.get('content-length') || '', 10) || 31 * 1024 * 1024;
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
      await cache.put('/policy_model.onnx', new Response(blob, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': blob.size.toString() },
      }));
      setModelAvailable(true);
      setModelProgress(100);
    } catch (err) {
      console.error('Otter download failed:', err);
      setDownloadError('Failed to download the Otter Chess model. Please check your connection and try again.');
    } finally {
      setIsDownloadingModel(false);
    }
  };

  const downloadStockfish = async () => {
    if (isDownloadingSf) return;
    setIsDownloadingSf(true);
    setDownloadError(null);
    setSfProgress(0);
    try {
      const cache = await caches.open('otter-model-cache');
      const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
      if (!res.body) throw new Error('Null response body');
      const total = parseInt(res.headers.get('content-length') || '', 10) || 1.5 * 1024 * 1024;
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
      await cache.put('/stockfish.js', new Response(blob, {
        headers: { 'content-type': 'application/javascript', 'content-length': blob.size.toString() },
      }));
      setStockfishAvailable(true);
      setSfProgress(100);
    } catch (err) {
      console.error('Stockfish download failed:', err);
      setDownloadError('Failed to download Stockfish. Please check your connection and try again.');
    } finally {
      setIsDownloadingSf(false);
    }
  };

  const eloToBucket = (elo: number) => {
    if (elo < 1100) return 0;
    if (elo >= 2000) return 10;
    return 1 + Math.floor((elo - 1100) / 100);
  };
  const clockToFraction = (clockSeconds: number | null) =>
    clockSeconds !== null ? Math.max(0, Math.min(1, clockSeconds / OLYMPIAD_CLOCK_BASE_SECONDS)) : OLYMPIAD_DEFAULT_CLOCK_FRACTION;

  // Otter inference for the currently displayed position — adapted from
  // /play's runModelInference (app/play/page.tsx), with Analyze-mode's
  // rating-bracket/time-format sliders replaced by the focused game's real
  // WhiteElo/BlackElo headers and real %clk-derived clock fraction.
  const runOtterInference = async (fenStr: string, history: string[], whiteElo: number, blackElo: number, clockFraction: number) => {
    if (!otterWorkerRef.current || !modelLoaded) return;
    let c: Chess;
    try {
      c = new Chess(fenStr);
    } catch (_) {
      return;
    }

    const currentSeq = ++lastInferenceSeqRef.current;
    try {
      const boardData = boardToTensor(c);

      const canonicalHistory = history.map((move, i) => (i % 2 === 1 ? mirrorMove(move) : move));
      const historyIds = new BigInt64Array(20);
      const historyMask = new Uint8Array(20);
      const windowMoves = canonicalHistory.slice(-20);
      const startIdx = 20 - windowMoves.length;
      for (let i = 0; i < windowMoves.length; i++) {
        const token = historyMoveToIdRef.current[windowMoves[i]] || 0;
        historyIds[startIdx + i] = BigInt(token);
        historyMask[startIdx + i] = 1;
      }

      const isWhiteTurn = c.turn() === 'w';
      const activeElo = eloToBucket(isWhiteTurn ? whiteElo : blackElo);
      const opponentElo = eloToBucket(isWhiteTurn ? blackElo : whiteElo);

      const { policyLogits, auxLogits, valuePred } = await callOtterWorker('live', {
        board: boardData,
        historyIds,
        historyMask,
        activeElo,
        opponentElo,
        tc: OLYMPIAD_TC_BUCKET,
        clock: [clockFraction, 0.0],
      }, true);

      if (currentSeq !== lastInferenceSeqRef.current) return;

      setWinProbability(valuePred as number);
      setWinProbFen(fenStr);

      const isBlackTurn = c.turn() === 'b';
      const legalUcis = c.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
      const unsorted: PredictedMove[] = [];
      legalUcis.forEach((moveUci) => {
        try {
          const temp = new Chess(c.fen());
          temp.move({
            from: moveUci.slice(0, 2) as Square,
            to: moveUci.slice(2, 4) as Square,
            promotion: moveUci.length > 4 ? (moveUci.slice(4) as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          if (temp.isCheckmate()) {
            unsorted.push({ move: moveUci, probability: 999.0 });
            return;
          }
        } catch (_) {}

        const canonMove = isBlackTurn ? mirrorMove(moveUci) : moveUci;
        const id = policyMoveToIdRef.current[canonMove];
        unsorted.push({ move: moveUci, probability: id !== undefined ? policyLogits[id] : -999.0 });
      });

      const maxLogit = Math.max(...unsorted.map((m) => m.probability));
      const expSum = unsorted.reduce((acc, m) => acc + Math.exp(m.probability - maxLogit), 0);
      const sortedMoves = unsorted
        .map((m) => ({ move: m.move, probability: Math.exp(m.probability - maxLogit) / expSum }))
        .sort((a, b) => b.probability - a.probability);
      setTopMoves(sortedMoves);

      const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
      const softmax = (arr: number[]) => {
        const mx = Math.max(...arr);
        const exps = arr.map((v) => Math.exp(v - mx));
        const sum = exps.reduce((a, b) => a + b, 0);
        return exps.map((v) => v / sum);
      };
      const pieceNames = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];

      const mvProbs = softmax(Array.from(auxLogits!.slice(0, 6)) as number[]);
      const mvIdx = mvProbs.indexOf(Math.max(...mvProbs));
      setAuxMovingPiece(`${pieceNames[mvIdx]} (${(mvProbs[mvIdx] * 100).toFixed(0)}%)`);

      let capText = 'None';
      if (sortedMoves.length > 0) {
        const toSq = sortedMoves[0].move.slice(2, 4);
        if (c.get(toSq as Square)) {
          const capProbs = softmax(Array.from(auxLogits!.slice(6, 12)) as number[]);
          const capIdx = capProbs.indexOf(Math.max(...capProbs));
          capText = `${pieceNames[capIdx]} (${(capProbs[capIdx] * 100).toFixed(0)}%)`;
        }
      }
      setAuxCapturedPiece(capText);
      setAuxCheckProb(`${(sigmoid(auxLogits![12] as number) * 100).toFixed(0)}%`);

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
    } catch (err) {
      console.error('Olympiad Otter inference error:', err);
    }
  };

  // Side-effect-free variant for the "Moves by Rating" sweep — same
  // tensors, but active_elo is pinned to whichever bucket the caller asks
  // about, and nothing here touches the live prediction state. Mirrors
  // /play's runModelInferenceAtElo (app/play/page.tsx:2161).
  const runOtterInferenceAtElo = async (c: Chess, history: string[], activeEloBucket: number, opponentEloVal: number, clockFraction: number): Promise<PredictedMove[] | null> => {
    if (!otterWorkerRef.current || !modelLoaded) return null;
    try {
      const boardData = boardToTensor(c);
      const canonicalHistory = history.map((move, i) => (i % 2 === 1 ? mirrorMove(move) : move));
      const historyIds = new BigInt64Array(20);
      const historyMask = new Uint8Array(20);
      const windowMoves = canonicalHistory.slice(-20);
      const startIdx = 20 - windowMoves.length;
      for (let i = 0; i < windowMoves.length; i++) {
        const token = historyMoveToIdRef.current[windowMoves[i]] || 0;
        historyIds[startIdx + i] = BigInt(token);
        historyMask[startIdx + i] = 1;
      }

      const { policyLogits } = await callOtterWorker('sweep', {
        board: boardData,
        historyIds,
        historyMask,
        activeElo: activeEloBucket,
        opponentElo: opponentEloVal,
        tc: OLYMPIAD_TC_BUCKET,
        clock: [clockFraction, 0.0],
      }, false);
      const legalUcis = c.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
      const isBlackTurn = c.turn() === 'b';
      const unsorted: PredictedMove[] = legalUcis.map((moveUci) => {
        const canonMove = isBlackTurn ? mirrorMove(moveUci) : moveUci;
        const id = policyMoveToIdRef.current[canonMove];
        return { move: moveUci, probability: id !== undefined ? (policyLogits[id] as number) : -999.0 };
      });
      const maxLogit = Math.max(...unsorted.map((m) => m.probability));
      const expSum = unsorted.reduce((acc, m) => acc + Math.exp(m.probability - maxLogit), 0);
      return unsorted
        .map((m) => ({ move: m.move, probability: Math.exp(m.probability - maxLogit) / expSum }))
        .sort((a, b) => b.probability - a.probability);
    } catch (err) {
      console.error('Olympiad rating-curve inference error:', err);
      return null;
    }
  };

  const whiteElo = focusedGame?.whiteElo ?? DEFAULT_OLYMPIAD_ELO;
  const blackElo = focusedGame?.blackElo ?? DEFAULT_OLYMPIAD_ELO;

  // Memoized (not a fresh .map() every render) since useRatingCurve's own
  // effect depends on this array by reference — see the same note on
  // displayMoves in useFocusedGame.ts.
  const historyUcis = useMemo(() => displayMoves.map((m) => m.uci), [displayMoves]);

  // Redirect both engines to whatever position is currently displayed —
  // the live tip normally, or an earlier ply when reviewing history.
  // Debounced so a burst of position changes (e.g. several moves landing
  // in one poll) doesn't fire repeated stop/go cycles on the live
  // Stockfish worker.
  useEffect(() => {
    if (!focusedGame) return;
    const handle = setTimeout(() => {
      currentFenRef.current = displayFen;
      activeTurnRef.current = displayFen.split(' ')[1] === 'b' ? 'b' : 'w';
      ignoreSearchLinesRef.current = true;
      sfMultiPvBufferRef.current.clear();
      setSfTopMoves([]);

      if (stockfishRef.current) {
        stockfishRef.current.postMessage('stop');
        stockfishRef.current.postMessage(`position fen ${displayFen}`);
        stockfishRef.current.postMessage('go depth 13');
      }

      if (modelLoaded) {
        const activeClock = (displayFen.split(' ')[1] === 'b' ? blackClockSeconds : whiteClockSeconds);
        runOtterInference(displayFen, historyUcis, whiteElo, blackElo, clockToFraction(activeClock));
      }
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen, modelLoaded, focusedGame?.boardKey]);

  const displayChess = useMemo(() => {
    try {
      return new Chess(displayFen);
    } catch (_) {
      return null;
    }
  }, [displayFen]);

  const { ratingCurveData, ratingCurveLoading, ratingCurveHoverIdx, setRatingCurveHoverIdx } = useRatingCurve({
    otterWorkerRef,
    modelLoaded,
    isAnalyzeMode: true,
    game: displayChess,
    historyMoves: historyUcis,
    analyzeWhiteElo: whiteElo,
    analyzeBlackElo: blackElo,
    analyzeHistoryK: 20,
    analyzeTimeFormat: 'classical',
    analyzeWhiteTime: whiteClockSeconds ?? OLYMPIAD_CLOCK_BASE_SECONDS / 2,
    analyzeBlackTime: blackClockSeconds ?? OLYMPIAD_CLOCK_BASE_SECONDS / 2,
    runModelInferenceAtElo: (c, history, activeEloBucket) => {
      const isWhiteTurn = c.turn() === 'w';
      const opponentEloVal = eloToBucket(isWhiteTurn ? blackElo : whiteElo);
      const clockFraction = clockToFraction(isWhiteTurn ? whiteClockSeconds : blackClockSeconds);
      return runOtterInferenceAtElo(c, history, activeEloBucket, opponentEloVal, clockFraction);
    },
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  });

  // Recomputed only once winProbFen actually matches the displayed
  // position — otherwise this holds its previous value (frozen) rather
  // than reinterpreting a stale winProbability under the new position's
  // turn, which is what caused the dip-then-correct flicker on every move.
  const [otterWinPct, setOtterWinPct] = useState(50);
  useEffect(() => {
    if (winProbFen !== displayFen) return;
    const activeTurn = displayFen.split(' ')[1] === 'b' ? 'b' : 'w';
    const normalized = (winProbability + 1) / 2;
    setOtterWinPct(Math.round((activeTurn === 'w' ? normalized : 1 - normalized) * 100));
  }, [displayFen, winProbability, winProbFen]);

  const turn: 'w' | 'b' = displayFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const { whiteDisplay: liveWhiteClock, blackDisplay: liveBlackClock } = useTickingClock(
    whiteClockSeconds,
    blackClockSeconds,
    turn,
    isAtLiveEdge && focusedGame?.result === '*',
  );

  const enginesReady = modelAvailable && stockfishAvailable;
  const nameWithTitle = (name: string, title: string | null) => (title ? `${title} ${name}` : name);

  return (
    <div className="flex-grow flex flex-col lg:flex-row min-h-0 h-[calc(100dvh-68px)] overflow-y-auto lg:divide-x divide-line lg:h-[calc(100vh-68px)] lg:overflow-visible">
      {focusedGame ? (
        <>
          <OlympiadHistoryPanel
            white={nameWithTitle(focusedGame.white, focusedGame.whiteTitle)}
            black={nameWithTitle(focusedGame.black, focusedGame.blackTitle)}
            moves={focusedGame.moves}
            currentMoveIdx={currentMoveIdx}
            goToMove={goToMove}
            jumpToStart={jumpToStart}
            jumpToEnd={jumpToEnd}
            stepMove={stepMove}
          />

          <div className="order-1 lg:order-2 shrink-0 lg:flex-1 flex flex-col min-h-0 min-w-0 lg:overflow-y-auto">
            {!enginesReady && (
              <div className="p-3 px-4 lg:px-6 bg-panel/40 border-b border-line flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                <span className="font-mono text-[11.5px] text-muted">
                  Download the analysis engines to see Otter &amp; Stockfish arrows for this game.
                </span>
                <div className="flex items-center gap-2">
                  {!modelAvailable && (
                    <button
                      onClick={downloadOtterModel}
                      disabled={isDownloadingModel}
                      className="font-mono text-[11px] uppercase font-bold text-pear border border-pear-dim px-2.5 py-1 rounded-[2px] hover:bg-panel disabled:opacity-60 cursor-pointer transition-all"
                    >
                      {isDownloadingModel ? `Otter ${modelProgress}%` : 'Download Otter (31MB)'}
                    </button>
                  )}
                  {!stockfishAvailable && (
                    <button
                      onClick={downloadStockfish}
                      disabled={isDownloadingSf}
                      className="font-mono text-[11px] uppercase font-bold text-pear border border-pear-dim px-2.5 py-1 rounded-[2px] hover:bg-panel disabled:opacity-60 cursor-pointer transition-all"
                    >
                      {isDownloadingSf ? `Stockfish ${sfProgress}%` : 'Download Stockfish (2MB)'}
                    </button>
                  )}
                </div>
                {downloadError && <span className="w-full font-mono text-[11px] text-rose-500">{downloadError}</span>}
              </div>
            )}

            <MainBoard
              fen={displayFen}
              lastMove={lastMove}
              isFlipped={isFlipped}
              setIsFlipped={setIsFlipped}
              topMoves={enginesReady ? topMoves : []}
              sfTopMoves={enginesReady ? sfTopMoves : []}
              playedMove={nextPlayedMove ? { from: nextPlayedMove.from, to: nextPlayedMove.to } : null}
              otterWinPct={otterWinPct}
              stockfishEvalPct={stockfishEvalPct}
              whiteLabel={nameWithTitle(focusedGame.white, focusedGame.whiteTitle)}
              blackLabel={nameWithTitle(focusedGame.black, focusedGame.blackTitle)}
              whiteTeam={focusedGame.whiteTeam}
              blackTeam={focusedGame.blackTeam}
              whiteElo={focusedGame.whiteElo}
              blackElo={focusedGame.blackElo}
              result={focusedGame.result}
              whiteClockSeconds={liveWhiteClock}
              blackClockSeconds={liveBlackClock}
              isLive={!isDemo && isAtLiveEdge && focusedGame.result === '*'}
            />

            <div className="mt-3">
              <div className="p-3 px-4 lg:px-6 flex flex-wrap items-center justify-between gap-2.5 shrink-0 border-y border-line">
                <div className="flex flex-wrap items-center gap-2.5">
                  <TeamDropdown teams={teams} selectedTeam={selectedTeam} setSelectedTeam={setSelectedTeam} />
                  <SectionToggle section={section} setSection={setSection} />
                </div>
                <GridPagination
                  pageStart={filteredBoards.length === 0 ? 0 : gridPageStart + 1}
                  pageEnd={Math.min(gridPageStart + GRID_PAGE_SIZE, filteredBoards.length)}
                  total={filteredBoards.length}
                  onPrev={() => setGridPage((p) => Math.max(0, p - 1))}
                  onNext={() => setGridPage((p) => Math.min(gridTotalPages - 1, p + 1))}
                  hasPrev={clampedGridPage > 0}
                  hasNext={clampedGridPage < gridTotalPages - 1}
                />
              </div>
              <div className="pt-3">
                <MiniBoardStrip
                  boards={pagedBoards}
                  focusedBoardKey={focusedGame.boardKey}
                  onSelectBoard={setFocusedBoardKey}
                />
              </div>
            </div>
          </div>

          <div className="order-2 lg:order-3 border-t border-line lg:border-t-0 w-full lg:w-[400px] flex-1 min-h-[150px] lg:flex-none lg:min-h-0 flex flex-col bg-panel divide-y divide-line overflow-y-auto">
            <OlympiadStatsPanel
              game={displayChess}
              roundName={isDemo ? 'Demo Position — not live' : (roundName ?? OLYMPIAD_TOURNAMENT_NAME)}
              topMoves={enginesReady ? topMoves : []}
              sfTopMoves={enginesReady ? sfTopMoves : []}
              auxIntuitionFrom={auxIntuitionFrom}
              auxIntuitionFromConf={auxIntuitionFromConf}
              auxIntuitionTo={auxIntuitionTo}
              auxIntuitionToConf={auxIntuitionToConf}
              winProbability={winProbability}
              auxCheckProb={auxCheckProb}
              auxMovingPiece={auxMovingPiece}
              auxCapturedPiece={auxCapturedPiece}
              ratingCurveData={ratingCurveData}
              ratingCurveLoading={ratingCurveLoading}
              ratingCurveHoverIdx={ratingCurveHoverIdx}
              setRatingCurveHoverIdx={setRatingCurveHoverIdx}
            />
          </div>
        </>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="font-mono text-[11px] text-pear uppercase font-bold tracking-wider">
            {tournamentOverride ? 'Broadcast' : OLYMPIAD_TOURNAMENT_NAME}
          </span>
          <h2 className="font-space text-lg text-paper">
            {gamesError ? gamesError : gamesLoading ? 'Loading the live broadcast…' : 'Waiting for the round to start.'}
          </h2>
          {roundName && <p className="font-mono text-[12px] text-muted">{roundName}</p>}
        </div>
      )}
    </div>
  );
}
