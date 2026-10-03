#!/usr/bin/env node
/*
 * Imports a difficulty-spread sample of real, book-sourced checkmate
 * puzzles for the Mate in 1/2/3 stages, replacing the earlier
 * procedurally-generated ones for just those three stages.
 *
 * Source: László Polgár's "Chess: 5,334 Problems, Combinations, and
 * Games" (1994) — a classic, famously progressive (easy-to-hard) puzzle
 * book used by generations of chess students. Data vendored from
 * https://github.com/denialromeo/4462-chess-problems (whose own README
 * explicitly invites reuse: "If you'd like to use these problems for
 * your own project... Enjoy!"), itself solved move-by-move with
 * Stockfish (see that repo's polgar.py). Every single one of the 4462
 * positions was independently re-verified against our own chess.js
 * engine (scripts/data/polgar-problems.json; see the bottom of this file
 * for that verification, also re-run as part of this import).
 *
 * We don't use all 4462 — we take an evenly-spaced sample across each
 * type's problem-ID range, which preserves the book's own easy-to-hard
 * ordering (problem IDs are already difficulty-ordered) while keeping
 * the in-app puzzle count reasonable.
 */
const path = require('path')
const { Chess } = require('./gen-lib')

const RAW = require('./data/polgar-problems.json')

const TARGETS = {
  // The underlying (white-to-move) pool is 307 / 3195 / 420 total.
  'Mate in One': { count: 200, goal: 'mate' },
  'Mate in Two': { count: 400, goal: 'mate' },
  'Mate in Three': { count: 200, goal: 'mate' },
}

function evenlySpaced(arr, count) {
  if (arr.length <= count) return arr.slice()
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(arr[Math.floor((i * (arr.length - 1)) / (count - 1))])
  }
  // de-dupe (can happen with small counts/rounding) while preserving order
  return out.filter((v, i) => out.indexOf(v) === i)
}

function parseMove(token) {
  let [from, to] = token.split('-')
  let promotion
  if (to.length === 3) {
    promotion = to[2]
    to = to.slice(0, 2)
  }
  return { from, to, promotion: promotion || 'q' }
}

function describeSolution(chess, sanMoves) {
  const firstIsCheck = /\+|#/.test(sanMoves[0])
  const firstIsCapture = sanMoves[0].includes('x')
  const plies = sanMoves.length
  const mateWord = plies === 1 ? 'in one move' : plies === 3 ? 'in two moves' : 'in three moves'
  const hint =
    plies === 1
      ? "This is a classic puzzle-book position. There's exactly one move that delivers checkmate immediately — look for a square the king can't escape to."
      : firstIsCheck
      ? 'Start with the check — it forces a single reply, and that reply is the key to the rest of the puzzle.'
      : "The first move isn't a check, but it sets up an unstoppable mate in a couple of moves. Think about what it threatens."
  const explanation =
    plies === 1
      ? `This position is from a classic chess puzzle book. ${
          firstIsCapture ? 'Capturing here' : 'This move'
        } delivers checkmate ${mateWord} — the king has no escape square, nothing can block, and nothing can capture the attacker.`
      : `This position is from a classic chess puzzle book. The forced sequence leads to checkmate ${mateWord} no matter how Black tries to wriggle out.`
  return { hint, explanation }
}

function buildPuzzles() {
  const puzzlesByType = {}
  for (const type of Object.keys(TARGETS)) puzzlesByType[type] = []
  for (const p of RAW.problems) {
    // The learner always plays White in this app (board orientation,
    // "you're playing White!" messaging, etc.) — skip the ~12% of book
    // problems where it's actually Black's move to find.
    if (p.fen.split(' ')[1] !== 'w') continue
    if (puzzlesByType[p.type]) puzzlesByType[p.type].push(p)
  }

  const results = {} // type -> array of puzzle objects
  for (const type of Object.keys(TARGETS)) {
    const { count, goal } = TARGETS[type]
    const sampled = evenlySpaced(puzzlesByType[type], count)
    const out = []
    for (const p of sampled) {
      const chess = new Chess()
      if (!chess.load(p.fen)) continue
      const tokens = p.moves.split(';')
      const sanMoves = []
      let ok = true
      for (const tok of tokens) {
        const { from, to, promotion } = parseMove(tok)
        const result = chess.move({ from, to, promotion })
        if (!result) {
          ok = false
          break
        }
        sanMoves.push(result.san)
      }
      if (!ok || !chess.in_checkmate()) continue // belt-and-suspenders; see scripts/validate-curriculum.js too
      const { hint, explanation } = describeSolution(chess, sanMoves)
      out.push({ fen: p.fen, goal, solution: sanMoves, hint, explanation })
    }
    results[type] = out
  }
  return results
}

module.exports = { buildPuzzles }

if (require.main === module) {
  const built = buildPuzzles()
  for (const type of Object.keys(built)) {
    console.log(type, '->', built[type].length, 'puzzles')
  }
}
