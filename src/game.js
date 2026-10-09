// Pure game-state model + logic. No React, no network.
import { defaultOptions } from './options.js'
import { now as wallNow } from './clock.js'

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
    events: [], // game log, see logEvent(): { id, t, type, team, period, clockMs, periodMs, player?, minutes?, seconds? }
    shootout: { home: [], away: [] }, // 'goal' | 'miss' per attempt
    opts: defaultOptions(),
    updatedAt: wallNow(),
    ...overrides,
  }
}

export function clockRemaining(state, now = wallNow()) {
  const c = state.clock
  if (!c.running || c.since == null) return c.remainingMs
  return Math.max(0, c.remainingMs - (now - c.since))
}

// What the display shows: remaining (count-down) or elapsed (count-up)
export function clockShown(state, now = wallNow()) {
  const rem = clockRemaining(state, now)
  if (state.opts?.clockDir === 'up') return Math.max(0, periodLength(state) - rem)
  return rem
}

export function periodLength(state) {
  if (state.period === 'OT') return 5 * MIN
  if (state.period === 'SO') return 0
  return state.periodLengthMs
}

export function penaltyRemaining(state, p, now = wallNow()) {
  const elapsed = p.clockAtStart - clockRemaining(state, now)
  return Math.max(0, p.durationMs - elapsed)
}

export function activePenalties(state, team, now = wallNow()) {
  return state.penalties.filter(p => p.team === team && penaltyRemaining(state, p, now) > 0)
}

export function skaters(state, now = wallNow()) {
  const nH = Math.min(activePenalties(state, 'home', now).length, 2)
  const nA = Math.min(activePenalties(state, 'away', now).length, 2)
  let h = state.skaters - nH
  let a = state.skaters - nA
  const lift = Math.max(0, 3 - Math.min(h, a))
  return { home: h + lift, away: a + lift }
}

export function skatersOnIce(state, team, now = wallNow()) {
  return skaters(state, now)[team]
}

