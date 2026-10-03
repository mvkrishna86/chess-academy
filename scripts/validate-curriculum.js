#!/usr/bin/env node
/*
 * Validates every puzzle in js/curriculum.js against the real chess rules
 * engine (vendored chess.js). Run with: node scripts/validate-curriculum.js
 *
 * For each puzzle it checks:
 *   1. The FEN parses and the position is legal (not already mate/stalemate).
 *   2. Every move in `solution` is a legal SAN move at that point in the game.
 *   3. If the stage's `goal` is "mate", the position after the final solution
 *      move is checkmate.
 *   4. If the stage's `goal` is "capture", the final solution move captures
 *      a piece (simple proxy for "the tactic wins material").
 *
 * On any failure it prints the puzzle id, the reason, and (for illegal
 * moves) the full list of legal SAN moves available at that point, so a
 * fix can be picked immediately.
 */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))
const { STAGES } = require(path.join(__dirname, '..', 'js', 'curriculum.js'))
const { isExchangeSafe, forkPieceIsSafe, exchangeNetGain, PIECE_VALUES } = require('./gen-lib')

let failures = 0
let total = 0

for (const stage of STAGES) {
  for (const puzzle of stage.puzzles) {
    total++
    const id = `${stage.id} / ${puzzle.id}`
    const chess = new Chess()
    const loaded = chess.load(puzzle.fen)
    if (loaded === false) {
      console.error(`FAIL [${id}]: invalid FEN "${puzzle.fen}"`)
      failures++
      continue
    }
    if (chess.in_checkmate() || chess.in_stalemate()) {
      console.error(`FAIL [${id}]: starting position is already game-over`)
      failures++
      continue
    }
    // It's White's turn, so Black must NOT be in check (that would mean
    // Black just made an illegal move leaving their own king in check).
    const turnColor = chess.turn()
    chess.load(puzzle.fen.replace(/ (w|b) /, turnColor === 'w' ? ' b ' : ' w '))
    if (chess.in_check()) {
      console.error(
        `FAIL [${id}]: the side NOT to move is already in check — impossible position. FEN: ${puzzle.fen}`
      )
      failures++
      continue
    }
    chess.load(puzzle.fen)

    let ok = true
    let lastMoveResult = null
    for (let i = 0; i < puzzle.solution.length; i++) {
      const san = puzzle.solution[i]
      const legalSans = chess.moves()
      const result = chess.move(san, { sloppy: true })
      if (!result) {
        console.error(
          `FAIL [${id}]: move #${i + 1} "${san}" is illegal.\n  Legal moves here: ${legalSans.join(', ')}\n  FEN at this point: ${chess.fen()}`
        )
        ok = false
        break
      }
      lastMoveResult = result
    }
    if (!ok) {
      failures++
      continue
    }

    const goal = puzzle.goal || stage.goal

    if (goal === 'mate') {
      if (!chess.in_checkmate()) {
        console.error(
          `FAIL [${id}]: final position is NOT checkmate. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'capture') {
      if (!lastMoveResult || !lastMoveResult.captured) {
        console.error(
          `FAIL [${id}]: final move "${puzzle.solution[puzzle.solution.length - 1]}" did not capture a piece.`
        )
        failures++
        continue
      }
      if (!isExchangeSafe(chess, lastMoveResult)) {
        console.error(
          `FAIL [${id}]: capture is not exchange-safe — Black can win back at least as much material. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'check') {
      if (!chess.in_check()) {
        console.error(
          `FAIL [${id}]: final move did not give check. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'fork') {
      const destSquare = lastMoveResult.to
      // chess.moves({square}) is filtered by whose turn it is, but it's now
      // the OPPONENT's turn — flip the turn back so we query the mover's
      // piece's attacks, not an empty set for the wrong side.
      const scratch = new Chess()
      scratch.load(chess.fen().replace(/ (w|b) /, ' w '))
      const attacks = scratch.moves({ square: destSquare, verbose: true })
      // Exclude the king — chess.js's scratch-board move list includes a
      // pseudo-"capture" of it, which would double-count the same king
      // alongside givesCheck below.
      const capturesAvailable = attacks.filter((m) => m.captured && m.captured !== 'k').length
      const givesCheck = chess.in_check()
      const forkCount = capturesAvailable + (givesCheck ? 1 : 0)
      if (forkCount < 2) {
        console.error(
          `FAIL [${id}]: final move does not fork >=2 targets (found ${forkCount}). FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
      if (!forkPieceIsSafe(chess, lastMoveResult)) {
        console.error(
          `FAIL [${id}]: forking piece is not exchange-safe — Black can trade it off for net material. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'promote') {
      if (!lastMoveResult || lastMoveResult.promotion !== 'q') {
        console.error(`FAIL [${id}]: final move did not promote to a queen. FEN: ${chess.fen()}`)
        failures++
        continue
      }
      const promoNet = PIECE_VALUES.q - PIECE_VALUES.p - exchangeNetGain(chess, lastMoveResult.to)
      if (promoNet < 0) {
        console.error(
          `FAIL [${id}]: the new queen is not safe — Black can win it back. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'castle') {
      const flags = lastMoveResult && lastMoveResult.flags
      if (!flags || (flags.indexOf('k') === -1 && flags.indexOf('q') === -1)) {
        console.error(`FAIL [${id}]: final move was not a castle. FEN: ${chess.fen()}`)
        failures++
        continue
      }
    } else if (goal === 'develop') {
      const fromRank = lastMoveResult && lastMoveResult.from[1]
      const okPiece = lastMoveResult && (lastMoveResult.piece === 'n' || lastMoveResult.piece === 'b')
      if (!okPiece || fromRank !== '1') {
        console.error(
          `FAIL [${id}]: final move did not develop a knight/bishop off the back rank. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    } else if (goal === 'center') {
      const okPiece = lastMoveResult && lastMoveResult.piece === 'p'
      const okSquare = lastMoveResult && (lastMoveResult.to === 'd4' || lastMoveResult.to === 'e4')
      if (!okPiece || !okSquare) {
        console.error(`FAIL [${id}]: final move did not push a pawn to d4/e4. FEN: ${chess.fen()}`)
        failures++
        continue
      }
    } else {
      console.error(`FAIL [${id}]: unknown goal "${goal}" — no validator branch covers it.`)
      failures++
      continue
    }

    // For goals that don't claim a material win (check/castle/develop/
    // center), the piece that just moved still shouldn't simply hang for
    // free — a kid would see "Solved!" on a move that actually loses a
    // piece for nothing.
    if (['check', 'castle', 'develop', 'center'].includes(goal)) {
      const initialGain = lastMoveResult.captured ? PIECE_VALUES[lastMoveResult.captured] : 0
      const net = initialGain - exchangeNetGain(chess, lastMoveResult.to)
      if (net < 0) {
        console.error(
          `FAIL [${id}]: the piece on ${lastMoveResult.to} hangs for nothing after this move. FEN: ${chess.fen()}`
        )
        failures++
        continue
      }
    }
  }
}

console.log(`\n${total - failures}/${total} puzzles passed.`)
if (failures > 0) {
  console.error(`${failures} puzzle(s) FAILED validation.`)
  process.exit(1)
} else {
  console.log('All puzzles valid. ✓')
}
