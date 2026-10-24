// Sync layer: Supabase realtime when configured, otherwise localStorage + BroadcastChannel
// (local mode = display and control must be in the same browser).
//
// Access model: reads are public; writes need the game's operator key.
import { createClient } from '@supabase/supabase-js'
import { mergeGame } from '../desktop/merge-game.mjs'
import { newGame } from './game.js'
import { setTimeOffset, setGameSkew, setClockRunning, localNow, localDrift, useMonotonicClock } from './clock.js'
import { createTimeFilter } from './timesync.js'

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
    if (window.desktop?.listTeams) return window.desktop.listTeams()
    const r = await fetch(SHARED_TEAMS_URL)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()).map(t => ({ ...t, can_edit: false, mine: false }))
  }
  return []
}

export function watchSharedTeams(callback) {
  return DESKTOP && window.desktop?.onTeams ? window.desktop.onTeams(callback) : () => {}
}

export function refreshSharedTeams() {
  return DESKTOP && window.desktop?.refreshTeams ? window.desktop.refreshTeams() : listSharedTeams()
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
  const t0 = localNow()
  const { data, error } = await supabase.rpc('server_now')
  const t1 = localNow()
  if (!error && typeof data === 'number') return { at: t1, rtt: t1 - t0, offset: data + (t1 - t0) / 2 - t1 }
  // server_now() missing (supabase.sql not re-run): fall back to the Date header, 1 s resolution
  // (counted into rtt so the filter knows how rough it is)
  const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY }, cache: 'no-store' })
  const t2 = localNow()
  const d = Date.parse(r.headers.get('date') || '')
  if (!d) throw new Error('no server time')
  return { at: t2, rtt: t2 - t1 + 1000, offset: d + 500 + (t2 - t1) / 2 - t2 }
}

// Pai 2026-10-24: 8 round trips when the page opens, then one every 10 s (and 3 when the tab comes back or the
// internet returns); the fastest of the last 5 minutes sets the clock (timesync.js), steered by clock.js.
const timeFilter = createTimeFilter()
let timeSyncBusy = false
export async function syncServerTime(samples = 3) {
  if (timeSyncBusy) return timeFilter.best()
  timeSyncBusy = true
  try {
    for (let i = 0; i < samples; i++) {
      try {
        const best = timeFilter.add(await sampleServerTime())
        if (best) setTimeOffset(best.offset, best.rtt / 2)
      } catch (e) { console.warn('time sync failed', e) }
    }
  } finally { timeSyncBusy = false }
  return timeFilter.best()
}

// a clock that slept or was set since the last check: the old round trips no longer count
let lastDrift = null
function driftMoved() {
  const d = localDrift()
  const moved = lastDrift !== null && Math.abs(d - lastDrift) > 1000
  lastDrift = d
  if (moved) timeFilter.reset()
  return moved
}

function startTimeSync() {
  if (timeSyncTimer) return
  useMonotonicClock()
  driftMoved()
  syncServerTime(8)
  timeSyncTimer = setInterval(() => syncServerTime(driftMoved() ? 3 : 1), 10_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncServerTime(driftMoved() ? 8 : 3) })
  window.addEventListener('online', () => syncServerTime(3))
}

let atomicStatsReady=false
export async function statsSyncReady() {
  if (!ONLINE || atomicStatsReady) return true
  const {data,error}=await supabase.rpc('stats_sync_ready')
  atomicStatsReady=!error && data===true
  return atomicStatsReady
}
const syncConflict = message => window.dispatchEvent(new CustomEvent('game-sync-conflict',{detail:message}))

