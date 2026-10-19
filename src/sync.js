// Sync layer: Supabase realtime when configured, otherwise localStorage + BroadcastChannel
// (local mode = display and control must be in the same browser).
//
// Access model: reads are public; writes need the game's operator key.
import { createClient } from '@supabase/supabase-js'
import { newGame } from './game.js'
import { setTimeOffset } from './clock.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
// Desktop app (desktop/, `vite build --mode desktop`): one computer, no internet, control + display windows
export const DESKTOP = import.meta.env.VITE_DESKTOP === '1'
export const ONLINE = !DESKTOP && Boolean(URL && KEY)
// The local (same-browser) store exists only for the test build (`vite build --mode test`, see .env.test).
// Production is cloud-only: without Supabase keys the app shows the setup screen instead of a board
// that silently cannot reach other devices.
export const ALLOW_LOCAL = import.meta.env.VITE_ALLOW_LOCAL === '1'
export const CONFIGURED = ONLINE || ALLOW_LOCAL

const supabase = ONLINE ? createClient(URL, KEY) : null

export function randomKey(len = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  for (const b of buf) out += chars[b % chars.length]
  return out
}

// ---------- Operator login ----------
// One login on a device lets the operator create and edit any game. The session token lives in
// localStorage and is sent instead of a per-game key; it never goes into a URL.
// The test build (local store) has no server, so it has no login and every page can write.
const SESSION = 'rinkboard:session'
const SESSION_USER = 'rinkboard:user'
export const NEEDS_LOGIN = ONLINE
export function getSession() { try { return localStorage.getItem(SESSION) || '' } catch { return '' } }
export function sessionUser() { try { return localStorage.getItem(SESSION_USER) || '' } catch { return '' } }

export async function login(username, password) {
  const { data, error } = await supabase.rpc('operator_login', { p_username: username, p_password: password })
  if (error) throw new Error(error.message)
  if (!data) return false
  try { localStorage.setItem(SESSION, data); localStorage.setItem(SESSION_USER, username.trim().toLowerCase()) } catch {}
  return true
}

export async function logout() {
  const t = getSession()
  try { localStorage.removeItem(SESSION); localStorage.removeItem(SESSION_USER) } catch {}
  if (t && supabase) await supabase.rpc('operator_logout', { p_token: t })
}

// Still valid on the server? (sessions last 30 days; changing the password ends them)
export async function checkSession() {
  const t = getSession()
  if (!t || !supabase) return false
  const { data } = await supabase.rpc('operator_check', { p_token: t })
  if (!data) { try { localStorage.removeItem(SESSION); localStorage.removeItem(SESSION_USER) } catch {} }
  return Boolean(data)
}

// The single-game operator link (?k=) a logged-in operator can hand to a helper
export async function helperKey(gameId) {
  const t = getSession()
  if (!t || !supabase) return ''
  const { data } = await supabase.rpc('get_game_key', { p_id: gameId, p_token: t })
  return data || ''
}

// Delete a game for good (logged-in operators; the test build just drops it from this browser)
export async function deleteGame(gameId) {
  if (!ONLINE) {
    try { localStorage.removeItem(`rinkboard:${gameId}`); localStorage.removeItem(`rinkboard:key:${gameId}`) } catch {}
    window.dispatchEvent(new Event('storage'))
    return true
  }
  const { data, error } = await supabase.rpc('delete_game', { p_id: gameId, p_token: getSession() })
  if (error) throw new Error(error.message)
  if (data) try { localStorage.removeItem(`rinkboard:key:${gameId}`) } catch {}
  return Boolean(data)
}

// Operator keys are remembered per game in this browser
// ---------- Shared team library (table `teams`, see supabase.sql) ----------
// Everybody's teams in one list: anyone can pick from it, a logged-in operator adds teams, the uploader
// (or the admin) edits them. The desktop app has no keys: it reads the list through the web app's /api/teams.
const SHARED_TEAMS_URL = 'https://livebyscoreboard.vercel.app/api/teams'
export const SHARED_TEAMS = ONLINE || DESKTOP

