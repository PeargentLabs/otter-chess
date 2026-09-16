// Hand-authored demo data, used only when /olympiad is opened with
// ?demo=1 in the URL. Lets the whole page's design — main board, history,
// stats panel, AND the mini-board strip / team dropdown / section toggle
// — be reviewed without waiting for a real Olympiad round to go live or
// depending on the network at all. Not real broadcast data — clearly
// labelled as a demo wherever it's shown (see app/olympiad/page.tsx).

import { Chess } from 'chess.js';
import type { OlympiadGame, OlympiadMove } from './types';

function buildDemoMoves(sanMoves: string[], startClock = 90 * 60): OlympiadMove[] {
  const replay = new Chess();
  const moves: OlympiadMove[] = [];
  let clock = startClock;
  for (const san of sanMoves) {
    const m = replay.move(san);
    if (!m) throw new Error(`Demo data has an illegal move: ${san}`);
    clock -= 30; // fixed decrement — deterministic, so the demo stays reproducible across reviews
    moves.push({ san: m.san, uci: m.from + m.to + (m.promotion || ''), fen: replay.fen(), from: m.from, to: m.to, clockSeconds: clock });
  }
  return moves;
}

function buildDemoGame(opts: {
  boardKey: string;
  boardNumber: number;
  white: string;
  black: string;
  whiteTeam: string;
  blackTeam: string;
  whiteElo: number;
  blackElo: number;
  sanMoves: string[];
}): OlympiadGame {
  const moves = buildDemoMoves(opts.sanMoves);
  return {
    boardKey: opts.boardKey,
    tournamentId: 'demo',
    boardNumber: opts.boardNumber,
    white: opts.white,
    black: opts.black,
    whiteTeam: opts.whiteTeam,
    blackTeam: opts.blackTeam,
    whiteElo: opts.whiteElo,
    blackElo: opts.blackElo,
    whiteTitle: 'GM',
    blackTitle: 'GM',
    result: '*',
    moves,
    fen: moves[moves.length - 1].fen,
  };
}

// Every line below is real, well-known opening theory — used purely as a
// realistic-looking, definitely-legal sequence of moves, not as an actual
// recreation of any specific game.
export const DEMO_GAMES: OlympiadGame[] = [
  buildDemoGame({
    boardKey: 'demo-usa-nor-1', boardNumber: 1,
    white: 'Caruana, Fabiano', black: 'Carlsen, Magnus',
    whiteTeam: 'United States', blackTeam: 'Norway',
    whiteElo: 2803, blackElo: 2830,
    sanMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7'],
  }),
  buildDemoGame({
    boardKey: 'demo-usa-nor-2', boardNumber: 2,
    white: 'So, Wesley', black: 'Hansen, Eirik',
    whiteTeam: 'United States', blackTeam: 'Norway',
    whiteElo: 2757, blackElo: 2631,
    sanMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'],
  }),
  buildDemoGame({
    boardKey: 'demo-ind-chn-1', boardNumber: 1,
    white: 'Praggnanandhaa, R', black: 'Wei, Yi',
    whiteTeam: 'India', blackTeam: 'China',
    whiteElo: 2747, blackElo: 2755,
    sanMoves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bg5', 'O-O'],
  }),
  buildDemoGame({
    boardKey: 'demo-ind-chn-2', boardNumber: 2,
    white: 'Gukesh, D', black: 'Ding, Liren',
    whiteTeam: 'India', blackTeam: 'China',
    whiteElo: 2783, blackElo: 2732,
    sanMoves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5'],
  }),
  buildDemoGame({
    boardKey: 'demo-fra-ger-1', boardNumber: 1,
    white: 'Vachier-Lagrave, Maxime', black: 'Keymer, Vincent',
    whiteTeam: 'France', blackTeam: 'Germany',
    whiteElo: 2709, blackElo: 2726,
    sanMoves: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Nb6'],
  }),
];

export const DEMO_OLYMPIAD_GAME: OlympiadGame = DEMO_GAMES[0];
