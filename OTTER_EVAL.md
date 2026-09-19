# Otter's Evaluation

This document explains what Otter's evaluation number actually is, how it's computed,
how it becomes the eval bar in [/play](docs/app/play/page.tsx) and
[/olympiad/watch](docs/app/olympiad/watch/page.tsx), and how it differs from Stockfish's
evaluation.

## What it is

The model has a **value head** — a small output next to the move-prediction (policy) head,
defined in [scripts/train.py](scripts/train.py):

```python
self.value_proj = nn.Sequential(
    nn.LayerNorm(256), nn.Linear(256, 64), nn.ReLU(inplace=True),
    nn.Linear(64, 1), nn.Tanh(),
)
```

It outputs a single number in `[-1, +1]`.

It is trained **only on game results**, never on an engine. Every position in a training
game is labeled by [scripts/data_loader.py](scripts/data_loader.py)'s
`result_to_value_target`:

```python
def result_to_value_target(result: str, turn: int) -> float:
    """Return value target from the active player's perspective."""
    if result == "1-0":
        return 1.0 if turn == fastchess.WHITE else -1.0
    if result == "0-1":
        return -1.0 if turn == fastchess.WHITE else 1.0
    return 0.0
```

- **+1** if the side to move in that position went on to **win** the game
- **-1** if they went on to **lose**
- **0** if the game was **drawn**

Training minimizes `F.mse_loss(value_pred, batch["value_target"])`. The predictor that
minimizes squared error against those labels converges to the **expected value**:

```
value_pred ≈ P(mover wins) − P(mover loses)
```

Draws contribute `0` and don't move this number either way, so a `0` reading can mean
"genuinely a toss-up" or "this tends to be drawn" — the model has no separate output for
draw probability, so those two cases are indistinguishable.

The output is always from **whoever's turn it is** in the queried position, not fixed to
White. It's re-evaluated after every move.

## The formula used in the web app

Both `/play` ([page.tsx](docs/app/play/page.tsx)) and `/olympiad/watch`
([page.tsx](docs/app/olympiad/watch/page.tsx)) query the value head **twice** per
position and combine the two readings, rather than trusting a single query:

**1. Query the real mover.** `runModelInference`/`runOtterInference` call the model for
the position as it actually stands, and record the value together with whose turn it
was computed for:

```ts
winProbability = valuePred          // the raw model output, in [-1, +1]
winProbabilityTurn = c.turn()       // 'w' or 'b' — whose turn the queried position was
winProbabilityFen = c.fen()         // the exact real position this reading belongs to
```

**2. Query the opposite side, hypothetically.** `evaluateOtterOppositeSide` fires a
second, fire-and-forget query against the *same* pieces but with the other side to move
— `withOppositeTurn` just flips the FEN's active-color field, no pieces move. This can
fail outright (the flipped arrangement can be illegal in its own right, e.g. it would
leave the real mover in check), in which case it's simply skipped:

```ts
otterOppositeScore   = <that query's raw output>
otterOppositeForFen  = realFen   // which real position this opposite reading answers for
```

**3. Combine into a White-perspective score**, via
[combineWhiteBlackScores](docs/lib/play/chess-utils.ts). Once both readings exist for the
*same* real position (`otterOppositeForFen === winProbabilityFen`):

```ts
export const combineWhiteBlackScores = (whiteScore: number, blackScore: number): number =>
  (whiteScore - blackScore) / 2;
```

Each of `whiteScore`/`blackScore` is already `P(that side wins) − P(that side loses)`
from its own queried perspective, so subtracting them and halving (their difference
spans `[-2, 2]`) folds both into one number back in `[-1, +1]`: positive means White is
favored, negative means Black is favored, `0` means dead level (or drawish).

This isn't just cosmetic — it's an ensembling trick. Otter's value head isn't perfectly
consistent between the two turn-framings of the same position (confirmed against real
finished games — see the history note below), so averaging the two readings cancels out
some of that per-query noise instead of trusting either single query alone.

**Fallback**: until the opposite query resolves for the current position (or if it fails
on an illegal flipped arrangement), the bar falls back to the plain sign-flip of the real
reading alone — `winProbabilityTurn === 'w' ? winProbability : -winProbability` — so it's
never blank.

**4. Bar fill % and pill text — both shown as White's win probability**, not the raw
signed score:

```ts
otterWinPct = round(((otterWhiteScore + 1) / 2) * 100)   // both the bar's fill % and its pill text, e.g. "62%"
```

