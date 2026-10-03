;(function () {
  const PROGRESS_KEY = 'chessAcademyProgress'

  const state = {
    stageIndex: 0,
    puzzleIndex: 0,
    chess: null,
    board: null,
    plyIndex: 0, // index into puzzle.solution for the NEXT expected move
    wrongAttempts: 0,
    solvedThisPuzzle: false,
  }

  // ---------- progress persistence ----------
  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}
    } catch (e) {
      return {}
    }
  }
  function saveProgress(progress) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  }
  function markSolved(stageId, puzzleId) {
    const progress = loadProgress()
    if (!progress[stageId]) progress[stageId] = {}
    progress[stageId][puzzleId] = true
    saveProgress(progress)
  }
  function isSolved(stageId, puzzleId) {
    const progress = loadProgress()
    return !!(progress[stageId] && progress[stageId][puzzleId])
  }
  function stageSolvedCount(stage) {
    const progress = loadProgress()
    const done = progress[stage.id] || {}
    return stage.puzzles.filter((p) => done[p.id]).length
  }

  // ---------- exchange safety (mirrors scripts/gen-lib.js) ----------
  // A move "achieving the goal" (e.g. capturing something) isn't enough on
  // its own — if the opponent can immediately win back as much or more
  // material, the move wasn't actually sound. This is what let a real bug
  // through earlier (a "pinned" piece that could still recapture the
  // pinning piece), so the live app checks it too, not just the puzzle
  // authoring scripts.
  var PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
  function exchangeNetGain(chessPos, square) {
    var captures = chessPos.moves({ verbose: true }).filter(function (m) {
      return m.to === square && m.captured
    })
    if (captures.length === 0) return 0
    var best = -Infinity
    for (var i = 0; i < captures.length; i++) {
      var m = captures[i]
      var capturedValue = PIECE_VALUES[m.captured]
      chessPos.move(m.san)
      var opponentBest = exchangeNetGain(chessPos, square)
      chessPos.undo()
      var netForMover = capturedValue - opponentBest
      if (netForMover > best) best = netForMover
    }
    return best
  }
  function isExchangeSafe(chessPos, lastMoveResult) {
    var square = lastMoveResult.to
    var initialGain = lastMoveResult.captured ? PIECE_VALUES[lastMoveResult.captured] : 0
    var blackNet = exchangeNetGain(chessPos, square)
    return initialGain - blackNet > 0
  }

  // ---------- goal checking (mirrors scripts/validate-curriculum.js) ----------
  function checkGoal(chess, lastMoveResult, goal) {
    if (goal === 'mate') return chess.in_checkmate()
    if (goal === 'capture')
      return !!(lastMoveResult && lastMoveResult.captured) && isExchangeSafe(chess, lastMoveResult)
    if (goal === 'check') return chess.in_check()
    if (goal === 'fork') {
      const scratch = new Chess()
      scratch.load(chess.fen().replace(/ (w|b) /, ' w '))
      const attacks = scratch.moves({ square: lastMoveResult.to, verbose: true })
      // Exclude the king — chess.js's scratch-board move list includes a
      // pseudo-"capture" of it, which would double-count the same king
      // alongside givesCheck below.
      const captures = attacks.filter((m) => m.captured && m.captured !== 'k').length
      const givesCheck = chess.in_check()
      if (captures + (givesCheck ? 1 : 0) < 2) return false
      return isExchangeSafe(chess, lastMoveResult)
    }
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
        lastMoveResult.from[1] === '1'
      )
    if (goal === 'center')
      return !!(
        lastMoveResult &&
        lastMoveResult.piece === 'p' &&
        (lastMoveResult.to === 'd4' || lastMoveResult.to === 'e4')
      )
    return false
  }

  function stripCheckSymbols(san) {
    return san.replace(/[+#]/g, '')
  }

  // ---------- dynamic forced-line verification (mirrors scripts/forced-search.js) ----------
  // Many "mate in 2/3" (and deflection/zwischenzug) puzzles have more than
  // one correct move at a given step — we only recorded ONE solution path
  // when authoring them. Rather than reject anything that doesn't match
  // that exact path, verify live: does THIS move (whatever it is) still
  // force the goal within the remaining move budget, no matter how Black
  // replies? If so it's correct, full stop — not just "correct because it
  // matches our notes."
  function findForcedLine(chess, whiteMovesLeft, goalFn) {
    const whiteMoves = chess.moves({ verbose: true })
    for (let i = 0; i < whiteMoves.length; i++) {
      const wm = whiteMoves[i]
      const result = chess.move(wm.san)
      if (whiteMovesLeft === 1) {
        const ok = goalFn(chess, result)
        chess.undo()
        if (ok) return [wm.san]
        continue
      }
      const blackMoves = chess.moves()
      if (blackMoves.length === 0) {
        chess.undo()
        continue
      }
      let allWork = true
      let exampleTail = null
      for (let j = 0; j < blackMoves.length; j++) {
        chess.move(blackMoves[j])
        const sub = findForcedLine(chess, whiteMovesLeft - 1, goalFn)
        chess.undo()
        if (!sub) {
          allWork = false
          break
        }
        if (!exampleTail) exampleTail = [blackMoves[j]].concat(sub)
      }
      chess.undo()
      if (allWork) return [wm.san].concat(exampleTail)
    }
    return null
  }

  // After the player's move, with Black to move: do ALL of Black's legal
  // replies still let White force the goal within `whiteMovesLeft` more
  // moves? Returns a representative Black reply to auto-play if so, or
  // null if the player's move doesn't actually force anything.
  function verifyAllRepliesForced(chess, whiteMovesLeft, goalFn) {
    const blackMoves = chess.moves()
    if (blackMoves.length === 0) return null
    let chosenReply = null
    for (let i = 0; i < blackMoves.length; i++) {
      chess.move(blackMoves[i])
      const sub = findForcedLine(chess, whiteMovesLeft, goalFn)
      chess.undo()
      if (!sub) return null
      if (!chosenReply) chosenReply = blackMoves[i]
    }
    return chosenReply
  }

  // ---------- DOM refs ----------
  const sidebarEl = document.getElementById('sidebar')
  const stageTitleEl = document.getElementById('stageTitle')
  const stageLessonEl = document.getElementById('stageLesson')
  const puzzleCounterEl = document.getElementById('puzzleCounter')
  const boardContainerEl = document.getElementById('boardContainer')
  const messageEl = document.getElementById('message')
  const turnHintEl = document.getElementById('turnHint')
  const hintBtn = document.getElementById('hintBtn')
  const solutionBtn = document.getElementById('solutionBtn')
  const retryBtn = document.getElementById('retryBtn')
  const prevBtn = document.getElementById('prevBtn')
  const nextBtn = document.getElementById('nextBtn')
  const printStageBtn = document.getElementById('printStageBtn')
  const resetProgressBtn = document.getElementById('resetProgressBtn')
  const overallProgressEl = document.getElementById('overallProgress')

  // ---------- sidebar ----------
  function renderSidebar() {
    sidebarEl.innerHTML = ''
    STAGES.forEach((stage, idx) => {
      const btn = document.createElement('button')
      btn.className = 'stage-btn' + (idx === state.stageIndex ? ' active' : '')
      const solved = stageSolvedCount(stage)
      const total = stage.puzzles.length
      btn.innerHTML =
        '<span class="stage-emoji">' + stage.emoji + '</span>' +
        '<span class="stage-name">' + stage.title + '</span>' +
        '<span class="stage-progress">' + solved + '/' + total + (solved === total ? ' ✅' : '') + '</span>'
      btn.addEventListener('click', () => selectStage(idx, firstUnsolvedIndex(stage)))
      sidebarEl.appendChild(btn)
    })
    renderOverallProgress()
  }

  function renderOverallProgress() {
    let solved = 0
    let total = 0
    STAGES.forEach((stage) => {
      total += stage.puzzles.length
      solved += stageSolvedCount(stage)
    })
    overallProgressEl.textContent = '⭐ ' + solved + ' / ' + total + ' puzzles solved'
  }

  function firstUnsolvedIndex(stage) {
    const progress = loadProgress()
    const done = progress[stage.id] || {}
    const idx = stage.puzzles.findIndex((p) => !done[p.id])
    return idx === -1 ? 0 : idx
  }

  // ---------- puzzle loading ----------
  function selectStage(stageIndex, puzzleIndex) {
    state.stageIndex = stageIndex
    state.puzzleIndex = puzzleIndex || 0
    renderSidebar()
    loadPuzzle()
  }

  function currentStage() {
    return STAGES[state.stageIndex]
  }
  function currentPuzzle() {
    return currentStage().puzzles[state.puzzleIndex]
  }

  function loadPuzzle() {
    const stage = currentStage()
    const puzzle = currentPuzzle()

    stageTitleEl.textContent = stage.emoji + ' ' + stage.title
    stageLessonEl.textContent = stage.lesson
    puzzleCounterEl.textContent =
      'Puzzle ' + (state.puzzleIndex + 1) + ' of ' + stage.puzzles.length

    state.chess = new Chess()
    state.chess.load(puzzle.fen)
    state.plyIndex = 0
    state.wrongAttempts = 0
    state.solvedThisPuzzle = isSolved(stage.id, puzzle.id)

    state.board = ChessBoardUI.createInteractiveBoard(boardContainerEl, state.chess, {
      onMoveAttempt: handleMoveAttempt,
    })

    showMessage(
      state.solvedThisPuzzle
        ? "You already solved this one! Try it again, or move on."
        : 'Find the best move for White.',
      'info'
    )
    turnHintEl.textContent = "Your move — you're playing White!"
    nextBtn.disabled = !hasNextPuzzle()
    prevBtn.disabled = !hasPrevPuzzle()
  }

  function hasNextPuzzle() {
    return (
      state.puzzleIndex < currentStage().puzzles.length - 1 ||
      state.stageIndex < STAGES.length - 1
    )
  }
  function hasPrevPuzzle() {
    return state.puzzleIndex > 0 || state.stageIndex > 0
  }

  function goNext() {
    if (state.puzzleIndex < currentStage().puzzles.length - 1) {
      state.puzzleIndex++
    } else if (state.stageIndex < STAGES.length - 1) {
      state.stageIndex++
      state.puzzleIndex = 0
    }
    renderSidebar()
    loadPuzzle()
  }
  function goPrev() {
    if (state.puzzleIndex > 0) {
      state.puzzleIndex--
    } else if (state.stageIndex > 0) {
      state.stageIndex--
      state.puzzleIndex = currentStage().puzzles.length - 1
    }
    renderSidebar()
    loadPuzzle()
  }

  // ---------- move handling ----------
  function handleMoveAttempt(moveObj) {
    if (!moveObj) return
    const puzzle = currentPuzzle()
    const isLastMove = state.plyIndex === puzzle.solution.length - 1

    if (isLastMove) {
      // On the final move, accept ANY legal move that achieves the goal —
      // not just the one line we happened to record. Many mates (back-rank
      // ones especially) have several winning final moves; rejecting a
      // correct-but-different move as "wrong" would be actively wrong
      // feedback, not just unhelpful.
      const goal = puzzle.goal || currentStage().goal
      if (checkGoal(state.chess, moveObj, goal)) {
        onPuzzleSolved()
      } else {
        state.chess.undo()
        state.board.refresh()
        state.wrongAttempts++
        showMessage(
          state.wrongAttempts >= 2
            ? 'Not quite. Hint: ' + puzzle.hint
            : 'Not quite — try again!',
          'error'
        )
      }
      return
    }

    // Not the final move yet. First check the fast path: does it match
    // the line we recorded? If not, don't immediately reject it — verify
    // live whether it ALSO forces the goal within the remaining moves
    // (there's often more than one correct move at this step).
    const expectedSan = puzzle.solution[state.plyIndex]
    const matchesRecordedLine = stripCheckSymbols(moveObj.san) === stripCheckSymbols(expectedSan)

    // After this move, the remaining recorded entries alternate Black,
    // White, Black, White, ..., White — an even count, half of which are
    // White's.
    const whiteMovesLeftAfterThis = (puzzle.solution.length - state.plyIndex - 1) / 2
    const goal = puzzle.goal || currentStage().goal
    let blackReplyToPlay = null
    if (matchesRecordedLine) {
      blackReplyToPlay = puzzle.solution[state.plyIndex + 1]
    } else {
      blackReplyToPlay = verifyAllRepliesForced(state.chess, whiteMovesLeftAfterThis, (c, r) =>
        checkGoal(c, r, goal)
      )
    }

    if (!blackReplyToPlay) {
      state.chess.undo()
      state.board.refresh()
      state.wrongAttempts++
      showMessage(
        state.wrongAttempts >= 2
          ? "Not quite. Hint: " + puzzle.hint
          : 'Not quite — try again!',
        'error'
      )
      return
    }

    // Correct intermediate move (whether or not it was our recorded one):
    // auto-play Black's forced reply.
    state.plyIndex++
    showMessage('Good move! Black is forced to reply...', 'info')
    state.board.deselect()
    setTimeout(() => {
      const blackMove = state.chess.move(blackReplyToPlay)
      state.board.refresh()
      if (blackMove) state.board.flashLastMove(blackMove.from, blackMove.to)
      state.plyIndex++
      showMessage('Black played ' + blackReplyToPlay + '. Now find your next move!', 'info')
    }, 650)
  }

  function onPuzzleSolved() {
    const stage = currentStage()
    const puzzle = currentPuzzle()
    markSolved(stage.id, puzzle.id)
    state.solvedThisPuzzle = true
    showMessage('🎉 Solved! ' + puzzle.explanation, 'success')
    nextBtn.disabled = !hasNextPuzzle()
    renderSidebar()
  }

  function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = 'message ' + (type || '')
  }

  // ---------- controls ----------
  hintBtn.addEventListener('click', () => {
    showMessage('💡 ' + currentPuzzle().hint, 'info')
  })

  solutionBtn.addEventListener('click', () => {
    const puzzle = currentPuzzle()
    showMessage('Answer: ' + puzzle.explanation, 'info')
    state.chess.load(puzzle.fen)
    state.board.refresh()
    let i = 0
    const playStep = () => {
      if (i >= puzzle.solution.length) return
      const move = state.chess.move(puzzle.solution[i])
      state.board.refresh()
      if (move) state.board.flashLastMove(move.from, move.to)
      i++
      setTimeout(playStep, 700)
    }
    setTimeout(playStep, 300)
    nextBtn.disabled = !hasNextPuzzle()
  })

  retryBtn.addEventListener('click', () => loadPuzzle())
  prevBtn.addEventListener('click', goPrev)
  nextBtn.addEventListener('click', goNext)

  printStageBtn.addEventListener('click', () => {
    ChessPrint.renderStage(currentStage())
  })

  resetProgressBtn.addEventListener('click', () => {
    if (confirm('Clear all saved progress? This cannot be undone.')) {
      localStorage.removeItem(PROGRESS_KEY)
      renderSidebar()
      loadPuzzle()
    }
  })

  // ---------- boot ----------
  renderSidebar()
  loadPuzzle()
})()
