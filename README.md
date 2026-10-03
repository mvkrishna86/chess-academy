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

**Live hosted version:** https://mvkrishna86.github.io/chess-academy/ (GitHub Pages, free, auto-deploys from the `main` branch of https://github.com/mvkrishna86/chess-academy).

## Google login setup (optional)

The app works fully offline with zero setup — progress saves to `localStorage` as before. Signing in with Google (via Supabase) additionally syncs progress across devices/browsers. Until you do the steps below, the header shows a disabled "Sign-in not set up yet" button and nothing else changes.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL Editor in your Supabase project, paste in the contents of `supabase/schema.sql`, and run it (creates the `progress` table + row-level-security policies).
3. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials): create an OAuth consent screen, then an OAuth Client ID of type "Web application." Set its **Authorized redirect URI** to the callback URL Supabase shows you under Authentication → Providers → Google (looks like `https://<project-ref>.supabase.co/auth/v1/callback`) — **not** your app's URL.
4. Back in Supabase → Authentication → Providers → Google: paste in the Client ID/Secret from step 3 and enable the provider.
5. In Supabase → Authentication → URL Configuration: add `https://mvkrishna86.github.io/chess-academy/` (and `http://localhost:8000` if testing locally) to the Redirect URLs allowlist. Skipping this makes login silently fail on the deployed site.
6. Edit `js/supabase-config.js` and fill in your project's URL and anon/public key (found in Supabase → Project Settings → API). This key is safe to commit — RLS policies protect the data, not key secrecy.

## What's inside

16 stages, 745 puzzles total. **See [LEARNING_PATH.md](LEARNING_PATH.md) for a suggested order to work through them, a tip for each stage, and where the puzzle content actually comes from.**

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

Your son always plays White. Click a piece to see its legal moves (dots), click a highlighted square to move. Progress is saved in the browser (localStorage) per puzzle, so it remembers what's solved even after closing the tab. "Reset progress" in the header clears it. The app also remembers which stage/puzzle you were last looking at and reopens there instead of always restarting at puzzle 1 — and the "Jump to #" box above the board lets you skip straight to any puzzle number in the current stage.

Each stage has a **🖨️ Print this stage** button that builds a printable worksheet — diagrams of every puzzle in that stage plus an answer key — handy for practicing away from the screen.

**Multiple correct moves are handled properly.** Many puzzles (especially mates) have more than one winning move — the app doesn't just check your move against the one line it happened to record. On the final move of a puzzle, any legal move that actually achieves the goal (checkmate, a safe capture, etc.) is accepted. On an earlier move in a multi-move puzzle, if what you played doesn't match the recorded line, the app re-runs the same forced-line search live, right there in the browser, to check whether your move *also* forces the win within the remaining moves — if so, it's accepted and the opponent's forced reply is computed for your move, not just replayed from the recorded line.

## How the puzzles are verified

Every single puzzle is machine-checked, not hand-verified, by several layers — built up specifically because earlier, weaker checks let real bugs through:

1. **`scripts/validate-curriculum.js`** — loads every puzzle's FEN and solution into the real chess engine and checks that each move is legal and that the final position actually achieves its goal (checkmate, a capture, a check, a fork, a promotion, castling, developing a piece, or a center pawn push). It also now runs the two checks below itself, so a single passing run is the full guarantee — not something you have to remember to also run separately.
2. **Exchange safety** (originally `scripts/audit-safety.js`, now folded into the validator) — a full static-exchange evaluation (simulates every possible alternating-capture sequence on the key square) confirming the opponent can't just win back the material a "capture" or "fork" puzzle claims to win for free. This exists because step 1 alone missed a real bug: a "pinned" piece can still legally capture the piece pinning it (that doesn't expose its own king), so a puzzle claiming a free piece could actually be an even — or losing — trade.
3. **Hanging-piece check** (originally `scripts/audit-hanging.js`, now folded into the validator) — for goals that don't claim a material win at all (check, castle, develop, center push), confirms the piece that just moved isn't simply capturable for free. This caught a second real bug: a "discovered check" generator that sometimes put the moving piece right next to the enemy king with nothing defending it — technically a legal check, but the king just captures it and the "lesson" was actually a blunder.
4. **A fork-detection bug** was also found and fixed along the way: a scratch board used to check "does this move attack 2+ things" could list a pseudo-capture of the enemy king (since a real game would never let you actually capture a king — it ends at checkmate first), which double-counted the same king as both a "capture target" and the check itself. Fixed to exclude the king from that count.

`scripts/audit-safety.js` and `scripts/audit-hanging.js` still exist standalone too, for a from-scratch second opinion, but `validate-curriculum.js` alone is now sufficient.

Most of the 745 puzzles aren't hand-written or made up. 380 (the mate stages) are sourced from a classic puzzle book, and another ~240 (pins, forks, skewers, discovered attacks, removing the defender, deflection, zwischenzug, back rank mate, smothered mate, king & pawn endgames) are real positions from real online games, pulled from the official Lichess puzzle database — see [LEARNING_PATH.md](LEARNING_PATH.md) for exactly where each stage's puzzles come from and why several other candidate data sources were rejected. The remaining stages (double attack, opening principles) are produced by this app's own generator scripts, which place pieces according to a tactical pattern (e.g. "attacker — pinned piece — king, all in a line") and let the engine search confirm a solution exists — far more reliable at this scale than writing FENs by hand. Either way, every puzzle — generated or imported — passes the exact same validation, and every generator/importer applies the same safety checks *during* construction, not just after — a check that didn't is how the discovered-check bug happened.

Puzzles within each stage are also sorted easy → hard using a lightweight difficulty heuristic (`difficultyScore` in `scripts/gen-lib.js`) — see LEARNING_PATH.md for what that's based on and why it's deliberately simple rather than a trained model.

## Project structure

```
index.html                   # app shell
css/style.css                 # all styling, incl. print worksheet styles
js/vendor/chess.js            # vendored chess.js (rules engine, MIT licensed)
js/curriculum.js              # the 16 stages / 745 puzzles (data only, generated — see below)
js/board.js                   # chessboard rendering + click-to-move
js/app.js                     # app logic: navigation, puzzle flow, progress
js/print.js                   # builds the printable worksheet
js/supabase-config.js         # Supabase project URL + anon key (fill in — see "Google login setup")
js/auth.js                    # Supabase client + auth state; no-ops cleanly if not configured
supabase/schema.sql           # progress table + RLS policies (run once in Supabase's SQL editor)

scripts/validate-curriculum.js  # verifies every puzzle: legal, achieves goal, exchange-safe, no hanging piece
scripts/audit-safety.js         # standalone exchange-safety audit (opponent can't win the material back)
scripts/audit-hanging.js        # standalone hanging-piece audit (for non-material goals: check/castle/develop/center)
scripts/gen-lib.js              # shared helpers: board building, exchange evaluation, goal checks
scripts/forced-search.js        # generic "find a forced N-move line achieving goal X" search
scripts/generators.js           # pins/skewers, forks/double-attack, discovered checks, removing-the-defender
scripts/generators-mates.js     # box mates, queen+king mates, smothered mates, mate-in-2/3
scripts/generators-special.js   # promotion, opening principles
scripts/import-polgar.js        # imports the Polgar-book mate puzzles (scripts/data/polgar-problems.json)
scripts/import-lichess.js       # imports real-game puzzles (scripts/data/lichess-raw-pool.json) — see LEARNING_PATH.md
scripts/build-curriculum.js     # runs all generators/importers and writes js/curriculum.js
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