// ---------- Supabase ----------
function supabaseStore(gameId, { key = '', canWrite = false } = {}) {
  let state = null
  let access = 'reading'
  const listeners = new Set()
  const emit = () => { setGameSkew(state?.desktop?.skew); setClockRunning(state?.clock?.running); listeners.forEach(fn => fn(state, access)) }
  let saveTimer = null
  let pending = null
  let confirmed = null
  let saving = false

  async function load() {
    const { data, error } = await supabase.from('games').select('state').eq('id', gameId).maybeSingle()
    if (error) console.error('load failed', error)
    if (data?.state) {
      state = data.state
      confirmed = data.state
      if (canWrite) {
        const { data: ok } = await supabase.rpc('check_key', { p_id: gameId, p_key: key })
        access = ok ? 'ok' : 'locked'
      } else access = 'ok'
    } else if (canWrite && key) {
      state = newGame()
      confirmed = state
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
      if (pending || saving) {
        const merged=mergeGame(confirmed,state,incoming)
        if (!merged.conflicts.length) state=merged.state
      } else state=incoming
      // Keep the original confirmed base until pending changes have been checked by the server.
      if (!pending && !saving) confirmed=incoming
      if (access === 'missing') access = 'ok'
      emit()
    })
    .subscribe()

  load()

  async function flush() {
    saveTimer=null
    if(saving)return
    const sent=pending
    pending=null
    if(!sent)return
    saving=true
    let candidate=sent,base=confirmed
    try {
      if(await statsSyncReady()) {
        let saved=false
        for(let attempt=0;attempt<5;attempt++) {
          const {data,error}=await supabase.rpc('save_game_checked',{p_id:gameId,p_key:key,p_base:base,p_state:candidate})
          if(error)throw error
          if(data?.error){access='locked';emit();return}
          if(data?.ok){confirmed=data.state;saved=true;break}
          if(!data?.state)throw Error('Could not confirm the game update.')
          const merged=mergeGame(base,candidate,data.state)
          if(merged.conflicts.length){confirmed=data.state;state=data.state;pending=null;emit();syncConflict('Another operator changed the same details. Your conflicting update was not saved. Review the latest event and try again.');return}
          base=data.state;candidate=merged.state
        }
        if(!saved)throw Error('The game is busy. Please retry your correction.')
        const rebased=mergeGame(sent,state,confirmed)
        if(rebased.conflicts.length){state=confirmed;pending=null;syncConflict('Overlapping edits were not saved. Review the latest game details.')}else{state=rebased.state;if(pending)pending=state}
        emit()
      } else {
        const {data,error}=await supabase.rpc('save_game',{p_id:gameId,p_key:key,p_state:sent})
        if(error)throw error
        if(data===false){access='locked';emit()}else confirmed=sent
      }
    }catch(error){state=confirmed;pending=null;emit();syncConflict('Game update could not be saved. Check your connection and retry.');console.error('save failed',error)}
    finally{saving=false;if(pending&&!saveTimer)saveTimer=setTimeout(flush,0)}
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
  const bases = {}
  const local = {} // parts changed here that the desktop has not confirmed yet
  const dirty = new Set() // ...and not sent yet
  let state = null
  let stopped = false
  let sendTimer = null
  let sending = false
  const listeners = new Set()
  const access = () => (state ? 'ok' : 'reading')
  const emit = () => { setClockRunning(state?.clock?.running); listeners.forEach(fn => fn(state, access())) }
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
  // newer = a higher number from the same start of the desktop app (`boot`); a restarted app counts from 1 again
  let boot = ''
  const newer = m => m?.state && (m.boot !== boot || m.seq > seq)
  const take = m => { if (newer(m)) { boot = m.boot; seq = m.seq; server = m.state; preload(server) } }

  async function send() {
    sendTimer = null
    if (sending || !dirty.size) return
    const base = Object.fromEntries([...dirty].map(k=>[k,bases[k] ?? server?.[k]]))
    const patch = {}
    for (const k of dirty) patch[k] = k in local ? local[k] ?? null : server?.[k] ?? null
    dirty.clear()
    sending = true
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch, base }) })
      if(r.status===409){
        for(const k of Object.keys(patch)){delete local[k];delete bases[k];dirty.delete(k)}
        const latest=await fetch(`${api}?v=0&b=`).then(r=>r.json());take(latest);rebuild()
        syncConflict('Another operator changed these details. Your correction was not saved. Review the latest event and try again.');return
      }
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
        const r = await fetch(`${api}?v=${seq}&b=${boot}`, { cache: 'no-store' })
        const m = await r.json()
        if (newer(m)) { take(m); rebuild() }
      } catch {
        await new Promise(res => setTimeout(res, 2000))
      }
    }
  }

  // clock offset: 8 quick round trips now, then one every 10 s; the fastest of the last 5 minutes wins (timesync.js)
  const timeFilter = createTimeFilter()
  let lastDrift = localDrift()
  async function syncTime(n) {
    const d = localDrift()
    if (Math.abs(d - lastDrift) > 1000) { timeFilter.reset(); n = Math.max(n, 3) }
    lastDrift = d
    for (let i = 0; i < n && !stopped; i++) {
      try {
        const t0 = localNow()
        const m = await (await fetch('/api/time', { cache: 'no-store' })).json()
        const t1 = localNow()
        if (typeof m.now !== 'number') continue
        const best = timeFilter.add({ at: t1, rtt: t1 - t0, offset: m.now + (t1 - t0) / 2 - t1 })
        if (best) setTimeOffset(best.offset, best.rtt / 2)
      } catch {}
    }
  }
  useMonotonicClock()
  syncTime(8)
  poll()
  const timeTimer = setInterval(() => syncTime(1), 10_000)
  const onVisible = () => { if (document.visibilityState === 'visible') syncTime(3) }
  document.addEventListener('visibilitychange', onVisible)

  return {
    get: () => state,
    getAccess: access,
    subscribe(fn) { listeners.add(fn); if (state) fn(state, access()); return () => listeners.delete(fn) },
    // a controller opened through the link: show the change at once and send the changed parts right away
    // (a STOP must reach every screen within half a second); taps made while a send is on its way go together next
    set(next) {
      const cur = state || {}
      for (const k of new Set([...Object.keys(cur), ...Object.keys(next)])) {
        if (k === 'updatedAt' || same(cur[k], next[k])) continue
        if(!dirty.has(k))bases[k]=cur[k]
        local[k] = next[k]
        dirty.add(k)
      }
      state = next
      emit()
      if (dirty.size && !sendTimer && !sending) send()
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
  const offRemote = window.desktop?.onRemoteState?.((id, patch, metadata) => {
    if (id !== gameId || !patch || typeof patch !== 'object') return
    let { updatedAt: _, ...parts } = patch
    if(metadata?.base){
      const current=Object.fromEntries(Object.keys(parts).map(k=>[k,state[k]]))
      const merged=mergeGame(metadata.base,parts,current)
      if(merged.conflicts.length){window.desktop?.rejectRemote?.(id,metadata.requestId);syncConflict('A remote correction overlapped another update and was not saved.');return}
      parts=merged.state
    }
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
    get: () => {try{const latest=JSON.parse(localStorage.getItem(key));if(latest&&latest.updatedAt>=state.updatedAt)state=latest}catch{}return state},
    getAccess: () => 'ok',
    subscribe(fn) { listeners.add(fn); fn(state, 'ok'); return () => listeners.delete(fn) },
    set(next) {
      state = next
      bc?.postMessage(next) // the other windows (the HDMI scoreboard) first: a STOP shows there at once
      emit()
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
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
