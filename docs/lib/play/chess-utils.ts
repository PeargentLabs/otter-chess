// Pure, stateless helpers used by /play — none of these close over React
// state, so they're safe to share across the page and its hooks/components.

import { Chess } from 'chess.js';
import type { PredictedMove } from './types';

// Chessground arrow-brush colors, shared by every board that draws Otter/
// Stockfish/played-move arrows (currently /play's Analyze mode and
// /olympiad's main board) so there's one place to change them instead of
// duplicated hex literals in each board's Chessground init and each
// sidebar's arrow-colour legend.
export const ARROW_BRUSH_COLORS = {
  otter: '#5C8A2E',
  stockfish: '#F0605F',
  played: '#EAB308',
} as const;

// Convert FEN string to 8x8 pieces grid (row 0 is Rank 8, col 0 is File a)
export const fenToGrid = (fen: string): string[][] => {
  const grid: string[][] = Array(8).fill(null).map(() => Array(8).fill(""));
  const fields = fen.split(' ');
  const ranks = fields[0].split('/');
  for (let r = 0; r < 8; r++) {
    let c = 0;
    if (!ranks[r]) continue;
    for (let i = 0; i < ranks[r].length; i++) {
      const char = ranks[r][i];
      if (/[1-8]/.test(char)) {
        c += parseInt(char, 10);
      } else {
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase();
        grid[r][c] = color + type;
        c++;
      }
    }
  }
  return grid;
};

// Convert 8x8 pieces grid back to FEN placement string
export const gridToFenPlacement = (grid: string[][]): string => {
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) {
    let rankStr = "";
    let emptyCount = 0;
    for (let c = 0; c < 8; c++) {
      const piece = grid[r][c];
      if (piece === "") {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount.toString();
          emptyCount = 0;
        }
        const color = piece[0];
        const type = piece[1];
        const char = color === 'w' ? type.toUpperCase() : type.toLowerCase();
        rankStr += char;
      }
    }
    if (emptyCount > 0) {
      rankStr += emptyCount.toString();
    }
    ranks.push(rankStr);
  }
  return ranks.join('/');
};

export const boardToTensor = (c: Chess): Float32Array => {
  const originalTurn = c.turn();
  const isWhite = originalTurn === 'w';
  const tensor = new Float32Array(18 * 8 * 8);

  const setVal = (ch: number, row: number, col: number, val: number) => {
    tensor[ch * 64 + row * 8 + col] = val;
  };

  const fillChannel = (ch: number, val: number) => {
    for (let i = 0; i < 64; i++) {
      tensor[ch * 64 + i] = val;
    }
  };

  const board = c.board();
  const pieceToCh: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

  for (let r = 0; r < 8; r++) {
    for (let cIdx = 0; cIdx < 8; cIdx++) {
      const piece = board[r][cIdx];
      if (piece) {
        const row = isWhite ? r : (7 - r);
        const col = cIdx;
        const color = isWhite ? piece.color : (piece.color === 'w' ? 'b' : 'w');
        const ch = pieceToCh[piece.type] + (color === 'w' ? 0 : 6);
        setVal(ch, row, col, 1.0);
      }
    }
  }

  const castling = {
    w: { k: c.fen().split(' ')[2].includes('K'), q: c.fen().split(' ')[2].includes('Q') },
    b: { k: c.fen().split(' ')[2].includes('k'), q: c.fen().split(' ')[2].includes('q') }
  };

  if (isWhite) {
    if (castling.w.k) fillChannel(12, 1.0);
    if (castling.w.q) fillChannel(13, 1.0);
    if (castling.b.k) fillChannel(14, 1.0);
    if (castling.b.q) fillChannel(15, 1.0);
  } else {
    if (castling.b.k) fillChannel(12, 1.0);
    if (castling.b.q) fillChannel(13, 1.0);
    if (castling.w.k) fillChannel(14, 1.0);
    if (castling.w.q) fillChannel(15, 1.0);
  }

  const fenParts = c.fen().split(' ');
  const epSquare = fenParts[3];
  if (epSquare && epSquare !== '-') {
    const file = epSquare.charCodeAt(0) - 97;
    const rank = parseInt(epSquare[1], 10);
    const row = isWhite ? (8 - rank) : (rank - 1);
    const col = file;
    setVal(16, row, col, 1.0);
  }

  if (isWhite) {
    fillChannel(17, 1.0);
  }

  return tensor;
};

export const mirrorSquare = (square: string): string => {
  const file = square[0];
  const rank = parseInt(square[1], 10);
  return `${file}${9 - rank}`;
};

export const mirrorMove = (moveUci: string): string => {
  const from = moveUci.slice(0, 2);
  const to = moveUci.slice(2, 4);
  const promo = moveUci.length > 4 ? moveUci.slice(4) : '';
  return `${mirrorSquare(from)}${mirrorSquare(to)}${promo}`;
};

export const formatUciAsSan = (uci: string, fen?: string): string => {
  if (!fen) return uci;
  try {
    const c = new Chess(fen);
    const mv = c.move({
      from: uci.slice(0, 2) as any,
      to: uci.slice(2, 4) as any,
      promotion: uci.length > 4 ? (uci.slice(4) as any) : undefined,
    });
    return mv ? mv.san : uci;
  } catch (_) {
    return uci;
  }
};

// Stockfish's raw centipawn score (White's perspective; mate scores are
// offset ±100000 — see the MultiPV parsing in initStockfishWorker) as a
// pawns-style points string for the eval bar pill, e.g. "+0.62" or "M3".
export const formatSfPoints = (raw: number | undefined): string => {
  if (raw === undefined) return '...';
  if (raw > 90000) return `M${100000 - raw}`;
  if (raw < -90000) return `-M${Math.abs(-100000 - raw)}`;
  return (raw > 0 ? '+' : '') + (raw / 100).toFixed(2);
};