export async function listSharedTeams() {
  if (supabase) {
    const { data, error } = await supabase.rpc('team_list', { p_token: getSession() || null })
    if (error) throw new Error(error.message)
    return data || []
  }
  if (DESKTOP) {
    const r = await fetch(SHARED_TEAMS_URL)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()).map(t => ({ ...t, can_edit: false, mine: false }))
  }
  return []
}

// Add (or update your own team with the same name). 'added' | 'updated' | 'taken' | 'login'
export async function saveSharedTeam({ name, color, logo }) {
  if (!supabase || !getSession()) return 'login'
  const { data, error } = await supabase.rpc('team_save', { p_token: getSession(), p_name: name, p_color: color || '', p_logo: logo || '' })
  if (error) throw new Error(error.message)
  return data
}

// A team set up in a game (Options / team sheet) joins the shared library if it is not there yet.
// Never overwrites an existing entry: the admin may have fixed that logo since this game was set up.
export async function shareTeamIfNew({ name, color, logo }) {
  const n = String(name || '').trim()
  if (!supabase || !getSession() || !n || ['home', 'away'].includes(n.toLowerCase())) return
  try {
    const list = await listSharedTeams()
    if (!list.some(t => t.name.trim().toLowerCase() === n.toLowerCase())) await saveSharedTeam({ name: n, color, logo })
  } catch {}
}

export async function updateSharedTeam(id, { name, color, logo }) {
  const { data, error } = await supabase.rpc('team_update', { p_token: getSession(), p_id: id, p_name: name || '', p_color: color || '', p_logo: logo || '' })
  if (error) throw new Error(/teams_name_key/.test(error.message) ? 'Another team already has that name.' : error.message)
  return data === 'updated'
}

