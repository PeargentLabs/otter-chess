// Multi-game PGN parsing for Lichess broadcast round feeds. Generalizes
// the single-game FEN/PGN-load logic used by /play's Analyze mode
// (loadGameForAnalysis in app/play/page.tsx) to a feed containing many
// games concatenated together — one round of an Olympiad broadcast is
// every board's game in one PGN blob.

import { Chess } from 'chess.js';
import type { OlympiadGame, OlympiadMove } from './types';

const cleanHeader = (v: string | null | undefined): string | null =>
  (v && v !== '?' ? v : null);

// Official Lichess relays annotate each move with the mover's remaining
// clock as a `{ [%clk H:MM:SS] }` PGN comment — confirmed present on live
// broadcast feeds via a direct API check. Not guaranteed on every relay,
// so callers must treat a null result as "unknown", not "flagged".
const CLOCK_RE = /%clk\s+(\d+):(\d{2}):(\d{2})/;
const parseClockComment = (comment: string | undefined): number | null => {
  if (!comment) return null;
  const m = CLOCK_RE.exec(comment);
  if (!m) return null;
  const [, h, mm, ss] = m;
  return parseInt(h, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(ss, 10);
};

const parseEloHeader = (v: string | null | undefined): number | null => {
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? null : n;
};

// Broadcast Round headers look like "5.37" (round 5, board 37). Falls back
// to null when the feed doesn't split boards into its own Round tag.
const parseBoardNumber = (round: string | null | undefined): number | null => {
  if (!round || !round.includes('.')) return null;
  const n = parseInt(round.split('.')[1], 10);
  return isNaN(n) ? null : n;
};

// Lichess relays often annotate a move with several back-to-back comment
// blocks — e.g. `{ [%eval -1.39] } { Mistake. Nf3 was best. } { [%clk
// 1:14:29] }` — but chess.js's PGN parser only tolerates ONE comment
// immediately after a move; a second adjacent `{...}` throws a parse
// error. Confirmed against a real round: this silently dropped 76 of 80
// games (every one with Lichess's auto-generated move-quality commentary),
// leaving only the handful of comment-free games to show up at all.
// Merging adjacent comment blocks into one before parsing fixes it without
// losing anything — %clk/%eval are found by regex search over the merged
// text regardless of where they land inside it.
const mergeAdjacentComments = (pgn: string): string => pgn.replace(/\}\s*\{/g, ' ');

function parseOneGame(pgnBlock: string, tournamentId: string): OlympiadGame | null {
  const tempChess = new Chess();
  try {
    tempChess.loadPgn(mergeAdjacentComments(pgnBlock));
  } catch (_) {
    return null;
  }

  const headers = tempChess.header();

  // A round that exists but hasn't been paired/started yet still returns
  // one PGN block per expected board, just with no player names and no
  // moves — not a real game to display. Treat "neither side named" as
  // that stub case rather than rendering a placeholder "White vs Black"
  // card with a false live indicator.
  if (!cleanHeader(headers.White) && !cleanHeader(headers.Black)) {
    return null;
  }

  const verboseMoves = tempChess.history({ verbose: true });
  // chess.js keys post-move comments (where %clk lives) by the resulting
  // FEN, from the ORIGINAL parse — not the replay below, since that's a
  // fresh instance chess.js knows nothing about.
  const commentsByFen = new Map(tempChess.getComments().map((c) => [c.fen, c.comment]));

  // Replay through a fresh instance to capture a FEN snapshot per ply, the
  // same walk /play's loadGameForAnalysis does for a pasted PGN.
  const moves: OlympiadMove[] = [];
  const replay = new Chess();
  for (const m of verboseMoves) {
    replay.move(m.san);
    const fen = replay.fen();
    moves.push({
      san: m.san,
      uci: m.from + m.to + (m.promotion || ''),
      fen,
      from: m.from,
      to: m.to,
      clockSeconds: parseClockComment(commentsByFen.get(fen)),
    });
  }

  const boardKey = cleanHeader(headers.GameURL)
    || `${headers.White || '?'}-${headers.Black || '?'}-${headers.Round || '?'}`;

  return {
    boardKey,
    tournamentId,
    boardNumber: parseBoardNumber(headers.Round),
    white: cleanHeader(headers.White) || 'White',
    black: cleanHeader(headers.Black) || 'Black',
    whiteTeam: cleanHeader(headers.WhiteTeam),
    blackTeam: cleanHeader(headers.BlackTeam),
    whiteElo: parseEloHeader(headers.WhiteElo),
    blackElo: parseEloHeader(headers.BlackElo),
    whiteTitle: cleanHeader(headers.WhiteTitle),
    blackTitle: cleanHeader(headers.BlackTitle),
    result: headers.Result || '*',
    moves,
    fen: moves.length > 0 ? moves[moves.length - 1].fen : replay.fen(),
  };
}

// A broadcast round's PGN feed is many games concatenated back to back,
// each starting with its own [Event "..."] header — split on that
// boundary rather than trying to detect blank-line game separators, which
// also appear inside a single game's own header block.
//
// Async and yielding, not a plain synchronous loop: parseOneGame does a
// full chess.js PGN load PLUS a second full move-by-move replay (to
// snapshot a FEN per ply), and a section poll (useOlympiadSection) calls
// this once per sub-broadcast, EVERY 10 SECONDS, for every sub-broadcast —
// regardless of which single game is actually focused on screen. For a
// real round (dozens of boards per sub-broadcast, 40-80 plies each) that
// added up to thousands of chess.js move computations run back to back
// with nothing yielding in between, which froze the main thread for the
// whole burst. Since that's driven by a poll timer rather than anything
// the viewer just did, it read as unexplained, "random" lag — dragging,
// scrubbing through moves, even plain scrolling would all stall together,
// because ALL of them run on the same blocked thread. Yielding every few
// games turns one long freeze into many sub-frame chunks the browser can
// interleave with rendering/input, at the same total cost.
const YIELD_EVERY_N_GAMES = 4;
const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function parseBroadcastPgn(pgnText: string, tournamentId: string): Promise<OlympiadGame[]> {
  const blocks = pgnText.split(/(?=^\[Event )/m).map((b) => b.trim()).filter(Boolean);
  const games: OlympiadGame[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const game = parseOneGame(blocks[i], tournamentId);
    if (game) games.push(game);
    if (i > 0 && i % YIELD_EVERY_N_GAMES === 0) await yieldToMainThread();
  }
  return games;
}