export const classifyDrop = (drop: number): { label: string; color: string } => {
  if (drop > 200) return { label: 'Blunder', color: '#F43F5E' };
  if (drop > 100) return { label: 'Mistake', color: '#FB923C' };
  if (drop > 50) return { label: 'Inaccuracy', color: '#EAB308' };
  return { label: 'Good', color: '#5C8A2E' };
};

// Helper to parse base seconds of a time control (e.g. "600+0" -> 600)
export const getBaseSeconds = (tc: string): number => {
  if (!tc || !tc.includes('+')) return 600;
  try {
    const parts = tc.split('+');
    return parseInt(parts[0], 10);
  } catch {
    return 600;
  }
};

// Helper to parse increment seconds of a time control
export const getIncrementSeconds = (tc: string): number => {
  if (!tc || !tc.includes('+')) return 0;
  try {
    const parts = tc.split('+');
    return parseInt(parts[1], 10);
  } catch {
    return 0;
  }
};

// Analyze mode's three selectable time formats, mapped to a base+increment
// time-control string in the same "seconds+seconds" shape used elsewhere
// (see getBaseSeconds/getIncrementSeconds below) — chosen so each format
// resolves to a distinct tc bucket in the model's time-control conditioning.
export const ANALYZE_TIME_FORMATS: Record<'blitz' | 'rapid' | 'classical', string> = {
  blitz: '300+0',
  rapid: '600+0',
  classical: '1800+0',
};

export const timeFormatToTc = (format: 'blitz' | 'rapid' | 'classical'): string =>
  ANALYZE_TIME_FORMATS[format];

// mm:ss display for a remaining-time slider.
export const formatClock = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Helper to compute expected human think time based on predictions, clock, and TC
//
// Modelled on how a human actually spends clock, which is *not* simply "the
// flatter the engine's move distribution, the longer the think":
//
//  - Opening moves come out of memory, not calculation. Book positions have
//    the flattest distributions in the whole game (e4/d4/Nf3/c4 are all
//    perfectly normal), so raw distribution entropy rates them as maximally
//    hard exactly where a human is fastest. `openingFactor` damps the first
//    few plies hard and ramps back to full by roughly move 10.
//  - Forced positions are instant regardless of entropy. A single legal reply,
//    a recapture, or a check evasion gets played without thought, so a low
//    legal-move count collapses the estimate.
//  - Time pressure speeds humans up, but only once it actually bites. The
//    clock term stays neutral for most of the game and only accelerates below
//    ~35% remaining, rather than making the *opening* the slowest phase (which
//    a plain timeLeft/baseSec ratio does, since it peaks at 1.0 on move 1).
//  - Nobody sinks an unbounded share of their remaining clock into one move,
//    hence the cap.
//
// `ply` is the number of half-moves already played (i.e. the history length
// before this move) and `legalMoveCount` the number of legal moves available
// in the position. Both are optional: omitted, they degrade to neutral so
// callers without a position handy still get a sane number.
export const getExpectedHumanTime = (
  preds: PredictedMove[],
  tcStr: string,
  timeLeft: number,
  ply: number = 0,
  legalMoveCount: number = 0,
): number => {
  if (!preds || preds.length === 0) return 3.0;

  const p1 = preds[0].probability;
  const p2 = preds[1]?.probability || 0;

  // Entropy/Difference factor: if p1 is close to p2, decisions are harder
  const diff = Math.max(0, p1 - p2);
  // Harder moves have low diff and low absolute p1
  const difficulty = 1.0 - (diff * 0.5 + p1 * 0.5);

  const baseSec = getBaseSeconds(tcStr);
  // 0.04 rather than 0.05: the clock term below no longer tapers through the
  // midgame, so trimming the scale keeps peak midgame thinks about where they
  // were instead of inflating them.
  const scale = Math.max(5, baseSec * 0.04); // e.g. 24s max for Rapid

  // Remaining clock scale: neutral until the clock genuinely bites, then a
  // steepening speed-up into the scramble.
  const clockRatio = baseSec > 0 ? timeLeft / baseSec : 1.0;
  const clockFactor = clockRatio >= 0.5 ? 1.0 : Math.max(0.08, clockRatio / 0.5);

  // Book/opening damping: near-instant for the first few plies, easing back to
  // a full-length think by ~ply 20.
  const openingFactor = Math.min(1, 0.03 + Math.pow(Math.max(0, ply - 4) / 16, 1.5));

  // Forced-move damping. 0 means "caller didn't say", so stay neutral.
  const forcedFactor =
    legalMoveCount <= 0 ? 1.0
      : legalMoveCount === 1 ? 0.05
      : legalMoveCount === 2 ? 0.25
      : legalMoveCount <= 4 ? 0.35
      : legalMoveCount <= 8 ? 0.8
      : 1.0;

  const raw = 0.4 + difficulty * scale * clockFactor;
  const estimated = raw * openingFactor * forcedFactor;

  // Never burn an unbounded share of what's left on a single move. 6% is what
  // keeps Otter from flagging itself in the pathological case where every
  // position in a long game reads as maximally murky — the old formula got
  // that for free from its linearly-decaying clock term, which this one
  // deliberately doesn't have.
  const cap = Math.max(0.3, timeLeft * 0.06);

  return Math.max(0.1, Math.round(Math.min(estimated, cap) * 10) / 10);
};
