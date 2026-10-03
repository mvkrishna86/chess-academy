/*
 * Supabase auth + progress-sync, isolated behind a small API so app.js's
 * existing (synchronous, localStorage-backed) progress logic barely has
 * to change. If js/supabase-config.js still has placeholder values, this
 * degrades to a no-op cleanly — the app keeps working exactly as before,
 * fully offline, with no Supabase calls attempted.
 */
;(function () {
  const config = window.SUPABASE_CONFIG || {}
  const isConfigured =
    !!config.url &&
    !!config.anonKey &&
    config.url !== 'YOUR_SUPABASE_PROJECT_URL' &&
    config.anonKey !== 'YOUR_SUPABASE_ANON_KEY'

  const client = isConfigured ? window.supabase.createClient(config.url, config.anonKey) : null

  let currentUser = null
  const listeners = []

  function notify() {
    listeners.forEach((cb) => cb(currentUser))
  }

  function onAuthChange(callback) {
    listeners.push(callback)
    callback(currentUser) // fire immediately with current (possibly null) state
  }

  function signIn() {
    if (!client) return
    client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
  }

  function signOut() {
    if (!client) return
    client.auth.signOut()
  }

  // Rows -> { stageId: { puzzleId: true } }
  async function fetchProgress() {
    if (!client || !currentUser) return {}
    const { data, error } = await client.from('progress').select('stage_id, puzzle_id').eq('user_id', currentUser.id)
    if (error) {
      console.error('ChessAuth.fetchProgress failed:', error.message)
      return {}
    }
    const out = {}
    for (const row of data) {
      if (!out[row.stage_id]) out[row.stage_id] = {}
      out[row.stage_id][row.puzzle_id] = true
    }
    return out
  }

  // Fire-and-forget: UI never waits on this.
  function upsertProgress(stageId, puzzleId) {
    if (!client || !currentUser) return
    client
      .from('progress')
      .upsert({ user_id: currentUser.id, stage_id: stageId, puzzle_id: puzzleId })
      .then(({ error }) => {
        if (error) console.error('ChessAuth.upsertProgress failed:', error.message)
      })
  }

  // One-time local -> remote merge of everything already solved in this
  // browser's localStorage, so logging in doesn't lose existing progress.
  function upsertMany(entries) {
    if (!client || !currentUser || entries.length === 0) return Promise.resolve()
    const rows = entries.map((e) => ({ user_id: currentUser.id, stage_id: e.stageId, puzzle_id: e.puzzleId }))
    return client
      .from('progress')
      .upsert(rows)
      .then(({ error }) => {
        if (error) console.error('ChessAuth.upsertMany failed:', error.message)
      })
  }

  if (client) {
    client.auth.getSession().then(({ data }) => {
      currentUser = data.session ? data.session.user : null
      notify()
    })
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null
      notify()
    })
  }

  // Used by "Reset progress" — that button promises to clear everything,
  // which should hold true for a signed-in user's remote rows too.
  function deleteAll() {
    if (!client || !currentUser) return Promise.resolve()
    return client
      .from('progress')
      .delete()
      .eq('user_id', currentUser.id)
      .then(({ error }) => {
        if (error) console.error('ChessAuth.deleteAll failed:', error.message)
      })
  }

  window.ChessAuth = {
    isConfigured: isConfigured,
    onAuthChange,
    signIn,
    signOut,
    fetchProgress,
    upsertProgress,
    upsertMany,
    deleteAll,
  }
})()
