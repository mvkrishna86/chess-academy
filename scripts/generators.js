#!/usr/bin/env node
/* Category generators. Each returns an array of validated puzzle objects:
 * { fen, solution, goal?, hint, explanation }. Authoring tool only. */
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
  isExchangeSafe,
  forkPieceIsSafe,
  exchangeNetGain,
  ROOK_DIRS,
  BISHOP_DIRS,
  KNIGHT_OFFSETS,
  squaresBetween,
} = require('./gen-lib')
const { findForcedLine } = require('./forced-search')

const ARTICLE = { ace: 'an', other: 'a' }
function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

// =====================================================================
// Pins & Skewers: attacker — victim — king, all collinear, attacker
// captures the victim directly (it can't move away without exposing its
// own king, so it's simply undefended in practice).
// =====================================================================
function genLineCapture(targetCount, opts) {
  opts = opts || {}
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 30000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const orientation = choice(['file', 'rank', 'diagonal'])
    const dir =
      orientation === 'file'
        ? [0, 1]
        : orientation === 'rank'
        ? [1, 0]
        : choice(BISHOP_DIRS)
    const attackerType = orientation === 'diagonal' ? choice(['b', 'q']) : choice(['r', 'q'])

    // pick a random anchor and lay out 3+ collinear squares along `dir`
    const anchorF = randInt(8)
    const anchorR = randInt(8)
    const victimDist = 1 + randInt(3) // 1..3 squares from attacker
    const kingDist = victimDist + 1 + randInt(3) // further out

    const attackerSq = sq(anchorF, anchorR)
    const victimSq = sq(anchorF + dir[0] * victimDist, anchorR + dir[1] * victimDist)
    const kingSq = sq(anchorF + dir[0] * kingDist, anchorR + dir[1] * kingDist)
    if (!attackerSq || !victimSq || !kingSq) continue

    const betweenAV = squaresBetween(attackerSq, victimSq)
    const betweenVK = squaresBetween(victimSq, kingSq)
    if (betweenAV === null || betweenVK === null) continue // not collinear (shouldn't happen)

    const victimType = choice(['n', 'b', 'r', 'q'])
    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    pieces[victimSq] = { type: victimType, color: 'b' }
    pieces[attackerSq] = { type: attackerType, color: 'w' }

    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue

    const fen = chess.fen()
    if (seen.has(fen)) continue

    const goal = opts.requireCheck ? 'check' : 'capture'
    const line = findForcedLine(chess, 1, (c, r) => {
      if (!checkGoal(c, r, 'capture')) return false
      if (opts.requireCheck && !c.in_check()) return false
      return r.to === victimSq // make sure it's specifically capturing our victim
    })
    if (!line) continue
    const verify1 = new Chess()
    verify1.load(fen)
    const moveResult1 = verify1.move(line[0], { sloppy: true })
    if (!isExchangeSafe(verify1, moveResult1)) continue
    seen.add(fen)

    const victimName = pieceName(victimType)
    const lineWord = orientation === 'diagonal' ? 'diagonal' : orientation === 'file' ? 'file' : 'rank'
    const hint = opts.requireCheck
      ? `Your piece, the ${victimName}, and the black king are all lined up on the same ${lineWord}. Capture the ${victimName} — it's check too!`
      : `The ${victimName} on ${victimSq} is standing between your piece and the black king on the same ${lineWord}. It can't move away — capture it for free!`
    const explanation = opts.requireCheck
      ? `The ${victimName} on ${victimSq} had no real defense: it was lined up right in front of its own king. Capturing it wins the piece AND gives check.`
      : `The ${victimName} on ${victimSq} is pinned to its king along the ${lineWord} — moving it would expose the king to check, so it just sits there. Your piece captures it for free.`

    results.push({ fen, solution: line, goal, hint, explanation })
  }
  return results
}

// =====================================================================
// Forks / Double Attack: a single move that attacks 2+ enemy targets at
// once (checkGoal('fork') already captures this generically — it works
// for knights (forks) and for queens/rooks/bishops (double attacks)).
// =====================================================================
function genForkLike(targetCount, attackerTypes) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 60000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const blackKingSq = choice(allSquares())
    let victimSq = choice(allSquares())
    if (victimSq === blackKingSq) continue
    const victimType = choice(['q', 'r', 'b', 'n'])

    const attackerType = choice(attackerTypes)
    const attackerSq = choice(allSquares())
    if (attackerSq === blackKingSq || attackerSq === victimSq) continue

    const pieces = {}
    pieces[blackKingSq] = { type: 'k', color: 'b' }
    pieces[victimSq] = { type: victimType, color: 'b' }
    pieces[attackerSq] = { type: attackerType, color: 'w' }
    const whiteKingSq = findSafeWhiteKing(pieces, blackKingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'fork'))
    if (!line) continue
    const verify2 = new Chess()
    verify2.load(fen)
    const moveResult2 = verify2.move(line[0], { sloppy: true })
    if (!forkPieceIsSafe(verify2, moveResult2)) continue
    seen.add(fen)

    const isKnight = attackerType === 'n'
    const victimName = pieceName(victimType)
    const hint = isKnight
      ? `Jump your knight so it attacks the king AND the ${victimName} at the same time.`
      : `Find the square where your piece attacks the king AND the ${victimName} at the same time.`
    const explanation = isKnight
      ? `This knight move forks the king (check!) and the ${victimName} at the same time — Black can only save one of them.`
      : `This move attacks the king (check!) and the ${victimName} at the same time, from the same line — a double attack. Black can only deal with one threat.`

    results.push({ fen, solution: line, hint, explanation, goal: 'fork' })
  }
  return results
}

