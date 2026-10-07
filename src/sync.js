// Sync layer: Supabase realtime when configured, otherwise localStorage + BroadcastChannel
// (local mode = display and control must be in the same browser).
//
// Access model: reads are public; writes need the game's operator key.
import { createClient } from '@supabase/supabase-js'
import { newGame } from './game.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const ONLINE = Boolean(URL && KEY)

const supabase = ONLINE ? createClient(URL, KEY) : null

export function randomKey(len = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  for (const b of buf) out += chars[b % chars.length]
  return out
}

// Operator keys are remembered per game in this browser
export function rememberKey(gameId, key) { try { localStorage.setItem(`rinkboard:key:${gameId}`, key) } catch {} }
export function storedKey(gameId) { try { return localStorage.getItem(`rinkboard:key:${gameId}`) || '' } catch { return '' } }

/**
 * createStore(gameId, { key, canWrite })
 *   key      — operator key (control page). Omit for read-only viewers.
 *   canWrite — control page wants to create the game if missing.
 * store.access: 'reading' | 'ok' | 'locked' | 'missing'
 *   locked  = game exists but key is wrong/missing
 *   missing = game doesn't exist and we can't create it (viewer)
 */
export function createStore(gameId, opts = {}) {
  return ONLINE ? supabaseStore(gameId, opts) : localStore(gameId, opts)
}

// ---------- Supabase ----------
function supabaseStore(gameId, { key = '', canWrite = false } = {}) {
  let state = null
  let access = 'reading'
  const listeners = new Set()
  const emit = () => listeners.forEach(fn => fn(state, access))
  let saveTimer = null
  let pending = null

  async function load() {
    const { data, error } = await supabase.from('games').select('state').eq('id', gameId).maybeSingle()
    if (error) console.error('load failed', error)
    if (data?.state) {
      state = data.state
      if (canWrite) {
        const { data: ok } = await supabase.rpc('check_key', { p_id: gameId, p_key: key })
        access = ok ? 'ok' : 'locked'
      } else access = 'ok'
    } else if (canWrite && key) {
      state = newGame()
      const { data: ok, error: e2 } = await supabase.rpc('create_game', { p_id: gameId, p_key: key, p_state: state })
      if (e2) console.error('create failed', e2)
      access = ok ? 'ok' : 'locked'
      if (!ok) { const r = await supabase.from('games').select('state').eq('id', gameId).maybeSingle(); if (r.data) state = r.data.state }
    } else {
      access = 'missing'
    }
    emit()
  }

  const channel = supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
      const incoming = payload.new?.state
      if (!incoming) return
      if (state && incoming.updatedAt < state.updatedAt) return
      state = incoming
      if (access === 'missing') access = 'ok'
      emit()
    })
    .subscribe()

  load()

  function flush() {
    saveTimer = null
    const s = pending
    pending = null
    if (!s) return
    supabase.rpc('save_game', { p_id: gameId, p_key: key, p_state: s }).then(({ data, error }) => {
      if (error) console.error('save failed', error)
      if (data === false && access !== 'locked') { access = 'locked'; emit() }
    })
  }

  return {
    get: () => state,
    getAccess: () => access,
    subscribe(fn) {
      listeners.add(fn)
      if (state) fn(state, access)
      return () => listeners.delete(fn)
    },
    set(next) {
      if (access === 'locked') return
      state = next
      emit()
      pending = next
      if (!saveTimer) saveTimer = setTimeout(flush, 80)
    },
    destroy() { supabase.removeChannel(channel) },
  }
}

// ---------- Local (same browser) ----------
function localStore(gameId) {
  const key = `rinkboard:${gameId}`
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(key) : null
  const listeners = new Set()
  let state = null
  try { state = JSON.parse(localStorage.getItem(key)) || null } catch {}
  if (!state) {
    state = newGame()
    try { localStorage.setItem(key, JSON.stringify(state)) } catch {}
  }
  const emit = () => listeners.forEach(fn => fn(state, 'ok'))

  const onMsg = e => {
    if (e.data && (!state || e.data.updatedAt >= state.updatedAt)) { state = e.data; emit() }
  }
  bc?.addEventListener('message', onMsg)
  const onStorage = e => { if (e.key === key && e.newValue) { try { onMsg({ data: JSON.parse(e.newValue) }) } catch {} } }
  window.addEventListener('storage', onStorage)

  return {
    get: () => state,
    getAccess: () => 'ok',
    subscribe(fn) { listeners.add(fn); fn(state, 'ok'); return () => listeners.delete(fn) },
    set(next) {
      state = next
      emit()
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      bc?.postMessage(next)
    },
    destroy() { bc?.close(); window.removeEventListener('storage', onStorage) },
  }
}
