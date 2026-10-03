# Learning Path: Zero to Hero

This is a suggested order for working through the 16 stages, plus a tip for each one. You don't have to follow it exactly — a confident kid can skip around — but if you're not sure what's next, start here.

**Within every stage, puzzles are already sorted easy → hard.** The sort isn't arbitrary: it's based on solution length (a 1-move mate is easier than a 5-move one), how many legal moves there were to choose from (more choices = harder to spot the right one), and how many pieces are on the board (more pieces = more to think about). This mirrors the real difficulty-research literature on chess puzzles — serious puzzle-rating systems (e.g. the FedCSIS chess-puzzle-difficulty competitions) fine-tune large neural networks against millions of human attempts, which isn't something a static app can replicate, but those same studies consistently find that solution length and position complexity carry most of the signal even on their own. So within each stage, puzzle 1 is meant to be noticeably easier than the last one.

## Where real puzzle data comes from

Most of the Checkmate in 1 / Mate in 2 / Mate in 3 puzzles (380 of them) are sourced from **László Polgár's "Chess: 5,334 Problems, Combinations, and Games"** (1994) — a legendary, famously progressive puzzle book used by generations of chess students (yes, including the Polgár sisters themselves). The data comes from [denialromeo/4462-chess-problems](https://github.com/denialromeo/4462-chess-problems), whose solutions were originally computed with Stockfish — and every single one was independently re-verified against this app's own chess engine before being included (see `scripts/import-polgar.js` and `scripts/validate-curriculum.js`).

Every other stage's puzzles are built by this app's own generators (`scripts/generators*.js`) — not hand-written, and not from an external dataset, because no freely-reusable dataset of positions tagged "pin," "fork," "removing the defender," etc. was available to pull from (the obvious one, the Lichess puzzle database, is blocked on at least one network this app was built on; see the note at the bottom). Each generator constructs a position matching a specific tactical pattern and lets the chess engine confirm a real solution exists — see `README.md`'s "How the puzzles are verified" section for exactly what gets checked.

## The path

**Step 0 — Warm-up (you already know this):** **Checkmate in 1**. You said your son already knows this one. Have him blast through a handful anyway — it's confidence-building, and the later puzzles in this stage (sourced from the Polgar book) are a notch harder than typical mate-in-1s, so it's worth a quick check that he's solid before moving on.

**Step 1 — The core tactics, roughly in order of "how obvious is the trick":**
1. **Pins** — a pinned piece can't move without exposing something more valuable behind it. Easiest tactic to spot once you know to look for "what's behind this piece?"
2. **Forks** — one piece (often a knight) attacks two things at once. The classic "aha" tactic.
3. **Skewers** — like a pin's big brother: attack through one piece to a juicier one behind it.
4. **Discovered Attacks** — move a piece out of the way to unmask an attack from the piece behind it.
5. **Removing the Defender** — before you take a piece, check whether its "defender" can actually recapture, or whether it's secretly pinned/overloaded.
6. **Double Attack** — generalizes the fork idea to any piece, not just knights: one move, two threats.

**Step 2 — Mating patterns**, once the core tactics feel comfortable:
7. **Back Rank Mate** — the king's own pawns can trap it on the back row.
8. **Smothered Mate & Patterns** — a king boxed in by its own pieces can be mated by a single knight.

**Step 3 — Deeper calculation**, once he can spot tactics quickly:
9. **Mate in 2** — think one extra move ahead: force a reply, then finish.
10. **Deflection & Decoys** — force an enemy piece (often with a check) to move somewhere worse *before* going for the material.
11. **Zwischenzug ("in-between move")** — resist the urge to play the obvious recapture; sometimes a surprise move first wins even more.
12. **Mate in 3** — the long calculation test. If he's solving these confidently, he's doing very well.

**Step 4 — Different skills, tackle anytime (not strictly sequential):**
- **Opening Principles** — castle, develop your pieces, control the center. This isn't tactics, it's habits — fine to start on day one alongside Step 1, or save for later. Either works.
- **King & Pawn Endgames** — walking a pawn home to promotion, and the basic king-and-pawn-vs-king technique. Good to introduce once mate-in-1/2 feel natural, since the final move is often itself a small checkmate or promotion puzzle.

**Step 5 — Mixed Review**, anytime, forever: once each stage above is in decent shape, this is the real test — puzzles from every stage in one place, no hint about which trick applies. This is the closest thing in the app to "just playing a game" and the one stage worth returning to regularly even after everything else is done.

## How to know he's ready to move on

A reasonable bar: solving most of a stage's puzzles **without needing the hint button**, and without too many wrong tries. Perfection isn't the goal — the "Show Answer" button exists for a reason, and getting a puzzle wrong once and seeing why is still useful. If he's reaching for the hint on nearly every puzzle in a stage, that's a sign to slow down and spend more time there rather than pushing forward.

## A note on data sources that *didn't* make the cut

In case it's useful context for later: several other GitHub repos were checked while building this (`rebeccaloran/432k-chess-puzzles`, `jamesdbullen/chess-puzzle-sets`, `brianch/offline-chess-puzzles`, `risendy/chessTraniningApp`, `vitogit/pgn-tactics-generator`). None contributed puzzle data to the app:
- The 432k-puzzle set turned out to have no verified solutions, no side-to-move info, and includes non-standard "fairy chess" positions — its own README says you need a chess engine to even check the answers.
- Several others are just *tools* that expect you to separately download the real Lichess puzzle database (`database.lichess.org`) — which is blocked by at least one relevant network's security policy ("access denied... identification as malicious"), so that data wasn't reachable here.
- A commercial, copyrighted puzzle-book PDF (explicitly "all rights reserved, no reproduction without the publisher's permission") was also suggested as a source and was deliberately **not** used — that's a different situation from the Polgar data, where the repo's own author explicitly invited reuse.

If you ever get access to the Lichess puzzle database from a different network, it would be a strong future addition — it's CC0 (public domain) and tagged by exactly the tactical themes this app's stages are named after, which would let the "Pins," "Forks," etc. stages use real game positions the same way the mate stages now do.