export async function deleteSharedTeam(id) {
  const { data, error } = await supabase.rpc('team_delete', { p_token: getSession(), p_id: id })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

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
// The desktop app's online link (desktop/share.cjs): the desktop build served over http(s) from the
// computer running the game, through a Cloudflare tunnel. Watch-only; the state streams from that computer.
export const VIEWER = DESKTOP && typeof location !== 'undefined' && location.protocol.startsWith('http')

export function createStore(gameId, opts = {}) {
  if (ONLINE) { startTimeSync(); return supabaseStore(gameId, opts) }
  if (VIEWER) return viewerStore(gameId)
  if (ALLOW_LOCAL) return localStore(gameId, opts)
  throw new Error('Live by Scoreboard is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
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

// ---------- Online link viewer (desktop app shared through a tunnel) ----------
// Long polling desktop/share.cjs: GET /api/state/<id>?v=<seq> answers when the game changes (or after ~25 s
// with nothing new). Pictures come as /api/img/<hash> (fetched once). The clock offset comes from
// GET /api/time, a tiny answer sent at once: the fastest of a few round trips gives the offset, so this
// phone's game clock matches the rink's (a long poll's time would include the wait and the download).
// A controller opened through the link sends only the parts of the game it changed; the desktop merges
// them into its own game, so two phones changing different things never undo each other.
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)

function viewerStore(gameId) {
  const api = `/api/state/${encodeURIComponent(gameId)}`
  let server = null // the desktop's game
  let seq = 0
  const local = {} // parts changed here that the desktop has not confirmed yet
  const dirty = new Set() // ...and not sent yet
  let state = null
  let stopped = false
  let sendTimer = null
  let sending = false
  const listeners = new Set()
  const access = () => (state ? 'ok' : 'reading')
  const emit = () => listeners.forEach(fn => fn(state, access()))
  const rebuild = () => {
    for (const k of Object.keys(local)) if (!dirty.has(k) && same(local[k], server?.[k])) delete local[k]
    state = server && { ...server, ...local }
    emit()
  }
  // pictures (logos, background) load once when the page opens and stay cached (immutable on the desktop side)
  const preloaded = new Set()
  const preload = st => {
    for (const src of JSON.stringify(st).match(/\/api\/img\/[0-9a-f]{40}/g) || []) {
      if (!preloaded.has(src)) { preloaded.add(src); new Image().src = src }
    }
  }
  const take = m => { if (m?.state && m.seq > seq) { seq = m.seq; server = m.state; preload(server) } }

  async function send() {
    sendTimer = null
    if (sending || !dirty.size) return
    const patch = {}
    for (const k of dirty) patch[k] = k in local ? local[k] ?? null : server?.[k] ?? null
    dirty.clear()
    sending = true
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch }) })
      if (r.status === 401) { window.location.reload(); return } // logged out (12 h): the page sends you to log in again
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      take(await r.json())
      for (const k of Object.keys(patch)) if (!dirty.has(k) && same(local[k], patch[k])) delete local[k]
      rebuild()
    } catch {
      for (const k of Object.keys(patch)) if (k in local && !same(server?.[k], local[k])) dirty.add(k)
      sendTimer = setTimeout(send, 1000)
    } finally {
      sending = false
      if (dirty.size && !sendTimer) sendTimer = setTimeout(send, 0)
    }
  }

  async function poll() {
    while (!stopped) {
      try {
        const r = await fetch(`${api}?v=${seq}`, { cache: 'no-store' })
        const m = await r.json()
        if (m.state && m.seq > seq) { take(m); rebuild() }
      } catch {
        await new Promise(res => setTimeout(res, 2000))
      }
    }
  }

  // clock offset: a few quick round trips now and every 30 s; the fastest of the last 5 minutes wins
  let samples = []
  async function syncTime(n) {
    for (let i = 0; i < n && !stopped; i++) {
      try {
        const t0 = Date.now()
        const m = await (await fetch('/api/time', { cache: 'no-store' })).json()
        const t1 = Date.now()
        if (typeof m.now === 'number') samples.push({ at: t1, rtt: t1 - t0, offset: m.now + (t1 - t0) / 2 - t1 })
      } catch {}
    }
    samples = samples.filter(x => x.at > Date.now() - 5 * 60_000)
    const best = samples.reduce((a, b) => (!a || b.rtt < a.rtt ? b : a), null)
    if (best) setTimeOffset(best.offset)
  }
  syncTime(6)
  poll()
  const timeTimer = setInterval(() => syncTime(3), 30_000)
  const onVisible = () => { if (document.visibilityState === 'visible') syncTime(3) }
  document.addEventListener('visibilitychange', onVisible)

  return {
    get: () => state,
    getAccess: access,
    subscribe(fn) { listeners.add(fn); if (state) fn(state, access()); return () => listeners.delete(fn) },
    // a controller opened through the link: show the change at once, send the changed parts (coalesced ~80 ms)
    set(next) {
      const cur = state || {}
      for (const k of new Set([...Object.keys(cur), ...Object.keys(next)])) {
        if (k === 'updatedAt' || same(cur[k], next[k])) continue
        local[k] = next[k]
        dirty.add(k)
      }
      state = next
      emit()
      if (dirty.size && !sendTimer) sendTimer = setTimeout(send, 80)
    },
    destroy() { stopped = true; clearInterval(timeTimer); document.removeEventListener('visibilitychange', onVisible) },
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
  // desktop app: hand every state to the online link (only the control window has this, see desktop/preload.cjs)
  const publish = () => { try { window.desktop?.publishState?.(gameId, state) } catch {} }
  // ...and take changes made on controllers opened through the online link: the parts they changed,
  // merged into this game (newest wins, whatever the phone's clock says)
  const offRemote = window.desktop?.onRemoteState?.((id, patch) => {
    if (id !== gameId || !patch || typeof patch !== 'object') return
    const { updatedAt: _, ...parts } = patch
    api.set({ ...state, ...parts, updatedAt: Math.max(Date.now(), (state?.updatedAt || 0) + 1) })
  })
  const emit = () => { listeners.forEach(fn => fn(state, 'ok')); publish() }
  publish()

  const onMsg = e => {
    if (e.data && (!state || e.data.updatedAt >= state.updatedAt)) { state = e.data; emit() }
  }
  bc?.addEventListener('message', onMsg)
  const onStorage = e => { if (e.key === key && e.newValue) { try { onMsg({ data: JSON.parse(e.newValue) }) } catch {} } }
  window.addEventListener('storage', onStorage)

  const api = {
    get: () => state,
    getAccess: () => 'ok',
    subscribe(fn) { listeners.add(fn); fn(state, 'ok'); return () => listeners.delete(fn) },
    set(next) {
      state = next
      emit()
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      bc?.postMessage(next)
    },
    destroy() { bc?.close(); window.removeEventListener('storage', onStorage); offRemote?.() },
  }
  return api
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