export function strengthLabel(state, now = wallNow()) {
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

export function timeoutRemaining(s, now = wallNow()) {
  if (!s.timeout) return 0
  return Math.max(0, s.timeout.durationMs - (now - s.timeout.since))
}

export function goalFlashActive(s, now = wallNow()) {
  if (!s.goalFlash || !s.opts?.goalIndicator) return null
  const offMs = (s.opts.goalOffSec ?? 15) * 1000
  return now - s.goalFlash.at < offMs ? s.goalFlash.team : null
}

// ---- game log ----
const MAX_EVENTS = 400
const uid = () => Math.random().toString(36).slice(2, 9)

// Append an entry to the game log, stamped with period and game clock.
export function logEvent(s, type, data = {}) {
  const e = { id: uid(), t: wallNow(), type, period: s.period, clockMs: clockRemaining(s), periodMs: periodLength(s), ...data }
  const events = [...(s.events || []), e]
  return { ...s, events: events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events }
}

function dropLastEvent(s, pred) {
  const events = s.events || []
  for (let i = events.length - 1; i >= 0; i--) {
    if (pred(events[i])) return { ...s, events: [...events.slice(0, i), ...events.slice(i + 1)] }
  }
  return s
}

// ---- mutations ----
const touch = s => ({ ...s, updatedAt: wallNow() })

export function startClock(s) {
  if (s.clock.running) return s
  if (clockRemaining(s) <= 0) return s
  return touch({ ...s, timeout: null, clock: { ...s.clock, running: true, since: wallNow() } })
}

export function stopClock(s) {
  if (!s.clock.running) return s
  const now = wallNow()
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
  const goalFlash = delta > 0 ? { team, at: wallNow() } : s.goalFlash
  let next = { ...s, [team]: { ...s[team], score }, goalFlash }
  if (delta > 0) next = logEvent(next, 'goal', { team })
  else if (score !== s[team].score) next = dropLastEvent(next, e => e.type === 'goal' && e.team === team) // undo a mistaken goal
  return touch(next)
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
  return touch(logEvent({ ...s, penalties: [...s.penalties, p] }, 'penalty', { team, player: p.player, minutes, penaltyId: p.id }))
}

export function removePenalty(s, id) {
  const p = s.penalties.find(x => x.id === id)
  let next = { ...s, penalties: s.penalties.filter(p => p.id !== id) }
  // a penalty removed before it ran at all was a mistake: drop it from the log too
  if (p && penaltyRemaining(s, p) >= p.durationMs) next = dropLastEvent(next, e => e.type === 'penalty' && e.penaltyId === id)
  return touch(next)
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
  return touch(logEvent({ ...stopped, timeout: { team, durationMs: seconds * 1000, since: wallNow() } }, 'timeout', { team, seconds }))
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

// ---- shootout ----
// Attempts are recorded per team as 'goal' | 'miss'. The winning goal is NOT added to the score
// automatically: when the shootout is decided the operator taps + GOAL for the winner, as on a rink board.
export function soAttempt(s, team, scored) {
  const so = s.shootout || { home: [], away: [] }
  const list = [...(so[team] || []), scored ? 'goal' : 'miss']
  return touch(logEvent({ ...s, shootout: { ...so, [team]: list } }, 'so', { team, scored: Boolean(scored), attempt: list.length }))
}

export function soUndo(s, team) {
  const so = s.shootout || { home: [], away: [] }
  const list = so[team] || []
  if (!list.length) return s
  return touch(dropLastEvent({ ...s, shootout: { ...so, [team]: list.slice(0, -1) } }, e => e.type === 'so' && e.team === team))
}

export function soClear(s) {
  return touch({ ...s, shootout: { home: [], away: [] }, events: (s.events || []).filter(e => e.type !== 'so') })
}

export function soGoals(s, team) {
  return ((s.shootout || {})[team] || []).filter(a => a === 'goal').length
}

// ---- game summary (export) ----
function fmtEventClock(e, clockDir) {
  const ms = clockDir === 'up' ? Math.max(0, (e.periodMs ?? 0) - (e.clockMs ?? 0)) : (e.clockMs ?? 0)
  return fmtClock(ms, { tenths: false })
}

function periodTitle(s, p) {
  if (p === 'OT') return s.opts?.otLabel || 'OT'
  if (p === 'SO') return 'SO'
  return `${s.opts?.labels?.period || 'Period'} ${p}`
}

// Rows for the summary: [{ period, time, type, team, teamName, detail, home, away }] in game order, with the running score.
export function summaryRows(s) {
  const rows = []
  let h = 0, a = 0
  for (const e of s.events || []) {
    if (e.type === 'goal') e.team === 'home' ? h++ : a++
    const name = s[e.team]?.name || e.team?.toUpperCase() || ''
    let detail = ''
    if (e.type === 'penalty') detail = `${e.player ? `#${e.player} ` : ''}${e.minutes} min`
    else if (e.type === 'timeout') detail = `${e.seconds} s`
    else if (e.type === 'so') detail = `attempt ${e.attempt} ${e.scored ? 'goal' : 'miss'}`
    rows.push({ period: e.period, time: fmtEventClock(e, s.opts?.clockDir), type: e.type, team: e.team, teamName: name, detail, home: h, away: a, player: e.player || '', minutes: e.minutes ?? '' })
  }
  return rows
}

export function summaryText(s) {
  const L = s.opts?.labels || {}
  const out = []
  if (s.opts?.title) out.push(s.opts.title)
  out.push(`${s.home.name} ${s.home.score} - ${s.away.score} ${s.away.name}`)
  out.push(`${L.shots || 'SHOTS'}: ${s.home.name} ${s.home.shots} - ${s.away.shots} ${s.away.name}`)
  const soH = soGoals(s, 'home'), soA = soGoals(s, 'away')
  if ((s.shootout?.home?.length || 0) + (s.shootout?.away?.length || 0) > 0) {
    const mark = l => l.map(x => (x === 'goal' ? 'O' : 'X')).join('') || '-'
    out.push(`SO: ${s.home.name} ${soH} (${mark(s.shootout.home)}) - ${soA} (${mark(s.shootout.away)}) ${s.away.name}`)
  }
  const rows = summaryRows(s)
  let cur = null
  const TYPE = { goal: (L.goal || 'GOAL').replace(/!$/, ''), penalty: L.penalty || 'PENALTY', timeout: L.timeout || 'TIMEOUT', so: 'SO' }
  for (const r of rows) {
    if (r.period !== cur) { cur = r.period; out.push('', periodTitle(s, cur)) }
    const score = r.type === 'goal' ? ` (${r.home}-${r.away})` : ''
    out.push(`  ${r.time}  ${TYPE[r.type] || r.type}  ${r.teamName}${r.detail ? ' ' + r.detail : ''}${score}`)
  }
  if (!rows.length) out.push('', '(no events)')
  return out.join('\n')
}

const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }

export function summaryCsv(s) {
  const head = ['period', 'time', 'event', 'team', 'player', 'minutes', 'detail', 'home', 'away']
  const lines = [head.join(',')]
  for (const r of summaryRows(s)) lines.push([r.period, r.time, r.type, r.teamName, r.player, r.minutes, r.detail, r.home, r.away].map(csvCell).join(','))
  return lines.join('\n')
}
