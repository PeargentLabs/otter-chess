'use client';

import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import type { OlympiadGame } from '@/lib/olympiad/types';
import { teamFlagUrl } from '@/lib/olympiad/flags';
import { sideScore, formatScore } from '@/lib/olympiad/result';

// One board in the grid — always shows the game's live tip position, no
// engine, no arrows, no move interaction (per the engine-isolation rule:
// only the focused main board may touch Stockfish/Otter). Chessground is
// still used as the renderer so it gets correct piece/square theming for
// free, just with movement and drawing switched off. Styled after
// Lichess's own broadcast grid: name/flag/title above and below a larger
// board, a score badge once the game has a result.
// Win/loss: colored text only, no pill background. Draw is harder to read
// as plain gray text at the same size, so it gets a background and a
// slightly larger size instead — not for emphasis, purely for legibility.
function ScoreBadge({ score }: { score: number }) {
  const won = score === 1;
  const lost = score === 0;
  const draw = score === 0.5;
  return (
    <span className={`shrink-0 font-mono font-bold flex items-center justify-center ${
      draw
        ? 'text-[11px] w-5 h-5 rounded-[2px] bg-line/40 text-muted'
        : `text-[11px] w-4 h-4 ${won ? 'text-pear' : 'text-rose-500'}`
    }`}>
      {formatScore(score)}
    </span>
  );
}

function PlayerRow({ name, title, team, score, liveBadge }: { name: string; title: string | null; team: string | null; score: number | null; liveBadge?: boolean }) {
  const flagUrl = teamFlagUrl(team);
  return (
    <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {flagUrl && <img src={flagUrl} alt="" className="w-4 h-3 object-cover rounded-[1px] shrink-0" />}
        {title && <span className="shrink-0 text-pear font-bold text-[10.5px] font-mono">{title}</span>}
        <span className="truncate text-[11px] font-mono text-paper" title={name}>{name}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {liveBadge && (
          <span className="flex items-center gap-1 font-mono text-[8.5px] uppercase font-bold text-pear">
            <span className="w-1.5 h-1.5 rounded-full bg-pear animate-pulse" />
            Live
          </span>
        )}
        {score !== null && <ScoreBadge score={score} />}
      </div>
    </div>
  );
}

export default function MiniBoardCard({
  game,
  isFocused,
  onClick,
}: {
  game: OlympiadGame;
  isFocused: boolean;
  onClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);

  useEffect(() => {
    if (containerRef.current && !cgRef.current) {
      cgRef.current = Chessground(containerRef.current, {
        fen: game.fen,
        viewOnly: true,
        movable: { free: false, color: undefined, dests: new Map() },
        drawable: { enabled: false },
        animation: { enabled: false },
        coordinates: false,
      });
    }
    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const last = game.moves[game.moves.length - 1];
    cgRef.current?.set({
      fen: game.fen,
      lastMove: last ? ([last.from, last.to] as Key[]) : undefined,
    });
  }, [game.fen]);

  const inProgress = game.result === '*';
  const whiteScore = sideScore(game.result, 'w');
  const blackScore = sideScore(game.result, 'b');

  return (
    <button
      onClick={onClick}
      className={`flex flex-col border rounded-[3px] overflow-hidden text-left cursor-pointer transition-all bg-panel/20 ${
        isFocused ? 'border-pear' : 'border-line hover:border-pear/50'
      }`}
    >
      <PlayerRow name={game.black} title={game.blackTitle} team={game.blackTeam} score={blackScore} liveBadge={inProgress} />
      <div className="w-full aspect-square bg-sq-dark relative">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <PlayerRow name={game.white} title={game.whiteTitle} team={game.whiteTeam} score={whiteScore} />
    </button>
  );
}
