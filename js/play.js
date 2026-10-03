/*
 * "Play vs Computer" mode: a full game against the vendored Stockfish
 * engine (js/engine.js), separate from the puzzle flow in js/app.js
 * (which this file does not touch or depend on).
 */
;(function () {
  const DIFFICULTIES = [
    { label: 'Beginner', skill: 1, movetime: 300 },
    { label: 'Easy', skill: 3, movetime: 500 },
    { label: 'Medium', skill: 6, movetime: 800 },
    { label: 'Hard', skill: 10, movetime: 1200 },
    { label: 'Club', skill: 14, movetime: 1500 },
  ]

  const boardContainerEl = document.getElementById('playBoardContainer')
  const statusEl = document.getElementById('playStatus')
  const messageEl = document.getElementById('playMessage')
  const moveListEl = document.getElementById('moveList')
  const difficultySelect = document.getElementById('difficultySelect')
  const newGameBtn = document.getElementById('newGameBtn')
  const resignBtn = document.getElementById('resignBtn')

  if (!boardContainerEl) return // play mode markup not present

  const state = {
    chess: null,
    board: null,
    engine: null,
    gameOver: false,
    engineThinking: false,
  }

  function currentDifficulty() {
    return DIFFICULTIES[Number(difficultySelect.value)] || DIFFICULTIES[2]
  }

  function updateMoveList() {
    const history = state.chess.history()
    moveListEl.innerHTML = ''
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement('li')
      li.textContent = history[i] + (history[i + 1] ? '  ' + history[i + 1] : '')
      moveListEl.appendChild(li)
    }
    moveListEl.scrollTop = moveListEl.scrollHeight
  }

  function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = 'message ' + (type || '')
  }

  function describeGameOver() {
    if (state.chess.in_checkmate()) {
      return state.chess.turn() === 'w' ? '😔 Checkmate — the computer wins.' : '🎉 Checkmate — you win!'
    }
    if (state.chess.in_stalemate()) return "It's a draw — stalemate."
    if (state.chess.in_threefold_repetition()) return "It's a draw — the same position happened three times."
    if (state.chess.insufficient_material()) return "It's a draw — not enough material left for either side to win."
    if (state.chess.in_draw()) return "It's a draw (50-move rule)."
    return null
  }

  function checkGameOver() {
    const result = describeGameOver()
    if (!result) return false
    state.gameOver = true
    showMessage(result, 'success')
    statusEl.textContent = 'Game over — click "New Game" to play again.'
    state.board.setLocked(true)
    return true
  }

  async function requestEngineMove() {
    state.engineThinking = true
    state.board.setLocked(true)
    statusEl.textContent = "Computer is thinking…"
    try {
      const uciMove = await state.engine.getBestMove(state.chess.fen(), currentDifficulty().movetime)
      if (!uciMove || uciMove === '(none)') {
        checkGameOver()
        return
      }
      const from = uciMove.slice(0, 2)
      const to = uciMove.slice(2, 4)
      const promotion = uciMove.length === 5 ? uciMove[4] : undefined
      const moveObj = state.chess.move({ from, to, promotion: promotion || 'q' })
      state.board.refresh()
      if (moveObj) state.board.flashLastMove(moveObj.from, moveObj.to)
      updateMoveList()
    } finally {
      state.engineThinking = false
      if (!checkGameOver()) {
        state.board.setLocked(false)
        statusEl.textContent = "Your move — you're playing White!"
      }
    }
  }

  function handlePlayerMove(moveObj) {
    if (!moveObj) return
    updateMoveList()
    if (checkGameOver()) return
    requestEngineMove()
  }

  function newGame() {
    state.gameOver = false
    state.chess = new Chess()
    state.board = ChessBoardUI.createInteractiveBoard(boardContainerEl, state.chess, {
      onMoveAttempt: handlePlayerMove,
    })
    updateMoveList()
    showMessage('New game started. Good luck!', 'info')
    statusEl.textContent = "Your move — you're playing White!"
    if (state.engine) state.engine.newGame()
  }

  function applyDifficulty() {
    if (state.engine) state.engine.setSkillLevel(currentDifficulty().skill)
  }

  newGameBtn.addEventListener('click', newGame)
  difficultySelect.addEventListener('change', applyDifficulty)
  resignBtn.addEventListener('click', () => {
    if (state.gameOver) return
    state.gameOver = true
    showMessage('You resigned. Click "New Game" for a rematch.', 'info')
    statusEl.textContent = 'Game over.'
    if (state.board) state.board.setLocked(true)
  })

  // The engine loads lazily, the first time Play mode is actually shown
  // (see js/mode-switch.js), so the Worker + WASM download never happens
  // for anyone who only ever uses the puzzle stages.
  let initStarted = false
  function initOnce() {
    if (initStarted) return
    initStarted = true
    try {
      state.engine = window.ChessEngine.create()
    } catch (e) {
      showMessage(
        'Could not start the chess engine in this browser. If you opened this file directly, try serving it instead (see README).',
        'error'
      )
      return
    }
    newGame()
    applyDifficulty()
  }

  window.ChessPlay = { initOnce }
})()
