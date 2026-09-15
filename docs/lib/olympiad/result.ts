// Per-side score from a PGN Result tag ("1-0", "0-1", "1/2-1/2", or "*" for
// a game still in progress). Returns null while the game is ongoing.
export function sideScore(result: string, side: 'w' | 'b'): number | null {
  if (result === '1-0') return side === 'w' ? 1 : 0;
  if (result === '0-1') return side === 'w' ? 0 : 1;
  if (result === '1/2-1/2') return 0.5;
  return null;
}

export function formatScore(score: number): string {
  return score === 0.5 ? '½' : String(score);
}
