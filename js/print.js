/*
 * Builds a printable worksheet for a stage: a static diagram for every
 * puzzle (White to move) plus an answer key at the end. Populates the
 * hidden #printSheet element, which is only shown via the @media print
 * rules in css/style.css, then triggers the browser print dialog.
 */
;(function () {
  function renderStage(stage) {
    const sheet = document.getElementById('printSheet')
    sheet.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'print-header'
    header.innerHTML =
      '<h1>' + stage.emoji + ' ' + escapeHtml(stage.title) + '</h1>' +
      '<p class="print-lesson">' + escapeHtml(stage.lesson) + '</p>' +
      '<p class="print-sub">White to move in every diagram. Find the best move!</p>'
    sheet.appendChild(header)

    const grid = document.createElement('div')
    grid.className = 'print-grid'
    stage.puzzles.forEach((puzzle, idx) => {
      const card = document.createElement('div')
      card.className = 'print-card'
      const title = document.createElement('h3')
      title.textContent = 'Puzzle ' + (idx + 1)
      card.appendChild(title)
      const boardHolder = document.createElement('div')
      boardHolder.className = 'print-board-holder'
      card.appendChild(boardHolder)
      grid.appendChild(card)
      sheet.appendChild(grid)
      ChessBoardUI.renderStaticBoard(boardHolder, puzzle.fen)
    })

    const answers = document.createElement('div')
    answers.className = 'print-answers'
    answers.innerHTML = '<h2>Answer Key</h2>'
    const list = document.createElement('ol')
    stage.puzzles.forEach((puzzle) => {
      const li = document.createElement('li')
      li.innerHTML =
        '<strong>' + escapeHtml(puzzle.solution.join(' ')) + '</strong> — ' +
        escapeHtml(puzzle.explanation)
      list.appendChild(li)
    })
    answers.appendChild(list)
    sheet.appendChild(answers)

    window.print()
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  window.ChessPrint = { renderStage }
})()