// =====================================================================
// Discovered Check: hiddenAttacker — blocker — king collinear; blocker
// moves to any legal square OFF that line, unmasking the check.
// =====================================================================
function genDiscoveredCheck(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 30000
  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const orientation = choice(['file', 'rank', 'diagonal'])
    const dir =
      orientation === 'file' ? [0, 1] : orientation === 'rank' ? [1, 0] : choice(BISHOP_DIRS)
    const hiddenType = orientation === 'diagonal' ? choice(['b', 'q']) : choice(['r', 'q'])
    const blockerType = choice(['n', 'b'])

    const anchorF = randInt(8)
    const anchorR = randInt(8)
    const blockerDist = 1 + randInt(2)
    const kingDist = blockerDist + 1 + randInt(2)
    const hiddenSq = sq(anchorF, anchorR)
    const blockerSq = sq(anchorF + dir[0] * blockerDist, anchorR + dir[1] * blockerDist)
    const kingSq = sq(anchorF + dir[0] * kingDist, anchorR + dir[1] * kingDist)
    if (!hiddenSq || !blockerSq || !kingSq) continue
    const between1 = squaresBetween(hiddenSq, blockerSq)
    const between2 = squaresBetween(blockerSq, kingSq)
    if (between1 === null || between2 === null) continue

    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    pieces[blockerSq] = { type: blockerType, color: 'w' }
    pieces[hiddenSq] = { type: hiddenType, color: 'w' }
    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue
    const fen = chess.fen()
    if (seen.has(fen)) continue

    // The pin-line squares (everything from hiddenSq to kingSq) — a legal
    // blocker move landing back on one of these wouldn't uncover anything.
    const lineSquares = new Set([hiddenSq, blockerSq, kingSq, ...between1, ...between2])
    const line = findForcedLine(chess, 1, (c, r) => {
      if (r.from !== blockerSq) return false
      if (lineSquares.has(r.to)) return false
      if (!c.in_check()) return false
      // The blocker must not simply hang on its new square (e.g. landing
      // next to the enemy king, who then just captures it and steps out
      // of check at the same time).
      return exchangeNetGain(c, r.to) <= 0
    })
    if (!line) continue
    seen.add(fen)

    const blockerName = pieceName(blockerType)
    const hint = `Your ${blockerName} is blocking your own piece. Hop it out of the way with a useful move.`
    const explanation = `Your ${blockerName} was standing in the way. Moving it off the line uncovers a check from the piece that was hiding behind it — a discovered check!`

    results.push({ fen, solution: line, hint, explanation })
  }
  return results
}

