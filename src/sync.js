// Sync layer: Supabase realtime when configured, otherwise localStorage + BroadcastChannel
// (local mode = display and control must be in the same browser).
import { createClient } from '@supabase/supabase-js'
import { newGame } from './game.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const ONLINE = Boolean(URL && KEY)

const supabase = ONLINE ? createClient(URL, KEY) : null

export function createStore(gameId) {
  return ONLINE ? supabaseStore(gameId) : localStore(gameId)
}

// ---------- Supabase ----------
function supabaseStore(gameId) {
  let state = null
  const listeners = new Set()
  const emit = () => listeners.forEach(fn => fn(state))
  let saveTimer = null
  let pending = null

  async function load() {
    const { data, error } = await supabase.from('games').select('state').eq('id', gameId).maybeSingle()
    if (error) console.error('load failed', error)
    if (data?.state) {
      state = data.state
    } else {
      state = newGame()
      await supabase.from('games').upsert({ id: gameId, state, updated_at: new Date().toISOString() })
    }
    emit()
  }

  const channel = supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
      const incoming = payload.new?.state
      if (!incoming) return
      // ignore echoes of our own older writes
      if (state && incoming.updatedAt < state.updatedAt) return
      state = incoming
      emit()
    })
    .subscribe()

  load()

  function flush() {
    saveTimer = null
    const s = pending
    pending = null
    if (!s) return
    supabase
      .from('games')
      .upsert({ id: gameId, state: s, updated_at: new Date().toISOString() })
      .then(({ error }) => error && console.error('save failed', error))
  }

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn)
      if (state) fn(state)
      return () => listeners.delete(fn)
    },
    set(next) {
      state = next
      emit()
      pending = next
      // coalesce rapid taps into one write (~80ms)
      if (!saveTimer) saveTimer = setTimeout(flush, 80)
    },
    destroy() {
      supabase.removeChannel(channel)
    },
  }
}

// ---------- Local (same browser) ----------
function localStore(gameId) {
  const key = `rinkboard:${gameId}`
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(key) : null
  const listeners = new Set()
  let state = null
  try {
    state = JSON.parse(localStorage.getItem(key)) || null
  } catch {}
  if (!state) {
    state = newGame()
    try { localStorage.setItem(key, JSON.stringify(state)) } catch {}
  }
  const emit = () => listeners.forEach(fn => fn(state))

  const onMsg = e => {
    if (e.data && (!state || e.data.updatedAt >= state.updatedAt)) {
      state = e.data
      emit()
    }
  }
  bc?.addEventListener('message', onMsg)
  const onStorage = e => {
    if (e.key === key && e.newValue) {
      try { onMsg({ data: JSON.parse(e.newValue) }) } catch {}
    }
  }
  window.addEventListener('storage', onStorage)

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn)
      fn(state)
      return () => listeners.delete(fn)
    },
    set(next) {
      state = next
      emit()
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      bc?.postMessage(next)
    },
    destroy() {
      bc?.close()
      window.removeEventListener('storage', onStorage)
    },
  }
}
