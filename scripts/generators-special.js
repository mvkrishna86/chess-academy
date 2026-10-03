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
  exchangeNetGain,
  isExchangeSafe,
  PIECE_VALUES,
} = require('./gen-lib')
const { findForcedLine } = require('./forced-search')

// =====================================================================
// King & Pawn Endgames
// =====================================================================

// Promotion in 1: a pawn one step from queening, with a clear path and a
// black king too far away to immediately punish the new queen.
function genPromotionIn1(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 20000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const file = randInt(8)
    const pawnSq = sq(file, 6) // rank 7
    const promoSq = sq(file, 7) // rank 8
    const pieces = {}
    pieces[pawnSq] = { type: 'p', color: 'w' }
    const blackKingSq = choice(allSquares().filter((s) => s !== pawnSq && s !== promoSq && !squaresAdjacent(s, promoSq)))
    pieces[blackKingSq] = { type: 'k', color: 'b' }
    const whiteKingSq = findSafeWhiteKing(pieces, blackKingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'promote'))
    if (!line) continue
    seen.add(fen)

    const hint = `Your pawn is one step from the last row. Push it all the way and promote to a queen!`
    const explanation = `A pawn that reaches the far row turns into a queen — one of the most powerful trades in chess. Your new queen is safely out of the black king's reach.`

    results.push({ fen, solution: line, goal: 'promote', hint, explanation })
  }
  return results
}

// A forced sequence (king maneuvering / zugzwang) ending in promotion —
// generated via brute force since K+P vs K has few enough pieces to search.
function genForcedPromotion(targetCount, plies) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = plies === 2 ? 8000 : 4000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const pawnFile = randInt(8)
    const pawnRank = 3 + randInt(3) // ranks 4-6 (0-indexed 3..5)
    const pawnSq = sq(pawnFile, pawnRank)
    const pieces = {}
    pieces[pawnSq] = { type: 'p', color: 'w' }
    const wk = choice(allSquares().filter((s) => s !== pawnSq))
    pieces[wk] = { type: 'k', color: 'w' }
    const bkCandidates = allSquares().filter(
      (s) => s !== pawnSq && s !== wk && !squaresAdjacent(s, wk)
    )
    if (bkCandidates.length === 0) continue
    const bk = choice(bkCandidates)
    pieces[bk] = { type: 'k', color: 'b' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, plies, (c, r) => checkGoal(c, r, 'promote'))
    if (!line || line.length !== plies * 2 - 1) continue

    // The new queen must not simply be capturable for free the moment
    // she appears (e.g. the enemy king ends up right next to her).
    const verify = new Chess()
    verify.load(fen)
    let lastMove = null
    for (const san of line) lastMove = verify.move(san)
    const blackNet = exchangeNetGain(verify, lastMove.to)
    const net = PIECE_VALUES.q - PIECE_VALUES.p - blackNet
    if (net < 0) continue

    seen.add(fen)

    const hint = `Maneuver your king to clear the way, then push your pawn through to promote.`
    const explanation = `By bringing your king into the right position first, your pawn's path to the last row becomes unstoppable. The full line: ${line.join(
      ' '
    )}.`

    results.push({ fen, solution: line, goal: 'promote', hint, explanation })
  }
  return results
}

// =====================================================================
// Opening Principles — objectively checkable rules, not "best move"
// judgments (we have no evaluation engine, only a legality one).
// =====================================================================

function genCastling(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 10000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const side = choice(['K', 'Q'])
    // Build the FEN by hand so castling rights are set correctly — put()
    // based construction always clears castling rights.
    const emptyBetween = side === 'K' ? ['f1', 'g1'] : ['b1', 'c1', 'd1']
    const blackPieces = {}
    const used = new Set(['e1', side === 'K' ? 'h1' : 'a1', ...emptyBetween])
    const numExtra = choice([0, 1, 2])
    const blackKingSq = choice(allSquares().filter((s) => rankOf(s) >= 4 && !used.has(s)))
    blackPieces[blackKingSq] = 'k'
    used.add(blackKingSq)
    const extraTypes = ['q', 'r', 'b', 'n', 'p']
    for (let i = 0; i < numExtra; i++) {
      const candidates = allSquares().filter((s) => rankOf(s) >= 3 && !used.has(s))
      if (candidates.length === 0) break
      const s = choice(candidates)
      used.add(s)
      blackPieces[s] = choice(extraTypes)
    }

    let boardFen = buildEmptyBoardArray()
    placeOnBoard(boardFen, 'e1', 'K')
    placeOnBoard(boardFen, side === 'K' ? 'h1' : 'a1', 'R')
    for (const s of Object.keys(blackPieces)) placeOnBoard(boardFen, s, blackPieces[s])
    const fenBoard = boardArrayToFen(boardFen)
    const castleRights = side === 'K' ? 'K' : 'Q'
    const fen = `${fenBoard} w ${castleRights} - 0 1`

    const chess = new Chess()
    if (!chess.load(fen)) continue
    if (!isCleanSetup(chess)) continue
    const expectedSan = side === 'K' ? 'O-O' : 'O-O-O'
    if (!chess.moves().includes(expectedSan)) continue
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'castle'))
    if (!line) continue
    seen.add(fen)

    const hint = `Your king and rook are both ready. Tuck your king away to safety — castle now!`
    const explanation = `Castling moves your king to safety behind its pawns AND brings your rook into play, all in one move. It's one of the best things you can do early in a game.`

    results.push({ fen, solution: line, goal: 'castle', hint, explanation })
  }
  return results
}