// =====================================================================
// Removing the Defender: attacker1 — defender — king collinear (a pin),
// so the defender LOOKS like it guards a square (via its own normal move
// pattern) but can't actually get there. A prize piece sits on that
// square; attacker2 captures it.
// =====================================================================
function genRemovingDefender(targetCount) {
  const results = []
  const seen = new Set()
  let attempts = 0
  const maxAttempts = 40000

  function otherLineSquares(defenderType, defenderSq, pinOrientation) {
    // Returns candidate "defended" squares (excluding the pin line itself).
    const f = fileOf(defenderSq)
    const r = rankOf(defenderSq)
    const out = []
    if (defenderType === 'n') {
      for (const [df, dr] of KNIGHT_OFFSETS) {
        const s = sq(f + df, r + dr)
        if (s) out.push(s)
      }
    } else if (defenderType === 'b') {
      if (pinOrientation !== 'diagonal') return []
      for (const dir of BISHOP_DIRS) {
        for (let d = 1; d < 8; d++) {
          const s = sq(f + dir[0] * d, r + dir[1] * d)
          if (s) out.push(s)
        }
      }
    } else if (defenderType === 'r') {
      if (pinOrientation === 'diagonal') return []
      const dirs = pinOrientation === 'file' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]]
      for (const dir of dirs) {
        for (let d = 1; d < 8; d++) {
          const s = sq(f + dir[0] * d, r + dir[1] * d)
          if (s) out.push(s)
        }
      }
    } else if (defenderType === 'q') {
      const allDirs = [...ROOK_DIRS, ...BISHOP_DIRS]
      const pinDir =
        pinOrientation === 'file' ? [0, 1] : pinOrientation === 'rank' ? [1, 0] : null
      for (const dir of allDirs) {
        if (pinDir && dir[0] === pinDir[0] && dir[1] === pinDir[1]) continue
        if (pinDir && dir[0] === -pinDir[0] && dir[1] === -pinDir[1]) continue
        for (let d = 1; d < 8; d++) {
          const s = sq(f + dir[0] * d, r + dir[1] * d)
          if (s) out.push(s)
        }
      }
    }
    return out
  }

  while (results.length < targetCount && attempts < maxAttempts) {
    attempts++
    const pinOrientation = choice(['file', 'rank', 'diagonal'])
    const pinDir =
      pinOrientation === 'file' ? [0, 1] : pinOrientation === 'rank' ? [1, 0] : choice(BISHOP_DIRS)
    const attacker1Type = pinOrientation === 'diagonal' ? 'b' : 'r'
    const defenderType = choice(['n', 'b', 'r', 'q'])
    if (defenderType === 'b' && pinOrientation !== 'diagonal') continue
    if (defenderType === 'r' && pinOrientation === 'diagonal') continue

    const anchorF = randInt(8)
    const anchorR = randInt(8)
    const defDist = 1 + randInt(2)
    const kingDist = defDist + 1 + randInt(2)
    const attacker1Sq = sq(anchorF, anchorR)
    const defenderSq = sq(anchorF + pinDir[0] * defDist, anchorR + pinDir[1] * defDist)
    const kingSq = sq(anchorF + pinDir[0] * kingDist, anchorR + pinDir[1] * kingDist)
    if (!attacker1Sq || !defenderSq || !kingSq) continue
    const between1 = squaresBetween(attacker1Sq, defenderSq)
    const between2 = squaresBetween(defenderSq, kingSq)
    if (between1 === null || between2 === null) continue
    const pinLineSquares = new Set([attacker1Sq, defenderSq, kingSq, ...between1, ...between2])

    const candidates = shuffle(
      otherLineSquares(defenderType, defenderSq, pinOrientation).filter((s) => !pinLineSquares.has(s))
    )
    if (candidates.length === 0) continue
    const prizeSq = choice(candidates)

    // attacker2: a queen placed on some line through prizeSq, clear path,
    // not colliding with anything already placed.
    const usedSoFar = new Set([attacker1Sq, defenderSq, kingSq, prizeSq, ...pinLineSquares])
    const attacker2Dirs = shuffle([...ROOK_DIRS, ...BISHOP_DIRS])
    let attacker2Sq = null
    for (const dir of attacker2Dirs) {
      const pf = fileOf(prizeSq)
      const pr = rankOf(prizeSq)
      for (let d = 1; d < 8; d++) {
        const s = sq(pf + dir[0] * d, pr + dir[1] * d)
        if (!s) break
        if (usedSoFar.has(s)) break
        if (d >= 1 && Math.random() < 0.5) {
          attacker2Sq = s
          break
        }
      }
      if (attacker2Sq) break
    }
    if (!attacker2Sq) continue

    const prizeType = choice(['n', 'b', 'r', 'q'])
    const pieces = {}
    pieces[kingSq] = { type: 'k', color: 'b' }
    pieces[defenderSq] = { type: defenderType, color: 'b' }
    pieces[prizeSq] = { type: prizeType, color: 'b' }
    pieces[attacker1Sq] = { type: attacker1Type, color: 'w' }
    pieces[attacker2Sq] = { type: 'q', color: 'w' }

    const whiteKingSq = findSafeWhiteKing(pieces, kingSq)
    if (!whiteKingSq) continue
    pieces[whiteKingSq] = { type: 'k', color: 'w' }

    const chess = buildPosition(pieces)
    if (!chess) continue
    if (!isCleanSetup(chess)) continue

    // Confirm the "defender" genuinely cannot recapture on prizeSq (the pin
    // really does stop it) — the whole point of the lesson.
    const defenderMoves = chess.moves({ square: defenderSq, verbose: true })
    if (defenderMoves.some((m) => m.to === prizeSq)) continue

    const fen = chess.fen()
    if (seen.has(fen)) continue

    const line = findForcedLine(chess, 1, (c, r) => checkGoal(c, r, 'capture') && r.to === prizeSq)
    if (!line) continue
    const verify3 = new Chess()
    verify3.load(fen)
    const moveResult3 = verify3.move(line[0], { sloppy: true })
    if (!isExchangeSafe(verify3, moveResult3)) continue
    seen.add(fen)

    const defenderName = pieceName(defenderType)
    const prizeName = pieceName(prizeType)
    const hint = `The ${prizeName} on ${prizeSq} looks defended by the ${defenderName} on ${defenderSq} — but check whether that ${defenderName} can actually move there.`
    const explanation = `The ${defenderName} on ${defenderSq} is pinned to its king and can't leave that line to recapture, even though it looks like it defends ${prizeSq}. The ${prizeName} is yours for free.`

    results.push({ fen, solution: line, hint, explanation })
  }
  return results
}

module.exports = {
  genLineCapture,
  genForkLike,
  genDiscoveredCheck,
  genRemovingDefender,
}
