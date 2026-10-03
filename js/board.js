/*
 * Minimal chessboard renderer + click-to-move interaction, built on the
 * vendored chess.js for legality. No images — pieces are drawn with
 * Unicode glyphs so the whole app works completely offline.
 */
;(function () {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const GLYPHS = {
    wK: '♔',
    wQ: '♕',
    wR: '♖',
    wB: '♗',
    wN: '♘',
    wP: '♙',
    bK: '♚',
    bQ: '♛',
    bR: '♜',
    bB: '♝',
    bN: '♞',
    bP: '♟',
  }

  function squareOf(fileIndex, rankIndex) {
    return FILES[fileIndex] + (rankIndex + 1)
  }

  // Builds the 64 square elements once; returns {el, squares: {a1: el, ...}}
  function buildGrid() {
    const el = document.createElement('div')
    el.className = 'board'
    const squares = {}
    // Rank 8 at the top, rank 1 at the bottom; file a at the left (White's
    // own view of the board, since the learner always plays White).
    for (let rankIndex = 7; rankIndex >= 0; rankIndex--) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
        const sq = squareOf(fileIndex, rankIndex)
        const sqEl = document.createElement('div')
        const isLight = (fileIndex + rankIndex) % 2 === 1
        sqEl.className = 'square ' + (isLight ? 'light' : 'dark')
        sqEl.dataset.square = sq
        if (fileIndex === 0) {
          const rankLabel = document.createElement('span')
          rankLabel.className = 'coord coord-rank'
          rankLabel.textContent = String(rankIndex + 1)
          sqEl.appendChild(rankLabel)
        }
        if (rankIndex === 0) {
          const fileLabel = document.createElement('span')
          fileLabel.className = 'coord coord-file'
          fileLabel.textContent = FILES[fileIndex]
          sqEl.appendChild(fileLabel)
        }
        const pieceSpan = document.createElement('span')
        pieceSpan.className = 'piece'
        sqEl.appendChild(pieceSpan)
        const dot = document.createElement('span')
        dot.className = 'move-dot'
        sqEl.appendChild(dot)
        el.appendChild(sqEl)
        squares[sq] = sqEl
      }
    }
    return { el, squares }
  }

  // Renders a chess.js board() array (8x8, rank8 first) onto the grid.
  function paint(squares, boardArray) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = boardArray[r][f]
        const rankIndex = 7 - r
        const sq = squareOf(f, rankIndex)
        const pieceEl = squares[sq].querySelector('.piece')
        pieceEl.textContent = piece ? GLYPHS[piece.color + piece.type.toUpperCase()] : ''
      }
    }
  }

  function clearMarks(squares) {
    Object.keys(squares).forEach((sq) => {
      squares[sq].classList.remove('selected', 'last-move', 'in-check')
      squares[sq].querySelector('.move-dot').classList.remove('visible', 'capture')
    })
  }

  // Interactive board bound to a live Chess instance.
  // options: { onIllegalAttempt(from,to), onMoveAttempt(moveObj) -> bool handled }
  function createInteractiveBoard(container, chess, options) {
    options = options || {}
    const { el, squares } = buildGrid()
    container.innerHTML = ''
    container.appendChild(el)

    let selected = null
    let locked = false

    function refresh() {
      paint(squares, chess.board())
      clearMarks(squares)
      if (chess.in_check()) {
        const turnColor = chess.turn()
        const kingSq = findKing(chess, turnColor)
        if (kingSq) squares[kingSq].classList.add('in-check')
      }
    }

    function findKing(chess, color) {
      const boardArray = chess.board()
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const piece = boardArray[r][f]
          if (piece && piece.type === 'k' && piece.color === color) {
            return squareOf(f, 7 - r)
          }
        }
      }
      return null
    }

    function showLegalDestinations(square) {
      const moves = chess.moves({ square: square, verbose: true })
      moves.forEach((m) => {
        const dot = squares[m.to].querySelector('.move-dot')
        dot.classList.add('visible')
        if (m.captured) dot.classList.add('capture')
      })
    }

    function onSquareClick(sq) {
      // Needed for Play vs Computer: without this, a player could select
      // and move the OPPONENT's pieces during the engine's "thinking"
      // delay, since the only other guard (piece.color === chess.turn())
      // happily matches Black once it's Black's turn. Puzzle mode never
      // locks, so this is a no-op there.
      if (locked) return
      const piece = chess.get(sq)

      if (selected) {
        if (sq === selected) {
          clearMarks(squares)
          selected = null
          return
        }
        const legalMoves = chess.moves({ square: selected, verbose: true })
        const match = legalMoves.find((m) => m.to === sq)
        if (match) {
          const moveObj = chess.move({ from: selected, to: sq, promotion: 'q' })
          selected = null
          refresh()
          if (moveObj) {
            squares[moveObj.from].classList.add('last-move')
            squares[moveObj.to].classList.add('last-move')
          }
          if (options.onMoveAttempt) options.onMoveAttempt(moveObj)
          return
        }
        // Clicked somewhere else: if it's a selectable piece, reselect.
        clearMarks(squares)
        selected = null
        if (piece && piece.color === chess.turn()) {
          selected = sq
          squares[sq].classList.add('selected')
          showLegalDestinations(sq)
        }
        return
      }

      if (piece && piece.color === chess.turn()) {
        selected = sq
        squares[sq].classList.add('selected')
        showLegalDestinations(sq)
      }
    }

    el.addEventListener('click', (e) => {
      const sqEl = e.target.closest('.square')
      if (!sqEl) return
      onSquareClick(sqEl.dataset.square)
    })

    refresh()

    return {
      refresh,
      flashLastMove: (from, to) => {
        squares[from].classList.add('last-move')
        squares[to].classList.add('last-move')
      },
      deselect: () => {
        clearMarks(squares)
        selected = null
      },
      setLocked: (value) => {
        locked = value
        if (locked) {
          clearMarks(squares)
          selected = null
        }
      },
    }
  }

  // Non-interactive board for the print worksheet — just paints a position.
  function renderStaticBoard(container, fen) {
    const chess = new window.Chess()
    chess.load(fen)
    const { el, squares } = buildGrid()
    container.innerHTML = ''
    container.appendChild(el)
    paint(squares, chess.board())
  }

  window.ChessBoardUI = {
    createInteractiveBoard,
    renderStaticBoard,
  }
})()
