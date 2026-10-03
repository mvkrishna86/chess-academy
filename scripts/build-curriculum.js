#!/usr/bin/env node
/*
 * Assembles the final js/curriculum.js: keeps every hand-written puzzle
 * (which have the most carefully-written hint/explanation text) as the
 * first puzzles in their stage, then tops each stage up to its target
 * count with engine-generated, engine-verified puzzles. Also builds four
 * brand-new stages from scratch. Run with: node scripts/build-curriculum.js
 */
const fs = require('fs')
const path = require('path')
const { Chess, checkGoal, isExchangeSafe, forkPieceIsSafe } = require('./gen-lib')
const { genLineCapture, genForkLike, genDiscoveredCheck, genRemovingDefender } = require('./generators')
const { genBoxMate, genQueenKingMate, genSmotheredMate, genForcedMate } = require('./generators-mates')
const {
  genPromotionIn1,
  genForcedPromotion,
  genCastling,
  genDevelopPiece,
  genCenterPawn,
  genForcedCapture,
} = require('./generators-special')

// The 12 original stages (seed puzzles + lesson text), loaded from the
// current curriculum.js before this script overwrites it.
//
// This script must be idempotent: running it twice in a row (e.g. after
// fixing a generator bug) must NOT compound on the previous run's output.
// So we slice every stage back down to its known hand-written seed count
// before appending freshly generated puzzles — otherwise a second run
// would treat the previous run's generated puzzles as "seeds" too and the
// stages would balloon (this actually happened once; don't remove this).
const SEED_COUNTS = {
  'mate-in-1': 5,
  pins: 5,
  forks: 5,
  skewers: 5,
  'discovered-attacks': 5,
  'removing-the-defender': 5,
  'double-attack': 5,
  'back-rank-mate': 5,
  'smothered-mate-patterns': 3,
  'mate-in-2': 4,
  'mate-in-3': 2,
  'mixed-review': 7,
}

const CURRICULUM_PATH = path.join(__dirname, '..', 'js', 'curriculum.js')
const { STAGES: LOADED_STAGES } = require(CURRICULUM_PATH)
const SEED_STAGES = LOADED_STAGES.filter((s) => s.id in SEED_COUNTS).map((s) =>
  Object.assign({}, s, { puzzles: s.puzzles.slice(0, SEED_COUNTS[s.id]) })
)

const globalSeen = new Set()
for (const stage of SEED_STAGES) {
  for (const puzzle of stage.puzzles) {
    const c = new Chess()
    c.load(puzzle.fen)
    globalSeen.add(c.fen())
  }
}

function dedupeAgainstGlobal(list) {
  const out = []
  for (const p of list) {
    if (globalSeen.has(p.fen)) continue
    globalSeen.add(p.fen)
    out.push(p)
  }
  return out
}

function renumber(puzzles) {
  return puzzles.map((p, i) => Object.assign({ id: i + 1 }, p))
}

function findSeed(id) {
  const stage = SEED_STAGES.find((s) => s.id === id)
  if (!stage) throw new Error('missing seed stage ' + id)
  return stage
}

console.log('Generating pins...')
const pins = findSeed('pins')
pins.puzzles = renumber(pins.puzzles.concat(dedupeAgainstGlobal(genLineCapture(20, { requireCheck: false }))))

console.log('Generating skewers...')
const skewers = findSeed('skewers')
skewers.puzzles = renumber(
  skewers.puzzles.concat(dedupeAgainstGlobal(genLineCapture(20, { requireCheck: true })))
)

console.log('Generating forks...')
const forks = findSeed('forks')
forks.puzzles = renumber(forks.puzzles.concat(dedupeAgainstGlobal(genForkLike(20, ['n']))))

console.log('Generating double-attack...')
const doubleAttack = findSeed('double-attack')
doubleAttack.puzzles = renumber(
  doubleAttack.puzzles.concat(dedupeAgainstGlobal(genForkLike(20, ['q', 'r', 'b'])))
)

console.log('Generating discovered-attacks...')
const discovered = findSeed('discovered-attacks')
discovered.puzzles = renumber(discovered.puzzles.concat(dedupeAgainstGlobal(genDiscoveredCheck(20))))

console.log('Generating removing-the-defender...')
const removingDefender = findSeed('removing-the-defender')
removingDefender.puzzles = renumber(
  removingDefender.puzzles.concat(dedupeAgainstGlobal(genRemovingDefender(20)))
)

