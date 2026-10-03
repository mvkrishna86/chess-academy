/*
 * Thin Promise-based wrapper around a vendored, single-threaded
 * Stockfish WASM build (js/vendor/stockfish.wasm.js + .wasm — Stockfish
 * "2019-08-15 64 POPCNT Multi-Variant", GPL-3.0, see
 * js/vendor/stockfish-COPYING.txt).
 *
 * This specific build matters: a newer multi-threaded Stockfish WASM
 * build was tried first and silently failed in a plain browser Worker —
 * it needs SharedArrayBuffer, which needs COOP/COEP response headers
 * that a static host like GitHub Pages can't set. This build reports
 * "Threads max=1" and was verified working with a plain `new Worker(...)`
 * and no special headers.
 */
;(function () {
  function createEngine() {
    const worker = new Worker('js/vendor/stockfish.wasm.js')
    const lineListeners = []
    worker.onmessage = (e) => {
      lineListeners.forEach((fn) => fn(e.data))
    }

    function send(cmd) {
      worker.postMessage(cmd)
    }

    // Resolves once a line matching `test` arrives. If `collect` is given,
    // every line (including the matching one) is pushed to it.
    function waitFor(test, collect) {
      return new Promise((resolve) => {
        const listener = (line) => {
          if (collect) collect.push(line)
          if (test(line)) {
            lineListeners.splice(lineListeners.indexOf(listener), 1)
            resolve(line)
          }
        }
        lineListeners.push(listener)
      })
    }

    const ready = (async () => {
      send('uci')
      await waitFor((line) => line === 'uciok')
      send('isready')
      await waitFor((line) => line === 'readyok')
    })()

    async function setSkillLevel(level) {
      await ready
      send('setoption name Skill Level value ' + level)
      // Keeps weaker levels genuinely weaker (otherwise the engine still
      // searches at full strength internally for some positions).
      send('setoption name UCI_LimitStrength value true')
      send('setoption name UCI_Elo value ' + skillToApproxElo(level))
      send('isready')
      await waitFor((line) => line === 'readyok')
    }

    function skillToApproxElo(level) {
      // Rough mapping — UCI_Elo's own range (varies by build) is clamped
      // internally, this just needs to land in the right ballpark.
      return 1100 + level * 90
    }

    async function newGame() {
      await ready
      send('ucinewgame')
      send('isready')
      await waitFor((line) => line === 'readyok')
    }

    // Resolves to a UCI move string (e.g. "e2e4" or "e7e8q").
    async function getBestMove(fen, movetimeMs) {
      await ready
      send('position fen ' + fen)
      const collected = []
      send('go movetime ' + movetimeMs)
      const bestmoveLine = await waitFor((line) => line.indexOf('bestmove') === 0, collected)
      const match = /bestmove\s+(\S+)/.exec(bestmoveLine)
      return match ? match[1] : null
    }

    function destroy() {
      worker.terminate()
    }

    return { ready, setSkillLevel, newGame, getBestMove, destroy }
  }

  window.ChessEngine = { create: createEngine }
})()
