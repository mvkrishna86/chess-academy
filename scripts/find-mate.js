#!/usr/bin/env node
/*
 * Brute-force forced-mate finder, used only to AUTHOR puzzles (not shipped
 * to the app). Given a FEN (White to move) and a max depth (in full moves),
 * it searches: does White have a move such that for every Black reply,
 * White can force mate within the remaining depth? Prints the first forced
 * line found.
 *
 * Usage: node scripts/find-mate.js "<fen>" <depthInFullMoves>
 */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))

function findForcedMate(chess, fullMovesLeft, line, forbidImmediate) {
  if (chess.in_checkmate()) {
    return line
  }
  if (fullMovesLeft <= 0) return null
  const whiteMoves = chess.moves()
  for (const wm of whiteMoves) {
    chess.move(wm)
    if (chess.in_checkmate()) {
      chess.undo()
      if (forbidImmediate) continue // we want an EXACT mate-in-N, not a shortcut
      return [...line, wm]
    }
    if (chess.in_check() === false && fullMovesLeft === 1) {
      // last move must mate; if it's not even check, skip quickly
    }
    const blackMoves = chess.moves()
    if (blackMoves.length === 0) {
      // stalemate, not useful
      chess.undo()
      continue
    }
    let allLeadToMate = true
    let exampleLine = null
    for (const bm of blackMoves) {
      chess.move(bm)
      const sub = findForcedMate(chess, fullMovesLeft - 1, [])
      chess.undo()
      if (!sub) {
        allLeadToMate = false
        break
      }
      if (!exampleLine) exampleLine = [bm, ...sub]
    }
    if (allLeadToMate) {
      chess.undo()
      return [...line, wm, ...exampleLine]
    }
    chess.undo()
  }
  return null
}

const fen = process.argv[2]
const depth = parseInt(process.argv[3] || '2', 10)
const chess = new Chess()
if (!chess.load(fen)) {
  console.error('Invalid FEN')
  process.exit(1)
}
const result = findForcedMate(chess, depth, [], true)
if (result) {
  console.log('FORCED MATE FOUND:', JSON.stringify(result))
} else {
  console.log('No forced mate found within depth', depth)
}
