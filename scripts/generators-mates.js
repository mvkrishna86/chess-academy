#!/usr/bin/env node
const {
  Chess,
  sq,
  fileOf,
  rankOf,
  randInt,
  choice,
  shuffle,
  allSquares,
  buildPosition,
  isCleanSetup,
  squaresAdjacent,
  findSafeWhiteKing,
  pieceName,
  checkGoal,
  KNIGHT_OFFSETS,
} = require('./gen-lib')
const { findForcedLine } = require('./forced-search')

// =====================================================================
// "Box" mate: king on rank R is boxed in by 1-3 of its own pawns on the
// adjacent rank; a rook/queen slides onto rank R with a clear path to
// check (and, since a slider's check always "follows" the king along
// that line, any sideways escape fails too).
// =====================================================================
function genBoxMate(targetCount, opts) {
  opts = opts || {}
  const ranks = opts.ranks || [0, 1, 2, 3, 4, 5, 6, 7]
  const fullBox = opts.fullBox !== false // if false, leave gaps (not used here; mate-in-2/3 handle that)
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 40000

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const kf = randInt(8)
    const kr = choice(ranks)
    const kingSq = sq(kf, kr)
    const pawnRank = kr >= 4 ? kr - 1 : kr + 1 // whichever stays on-board; bias toward "upper" ranks
    if (pawnRank < 0 || pawnRank > 7) continue

    const pawnFiles = [kf - 1, kf, kf + 1].filter((f) => f >= 0 && f <= 7)
    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    const usedSquares = new Set([kingSq])
    let ok = true
    for (const f of pawnFiles) {
      const s = sq(f, pawnRank)
      if (!s || usedSquares.has(s)) {
        ok = false
        break
      }
      pieces[s] = { type: 'p', color: 'b' }
      usedSquares.add(s)
    }
    if (!ok) continue

    // Attacker approaches rank `kr` vertically on some empty file.
    const checkFile = choice([0, 1, 2, 3, 4, 5, 6, 7].filter((f) => f !== kf))
    const checkSq = sq(checkFile, kr)
    if (!checkSq || usedSquares.has(checkSq)) continue
    const startRank = choice([0, 1, 2, 3, 4, 5, 6, 7].filter((r) => r !== kr))
    const attackerStart = sq(checkFile, startRank)
    if (!attackerStart || usedSquares.has(attackerStart)) continue
    const attackerType = choice(['r', 'q'])
    pieces[attackerStart] = { type: attackerType, color: 'w' }
    usedSquares.add(attackerStart)

    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'mate'))
    if (!line) continue
    seen.add(fen)

    const pieceWord = attackerType === 'q' ? 'queen' : 'rook'
    const rankNum = kr + 1
    const hint = `The pawns trap the king on its row. Slide your ${pieceWord} all the way across to check it.`
    const explanation = `The king's own pawns block every square in front of it, and your ${pieceWord} controls the whole ${rankNum}${ordinalSuffix(
      rankNum
    )} row once it gets there — sliding sideways doesn't escape a check along the same row. Checkmate!`

    results.push({ fen, solution: line, goal: 'mate', hint, explanation })
  }
  return results
}

function ordinalSuffix(n) {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

// =====================================================================
// Queen (+ King) cooperation mate: king on an edge/corner square, queen
// lands adjacent delivering mate, defended by the White king.
// =====================================================================
function genQueenKingMate(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 40000
  const edgeSquares = allSquares().filter((s) => {
    const f = fileOf(s)
    const r = rankOf(s)
    return f === 0 || f === 7 || r === 0 || r === 7
  })

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const kingSq = choice(edgeSquares)
    const kf = fileOf(kingSq)
    const kr = rankOf(kingSq)
    const neighbors = []
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue
        const s = sq(kf + df, kr + dr)
        if (s) neighbors.push(s)
      }
    }
    if (neighbors.length > 5) continue // only want corners/edges (<=5 neighbors)
    const landingSq = choice(neighbors)
    const lf = fileOf(landingSq)
    const lr = rankOf(landingSq)
    const defendCandidates = []
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue
        const s = sq(lf + df, lr + dr)
        if (!s || s === kingSq) continue
        if (squaresAdjacent(s, kingSq)) continue // white & black kings can't be adjacent
        defendCandidates.push(s)
      }
    }
    if (defendCandidates.length === 0) continue
    const defendSq = choice(defendCandidates)

    // Queen must start somewhere aligned to landingSq (not already placed).
    const used = new Set([kingSq, landingSq, defendSq])
    const dirs = shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
    let queenStart = null
    for (const dir of dirs) {
      for (let d = 1; d < 8; d++) {
        const s = sq(fileOf(landingSq) + dir[0] * d, rankOf(landingSq) + dir[1] * d)
        if (!s) break
        if (used.has(s)) break
        if (squaresAdjacent(s, kingSq)) continue
        queenStart = s
        break
      }
      if (queenStart) break
    }
    if (!queenStart) continue

    const pieces = {
      [kingSq]: { type: 'k', color: 'b' },
      [defendSq]: { type: 'k', color: 'w' },
      [queenStart]: { type: 'q', color: 'w' },
    }
    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'mate'))
    if (!line) continue
    seen.add(fen)

    const hint = `The king is stuck on the edge. Can your queen land right next to it, safely guarded by your own king?`
    const explanation = `Your queen lands next to the king, covering every escape square — and your own king guards her so she can't be captured. Checkmate!`

    results.push({ fen, solution: line, goal: 'mate', hint, explanation })
  }
  return results
}

