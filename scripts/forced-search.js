#!/usr/bin/env node
/*
 * Generic forced-line search: finds a sequence of exactly `whiteMovesLeft`
 * White moves — with Black's replies in between forced to all lead to the
 * same outcome — such that the FINAL White move satisfies `goalFn(chess,
 * lastMoveResult)`. With whiteMovesLeft=1 this is just "does White have a
 * single move satisfying goalFn" (used for one-move tactics too).
 *
 * This generalizes scripts/find-mate.js (goalFn = checkmate) to any goal:
 * a capture, a fork, a check, a promotion, etc. — which is what lets the
 * same search power mate-in-2/3, deflection/decoy, zwischenzug, and
 * K+P-endgame "opposition" puzzle generation.
 */
function findForcedLine(chess, whiteMovesLeft, goalFn) {
  const whiteMoves = chess.moves({ verbose: true })
  for (const wm of whiteMoves) {
    const result = chess.move(wm.san)
    if (whiteMovesLeft === 1) {
      const ok = goalFn(chess, result)
      chess.undo()
      if (ok) return [wm.san]
      continue
    }
    const blackMoves = chess.moves()
    if (blackMoves.length === 0) {
      chess.undo()
      continue
    }
    let allWork = true
    let exampleTail = null
    for (const bm of blackMoves) {
      chess.move(bm)
      const sub = findForcedLine(chess, whiteMovesLeft - 1, goalFn)
      chess.undo()
      if (!sub) {
        allWork = false
        break
      }
      if (!exampleTail) exampleTail = [bm, ...sub]
    }
    chess.undo()
    if (allWork) return [wm.san, ...exampleTail]
  }
  return null
}

module.exports = { findForcedLine }
