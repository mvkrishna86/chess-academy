#!/usr/bin/env node
/*
 * Imports real tactics puzzles — taken from actual online games, not
 * composed — from the official Lichess puzzle database (CC0 / public
 * domain), replacing the sparse procedurally-generated puzzles in most
 * of the tactics stages.
 *
 * Source: https://huggingface.co/datasets/Lichess/chess-puzzles — the
 * Lichess organization's own mirror of https://database.lichess.org,
 * fetched via Hugging Face because the database.lichess.org domain
 * itself is blocked by at least one relevant network's security policy.
 * scripts/data/lichess-raw-pool.json is a small (16-theme, ~500/theme)
 * pre-filtered extract of that database (see the duckdb command in
 * LEARNING_PATH.md if you need to regenerate/expand it) — not the full
 * multi-GB dataset.
 *
 * Lichess puzzle format quirk this has to handle: the FEN is the
 * position *before* the opponent's setup move, and `moves[0]` is that
 * setup move — not something the solver plays. We apply it first, then
 * use moves[1:] as the actual puzzle solution. We only keep puzzles
 * where that setup move is Black's (so the solver — always White in
 * this app) moves second.
 */
const { Chess, checkGoal, isExchangeSafe, forkPieceIsSafe, exchangeNetGain, PIECE_VALUES } = require('./gen-lib')

const RAW = require('./data/lichess-raw-pool.json')

function parseUci(token) {
  const from = token.slice(0, 2)
  const to = token.slice(2, 4)
  const promotion = token.length === 5 ? token[4] : 'q'
  return { from, to, promotion }
}

const THEME_TEXT = {
  pin: {
    hint: 'A piece is pinned to something more valuable behind it and can\'t move away — find the move that cashes in on that.',
    explanation: 'This position is from a real online game. The pinned piece couldn\'t safely move out of the way, which is exactly what makes this work.',
  },
  fork: {
    hint: 'Look for one move that attacks two things at once — the opponent can only save one of them.',
    explanation: 'This position is from a real online game. The move forks two targets at once, so no matter what the opponent does, something is lost.',
  },
  skewer: {
    hint: 'Line up an attack through one piece to a bigger one behind it.',
    explanation: 'This position is from a real online game. The skewer wins material because the piece in front can\'t block for the piece behind it.',
  },
  discoveredAttack: {
    hint: 'Moving one piece out of the way can reveal a nasty attack from the piece behind it.',
    explanation: 'This position is from a real online game — moving the blocking piece uncovers an attack that was hiding the whole time.',
  },
  capturingDefender: {
    hint: 'Something you want to capture is "defended" — but check whether that defender can really do its job.',
    explanation: 'This position is from a real online game. The defender wasn\'t able to actually recapture, so the real prize was there for the taking.',
  },
  deflection: {
    hint: "Force an enemy piece to move somewhere worse first — often with a check — before going for the real target.",
    explanation: 'This position is from a real online game. Forcing the reply first is what opens the door to the winning move.',
  },
  intermezzo: {
    hint: "Before playing the move that looks automatic, look for a surprise in-between move first.",
    explanation: 'This position is from a real online game — an in-between move (zwischenzug) wins more than the "obvious" move would have.',
  },
  backRankMate: {
    hint: "The king's own pawns can trap it on the back row — look for the check it can't escape.",
    explanation: 'This position is from a real online game. The king was trapped on the back rank by its own pieces.',
  },
  smotheredMate: {
    hint: 'The king is boxed in by its own pieces — a single knight check can be unstoppable.',
    explanation: 'This position is from a real online game — the king was smothered by its own pieces with no square to run to.',
  },
  pawnEndgame: {
    hint: 'Think about king position and whose pawn is faster — small details decide pawn endgames.',
    explanation: 'This position is from a real online game, in the kind of pawn endgame every player eventually has to learn to handle.',
  },
  promotion: {
    hint: 'A pawn is close to the end of the board — find the way to push it through (or capture to clear the path).',
    explanation: 'This position is from a real online game. Promoting a pawn to a queen was the key to the position.',
  },
}

function buildTheme(themeKey, targetCount) {
  const pool = RAW[themeKey] || []
  const text = THEME_TEXT[themeKey] || {
    hint: 'Find the strongest move for White.',
    explanation: 'This position is from a real online game.',
  }
  const results = []
  for (const p of pool) {
    if (results.length >= targetCount) break
    const chess = new Chess()
    if (!chess.load(p.fen)) continue
    const tokens = p.moves.split(' ')
    if (tokens.length < 2) continue

    // moves[0] is the opponent's setup move, not part of the solution.
    const setup = parseUci(tokens[0])
    const setupResult = chess.move(setup)
    if (!setupResult) continue
    if (chess.turn() !== 'w') continue // solver must be White from here on

    const solutionTokens = tokens.slice(1)
    const sanMoves = []
    let lastResult = null
    let ok = true
    for (const tok of solutionTokens) {
      const { from, to, promotion } = parseUci(tok)
      const result = chess.move({ from, to, promotion })
      if (!result) {
        ok = false
        break
      }
      sanMoves.push(result.san)
      lastResult = result
    }
    if (!ok || sanMoves.length === 0) continue

    // Determine a goal we can mechanically verify (same bar as every
    // other puzzle in this app — see scripts/validate-curriculum.js).
    let goal = null
    if (chess.in_checkmate()) {
      goal = 'mate'
    } else if (lastResult.captured && isExchangeSafe(chess, lastResult)) {
      goal = 'capture'
    } else if (chess.in_check() && forkPieceIsSafe(chess, lastResult)) {
      goal = 'check'
    } else if (lastResult.promotion === 'q' && !lastResult.captured) {
      const net = PIECE_VALUES.q - PIECE_VALUES.p - exchangeNetGain(chess, lastResult.to)
      if (net >= 0) goal = 'promote'
    }
    if (!goal) continue

    results.push({
      fen: setupResultFenOf(p.fen, setup),
      goal,
      solution: sanMoves,
      hint: text.hint,
      explanation: text.explanation,
      _rating: p.rating,
    })
  }
  return results
}

function setupResultFenOf(originalFen, setupMove) {
  const chess = new Chess()
  chess.load(originalFen)
  chess.move(setupMove)
  return chess.fen()
}

module.exports = { buildTheme }

if (require.main === module) {
  for (const theme of Object.keys(RAW)) {
    const built = buildTheme(theme, 25)
    console.log(theme, '->', built.length, 'puzzles (requested 25)')
  }
}