// =====================================================================
// Smothered mate: king in a corner, all its own-piece-blocked neighbors,
// knight delivers mate from the one square nothing can capture.
// =====================================================================
function genSmotheredMate(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 20000
  const corners = [
    [0, 0],
    [0, 7],
    [7, 0],
    [7, 7],
  ]

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const [cf, cr] = choice(corners)
    const fileSign = cf === 7 ? -1 : 1
    const rankSign = cr === 7 ? -1 : 1
    const kingSq = sq(cf, cr)
    const pawnDiag = sq(cf + fileSign, cr + rankSign)
    const pawnVert = sq(cf, cr + rankSign)
    const stuckHoriz = sq(cf + fileSign, cr)
    const knightSq = sq(cf + 2 * fileSign, cr + rankSign)
    if (!pawnDiag || !pawnVert || !stuckHoriz || !knightSq) continue

    const stuckType = choice(['r', 'n'])
    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    pieces[pawnDiag] = { type: 'p', color: 'b' }
    pieces[pawnVert] = { type: 'p', color: 'b' }
    pieces[stuckHoriz] = { type: stuckType, color: 'b' }

    const used = new Set(Object.keys(pieces))
    used.add(knightSq)
    const knightStartCandidates = shuffle(
      KNIGHT_OFFSETS.map(([df, dr]) => sq(fileOf(knightSq) + df, rankOf(knightSq) + dr)).filter(
        (s) => s && !used.has(s)
      )
    )
    if (knightStartCandidates.length === 0) continue
    const knightStart = knightStartCandidates[0]
    pieces[knightStart] = { type: 'n', color: 'w' }

    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'mate'))
    if (!line) continue
    seen.add(fen)

    const stuckName = pieceName(stuckType)
    const hint = `The king is completely boxed in by its own ${stuckName} and pawns. Hop your knight to the one square nothing can capture it on.`
    const explanation = `The king is smothered by its own pieces — totally boxed in. Your knight delivers checkmate from a square nothing can reach: not the ${stuckName}, not the pawns (they can't capture sideways or backward).`

    results.push({ fen, solution: line, goal: 'mate', hint, explanation })
  }
  return results
}

// =====================================================================
// Mate in 2 / Mate in 3: random king-box (with 1-2 real flight squares)
// + two White attackers; brute-force forced-mate search does the rest.
// =====================================================================
function genForcedMate(targetCount, plies) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = plies === 2 ? 15000 : 6000

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const kf = randInt(8)
    const kr = choice([0, 7]) // keep the king on a back rank for a believable box
    const kingSq = sq(kf, kr)
    const pawnRank = kr === 7 ? 6 : 1
    const numPawns = plies === 2 ? choice([1, 2]) : choice([0, 1])
    const pawnFileOffsets = shuffle([-1, 0, 1]).slice(0, numPawns)
    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    const used = new Set([kingSq])
    let ok = true
    for (const off of pawnFileOffsets) {
      const s = sq(kf + off, pawnRank)
      if (!s || used.has(s)) {
        ok = false
        break
      }
      pieces[s] = { type: 'p', color: 'b' }
      used.add(s)
    }
    if (!ok) continue

    const attackerSetups = [
      ['q', 'r'],
      ['r', 'r'],
      ['q', 'n'],
      ['r', 'n'],
    ]
    const [type1, type2] = choice(attackerSetups)
    const sq1 = choice(allSquares().filter((s) => !used.has(s)))
    used.add(sq1)
    pieces[sq1] = { type: type1, color: 'w' }
    const sq2Candidates = allSquares().filter((s) => !used.has(s))
    if (sq2Candidates.length === 0) continue
    const sq2 = choice(sq2Candidates)
    used.add(sq2)
    pieces[sq2] = { type: type2, color: 'w' }

    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, plies, (c, r) => checkGoal(c, r, 'mate'))
    if (!line || line.length !== plies * 2 - 1) continue
    seen.add(fen)

    const hint =
      plies === 2
        ? 'Find the move that leaves Black no good options — then finish the job next move.'
        : 'Chase the king with forcing moves, one step at a time, until there is nowhere left to run.'
    const explanation =
      plies === 2
        ? `This move leaves Black no way to avoid checkmate next move, no matter what they try. The line goes: ${line.join(
            ' '
          )}.`
        : `Each move keeps tightening the net until there's no escape left. The full line: ${line.join(
            ' '
          )}.`

    results.push({ fen, solution: line, goal: 'mate', hint, explanation })
  }
  return results
}

module.exports = {
  genBoxMate,
  genQueenKingMate,
  genSmotheredMate,
  genForcedMate,
}
