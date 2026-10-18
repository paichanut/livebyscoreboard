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
    penalties: [], // { id, team, player, minutes, kind, durationMs, elapsedMs } — elapsedMs as of penFoldAt
    showTimeOfDay: false, // M key: the display shows the time of day instead of the period clock
    playLive: true, // the whistle: false pauses penalty clocks while the game clock may keep running
    penFoldAt: null, // when penalties' elapsedMs was last brought up to date
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
  if (state.period === 'OT') return (Number(state.opts?.otMinutes) || 5) * MIN
  if (state.period === 'SO') return 0
  return state.periodLengthMs
}

// ---- penalties (IIHF; rules from the standalone-scoreboard brief) ----
// A penalty counts REAL elapsed time while play is live: live = clock running && playLive (the whistle).
// It does not follow the game clock, so correcting the clock never moves a penalty.
// At most two penalties per side run at once (Rule 26.1); later ones wait and start when a slot frees.
// Misconducts (10:00) run whenever play is live, take no slot and don't change strength.
// Stored per penalty: elapsedMs, correct as of s.penFoldAt. Everything else is derived here, so every
// screen computes the same thing from the same stored state.
export function penaltyKind(minutes) {
  if (minutes === 2) return 'minor'
  if (minutes === 4) return 'double'
  if (minutes === 10) return 'misconduct'
  if (minutes === 5) return 'major'
  return minutes < 5 ? 'minor' : 'major'
}
const kindOf = p => p.kind || penaltyKind(Math.round(p.durationMs / MIN))

export function isLive(s) {
  return Boolean(s.clock.running && s.playLive !== false)
}

// Live time since the last fold. Live time stops when the game clock reaches 0, even if nobody pressed stop yet.
function liveBudget(s, now) {
  if (!isLive(s) || s.clock.since == null) return 0
  const end = Math.min(now, s.clock.since + s.clock.remainingMs)
  return Math.max(0, end - (s.penFoldAt ?? s.clock.since))
}

// Penalties that take one of the two slots and reduce strength (minor, double minor, major).
// Coincidental penalties (RB 19.1: they cancel out, only the difference goes on the clock), misconducts
// and game misconducts never take a slot, never change strength and are not shown on the display.
const takesSlot = p => !p.coincidental && ['minor', 'double', 'major'].includes(kindOf(p))
// Shown on the display's penalty clocks
export const onPenaltyClock = p => takesSlot(p)

// { [id]: { remainingMs, status: 'running' | 'waiting' | 'done' | 'game' } }
export function penaltyView(s, now = wallNow()) {
  const budget = liveBudget(s, now)
  const out = {}
  for (const team of ['home', 'away']) {
    const list = (s.penalties || []).filter(p => p.team === team)
    // slot penalties: spend the live time on the (at most two) running ones; when one ends, the next starts
    const endAt = {} // live-time offset at which a slot penalty ended (Infinity = still going)
    let pending = list.filter(takesSlot).map(p => ({ id: p.id, rem: Math.max(0, p.durationMs - (p.elapsedMs || 0)) }))
    for (const x of pending) if (x.rem <= 0) { out[x.id] = { remainingMs: 0, status: 'done' }; endAt[x.id] = 0 }
    pending = pending.filter(x => x.rem > 0)
    let b = budget
    let used = 0
    while (b > 0 && pending.length) {
      const running = pending.slice(0, 2)
      const step = Math.min(...running.map(x => x.rem))
      if (step > b) { running.forEach(x => { x.rem -= b }); used += b; b = 0; break }
      running.forEach(x => { x.rem -= step })
      used += step
      b -= step
      for (const x of running) if (x.rem <= 0) { out[x.id] = { remainingMs: 0, status: 'done' }; endAt[x.id] = used }
      pending = pending.filter(x => x.rem > 0)
    }
    pending.forEach((x, i) => { out[x.id] = { remainingMs: x.rem, status: i < 2 ? 'running' : 'waiting' }; endAt[x.id] = Infinity })
    // everything else runs on its own
    for (const p of list) {
      if (takesSlot(p)) continue
      if (kindOf(p) === 'game') { out[p.id] = { remainingMs: 0, status: 'game' }; continue }
      // a misconduct starts only when the same player's other penalties are over (RB 22.3)
      let start = 0
      if (kindOf(p) === 'misconduct' && p.player) {
        for (const q of list) if (takesSlot(q) && q.player === p.player) start = Math.max(start, endAt[q.id] ?? 0)
      }
      const run = start === Infinity ? 0 : Math.max(0, budget - start)
      const rem = Math.max(0, p.durationMs - (p.elapsedMs || 0) - run)
      out[p.id] = { remainingMs: rem, status: rem <= 0 ? 'done' : start === Infinity ? 'waiting' : 'running' }
    }
  }
  return out
}

