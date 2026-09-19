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

Per move, [runModelInference](docs/app/play/page.tsx#L1923) (in `/play`) and
[runOtterInference](docs/app/olympiad/watch/page.tsx) (in `/olympiad/watch`) call the
model and record two things together:

```ts
winProbability = valuePred          // the raw model output, in [-1, +1]
winProbabilityTurn = c.turn()       // 'w' or 'b' — whose turn the queried position was
```

**1. Flip to White's frame.** Since `winProbability` already equals
`P(winProbabilityTurn's side wins) − P(winProbabilityTurn's side loses)`, getting a
White-perspective, Stockfish-shaped score is just a sign flip — no second model query
needed:

```ts
otterWhiteScore = (winProbabilityTurn === 'w')
  ? winProbability
  : -winProbability
```

`otterWhiteScore` is in `[-1, +1]`: positive means White is favored, negative means Black
is favored, `0` means dead level (or drawish).

**2. Bar fill %** (visual height of the colored region only):

```ts
otterWinPct = round(((otterWhiteScore + 1) / 2) * 100)
```

**3. Pill text**, via [formatOtterScore](docs/lib/play/chess-utils.ts):

```ts
export const formatOtterScore = (score: number | undefined): string => {
  if (score === undefined) return '...';
  return (score > 0 ? '+' : '') + score.toFixed(2);
};
```

e.g. `+0.42`, `-0.17`, `0.00` — the same pill-text convention as Stockfish's own bar
(`formatSfPoints`), so the two bars read the same way at a glance.

### Why `winProbabilityTurn`, not the live board turn

`runModelInference`/`runOtterInference` are async. A move can be applied to the board
(flipping whose turn it is) before that move's own inference call resolves. If the flip
in step 1 read the board's *current* turn instead of the turn the value was actually
computed for, there's a window where a stale `winProbability` (computed for the mover
who just moved) gets flipped as if it belonged to the *new* mover — inverting the sign
and showing the wrong side as winning until the fresh inference lands. This was most
visible in `/play`'s Automated Otter Game Loop, where moves land back-to-back fast enough
that the flash barely settles between them. Recording `winProbabilityTurn` alongside
`winProbability` at the exact moment it's set closes that gap.

## `/olympiad/watch`'s single bar vs. its old two-bar design

`/olympiad/watch` used to show **two independent Otter bars** instead of one: one from
querying the position with White to move, one from querying it with Black to move (via
`withOppositeTurn`, flipping the FEN's active-color field). That existed because Otter's
value head isn't fully self-consistent between those two framings of the same real
position — confirmed by direct testing against finished games — so showing both readings
side by side was an intentional way of surfacing that disagreement rather than hiding it.

The current single-bar version (matching `/play`) trades that away for a
Stockfish-shaped display: it only ever queries the position once, from whoever is
actually on move, and sign-flips that one reading. It no longer surfaces the two-framing
disagreement — if that matters again, the two-bar/`withOppositeTurn` code is recoverable
from git history.

## How this differs from Stockfish's evaluation

|                        | Otter                                              | Stockfish                                  |
|------------------------|-----------------------------------------------------|---------------------------------------------|
| Source                 | Neural net trained on how human games ended        | Depth-limited engine search                |
| Unit                   | Expected score, bounded to `[-1, +1]`              | Centipawns, or mate-in-N (unbounded)        |
| Depends on rating/clock? | **Yes** — Elo and time control are model inputs  | No — objective given the position           |
| Looks ahead?           | No — reads the position once                       | Yes — searches many plies deep              |
| Draws                  | Folded into the same axis as win/loss (scored `0`) | N/A — reports the position's objective value |

Formatting the two bars the same way (signed score, same pill style) makes them visually
comparable, but they are still answering different questions:

- Stockfish: *"Who is objectively better here, and by how much?"*
- Otter: *"At this rating and time control, how do games from this exact position tend to
  score?"*

A totally winning-but-hard-to-convert position and a barely-winning one can both read
close to `+1.00`/`-1.00` on Otter's bar (it's bounded), while Stockfish keeps climbing
(or reports mate). Disagreement between the two bars is expected and is often the
interesting signal — it's showing where engine truth and human practice diverge.
