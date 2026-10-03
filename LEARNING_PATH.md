# Learning Path: Zero to Hero

This is a suggested order for working through the 16 stages, plus a tip for each one. You don't have to follow it exactly — a confident kid can skip around (use the "Jump to #" box above the board, or just click any stage in the sidebar — the app also remembers where you left off, so reopening it won't send you back to puzzle 1) — but if you're not sure what's next, start here.

**Within every stage, puzzles are already sorted easy → hard.** The sort isn't arbitrary: it's based on solution length (a 1-move mate is easier than a 5-move one), how many legal moves there were to choose from (more choices = harder to spot the right one), and how many pieces are on the board (more pieces = more to think about). This mirrors the real difficulty-research literature on chess puzzles — serious puzzle-rating systems (e.g. the FedCSIS chess-puzzle-difficulty competitions) fine-tune large neural networks against millions of human attempts, which isn't something a static app can replicate, but those same studies consistently find that solution length and position complexity carry most of the signal even on their own. So within each stage, puzzle 1 is meant to be noticeably easier than the last one.

## Where real puzzle data comes from

**Checkmate in 1 / Mate in 2 / Mate in 3** (800 puzzles): **László Polgár's "Chess: 5,334 Problems, Combinations, and Games"** (1994) — a legendary, famously progressive puzzle book used by generations of chess students (yes, including the Polgár sisters themselves). The data comes from [denialromeo/4462-chess-problems](https://github.com/denialromeo/4462-chess-problems), whose solutions were originally computed with Stockfish — and every single one was independently re-verified against this app's own chess engine before being included (see `scripts/import-polgar.js`).

**Pins, Forks, Skewers, Discovered Attacks, Removing the Defender, Deflection & Decoys, Zwischenzug, Back Rank Mate, Smothered Mate & Patterns, and most of King & Pawn Endgames** (around 670 puzzles): real positions from real online games, pulled from the **official Lichess puzzle database** (CC0 / public domain — no permission or attribution even required, though we're giving it anyway because it's accurate and it's the right thing to do). `database.lichess.org` itself is blocked by at least one relevant network's security policy, but the Lichess organization also publishes the exact same dataset on Hugging Face (`huggingface.co/datasets/Lichess/chess-puzzles`), which isn't blocked — see `scripts/import-lichess.js` for exactly how each puzzle is converted and re-verified (every puzzle still has to pass the same mechanical goal + exchange-safety checks as everything else before it's allowed in).

**Double Attack and the rest of Opening Principles / King & Pawn Endgames**: built by this app's own generators (`scripts/generators*.js`) — a tactical theme ("double attack") with no exact matching Lichess tag, and goals (castle, develop a piece, push a center pawn) that are about following good habits rather than a tagged tactic, so there's no "real game" dataset that fits cleanly. Each generator constructs a position matching the pattern and lets the chess engine confirm a real solution exists — see `README.md`'s "How the puzzles are verified" section for exactly what gets checked.

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

## Regenerating or expanding the Lichess-sourced puzzles

`scripts/data/lichess-raw-pool.json` is a small (~400-per-theme) pre-filtered extract, not the full multi-GB database. To pull a fresh/larger extract:

```bash
python3 -m venv /tmp/pq-venv && /tmp/pq-venv/bin/pip install duckdb --index-url https://pypi.org/simple/
curl -sL "https://huggingface.co/datasets/Lichess/chess-puzzles/resolve/main/data/train-00000-of-00003.parquet" -o /tmp/lichess.parquet
/tmp/pq-venv/bin/python3 -c "
import duckdb, json
con = duckdb.connect()
themes = ['pin','fork','skewer','discoveredAttack','capturingDefender','deflection','intermezzo','backRankMate','smotheredMate','pawnEndgame','promotion']
out = {}
for t in themes:
    rows = []
    for lo, hi in [(500, 800), (800, 1100), (1100, 1500), (1500, 1900)]:
        # Stratified by rating band for a genuine easy->hard spread, not
        # just a cluster of similarly-rated puzzles. NbPlays DESC + a
        # Popularity/NbPlays/theme-count bar favors well-regarded, focused
        # examples of the theme over obscure or kitchen-sink-tagged ones.
        rows += con.execute(f\"SELECT PuzzleId, FEN, Moves, Rating FROM read_parquet('/tmp/lichess.parquet') WHERE list_contains(Themes, '{t}') AND FEN LIKE '% b %' AND Rating BETWEEN {lo} AND {hi} AND Popularity > 70 AND NbPlays > 500 AND len(Themes) <= 6 ORDER BY NbPlays DESC LIMIT 150\").fetchall()
    out[t] = [{'id': r[0], 'fen': r[1], 'moves': r[2], 'rating': r[3]} for r in rows]
json.dump(out, open('scripts/data/lichess-raw-pool.json', 'w'))
"
node scripts/build-curriculum.js && node scripts/validate-curriculum.js
```

(`FEN LIKE '% b %'` is what keeps the learner playing White — see the comment at the top of `scripts/import-lichess.js` for why.)

## A note on data sources that *didn't* make the cut

In case it's useful context for later: several other GitHub repos were checked while building this (`rebeccaloran/432k-chess-puzzles`, `jamesdbullen/chess-puzzle-sets`, `brianch/offline-chess-puzzles`, `risendy/chessTraniningApp`, `vitogit/pgn-tactics-generator`). None contributed puzzle data directly:
- The 432k-puzzle set turned out to have no verified solutions, no side-to-move info, and includes non-standard "fairy chess" positions — its own README says you need a chess engine to even check the answers.
- The others are just *tools* that expect the real Lichess puzzle database downloaded from `database.lichess.org` — which is blocked by at least one relevant network's security policy. (Resolved: the same CC0 data is also published by Lichess on Hugging Face, which isn't blocked — see above.)
- A commercial, copyrighted puzzle-book PDF (explicitly "all rights reserved, no reproduction without the publisher's permission") was also suggested as a source and was deliberately **not** used — that's a different situation from the Polgar data, where the repo's own author explicitly invited reuse, or the Lichess data, which is CC0.
- A full scanned copy of the original 1994 Polgár book (hosted on an unofficial mirror) was likewise not used, for the same reason — unlike the already-extracted, reuse-invited FEN/move data, bulk-extracting directly from a full book scan is a meaningfully bigger and riskier taking.
