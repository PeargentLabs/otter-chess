'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { PredictedMove } from '@/lib/play/types';
import { boardToTensor, mirrorMove, mirrorSquare, withOppositeTurn } from '@/lib/play/chess-utils';
import { useStockfish } from '@/hooks/play/useStockfish';
import { useOtterWorker } from '@/hooks/play/useOtterWorker';
import { useRatingCurve } from '@/hooks/play/useRatingCurve';
import { useOlympiadSection } from '@/hooks/olympiad/useOlympiadSection';
import { useFocusedGame } from '@/hooks/olympiad/useFocusedGame';
import { useTickingClock } from '@/hooks/olympiad/useTickingClock';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, ALL_TOURNAMENT_IDS, OLYMPIAD_TOURNAMENT_NAME } from '@/lib/olympiad/config';
import { readSavedTeam, writeSavedSection, writeSavedTeam } from '@/lib/olympiad/filter-prefs';
import { groupIntoPairings, uniqueTeams } from '@/lib/olympiad/grouping';
import { DEMO_GAMES } from '@/lib/olympiad/demo-data';
import MainBoard from '@/components/olympiad/MainBoard';
import OlympiadHistoryPanel from '@/components/olympiad/OlympiadHistoryPanel';
import OlympiadStatsPanel from '@/components/olympiad/OlympiadStatsPanel';
import MiniBoardStrip from '@/components/olympiad/MiniBoardStrip';
import GridPagination from '@/components/olympiad/GridPagination';
import TeamDropdown from '@/components/olympiad/TeamDropdown';
import SectionToggle, { type OlympiadSection } from '@/components/olympiad/SectionToggle';
import SetupModal from '@/components/play/modals/SetupModal';

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

  const [section, setSectionState] = useState<OlympiadSection>(isValidSection(sectionParam) ? sectionParam : 'all');
  // Starts at null (not the lobby's default) purely so the mount effect
  // below can tell "not read from storage yet" apart from an explicit
  // "All Teams" — it's overwritten within the same first effect pass,
  // before anything renders using it as a real value.
  const [selectedTeam, setSelectedTeamState] = useState<string | null>(null);
  // Explicitly clicked (or deep-linked) board, if any — otherwise the page
  // defaults to the first board of the first (or selected-team's) pairing.
  const [focusedBoardKey, setFocusedBoardKey] = useState<string | null>(focusParam);

  // setSection/setSelectedTeam (used by the SectionToggle/TeamDropdown
  // widgets below) persist every user-driven change, so it carries back to
  // the lobby too. The URL-sync and storage-read effects below call the
  // raw ...State setters directly instead — they're resolving "what does
  // the URL/storage say right now", not a deliberate filter change, and
  // persisting THEM would re-write a just-read value on top of itself (or
  // worse, stomp a real preference with a stale one) before the very
  // re-render that would have shown it.
  const setSection = (s: OlympiadSection) => { setSectionState(s); writeSavedSection(s); };
  const setSelectedTeam = (t: string | null) => { setSelectedTeamState(t); writeSavedTeam(t); };

  // A useState initializer only runs on the very first mount — but a
  // second click from the lobby lands on this SAME route (just a new
  // ?focus=/&section= query), and Next's client-side router reuses the
  // already-mounted page instead of remounting it. Without this, the URL
  // would change but `section`/`focusedBoardKey` wouldn't, so a second
  // clicked game just kept showing whichever game was focused before —
  // this keeps them synced to the URL on every navigation, not just the
  // first.
  useEffect(() => {
    setFocusedBoardKey(focusParam);
  }, [focusParam]);
  useEffect(() => {
    if (isValidSection(sectionParam)) setSectionState(sectionParam);
  }, [sectionParam]);
  // The lobby's team filter carries over here (no ?team= URL plumbing
  // needed) since both pages read/write the same stored preference —
  // picking India in the lobby and clicking into a game means this page's
  // own team dropdown starts on India too, instead of resetting to "All
  // Teams" the way it used to.
  useEffect(() => {
    setSelectedTeamState(readSavedTeam());
  }, []);

  // What to POLL — always every sub-broadcast across both sections, unless
  // a single tournament is explicitly overridden via ?tournament=, or demo
  // mode needs no network at all. Polling everything regardless of the
  // section toggle means switching it is a free client-side filter below,
  // never a teardown-and-refetch of a whole new tournament set.
  const pollIds = useMemo(() => {
    if (isDemo) return [];
    if (tournamentOverride) return [tournamentOverride];
    return ALL_TOURNAMENT_IDS;
  }, [isDemo, tournamentOverride]);

  const { games: liveGames, gamesByTournamentId, asOfByTournamentId, roundName, loading: gamesLoading, error: gamesError } = useOlympiadSection(pollIds, roundNumber);
  // ?demo=1 also feeds the mini-board strip / team dropdown / section
  // toggle from lib/olympiad/demo-data.ts's several dummy pairings, so
  // that part of the design is reviewable with no network dependency too.
  //
  // This is every currently polled game regardless of which section is
  // displayed — a deep link (a click from the lobby, or ?focus= in the
  // URL) resolves against this full set below, not just whichever
  // section's boards are on screen right now.
  const allGames = isDemo ? DEMO_GAMES : liveGames;

  // What to DISPLAY — the mini-board strip / team dropdown / pairings are
  // scoped to just the active section (or the single overridden tournament).
  const sectionIds = useMemo(() => {
    if (tournamentOverride) return [tournamentOverride];
    if (section === 'open') return OPEN_TOURNAMENT_IDS;
    if (section === 'women') return WOMENS_TOURNAMENT_IDS;
    return ALL_TOURNAMENT_IDS;
  }, [tournamentOverride, section]);

  const games = useMemo(
    () => (isDemo ? DEMO_GAMES : sectionIds.flatMap((id) => gamesByTournamentId.get(id) ?? [])),
    [isDemo, sectionIds, gamesByTournamentId],
  );

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

  const focusedGame = useMemo(() => {
    if (focusedBoardKey) {
      // Searches the full unfiltered set, not just the active section's
      // `games` — a deep link's board must resolve regardless of which
      // section happens to be selected (e.g. it defaults to "open" but the
      // clicked board was a Women's game). And whenever a specific board
      // WAS requested (a lobby click, or ?focus= in the URL), never
      // silently substitute a different one if it isn't found — that's
      // what made clicking one game land on a completely different one.
      // Falling through to "no focused game" instead just shows the
      // render below's own waiting state until this board's poll catches
      // up (it keeps polling in the background regardless).
      return allGames.find((g) => g.boardKey === focusedBoardKey) ?? null;
    }
    const pool = filteredPairings.length > 0 ? filteredPairings : pairings;
    return pool[0]?.boards[0] ?? null;
  }, [focusedBoardKey, allGames, filteredPairings, pairings]);

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

  // Keyboard move navigation — same convention as /play's Analyze mode
  // (ArrowRight/Left step one ply, ArrowUp/Down jump to the start/live
  // edge). OlympiadHistoryPanel's own footer already advertises this; it
  // just never had a listener wired up to back it.
  //
  // stepMove/jumpToStart/jumpToEnd are plain closures re-created every
  // render (not memoized) — reading them straight from a dependency array
  // would either go stale (if the listener only re-attached rarely) or
  // re-attach a window listener on every tick of the live clock. A ref
  // updated every render sidesteps both: the effect below only actually
  // re-attaches when the focused BOARD changes, but the handler it
  // installed always calls through to whichever closures are current.
  const navRef = useRef({ stepMove, jumpToStart, jumpToEnd });
  useEffect(() => {
    navRef.current = { stepMove, jumpToStart, jumpToEnd };
  });
  useEffect(() => {
    if (!focusedGame) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navRef.current.stepMove(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navRef.current.stepMove(-1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navRef.current.jumpToStart();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navRef.current.jumpToEnd();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedGame?.boardKey]);

  const [isFlipped, setIsFlipped] = useState(false);
  // Off by default — real broadcast clock data is noisy/incomplete (not
  // every feed carries %clk, see lib/olympiad/pgn-parser.ts) and turned out
  // to be one more variable worth isolating while comparing Otter's reads
  // against known outcomes. On, it's the focused game's real remaining-time
  // fraction; off, a neutral mid-clock reading, same as when a feed simply
  // doesn't have %clk data at all.
  const [passClockToOtter, setPassClockToOtter] = useState(false);
  // On by default (unlike the clock) — the move sequence leading to this
  // position is real, complete data straight from the broadcast PGN, not
  // something noisy/partial like %clk coverage. Off feeds an empty history
  // window instead, for isolating how much of a read comes from the
  // position alone versus the moves that led to it.
  const [passHistoryToOtter, setPassHistoryToOtter] = useState(true);

  // Engine availability / download gating — trimmed version of /play's
  // engine bootstrap (same cache, same asset URLs), without the match/
  // editor-mode UI that doesn't apply here.
  const [modelAvailable, setModelAvailable] = useState(false);
  const [stockfishAvailable, setStockfishAvailable] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [isDownloadingSf, setIsDownloadingSf] = useState(false);
  const [sfProgress, setSfProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'webgpu' | 'wasm'>('wasm');

  // Otter output state (mirrors the subset of /play's page-level state that
  // AnalyzeSidebar's extracted panels read).
  const [topMoves, setTopMoves] = useState<PredictedMove[]>([]);
  // Otter's own raw, mover-relative reading — feeds IntuitionPanel's plain
  // signed number via OlympiadStatsPanel, distinct from the two labeled
  // White/Black eval bars below.
  const [winProbability, setWinProbability] = useState(0);
  // Two separate readings instead of one flipped-based-on-turn number —
  // Otter's value head turns out not to be fully consistent between "White
  // to move" and "Black to move" framings of the same real game trajectory
  // (confirmed by direct testing against real finished games), so forcing
  // both into a single number made the bar swing depending purely on whose
  // turn it was, not on what was actually happening in the game. Showing
  // both readings side by side is honest about that instead of hiding it
  // behind a transform, and lets each stay pinned to its own label —
  // "White" always means the White-to-move query's own answer.
  const [otterWhitePct, setOtterWhitePct] = useState(50);
  const [otterBlackPct, setOtterBlackPct] = useState(50);
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
        const hasModel = !!modelRes;
        const hasSf = !!sfRes;
        setModelAvailable(hasModel);
        setStockfishAvailable(hasSf);

        if (!hasModel || !hasSf) {
          setShowSetupModal(true);
        }
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

  // The secondary (non-mover) side's bar — see the call site in
  // runOtterInference below for why this is split out and fire-and-forget
  // rather than awaited inline: it must never delay the move arrows/aux
  // stats, which only need the FIRST query's already-resolved data.
  const runOtterOppositeInference = async (
    fenStr: string,
    realIsWhiteTurn: boolean,
    whiteElo: number,
    blackElo: number,
    clockFraction: number,
    historyIds: BigInt64Array,
    historyMask: Uint8Array,
    currentSeq: number,
  ) => {
    const oppositeFen = withOppositeTurn(fenStr);
    if (!oppositeFen) return;
    try {
      const oc = new Chess(oppositeFen);
      const oppBoardData = boardToTensor(oc);
      const oppIsWhiteTurn = !realIsWhiteTurn;
      const oppActiveElo = eloToBucket(oppIsWhiteTurn ? whiteElo : blackElo);
      const oppOpponentElo = eloToBucket(oppIsWhiteTurn ? blackElo : whiteElo);
      const oppResult = await callOtterWorker('live', {
        board: oppBoardData,
        historyIds,
        historyMask,
        activeElo: oppActiveElo,
        opponentElo: oppOpponentElo,
        tc: OLYMPIAD_TC_BUCKET,
        clock: [clockFraction, 0.0],
      }, true);
      if (currentSeq !== lastInferenceSeqRef.current) return;
      const oppPct = Math.round(((oppResult.valuePred as number) + 1) / 2 * 100);
      if (oppIsWhiteTurn) setOtterWhitePct(oppPct); else setOtterBlackPct(oppPct);
    } catch (_) {
      // This exact arrangement is illegal with the other side to move (e.g.
      // it would leave the real mover in check) — leave that side's bar
      // showing its last known value rather than guessing.
    }
  };

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

      const canonicalHistory = passHistoryToOtter
        ? history.map((move, i) => (i % 2 === 1 ? mirrorMove(move) : move))
        : [];
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

      // This query already answered "how does Otter see this for whoever's
      // actually moving" — when isWhiteTurn, that IS the White bar's own
      // reading directly (no flip needed, since the value head already
      // answers from the mover's own perspective).
      const realPct = Math.round(((valuePred as number) + 1) / 2 * 100);
      if (isWhiteTurn) setOtterWhitePct(realPct); else setOtterBlackPct(realPct);

      // The OTHER bar needs a second, hypothetical query treating this same
      // arrangement as if the other side were to move (see
      // withOppositeTurn) — kicked off here but NOT awaited: the move
      // arrows/aux stats below only need the query that already resolved
      // above, so waiting on a second full model pass before computing them
      // was pure added latency on every single navigation, doubling how
      // long clicking through moves took to feel responsive. It updates
      // the other bar whenever it finishes instead.
      runOtterOppositeInference(fenStr, isWhiteTurn, whiteElo, blackElo, clockFraction, historyIds, historyMask, currentSeq);

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
      const canonicalHistory = passHistoryToOtter
        ? history.map((move, i) => (i % 2 === 1 ? mirrorMove(move) : move))
        : [];
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
  // Fires immediately, same as /play's Analyze mode (updateGameState in
  // app/play/page.tsx): the position itself is already on screen the
  // instant currentMoveIdx changes (displayFen is a plain useMemo off it,
  // no async in the way), and runOtterInference is fire-and-forget here
  // exactly like /play's own runModelInference call — this effect never
  // awaits it, so clicking through moves never waits on the engines. A
  // debounce here was pure extra latency stacked on top of that for no
  // benefit: rapid navigation is already handled by the Otter worker's own
  // "a newer live request supersedes the queued one" logic (see
  // public/otter-worker.js) and by Stockfish's own 'stop' before each new
  // 'go', not by delaying when either one starts.
  useEffect(() => {
    if (!focusedGame) return;
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
      const clockFraction = passClockToOtter ? clockToFraction(activeClock) : OLYMPIAD_DEFAULT_CLOCK_FRACTION;
      runOtterInference(displayFen, historyUcis, whiteElo, blackElo, clockFraction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen, modelLoaded, focusedGame?.boardKey, passClockToOtter, passHistoryToOtter]);

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
      const clockFraction = passClockToOtter
        ? clockToFraction(isWhiteTurn ? whiteClockSeconds : blackClockSeconds)
        : OLYMPIAD_DEFAULT_CLOCK_FRACTION;
      return runOtterInferenceAtElo(c, history, activeEloBucket, opponentEloVal, clockFraction);
    },
    ensureBgStockfishWorker,
    evaluatePositionOnce,
  });

  const turn: 'w' | 'b' = displayFen.split(' ')[1] === 'b' ? 'b' : 'w';
  // When the focused game's own tournament hasn't reported a real poll
  // timestamp yet (e.g. isDemo, or genuinely still loading), Date.now() is
  // the only sane fallback — it just means "assume this reading is fresh,"
  // which is exactly what the hook always assumed before asOf existed.
  const clockAsOf = (focusedGame && asOfByTournamentId.get(focusedGame.tournamentId)) ?? Date.now();
  const { whiteDisplay: liveWhiteClock, blackDisplay: liveBlackClock } = useTickingClock(
    whiteClockSeconds,
    blackClockSeconds,
    turn,
    isAtLiveEdge && focusedGame?.result === '*',
    clockAsOf,
  );

  const enginesReady = modelAvailable && stockfishAvailable;
  const nameWithTitle = (name: string, title: string | null) => (title ? `${title} ${name}` : name);

  return (
    <div className="flex-grow flex flex-col lg:flex-row min-h-0 h-[calc(100dvh-68px)] overflow-y-auto lg:divide-x divide-line lg:h-[calc(100vh-68px)] lg:overflow-visible">
      {focusedGame ? (
        <>
          <OlympiadHistoryPanel
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
                  <button
                    onClick={() => setShowSetupModal(true)}
                    className="font-mono text-[11px] uppercase font-bold text-pear border border-pear px-2.5 py-1 rounded-[2px] hover:bg-pear hover:text-bg cursor-pointer transition-all"
                  >
                    Setup Engines
                  </button>
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
              otterWhitePct={otterWhitePct}
              otterBlackPct={otterBlackPct}
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
                  <TeamDropdown
                    teams={teams}
                    selectedTeam={selectedTeam}
                    // Picking a team here is an explicit "take me to their
                    // board" action, so it drops the current pin — done
                    // right at this call site (not a passive effect keyed
                    // on selectedTeam) so it only fires on an actual click,
                    // never on mount or when the team carries over from the
                    // lobby's own selection.
                    setSelectedTeam={(team) => {
                      setSelectedTeam(team);
                      setFocusedBoardKey(null);
                    }}
                  />
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
              passClockToOtter={passClockToOtter}
              setPassClockToOtter={setPassClockToOtter}
              passHistoryToOtter={passHistoryToOtter}
              setPassHistoryToOtter={setPassHistoryToOtter}
            />
          </div>
        </>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="font-mono text-[11px] text-pear uppercase font-bold tracking-wider">
            {tournamentOverride ? 'Broadcast' : OLYMPIAD_TOURNAMENT_NAME}
          </span>
          <h2 className="font-space text-lg text-paper">
            {gamesError
              ? gamesError
              : focusedBoardKey
              ? 'Still connecting to that game — it should appear in a few seconds.'
              : gamesLoading
              ? 'Loading the live broadcast…'
              : 'Waiting for the round to start.'}
          </h2>
          {roundName && <p className="font-mono text-[12px] text-muted">{roundName}</p>}
        </div>
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
          description="We need to download the models to see live Otter & Stockfish analysis."
        />
      )}
    </div>
  );
}
