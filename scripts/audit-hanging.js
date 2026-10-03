#!/usr/bin/env node
/*
 * Second safety pass, prompted by a real bug already found in 'capture'/
 * 'fork' puzzles: checks that for every OTHER goal type too (check,
 * promote, castle, develop, center), the piece that just moved isn't
 * simply hanging for free. A kid will trust "this is a good move" at
 * face value, so a puzzle that technically satisfies its goal but
 * immediately loses the piece for nothing is still a bad lesson.
 */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))
const { STAGES } = require(path.join(__dirname, '..', 'js', 'curriculum.js'))
const { exchangeNetGain, PIECE_VALUES } = require('./gen-lib')

let issues = 0
let checked = 0

for (const stage of STAGES) {
  for (const puzzle of stage.puzzles) {
    const goal = puzzle.goal || stage.goal
    if (['mate', 'capture', 'fork'].includes(goal)) continue // already audited elsewhere
    checked++
    const chess = new Chess()
    chess.load(puzzle.fen)
    let lastResult = null
    for (const san of puzzle.solution) {
      lastResult = chess.move(san, { sloppy: true })
    }
    if (!lastResult) continue

    // Credit whatever White's solving move itself already won (a capture,
    // or the ~8-point swing from promoting a pawn into a queen) before
    // judging whether Black's best reply on that square nets them ahead —
    // same logic as isExchangeSafe, just allowing a net of exactly 0 since
    // these goals don't claim a material win in the first place.
    const square = lastResult.to
    let initialGain = lastResult.captured ? PIECE_VALUES[lastResult.captured] : 0
    if (goal === 'promote') initialGain += PIECE_VALUES.q - PIECE_VALUES.p
    const blackNet = exchangeNetGain(chess, square)
    const net = initialGain - blackNet
    if (net < 0) {
      issues++
      console.error(
        `ISSUE [${stage.id} / ${puzzle.id}] (goal=${goal}): the piece on ${square} nets Black +${-net} overall. FEN: ${puzzle.fen}  solution: ${puzzle.solution.join(' ')}`
      )
    }
  }
}

console.log(`\nChecked ${checked} check/promote/castle/develop/center puzzles, found ${issues} issue(s).`)
process.exit(issues > 0 ? 1 : 0)