console.log('Generating mate-in-1...')
const mateIn1 = findSeed('mate-in-1')
mateIn1.puzzles = renumber(
  mateIn1.puzzles.concat(
    dedupeAgainstGlobal(genBoxMate(13, { ranks: [0, 1, 2, 3, 4, 5, 6, 7] })),
    dedupeAgainstGlobal(genQueenKingMate(12))
  )
)

console.log('Generating back-rank-mate...')
const backRank = findSeed('back-rank-mate')
backRank.puzzles = renumber(backRank.puzzles.concat(dedupeAgainstGlobal(genBoxMate(20, { ranks: [0, 7] }))))

console.log('Generating smothered-mate-patterns...')
const smothered = findSeed('smothered-mate-patterns')
smothered.puzzles = renumber(smothered.puzzles.concat(dedupeAgainstGlobal(genSmotheredMate(22))))

console.log('Generating mate-in-2 (slow-ish)...')
const mateIn2 = findSeed('mate-in-2')
mateIn2.puzzles = renumber(mateIn2.puzzles.concat(dedupeAgainstGlobal(genForcedMate(21, 2))))

console.log('Generating mate-in-3 (slow)...')
const mateIn3 = findSeed('mate-in-3')
mateIn3.puzzles = renumber(mateIn3.puzzles.concat(dedupeAgainstGlobal(genForcedMate(18, 3))))

console.log('Generating Opening Principles (new stage)...')
const openingPrinciples = {
  id: 'opening-principles',
  title: 'Opening Principles',
  emoji: '🚀',
  goal: 'check',
  lesson:
    "The opening (the first few moves of a game) goes well if you follow 3 simple rules: get your king safe by castling, bring your knights and bishops out into the game, and fight for the center squares (d4/d5/e4/e5) where pieces have the most power. Follow these and you'll start every game strong!",
  puzzles: renumber(
    dedupeAgainstGlobal(genCastling(10)).concat(
      dedupeAgainstGlobal(genDevelopPiece(10)),
      dedupeAgainstGlobal(genCenterPawn(10))
    )
  ),
}

console.log('Generating King & Pawn Endgames (new stage)...')
const kingPawnEndgames = {
  id: 'king-pawn-endgames',
  title: 'King & Pawn Endgames',
  emoji: '👑',
  goal: 'promote',
  lesson:
    "In the endgame, even a single pawn can win the whole game — if you can walk it safely to the last row and turn it into a queen! Watch for when the path is clear, and remember your king can help clear the way or block the enemy king from catching up.",
  puzzles: renumber(
    dedupeAgainstGlobal(genPromotionIn1(16)).concat(dedupeAgainstGlobal(genForcedPromotion(9, 2)))
  ),
}

console.log('Generating Deflection & Decoys (new stage)...')
const deflection = {
  id: 'deflection-decoys',
  title: 'Deflection & Decoys',
  emoji: '🎭',
  goal: 'capture',
  lesson:
    "Sometimes you can't win material right away — a piece is in the way, or nothing is hanging yet. A deflection or decoy FORCES an enemy piece (often the king, with a check) to move somewhere worse first. Once it's forced to move, your real plan works a move later!",
  puzzles: renumber(
    dedupeAgainstGlobal(
      genForcedCapture(25, {
        hint: "Don't grab material right away — force Black's hand first, THEN collect.",
        explanation:
          "Your first move forces Black into a specific reply, and that's exactly what opens the door to winning material with your second move.",
      })
    )
  ),
}

console.log('Generating Zwischenzug (new stage)...')
const zwischenzug = {
  id: 'zwischenzug',
  title: 'Zwischenzug (In-Between Moves)',
  emoji: '⏱️',
  goal: 'capture',
  lesson:
    "Zwischenzug is a German word for \"in-between move.\" Instead of immediately doing the expected thing (like recapturing), you sneak in a surprising check or threat FIRST. Your opponent has to deal with that threat before anything else — and by the time they do, you've won even more.",
  puzzles: renumber(
    dedupeAgainstGlobal(
      genForcedCapture(25, {
        hint: 'Before you do the obvious thing, look for a surprising in-between move — a check your opponent must answer first.',
        explanation:
          "Instead of playing the expected move right away, this in-between move forces Black to react — and only then do you cash in.",
      })
    )
  ),
}

