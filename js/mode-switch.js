/*
 * Toggles between Puzzles mode (js/app.js) and Play vs Computer mode
 * (js/play.js). Deliberately tiny and separate from both — neither mode
 * controller needs to know the other exists.
 */
;(function () {
  const puzzlesTabBtn = document.getElementById('puzzlesTabBtn')
  const playTabBtn = document.getElementById('playTabBtn')
  const puzzleModeEl = document.getElementById('puzzleMode')
  const playModeEl = document.getElementById('playMode')

  if (!puzzlesTabBtn || !playTabBtn) return

  function showPuzzles() {
    puzzleModeEl.hidden = false
    playModeEl.hidden = true
    puzzlesTabBtn.classList.add('active')
    playTabBtn.classList.remove('active')
  }

  function showPlay() {
    puzzleModeEl.hidden = true
    playModeEl.hidden = false
    puzzlesTabBtn.classList.remove('active')
    playTabBtn.classList.add('active')
    if (window.ChessPlay) window.ChessPlay.initOnce()
  }

  puzzlesTabBtn.addEventListener('click', showPuzzles)
  playTabBtn.addEventListener('click', showPlay)
})()