Since `otterWhiteScore` already equals `P(White wins) − P(Black wins)`, this recovers the
classical win-probability convention where a draw counts as half a win:
`(score + 1) / 2 = P(White wins) + P(draw) / 2`. `50%` means dead level (or drawish);
higher favors White, lower favors Black. Unlike Stockfish's bar (which shows the raw
centipawn score as its pill text, e.g. `+0.62`), Otter's pill intentionally shows the
probability-style number instead of the raw `[-1, +1]` score, since that reads more
naturally as "how likely is White to win" — the raw score is still there internally
(`otterWhiteScore`), just not surfaced as pill text.

### Converting the percentage back to a signed eval

The displayed `otterWinPct` is centered on `50`, not `0` — `50%` means dead level, not
`0%`. To get a signed, zero-centered number back out of it (positive = White favored,
negative = Black favored, `0` = level/drawish), subtract `50`:

```ts
signedEval = otterWinPct - 50   // e.g. 62% -> +12, 38% -> -12, 50% -> 0
```

That recovers (up to rounding) the original `[-1, +1]` score on a `[-50, +50]` scale,
since `otterWinPct = ((otterWhiteScore + 1) / 2) * 100` rearranges to:

```text
otterWinPct - 50 = 50 * otterWhiteScore
```

So:

- `otterWinPct - 50 > 0` → White is favored (equivalently, `otterWinPct > 50`)
- `otterWinPct - 50 < 0` → Black is favored (equivalently, `otterWinPct < 50`)
- `otterWinPct - 50 = 0` → dead level, or drawish (`otterWinPct = 50`)

Dividing that result by `50` (`(otterWinPct - 50) / 50`) recovers `otterWhiteScore`
itself, back on the model's native `[-1, +1]` scale — useful if you need the un-rounded,
un-rescaled signed score rather than the display-friendly `±50`-scale version.

### Why `winProbabilityTurn`/`winProbabilityFen`, not the live board turn

Both inference calls are async. A move can be applied to the board (flipping whose turn
it is) before that move's own inference call resolves. If step 3's flip read the board's
*current* turn instead of the turn each value was actually computed for, there's a
window where a stale reading (computed for the mover who just moved) gets flipped as if
it belonged to the *new* mover — inverting the sign and showing the wrong side as winning
until the fresh inference lands. This was most visible in `/play`'s Automated Otter Game
Loop, where moves land back-to-back fast enough that the flash barely settles between
them. Recording `winProbabilityTurn`/`winProbabilityFen` alongside each value at the
exact moment it's set closes that gap, and the FEN match additionally guards the
opposite-turn combine step against mixing readings from two different positions.

### History: `/olympiad/watch`'s old two-bar design

`/olympiad/watch` originally showed the two readings above as **two separate bars**
instead of combining them — one labeled "queried as White to move", one "queried as
Black to move" — specifically to surface the two-framing disagreement rather than hide
it. The current combined single bar (matching `/play`, and using the same
subtract-and-average formula) folds both readings into one number instead. The
`withOppositeTurn`-based two-bar rendering code is recoverable from git history if that
disagreement ever needs to be surfaced on its own again.

## How this differs from Stockfish's evaluation

|                        | Otter                                              | Stockfish                                  |
|------------------------|-----------------------------------------------------|---------------------------------------------|
| Source                 | Neural net trained on how human games ended        | Depth-limited engine search                |
| Unit                   | Win probability (`0–100%`), from an expected score bounded to `[-1, +1]` | Centipawns, or mate-in-N (unbounded) |
| Depends on rating/clock? | **Yes** — Elo and time control are model inputs  | No — objective given the position           |
| Looks ahead?           | No — reads the (static) position, twice each move  | Yes — searches many plies deep              |
| Draws                  | Folded into the same axis as win/loss (a draw counts as half a win) | N/A — reports the position's objective value |

The two bars are laid out the same way but read differently — Otter's pill shows a win
probability (`62%`), Stockfish's shows a raw centipawn score (`+0.62`) — which is
intentional given they're answering different questions:

- Stockfish: *"Who is objectively better here, and by how much?"*
- Otter: *"At this rating and time control, how do games from this exact position tend to
  score?"*

A totally winning-but-hard-to-convert position and a barely-winning one can both read
close to `+1.00`/`-1.00` on Otter's bar (it's bounded), while Stockfish keeps climbing
(or reports mate). Disagreement between the two bars is expected and is often the
interesting signal — it's showing where engine truth and human practice diverge.
