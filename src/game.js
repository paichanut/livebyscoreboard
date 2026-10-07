// Pure game-state model + logic. No React, no network.

export const PERIODS = ['1', '2', '3', 'OT', 'SO']
export const MIN = 60_000

export function newGame(overrides = {}) {
  return {
    v: 1,
    home: { name: 'HOME', score: 0, shots: 0, color: '#e63946' },
    away: { name: 'AWAY', score: 0, shots: 0, color: '#3a86ff' },
    period: '1',
    periodLengthMs: 15 * MIN,
    skaters: 5, // 5 for full ice, 3 for 3-on-3
    theme: 'dark', // dark | light | led | ice
    clock: { remainingMs: 15 * MIN, running: false, since: null },
    // penalties: remaining is derived from the game clock so both devices tick identically
    penalties: [], // { id, team, player, durationMs, clockAtStart }
    horn: 0, // bump to make the display play the horn
    timeout: null, // { team, durationMs, since }
    goalFlash: null, // { team, at }
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function clockRemaining(state, now = Date.now()) {
  const c = state.clock
  if (!c.running || c.since == null) return c.remainingMs
  return Math.max(0, c.remainingMs - (now - c.since))
}

export function penaltyRemaining(state, p, now = Date.now()) {
  const elapsed = p.clockAtStart - clockRemaining(state, now)
  return Math.max(0, p.durationMs - elapsed)
}

export function activePenalties(state, team, now = Date.now()) {
  return state.penalties.filter(p => p.team === team && penaltyRemaining(state, p, now) > 0)
}

// Skaters per side. Never below 3; in 3-on-3 a penalty gives the other side a 4v3.
export function skaters(state, now = Date.now()) {
  const nH = Math.min(activePenalties(state, 'home', now).length, 2)
  const nA = Math.min(activePenalties(state, 'away', now).length, 2)
  let h = state.skaters - nH
  let a = state.skaters - nA
  const lift = Math.max(0, 3 - Math.min(h, a))
  return { home: h + lift, away: a + lift }
}

export function skatersOnIce(state, team, now = Date.now()) {
  return skaters(state, now)[team]
}

export function strengthLabel(state, now = Date.now()) {
  const { home: h, away: a } = skaters(state, now)
  if (h === a && h === state.skaters) return ''
  return `${h}v${a}`
}

export function fmtClock(ms, { tenths = true } = {}) {
  ms = Math.max(0, ms)
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (ms < MIN && tenths) {
    const t = Math.floor((ms % 1000) / 100)
    return `${s}.${t}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---- mutations (each returns a new state) ----

const touch = s => ({ ...s, updatedAt: Date.now() })

export function startClock(s) {
  if (s.clock.running) return s
  if (clockRemaining(s) <= 0) return s
  return touch({ ...s, timeout: null, clock: { ...s.clock, running: true, since: Date.now() } })
}

export function stopClock(s) {
  if (!s.clock.running) return s
  const now = Date.now()
  return touch({ ...s, clock: { remainingMs: clockRemaining(s, now), running: false, since: null } })
}

export function toggleClock(s) {
  return s.clock.running ? stopClock(s) : startClock(s)
}

export function setClock(s, ms) {
  ms = Math.max(0, ms)
  const stopped = stopClock(s)
  // keep penalties' remaining time stable across a manual clock edit
  const pens = stopped.penalties.map(p => ({
    ...p,
    durationMs: penaltyRemaining(stopped, p),
    clockAtStart: ms,
  })).filter(p => p.durationMs > 0)
  return touch({ ...stopped, clock: { remainingMs: ms, running: false, since: null }, penalties: pens })
}

export function adjustClock(s, deltaMs) {
  return setClock(s, clockRemaining(s) + deltaMs)
}

export function setPeriod(s, period) {
  let len = s.periodLengthMs
  if (period === 'OT') len = 5 * MIN
  if (period === 'SO') len = 0
  const next = setClock(s, len)
  return touch({ ...next, period })
}

export function nextPeriod(s) {
  const i = PERIODS.indexOf(s.period)
  return setPeriod(s, PERIODS[Math.min(i + 1, PERIODS.length - 1)])
}

export function addScore(s, team, delta) {
  const score = Math.max(0, s[team].score + delta)
  const goalFlash = delta > 0 ? { team, at: Date.now() } : s.goalFlash
  return touch({ ...s, [team]: { ...s[team], score }, goalFlash })
}

export function timeoutRemaining(s, now = Date.now()) {
  if (!s.timeout) return 0
  return Math.max(0, s.timeout.durationMs - (now - s.timeout.since))
}

export function startTimeout(s, team, seconds) {
  const stopped = stopClock(s)
  return touch({ ...stopped, timeout: { team, durationMs: seconds * 1000, since: Date.now() } })
}

export function clearTimeout_(s) {
  return s.timeout ? touch({ ...s, timeout: null }) : s
}

export function addShot(s, team, delta) {
  const shots = Math.max(0, s[team].shots + delta)
  return touch({ ...s, [team]: { ...s[team], shots } })
}

export function setTeam(s, team, patch) {
  return touch({ ...s, [team]: { ...s[team], ...patch } })
}

export function addPenalty(s, team, player, minutes) {
  const p = {
    id: Math.random().toString(36).slice(2, 9),
    team,
    player: String(player || '').trim(),
    durationMs: minutes * MIN,
    clockAtStart: clockRemaining(s),
  }
  return touch({ ...s, penalties: [...s.penalties, p] })
}

export function removePenalty(s, id) {
  return touch({ ...s, penalties: s.penalties.filter(p => p.id !== id) })
}

export function pruneExpiredPenalties(s) {
  const alive = s.penalties.filter(p => penaltyRemaining(s, p) > 0)
  return alive.length === s.penalties.length ? s : touch({ ...s, penalties: alive })
}

export function fireHorn(s) {
  return touch({ ...s, horn: (s.horn || 0) + 1 })
}

export function setSettings(s, patch) {
  const next = { ...s, ...patch }
  if (patch.periodLengthMs != null && !s.clock.running && ['1', '2', '3'].includes(s.period)) {
    return setClock(touch(next), patch.periodLengthMs)
  }
  return touch(next)
}

export function resetGame(s) {
  return newGame({
    home: { ...s.home, score: 0, shots: 0 },
    away: { ...s.away, score: 0, shots: 0 },
    periodLengthMs: s.periodLengthMs,
    skaters: s.skaters,
    theme: s.theme,
    clock: { remainingMs: s.periodLengthMs, running: false, since: null },
  })
}
