#!/usr/bin/env node
/* Authoring tool only. Sweeps for genuine mate-in-3 (5-ply) positions. */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))

function findForcedMate(chess, fullMovesLeft, forbidImmediate) {
  if (chess.in_checkmate()) return []
  if (fullMovesLeft <= 0) return null
  const whiteMoves = chess.moves()
  for (const wm of whiteMoves) {
    chess.move(wm)
    if (chess.in_checkmate()) {
      chess.undo()
      if (forbidImmediate) continue
      return [wm]
    }
    const blackMoves = chess.moves()
    if (blackMoves.length === 0) {
      chess.undo()
      continue
    }
    let allLeadToMate = true
    let exampleLine = null
    for (const bm of blackMoves) {
      chess.move(bm)
      const sub = findForcedMate(chess, fullMovesLeft - 1, false)
      chess.undo()
      if (!sub) {
        allLeadToMate = false
        break
      }
      if (!exampleLine) exampleLine = [bm, ...sub]
    }
    chess.undo()
    if (allLeadToMate) return [wm, ...exampleLine]
  }
  return null
}

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const kingBoxes = [
  { king: 'g8', pawns: ['h7'] }, // f7 and g7 both open
  { king: 'b8', pawns: ['a7'] }, // c7 and b7(own? no) open — a7 only
]

let found = 0
for (const box of kingBoxes) {
  for (const f1 of files) {
    for (let r1 = 1; r1 <= 2; r1++) {
      const rookSq = `${f1}${r1}`
      for (const f2 of files) {
        for (let r2 = 1; r2 <= 3; r2++) {
          const queenSq = `${f2}${r2}`
          if (queenSq === rookSq) continue
          const whiteKingSq = rookSq === 'g1' || queenSq === 'g1' ? 'h1' : 'g1'
          if (whiteKingSq === rookSq || whiteKingSq === queenSq) continue
          if (box.king === rookSq || box.king === queenSq || box.king === whiteKingSq) continue
          if (box.pawns.includes(rookSq) || box.pawns.includes(queenSq) || box.pawns.includes(whiteKingSq))
            continue

          const put = {}
          put[box.king] = { type: 'k', color: 'b' }
          for (const p of box.pawns) put[p] = { type: 'p', color: 'b' }
          put[rookSq] = { type: 'r', color: 'w' }
          put[queenSq] = { type: 'q', color: 'w' }
          put[whiteKingSq] = { type: 'k', color: 'w' }

          const chess = new Chess()
          chess.clear()
          let ok = true
          for (const sq of Object.keys(put)) {
            if (!chess.put(put[sq], sq)) ok = false
          }
          if (!ok) continue
          if (chess.in_check()) continue
          const asBlack = new Chess()
          asBlack.load(chess.fen().replace(' w ', ' b '))
          if (asBlack.in_check()) continue

          const result = findForcedMate(chess, 3, true)
          if (result && result.length === 5) {
            found++
            console.log(`FOUND #${found}: fen="${chess.fen()}" line=${JSON.stringify(result)}`)
            if (found >= 10) process.exit(0)
          }
        }
      }
    }
  }
}
console.log('done, found', found)
