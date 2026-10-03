#!/usr/bin/env node
/* Shared helpers for the puzzle generators. Authoring tools only. */
const path = require('path')
const { Chess } = require(path.join(__dirname, '..', 'js', 'vendor', 'chess.js'))

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function sq(f, r) {
  // f, r are 0-indexed (file a=0..h=7, rank '1'=0..'8'=7)
  if (f < 0 || f > 7 || r < 0 || r > 7) return null
  return FILES[f] + (r + 1)
}
function fileOf(square) {
  return FILES.indexOf(square[0])
}
function rankOf(square) {
  return parseInt(square[1], 10) - 1
}

function randInt(n) {
  return Math.floor(Math.random() * n)
}
function choice(arr) {
  return arr[randInt(arr.length)]
}
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function allSquares() {
  const out = []
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) out.push(sq(f, r))
  return out
}

// Builds a Chess position from a {square: {type, color}} map. White to move.
// Returns null if any placement fails.
function buildPosition(pieces) {
  const chess = new Chess()
  chess.clear() // turn defaults to 'w'
  for (const square of Object.keys(pieces)) {
    const ok = chess.put(pieces[square], square)
    if (!ok) return null
  }
  return chess
}

// True if the side NOT to move is in check (an impossible/illegal position).
function sideNotToMoveInCheck(chess) {
  const scratch = new Chess()
  const turn = chess.turn()
  scratch.load(chess.fen().replace(/ (w|b) /, turn === 'w' ? ' b ' : ' w '))
  return scratch.in_check()
}

// Standard sanity filter applied to every generated position before we even
// look for a solution: valid position, White not already in check, Black
// (not to move) not in check, not already mate/stalemate.
function isCleanSetup(chess) {
  if (chess.in_check()) return false // White already in check at puzzle start
  if (sideNotToMoveInCheck(chess)) return false // impossible position
  if (chess.in_checkmate() || chess.in_stalemate()) return false
  return true
}

function squaresAdjacent(a, b) {
  return Math.abs(fileOf(a) - fileOf(b)) <= 1 && Math.abs(rankOf(a) - rankOf(b)) <= 1
}

// Finds a safe square for the White king: not occupied, not adjacent to the
// black king, and (after placing) White is not left in check.
function findSafeWhiteKing(pieces, blackKingSq) {
  const used = new Set(Object.keys(pieces))
  const candidates = shuffle(allSquares()).filter(
    (s) => !used.has(s) && !squaresAdjacent(s, blackKingSq)
  )
  for (const sq2 of candidates) {
    const testPieces = Object.assign({}, pieces, { [sq2]: { type: 'k', color: 'w' } })
    const chess = buildPosition(testPieces)
    if (!chess) continue
    if (chess.in_check()) continue // this king square would be in check
    return sq2
  }
  return null
}

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

function pieceName(type) {
  return PIECE_NAMES[type]
}

// All (fileStep, rankStep) unit directions for rook/bishop/queen lines.
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const KNIGHT_OFFSETS = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
]

// Returns the ordered list of empty-required squares strictly between a and
// b if they are collinear (rank, file, or diagonal); otherwise null.
function squaresBetween(a, b) {
  const df = fileOf(b) - fileOf(a)
  const dr = rankOf(b) - rankOf(a)
  if (df === 0 && dr === 0) return null
  const stepF = df === 0 ? 0 : df / Math.abs(df)
  const stepR = dr === 0 ? 0 : dr / Math.abs(dr)
  if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return null
  const steps = Math.max(Math.abs(df), Math.abs(dr))
  const out = []
  for (let i = 1; i < steps; i++) {
    out.push(sq(fileOf(a) + stepF * i, rankOf(a) + stepR * i))
  }
  return out
}

