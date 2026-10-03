#!/usr/bin/env node
/*
 * Material-safety audit: for every 'capture' or 'fork' goal puzzle, uses a
 * proper static-exchange evaluation (full alternating-capture simulation,
 * not just "Black's single best reply") to confirm Black can't claw back
 * at least as much material as White's move won. The mechanical validator
 * only checks that the stated move is legal and matches the goal — it
 * can't see this, which is how a "pinned rook can still capture the
 * pinner" bug slipped through.
 */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))
const { STAGES } = require(path.join(__dirname, '..', 'js', 'curriculum.js'))
const { isExchangeSafe, forkPieceIsSafe } = require('./gen-lib')

let issues = 0
let checked = 0

for (const stage of STAGES) {
  for (const puzzle of stage.puzzles) {
    const goal = puzzle.goal || stage.goal
    if (goal !== 'capture' && goal !== 'fork') continue
    checked++
    const chess = new Chess()
    chess.load(puzzle.fen)
    let lastResult = null
    for (const san of puzzle.solution) {
      lastResult = chess.move(san, { sloppy: true })
    }
    if (!lastResult) continue

    const safe = goal === 'capture' ? isExchangeSafe(chess, lastResult) : forkPieceIsSafe(chess, lastResult)
    if (!safe) {
      issues++
      console.error(`ISSUE [${stage.id} / ${puzzle.id}]: not exchange-safe. FEN: ${puzzle.fen}  solution: ${puzzle.solution.join(' ')}`)
    }
  }
}

console.log(`\nChecked ${checked} capture/fork puzzles, found ${issues} issue(s).`)
process.exit(issues > 0 ? 1 : 0)