function buildEmptyBoardArray() {
  return Array.from({ length: 8 }, () => Array(8).fill(null))
}
function placeOnBoard(board, square, pieceChar) {
  const f = fileOf(square)
  const r = rankOf(square)
  board[7 - r][f] = pieceChar
}
function boardArrayToFen(board) {
  return board
    .map((row) => {
      let out = ''
      let empties = 0
      for (const cell of row) {
        if (!cell) {
          empties++
        } else {
          if (empties) {
            out += empties
            empties = 0
          }
          out += cell
        }
      }
      if (empties) out += empties
      return out
    })
    .join('/')
}

function genDevelopPiece(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 15000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const pieceType = choice(['n', 'b'])
    const homeSq = sq(randInt(8), 0)
    const pieces = {}
    pieces[homeSq] = { type: pieceType, color: 'w' }
    const blackKingSq = choice(allSquares().filter((s) => rankOf(s) >= 5))
    pieces[blackKingSq] = { type: 'k', color: 'b' }
    const whiteKingSq = findSafeWhiteKing(pieces, blackKingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'develop'))
    if (!line) continue
    seen.add(fen)

    const pieceWord = pieceType === 'n' ? 'knight' : 'bishop'
    const hint = `Your ${pieceWord} is still on its home square. Bring it out into the game!`
    const explanation = `Getting your knights and bishops off the back row early means more of your pieces are ready for action — a key opening principle.`

    results.push({ fen, solution: line, goal: 'develop', hint, explanation })
  }
  return results
}

function genCenterPawn(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 15000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const file = choice([3, 4]) // d or e
    const startRank = choice([1, 2]) // rank 2 or 3
    const pawnSq = sq(file, startRank)
    const pieces = {}
    pieces[pawnSq] = { type: 'p', color: 'w' }
    const blackKingSq = choice(allSquares().filter((s) => rankOf(s) >= 5))
    pieces[blackKingSq] = { type: 'k', color: 'b' }
    const whiteKingSq = findSafeWhiteKing(pieces, blackKingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'center'))
    if (!line) continue
    seen.add(fen)

    const hint = `Push your pawn into the center — the squares that control the most important part of the board.`
    const explanation = `Central pawn moves like this one give your pieces more squares to work with and let you fight for the middle of the board — one of the big opening principles.`

    results.push({ fen, solution: line, goal: 'center', hint, explanation })
  }
  return results
}

// =====================================================================
// Deflection/Decoy & Zwischenzug: a forced 2-move sequence (White forces
// a specific Black reply, usually with a check) where the SECOND move
// captures material that wasn't available before — i.e. the first move
// wasn't a "free" capture by itself, Black had to be forced out of the
// way first. Exchange-safety is checked same as the single-move tactics.
// =====================================================================
function genForcedCapture(targetCount, opts) {
  opts = opts || {}
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 20000
  const pieceTypes = ['q', 'r', 'b', 'n']

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const blackKingSq = choice(allSquares())
    const victim1Sq = choice(allSquares().filter((s) => s !== blackKingSq))
    const victim1Type = choice(pieceTypes)
    const pieces = {}
    pieces[blackKingSq] = { type: 'k', color: 'b' }
    pieces[victim1Sq] = { type: victim1Type, color: 'b' }

    const used = new Set([blackKingSq, victim1Sq])
    const attackerCount = 2
    const attackerTypes = shuffle(pieceTypes).slice(0, attackerCount)
    let ok = true
    for (const t of attackerTypes) {
      const candidates = allSquares().filter((s) => !used.has(s))
      if (candidates.length === 0) {
        ok = false
        break
      }
      const s = choice(candidates)
      used.add(s)
      pieces[s] = { type: t, color: 'w' }
    }
    if (!ok) continue

    const whiteKingSq = findSafeWhiteKing(pieces, blackKingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 2, (c, r) => checkGoal(c, r, 'capture'))
    if (!line || line.length !== 3) continue

    const verify = new Chess()
    verify.load(fen)
    verify.move(line[0])
    verify.move(line[1])
    const lastResult = verify.move(line[2])
    if (!isExchangeSafe(verify, lastResult)) continue

    seen.add(fen)
    results.push({
      fen,
      solution: line,
      goal: 'capture',
      hint: opts.hint || `Don't grab material right away — force Black's hand first, THEN collect.`,
      explanation:
        opts.explanation ||
        `Your first move forces Black into a specific reply (there's no better option), and that's exactly what opens the door to winning material with your second move. Full line: ${line.join(
          ' '
        )}.`,
    })
  }
  return results
}

module.exports = {
  genPromotionIn1,
  genForcedPromotion,
  genCastling,
  genDevelopPiece,
  genCenterPawn,
  genForcedCapture,
}
