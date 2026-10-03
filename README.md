# Chess Academy

An offline, step-by-step chess puzzle app for learning tactics — built for a kid who already knows mate-in-1, mate-in-2, and pinning, and is ready for a lot more.

## How to run it

No install, no build step — just a static site.

**Easiest:** double-click `index.html` to open it in your browser.

**If your browser blocks local scripts:** serve it instead:

```bash
cd /Users/vmedeti/chess
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## What's inside

16 stages, 417 puzzles total:

1. Checkmate in 1
2. Opening Principles (castling, developing pieces, controlling the center)
3. Pins
4. Forks
5. Skewers
6. Discovered Attacks
7. Removing the Defender
8. Double Attack
9. Deflection & Decoys
10. Zwischenzug (In-Between Moves)
11. Back Rank Mate
12. Smothered Mate & Patterns
13. Mate in 2
14. Mate in 3
15. King & Pawn Endgames (promotion, basic opposition)
16. Mixed Review

This still isn't "the whole of chess" — there's no positional play, no deeper endgames (rook endgames, more complex pawn structures), and no real opening theory. It's a solid tactics-and-fundamentals foundation to build on.

Your son always plays White. Click a piece to see its legal moves (dots), click a highlighted square to move. Progress is saved in the browser (localStorage) per puzzle, so it remembers what's solved even after closing the tab. "Reset progress" in the header clears it.

Each stage has a **🖨️ Print this stage** button that builds a printable worksheet — diagrams of every puzzle in that stage plus an answer key — handy for practicing away from the screen.

**Multiple correct moves are handled properly.** Many puzzles (especially mates) have more than one winning move — the app doesn't just check your move against the one line it happened to record. On the final move of a puzzle, any legal move that actually achieves the goal (checkmate, a safe capture, etc.) is accepted. On an earlier move in a multi-move puzzle, if what you played doesn't match the recorded line, the app re-runs the same forced-line search live, right there in the browser, to check whether your move *also* forces the win within the remaining moves — if so, it's accepted and the opponent's forced reply is computed for your move, not just replayed from the recorded line.

## How the puzzles are verified

Every single puzzle is machine-checked, not hand-verified, by several layers — built up specifically because earlier, weaker checks let real bugs through:

1. **`scripts/validate-curriculum.js`** — loads every puzzle's FEN and solution into the real chess engine and checks that each move is legal and that the final position actually achieves its goal (checkmate, a capture, a check, a fork, a promotion, castling, developing a piece, or a center pawn push). It also now runs the two checks below itself, so a single passing run is the full guarantee — not something you have to remember to also run separately.
2. **Exchange safety** (originally `scripts/audit-safety.js`, now folded into the validator) — a full static-exchange evaluation (simulates every possible alternating-capture sequence on the key square) confirming the opponent can't just win back the material a "capture" or "fork" puzzle claims to win for free. This exists because step 1 alone missed a real bug: a "pinned" piece can still legally capture the piece pinning it (that doesn't expose its own king), so a puzzle claiming a free piece could actually be an even — or losing — trade.
3. **Hanging-piece check** (originally `scripts/audit-hanging.js`, now folded into the validator) — for goals that don't claim a material win at all (check, castle, develop, center push), confirms the piece that just moved isn't simply capturable for free. This caught a second real bug: a "discovered check" generator that sometimes put the moving piece right next to the enemy king with nothing defending it — technically a legal check, but the king just captures it and the "lesson" was actually a blunder.
4. **A fork-detection bug** was also found and fixed along the way: a scratch board used to check "does this move attack 2+ things" could list a pseudo-capture of the enemy king (since a real game would never let you actually capture a king — it ends at checkmate first), which double-counted the same king as both a "capture target" and the check itself. Fixed to exclude the king from that count.

`scripts/audit-safety.js` and `scripts/audit-hanging.js` still exist standalone too, for a from-scratch second opinion, but `validate-curriculum.js` alone is now sufficient.

Most of the 417 puzzles aren't hand-written — they're produced by generator scripts that place pieces according to a tactical pattern (e.g. "attacker — pinned piece — king, all in a line") and let the engine search confirm a solution exists, which is far more reliable at this scale than writing FENs by hand. Even so, every generator applies the same safety checks above *during generation*, not just after — a generator that doesn't is how the discovered-check bug happened.

## Project structure

```
index.html                   # app shell
css/style.css                 # all styling, incl. print worksheet styles
js/vendor/chess.js            # vendored chess.js (rules engine, MIT licensed)
js/curriculum.js              # the 16 stages / 417 puzzles (data only, generated — see below)
js/board.js                   # chessboard rendering + click-to-move
js/app.js                     # app logic: navigation, puzzle flow, progress
js/print.js                   # builds the printable worksheet

scripts/validate-curriculum.js  # verifies every puzzle: legal, achieves goal, exchange-safe, no hanging piece
scripts/audit-safety.js         # standalone exchange-safety audit (opponent can't win the material back)
scripts/audit-hanging.js        # standalone hanging-piece audit (for non-material goals: check/castle/develop/center)
scripts/gen-lib.js              # shared helpers: board building, exchange evaluation, goal checks
scripts/forced-search.js        # generic "find a forced N-move line achieving goal X" search
scripts/generators.js           # pins/skewers, forks/double-attack, discovered checks, removing-the-defender
scripts/generators-mates.js     # box mates, queen+king mates, smothered mates, mate-in-2/3
scripts/generators-special.js   # promotion, opening principles, deflection/zwischenzug
scripts/build-curriculum.js     # runs all generators and writes js/curriculum.js
scripts/find-mate.js, sweep-mate2.js, sweep-mate3.js   # earlier one-off mate-search tools
```

## Regenerating or extending the curriculum

To change puzzle counts, add a new stage, or tweak a generator, edit the relevant `scripts/generators*.js` file or `scripts/build-curriculum.js`, then rebuild and re-verify:

```bash
node scripts/build-curriculum.js        # regenerates js/curriculum.js from scratch (safe to re-run — see note below)
node scripts/validate-curriculum.js     # legality + goal achieved + exchange-safe + no hanging piece (must show 0 failures)
```

`build-curriculum.js` is idempotent: it always slices each original stage back down to its known hand-written seed count (`SEED_COUNTS` near the top of the file) before generating fresh puzzles on top. Don't remove that — without it, running the script twice in a row (e.g. after fixing a generator bug) treats the *previous* run's generated puzzles as seeds too and every stage balloons. If you add a new stage, add its hand-written seed count to `SEED_COUNTS` too.

If you hand-edit `js/curriculum.js` directly (e.g. to tweak one puzzle's hint text), you don't need to rebuild — just re-run `validate-curriculum.js` before trusting the change.
