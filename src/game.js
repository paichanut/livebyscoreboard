// Pure game-state model + logic. No React, no network.
import { defaultOptions } from './options.js'

export const MIN = 60_000

export function periodList(state) {
  const n = Math.max(1, Math.min(9, Number(state?.opts?.periods) || 3))
  const list = []
  for (let i = 1; i <= n; i++) list.push(String(i))
  list.push('OT', 'SO')
  return list
}

export function periodLabel(state) {
  const p = state.period
  if (p === 'OT') return state.opts?.otLabel || 'OT'
  if (p === 'SO') return 'SO'
  return p
}

export function newGame(overrides = {}) {
  return {
    v: 2,
    home: { name: 'HOME', score: 0, shots: 0, color: '#e63946' },
    away: { name: 'AWAY', score: 0, shots: 0, color: '#3a86ff' },
    period: '1',
    periodLengthMs: 15 * MIN,
    skaters: 5,
    theme: 'dark',
    clock: { remainingMs: 15 * MIN, running: false, since: null },
    penalties: [], // { id, team, player, durationMs, clockAtStart }
    horn: 0,
    buzzer: 0,
    timeout: null, // { team, durationMs, since }
    goalFlash: null, // { team, at }
    opts: defaultOptions(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function clockRemaining(state, now = Date.now()) {
  const c = state.clock
  if (!c.running || c.since == null) return c.remainingMs
  return Math.max(0, c.remainingMs - (now - c.since))
}

// What the display shows: remaining (count-down) or elapsed (count-up)
export function clockShown(state, now = Date.now()) {
  const rem = clockRemaining(state, now)
  if (state.opts?.clockDir === 'up') return Math.max(0, periodLength(state) - rem)
  return rem
}

export function periodLength(state) {
  if (state.period === 'OT') return 5 * MIN
  if (state.period === 'SO') return 0
  return state.periodLengthMs
}

export function penaltyRemaining(state, p, now = Date.now()) {
  const elapsed = p.clockAtStart - clockRemaining(state, now)
  return Math.max(0, p.durationMs - elapsed)
}

export function activePenalties(state, team, now = Date.now()) {
  return state.penalties.filter(p => p.team === team && penaltyRemaining(state, p, now) > 0)
}

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

export function timeoutRemaining(s, now = Date.now()) {
  if (!s.timeout) return 0
  return Math.max(0, s.timeout.durationMs - (now - s.timeout.since))
}

export function goalFlashActive(s, now = Date.now()) {
  if (!s.goalFlash || !s.opts?.goalIndicator) return null
  const offMs = (s.opts.goalOffSec ?? 15) * 1000
  return now - s.goalFlash.at < offMs ? s.goalFlash.team : null
}

// ---- mutations ----
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

export function resetClock(s) {
  return setClock(s, periodLength(s))
}

export function setPeriod(s, period) {
  const next = { ...s, period }
  return touch(setClock(next, periodLength(next)))
}

export function nextPeriod(s) {
  const list = periodList(s)
  const i = list.indexOf(s.period)
  return setPeriod(s, list[Math.min(i + 1, list.length - 1)])
}

export function prevPeriod(s) {
  const list = periodList(s)
  const i = list.indexOf(s.period)
  return setPeriod(s, list[Math.max(i - 1, 0)])
}

export function addScore(s, team, delta) {
  const score = Math.max(0, s[team].score + delta)
  const goalFlash = delta > 0 ? { team, at: Date.now() } : s.goalFlash
  return touch({ ...s, [team]: { ...s[team], score }, goalFlash })
}

export function clearGoalFlash(s) {
  return s.goalFlash ? touch({ ...s, goalFlash: null }) : s
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

export function fireBuzzer(s) {
  return touch({ ...s, buzzer: (s.buzzer || 0) + 1 })
}

export function startTimeout(s, team, seconds) {
  const stopped = stopClock(s)
  return touch({ ...stopped, timeout: { team, durationMs: seconds * 1000, since: Date.now() } })
}

export function clearTimeout_(s) {
  return s.timeout ? touch({ ...s, timeout: null }) : s
}

export function setSettings(s, patch) {
  const next = { ...s, ...patch }
  if (patch.periodLengthMs != null && !s.clock.running && !['OT', 'SO'].includes(s.period)) {
    return setClock(touch(next), patch.periodLengthMs)
  }
  return touch(next)
}

export function setOptions(s, opts) {
  return touch({ ...s, opts })
}

export function resetGame(s) {
  return newGame({
    home: { ...s.home, score: 0, shots: 0 },
    away: { ...s.away, score: 0, shots: 0 },
    periodLengthMs: s.periodLengthMs,
    skaters: s.skaters,
    theme: s.theme,
    opts: s.opts,
    clock: { remainingMs: s.periodLengthMs, running: false, since: null },
  })
}