export function penaltyRemaining(state, p, now = wallNow()) {
  return penaltyView(state, now)[p.id]?.remainingMs ?? 0
}

export function penaltyStatus(state, p, now = wallNow()) {
  return penaltyView(state, now)[p.id]?.status ?? 'done'
}

// Penalty clocks shown on the display right now
export function activePenalties(state, team, now = wallNow()) {
  const v = penaltyView(state, now)
  return state.penalties.filter(p => p.team === team && onPenaltyClock(p) && v[p.id]?.status === 'running')
}

// Shown on the display as "+N"
export function waitingPenalties(state, team, now = wallNow()) {
  const v = penaltyView(state, now)
  return state.penalties.filter(p => p.team === team && onPenaltyClock(p) && v[p.id]?.status === 'waiting')
}

// Every penalty still to serve, in order (control page list)
export function teamPenalties(state, team, now = wallNow()) {
  const v = penaltyView(state, now)
  return state.penalties.filter(p => p.team === team && v[p.id] && v[p.id].status !== 'done')
    .map(p => ({ ...p, kind: kindOf(p), remainingMs: v[p.id].remainingMs, status: v[p.id].status }))
}

export function skaters(state, now = wallNow()) {
  const v = penaltyView(state, now)
  const down = team => state.penalties.filter(p => p.team === team && takesSlot(p) && v[p.id]?.status === 'running').length
  let h = state.skaters - down('home')
  let a = state.skaters - down('away')
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

// Bring every penalty's elapsedMs up to `now` and drop finished ones. Call before anything that
// changes whether play is live, or changes the penalty list.
export function foldPenalties(s, now = wallNow()) {
  const v = penaltyView(s, now)
  const penalties = (s.penalties || []).filter(p => v[p.id] && v[p.id].status !== 'done')
    .map(p => ({ ...p, kind: kindOf(p), elapsedMs: p.durationMs - v[p.id].remainingMs }))
  return { ...s, penalties, penFoldAt: now }
}

// startClock = faceoff: the clock starts and play is live. { penalties: false } starts only the
// period clock and leaves the penalty clocks as they are (PC Scoreboards "Start period time").
export function startClock(s, { penalties = true } = {}) {
  if (s.clock.running) return s
  if (clockRemaining(s) <= 0) return s
  const now = wallNow()
  const playLive = penalties ? true : s.playLive !== false
  return touch({ ...foldPenalties(s, now), timeout: null, playLive, clock: { ...s.clock, running: true, since: now } })
}

export function stopClock(s) {
  if (!s.clock.running) return s
  const now = wallNow()
  return touch({ ...foldPenalties(s, now), clock: { remainingMs: clockRemaining(s, now), running: false, since: null } })
}

// The whistle: pause or resume penalty clocks without touching the game clock
export function toggleWhistle(s) {
  return setPlayLive(s, s.playLive === false)
}

export function setPlayLive(s, live) {
  if ((s.playLive !== false) === live) return s
  return touch({ ...foldPenalties(s), playLive: live })
}

export function removeLastPenalty(s) {
  const v = penaltyView(s)
  const open = s.penalties.filter(p => v[p.id] && v[p.id].status !== 'done' && v[p.id].status !== 'game')
  return open.length ? removePenalty(s, open[open.length - 1].id) : s
}

// Goal light by hand (PC Scoreboards Left / Right / F8): on for a team without changing the score, or off
export function setGoalLight(s, team) {
  return touch({ ...s, goalFlash: team ? { team, at: wallNow() } : null })
}

export function toggleTimeOfDay(s) {
  return touch({ ...s, showTimeOfDay: !s.showTimeOfDay })
}

export function fmtTimeOfDay(ms = wallNow()) {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function toggleClock(s) {
  return s.clock.running ? stopClock(s) : startClock(s)
}

// Setting or nudging the game clock never moves a penalty (they count real time)
export function setClock(s, ms) {
  ms = Math.max(0, ms)
  const stopped = stopClock(s)
  return touch({ ...stopped, clock: { remainingMs: ms, running: false, since: null } })
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

// Rule 16.2: a goal by the side with more skaters ends the scored-against side's running minor with
// the least time left (a double minor loses only its current 2:00 portion). Never a major or misconduct,
// never on a penalty-shot goal. Undoing a goal (−1) does not bring the penalty back.
export function releaseOnGoal(s, team, now = wallNow()) {
  const opp = team === 'home' ? 'away' : 'home'
  const f = foldPenalties(s, now)
  const sk = skaters(f, now)
  if (sk[team] <= sk[opp]) return f
  const v = penaltyView(f, now)
  const cands = f.penalties.filter(p => p.team === opp && takesSlot(p) && ['minor', 'double'].includes(kindOf(p)) && v[p.id]?.status === 'running')
  if (!cands.length) return f
  const target = cands.reduce((a, b) => (v[b.id].remainingMs < v[a.id].remainingMs ? b : a))
  const rem = v[target.id].remainingMs
  if (kindOf(target) === 'double' && rem > 2 * MIN) {
    return { ...f, penalties: f.penalties.map(p => (p.id === target.id ? { ...p, elapsedMs: p.durationMs - 2 * MIN } : p)) }
  }
  return { ...f, penalties: f.penalties.filter(p => p.id !== target.id) }
}

export function addScore(s, team, delta, { penaltyShot = false } = {}) {
  const score = Math.max(0, s[team].score + delta)
  const goalFlash = delta > 0 ? { team, at: wallNow() } : s.goalFlash
  const base = delta > 0 && !penaltyShot ? releaseOnGoal(s, team) : s
  let next = { ...base, [team]: { ...s[team], score }, goalFlash }
  if (delta > 0) next = logEvent(next, 'goal', penaltyShot ? { team, penaltyShot: true } : { team })
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

// opts.kind 'game' = game misconduct (rest of the game, 20 min in the records, no clock).
// opts.coincidental = cancels against the other team's equal penalty: tracked, but not on the display
// and no change in strength (RB 19.1).
export function addPenalty(s, team, player, minutes, infraction = '', { kind, coincidental = false } = {}) {
  const f = foldPenalties(s)
  const game = kind === 'game'
  const p = {
    id: Math.random().toString(36).slice(2, 9),
    team,
    player: String(player || '').trim(),
    infraction: String(infraction || '').trim(),
    minutes: game ? 20 : minutes,
    kind: game ? 'game' : penaltyKind(minutes),
    durationMs: game ? 0 : minutes * MIN,
    elapsedMs: 0,
    ...(coincidental && !game ? { coincidental: true } : {}),
  }
  return touch(logEvent({ ...f, penalties: [...f.penalties, p] }, 'penalty', {
    team, player: p.player, minutes: p.minutes, infraction: p.infraction, penaltyId: p.id, kind: p.kind, ...(p.coincidental ? { coincidental: true } : {}),
  }))
}

export function removePenalty(s, id) {
  const f = foldPenalties(s)
  const p = f.penalties.find(x => x.id === id)
  let next = { ...f, penalties: f.penalties.filter(x => x.id !== id) }
  // a penalty removed before it ran at all was a mistake: drop it from the log too
  if (p && !p.elapsedMs) next = dropLastEvent(next, e => e.type === 'penalty' && e.penaltyId === id)
  return touch(next)
}

// Fix a penalty after the fact: player, infraction, or length (time already served is kept)
export function editPenalty(s, id, { player, minutes, infraction, kind, coincidental }) {
  const f = foldPenalties(s)
  return touch({
    ...f,
    penalties: f.penalties.map(p => {
      if (p.id !== id) return p
      // kind: 'game' | 'auto' (from minutes) | undefined (keep)
      const game = kind === 'game' || (kind == null && minutes == null && p.kind === 'game')
      const durationMs = game ? 0 : minutes != null ? minutes * MIN : p.durationMs
      const next = {
        ...p,
        player: player != null ? String(player).trim() : p.player,
        infraction: infraction != null ? String(infraction).trim() : p.infraction,
        minutes: game ? 20 : minutes ?? p.minutes,
        kind: game ? 'game' : minutes != null ? penaltyKind(minutes) : p.kind,
        durationMs,
        elapsedMs: Math.min(p.elapsedMs, durationMs),
      }
      if (coincidental != null) { if (coincidental && !game) next.coincidental = true; else delete next.coincidental }
      return next
    }),
  })
}

// ±1 s / ±5 s on one penalty, to match the rink's official board. +deltaMs = more time to serve.
export function nudgePenalty(s, id, deltaMs) {
  const f = foldPenalties(s)
  return touch({
    ...f,
    penalties: f.penalties.map(p => (p.id === id ? { ...p, elapsedMs: Math.min(p.durationMs, Math.max(0, p.elapsedMs - deltaMs)) } : p)),
  })
}

export function pruneExpiredPenalties(s) {
  const v = penaltyView(s)
  return s.penalties.some(p => !v[p.id] || v[p.id].status === 'done') ? touch(foldPenalties(s)) : s
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
    if (e.type === 'penalty') detail = `${e.player ? `#${e.player} ` : ''}${e.kind === 'game' ? 'game misconduct' : `${e.minutes} min`}${e.infraction ? ` ${e.infraction}` : ''}${e.coincidental ? ' (coincidental)' : ''}`
    else if (e.type === 'goal' && e.penaltyShot) detail = 'penalty shot'
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