// Shared with js/app.js's checkGoal (kept independent since this one runs
// under Node against the Node-required chess.js, not the browser global).
function checkGoal(chess, lastMoveResult, goal) {
  if (goal === 'mate') return chess.in_checkmate()
  if (goal === 'capture') return !!(lastMoveResult && lastMoveResult.captured)
  if (goal === 'check') return chess.in_check()
  if (goal === 'promote') return !!(lastMoveResult && lastMoveResult.promotion === 'q')
  if (goal === 'castle')
    return !!(
      lastMoveResult &&
      (lastMoveResult.flags.indexOf('k') !== -1 || lastMoveResult.flags.indexOf('q') !== -1)
    )
  if (goal === 'develop')
    return !!(
      lastMoveResult &&
      (lastMoveResult.piece === 'n' || lastMoveResult.piece === 'b') &&
      rankOf(lastMoveResult.from) === 0
    )
  if (goal === 'center')
    return !!(
      lastMoveResult &&
      lastMoveResult.piece === 'p' &&
      (lastMoveResult.to === 'd4' || lastMoveResult.to === 'e4')
    )
  if (goal === 'fork') {
    const scratch = new Chess()
    scratch.load(chess.fen().replace(/ (w|b) /, ' w '))
    const attacks = scratch.moves({ square: lastMoveResult.to, verbose: true })
    // Exclude the king from "captures" — chess.js's move list for this
    // turn-flipped scratch board happily lists a pseudo-"capture" of the
    // enemy king (since real play would never let you reach that square,
    // the game ends at checkmate first), which would otherwise get
    // double-counted alongside `givesCheck` for the exact same king.
    const captures = attacks.filter((m) => m.captured && m.captured !== 'k').length
    const givesCheck = chess.in_check()
    return captures + (givesCheck ? 1 : 0) >= 2
  }
  return false
}

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// Static-exchange evaluation on a single square: simulates optimal
// alternating captures on `square` (the side to move always picks the
// continuation that's best for them) and returns the net material swing
// in favor of the side TO MOVE at the point this is called. Mutates and
// restores `chess` via move/undo.
function exchangeNetGain(chess, square) {
  const captures = chess.moves({ verbose: true }).filter((m) => m.to === square && m.captured)
  if (captures.length === 0) return 0
  let best = -Infinity
  for (const m of captures) {
    const capturedValue = PIECE_VALUES[m.captured]
    chess.move(m.san)
    const opponentBest = exchangeNetGain(chess, square)
    chess.undo()
    const netForMover = capturedValue - opponentBest
    if (netForMover > best) best = netForMover
  }
  return best
}

// True if, after `lastMoveResult` (White's move), Black cannot claw back
// at least as much material via a sequence of captures on the square
// White just moved to. This is what the mechanical goal check (legal +
// captured something) can't see: a "free" piece next to the enemy king,
// or a pinned defender that recaptures the pinner along the pin line.
function isExchangeSafe(chess, lastMoveResult) {
  const square = lastMoveResult.to
  const initialGain = lastMoveResult.captured ? PIECE_VALUES[lastMoveResult.captured] : 0
  const blackNet = exchangeNetGain(chess, square) // chess is positioned with Black to move
  return initialGain - blackNet > 0
}

// For fork-style puzzles: the forking move usually isn't a capture itself
// (initialGain=0) — the win comes from grabbing the OTHER attacked piece
// next move instead, which isn't modeled by exchangeNetGain at all. So:
//   - if NOTHING can capture the forking piece, it's safe outright (this
//     is the common, ideal case — e.g. most knight forks).
//   - if Black COULD capture it, that trade must favor White (same bar as
//     isExchangeSafe) — otherwise Black just trades it off evenly and the
//     fork never actually wins the extra material it claims to.
function forkPieceIsSafe(chess, lastMoveResult) {
  const square = lastMoveResult.to
  const captureIsAvailable = chess
    .moves({ verbose: true })
    .some((m) => m.to === square && m.captured)
  if (!captureIsAvailable) return true
  return isExchangeSafe(chess, lastMoveResult)
}

// ---------------------------------------------------------------------
// Difficulty scoring, for ordering each stage's puzzles easy -> hard
// ("zero to hero"). This is a deliberately lightweight heuristic, not a
// machine-learning model — real puzzle-difficulty-rating systems (see
// e.g. the FedCSIS puzzle-difficulty challenges) fine-tune neural nets
// like Maia-2 against millions of human solve-attempts, ensembled with
// Stockfish/Leela engine features, which needs GPU training and isn't
// feasible for a static client-side app. But that research consistently
// finds a few CHEAP, HAND-CRAFTED features carry most of the signal:
// solution length, the number of choices at the critical position, and
// overall position complexity (piece count). We use exactly those three,
// computed directly off the FEN + solution with no engine search needed.
// ---------------------------------------------------------------------
function difficultyScore(fen, solution) {
  const chess = new Chess()
  chess.load(fen)
  const branchingFactor = chess.moves().length
  let pieceCount = 0
  const board = chess.board()
  for (const row of board) {
    for (const cell of row) {
      if (cell) pieceCount++
    }
  }
  const plies = solution.length
  // Weighted so solution length dominates (it's the single strongest
  // signal in the literature), with branching factor and position
  // complexity as secondary tie-breakers.
  return plies * 100 + branchingFactor * 2 + pieceCount
}

module.exports = {
  Chess,
  FILES,
  sq,
  fileOf,
  rankOf,
  randInt,
  choice,
  shuffle,
  allSquares,
  buildPosition,
  sideNotToMoveInCheck,
  isCleanSetup,
  squaresAdjacent,
  findSafeWhiteKing,
  pieceName,
  checkGoal,
  isExchangeSafe,
  forkPieceIsSafe,
  exchangeNetGain,
  difficultyScore,
  PIECE_VALUES,
  ROOK_DIRS,
  BISHOP_DIRS,
  KNIGHT_OFFSETS,
  squaresBetween,
}
