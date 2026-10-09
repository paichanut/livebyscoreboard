// Sync layer: Supabase realtime when configured, otherwise localStorage + BroadcastChannel
// (local mode = display and control must be in the same browser).
//
// Access model: reads are public; writes need the game's operator key.
import { createClient } from '@supabase/supabase-js'
import { newGame } from './game.js'
import { setTimeOffset } from './clock.js'

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
  if (ONLINE) startTimeSync()
  return ONLINE ? supabaseStore(gameId, opts) : localStore(gameId, opts)
}

// ---------- Server time ----------
// The game clock is derived from wall-clock time on every device, so a phone whose clock is
// 20 s fast would show a clock 20 s ahead of the TV. We measure each device's offset to the
// server (server_now() RPC; fallback: the HTTP Date header) and feed it to clock.js.
let timeSyncTimer = null
async function sampleServerTime() {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('server_now')
  const t1 = Date.now()
  if (!error && typeof data === 'number') return { serverMs: data, t0, t1 }
  // server_now() missing (supabase.sql not re-run): fall back to the Date header, 1 s resolution
  const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY }, cache: 'no-store' })
  const t2 = Date.now()
  const d = Date.parse(r.headers.get('date') || '')
  if (!d) throw new Error('no server time')
  return { serverMs: d + 500, t0: t1, t1: t2 }
}

export async function syncServerTime(samples = 3) {
  let best = null
  for (let i = 0; i < samples; i++) {
    try {
      const s = await sampleServerTime()
      const rtt = s.t1 - s.t0
      if (!best || rtt < best.rtt) best = { rtt, offset: s.serverMs + rtt / 2 - s.t1 }
    } catch (e) { console.warn('time sync failed', e) }
  }
  if (best) setTimeOffset(best.offset)
  return best
}

function startTimeSync() {
  if (timeSyncTimer) return
  syncServerTime()
  timeSyncTimer = setInterval(() => syncServerTime(2), 5 * 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncServerTime(2) })
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

// ---------- List of games (tournament / live page) ----------
// rows: [{ id, state, updatedAt }] newest first. Online: public select on `games` + realtime on the whole table.
// Local: every rinkboard:* game in this browser's localStorage.
export function createGamesList() {
  const listeners = new Set()
  let rows = []
  const emit = () => listeners.forEach(fn => fn(rows))
  const api = {
    subscribe(fn) { listeners.add(fn); fn(rows); return () => listeners.delete(fn) },
    destroy() {},
  }
  if (ONLINE) {
    const toRow = r => ({ id: r.id, state: r.state, updatedAt: new Date(r.updated_at).getTime() })
    supabase.from('games').select('id,state,updated_at').order('updated_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) console.error('list failed', error); rows = (data || []).map(toRow); emit() })
    const channel = supabase
      .channel('games:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, payload => {
        if (payload.eventType === 'DELETE') rows = rows.filter(r => r.id !== payload.old?.id)
        else if (payload.new?.state) { const r = toRow(payload.new); rows = [r, ...rows.filter(x => x.id !== r.id)] }
        emit()
      })
      .subscribe()
    api.destroy = () => supabase.removeChannel(channel)
    return api
  }
  const scan = () => {
    const out = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k.startsWith('rinkboard:') || k.startsWith('rinkboard:key:')) continue
        const st = JSON.parse(localStorage.getItem(k))
        if (st?.home && st?.clock) out.push({ id: k.slice('rinkboard:'.length), state: st, updatedAt: st.updatedAt || 0 })
      }
    } catch {}
    rows = out.sort((a, b) => b.updatedAt - a.updatedAt)
    emit()
  }
  window.addEventListener('storage', scan)
  scan()
  api.destroy = () => window.removeEventListener('storage', scan)
  return api
}