// ---- Mixed review: sample across every other stage for a final test ----
const allStagesSoFar = [
  mateIn1,
  openingPrinciples,
  pins,
  forks,
  skewers,
  discovered,
  removingDefender,
  doubleAttack,
  deflection,
  zwischenzug,
  backRank,
  smothered,
  mateIn2,
  mateIn3,
  kingPawnEndgames,
]

console.log('Assembling Mixed Review...')
const mixedReview = findSeed('mixed-review')
const sampled = []
for (const stage of allStagesSoFar) {
  // Grab 2 puzzles we haven't already used as mixed-review seeds, favoring
  // ones further into the generated list (skip the first few hand-seeds
  // already shown elsewhere, where possible) for variety.
  const picks = stage.puzzles.slice(-2)
  for (const p of picks) {
    sampled.push({
      fen: p.fen,
      goal: p.goal || stage.goal,
      solution: p.solution,
      hint: p.hint,
      explanation: p.explanation,
    })
  }
}
mixedReview.puzzles = renumber(mixedReview.puzzles.concat(sampled))

const FINAL_STAGES = [
  mateIn1,
  openingPrinciples,
  pins,
  forks,
  skewers,
  discovered,
  removingDefender,
  doubleAttack,
  deflection,
  zwischenzug,
  backRank,
  smothered,
  mateIn2,
  mateIn3,
  kingPawnEndgames,
  mixedReview,
]

for (const stage of FINAL_STAGES) {
  console.log(`${stage.id}: ${stage.puzzles.length} puzzles`)
}

// ---- Serialize ----
function serializeStage(stage) {
  const puzzlesStr = stage.puzzles
    .map((p) => {
      const parts = [`id: ${p.id}`, `fen: ${JSON.stringify(p.fen)}`]
      if (p.goal) parts.push(`goal: ${JSON.stringify(p.goal)}`)
      parts.push(`solution: ${JSON.stringify(p.solution)}`)
      parts.push(`hint: ${JSON.stringify(p.hint)}`)
      parts.push(`explanation: ${JSON.stringify(p.explanation)}`)
      return `        {\n          ${parts.join(',\n          ')},\n        }`
    })
    .join(',\n')
  return `    {
      id: ${JSON.stringify(stage.id)},
      title: ${JSON.stringify(stage.title)},
      emoji: ${JSON.stringify(stage.emoji)},
      goal: ${JSON.stringify(stage.goal)},
      lesson: ${JSON.stringify(stage.lesson)},
      puzzles: [
${puzzlesStr}
      ],
    }`
}

const header = `/*
 * The chess curriculum: stages (topics) made of puzzles.
 *
 * Every puzzle has White to move (the learner always plays White).
 * \`solution\` is an array of SAN moves, alternating White/Black, ending
 * on a White move.
 *
 * \`goal\` tells the validator (and the app's success check) what counts
 * as "solved" for the final move in \`solution\`:
 *   'mate'    - the final position must be checkmate
 *   'capture' - the final move must capture a piece
 *   'check'   - the final move must give check
 *   'fork'    - the final move must attack 2+ enemy targets at once
 *   'promote' - the final move must promote a pawn to a queen
 *   'castle'  - the final move must be castling (O-O or O-O-O)
 *   'develop' - the final move must move a knight/bishop off the back rank
 *   'center'  - the final move must push a pawn to d4 or e4
 * A puzzle can override its stage's goal with its own \`goal\` field.
 *
 * Every single puzzle here is checked against the real chess rules engine
 * by scripts/validate-curriculum.js (legality + goal achieved) AND
 * scripts/audit-safety.js (a full static-exchange evaluation confirming
 * Black can't just win back the material — this caught a real bug where a
 * "pinned" piece could still recapture the pinning piece along the same
 * line). Most puzzles are generated by scripts/generators*.js rather than
 * hand-written, specifically so every one of them is engine-checked.
 */
;(function () {
  const STAGES = [
`

const footer = `
  ]

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STAGES }
  }
  if (typeof window !== 'undefined') {
    window.STAGES = STAGES
  }
})()
`

const body = FINAL_STAGES.map(serializeStage).join(',\n')
fs.writeFileSync(CURRICULUM_PATH, header + body + footer)
console.log('\nWrote', CURRICULUM_PATH)
