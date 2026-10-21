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

export function fmtClock(ms, { tenths = true, countdown = true } = {}) {
  // Never show an expired countdown while positive time remains. Keep the
  // existing truncation elsewhere, including the shift/game second alignment.
  ms = Math.max(0, ms)
  if (countdown && ms > 0) ms = Math.max(tenths ? 100 : 1000, ms)
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
export function logEvent(s, type, data = {}, now = wallNow()) {
  const e = { id: uid(), t: now, type, period: s.period, clockMs: clockRemaining(s, now), periodMs: periodLength(s), ...data }
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
  const ended = (s.penalties || []).filter(p => !penalties.some(q => q.id === p.id))
  return logPenaltyEnds({ ...s, penalties, penFoldAt: now }, ended, 'expired', now)
}

// Game-sheet "End" time for penalties that left the box (time served, released by a goal, removed)
function logPenaltyEnds(s, ended, reason, now = wallNow()) {
  return ended.reduce((acc, p) => logEvent(acc, 'penaltyEnd', { team: p.team, penaltyId: p.id, reason }, now), s)
}

// startClock = faceoff: the clock starts and play is live. { penalties: false } starts only the
// period clock and leaves the penalty clocks as they are (PC Scoreboards "Start period time").
export function startClock(s, { penalties = true, now = wallNow() } = {}) {
  if (s.clock.running) return s
  if (clockRemaining(s, now) <= 0) return s
  const playLive = penalties ? true : s.playLive !== false
  return touch({ ...foldAll(s, now), timeout: null, playLive, clock: { ...s.clock, running: true, since: now } })
}

export function stopClock(s, now = wallNow()) {
  if (!s.clock.running) return s
  const remainingMs = clockRemaining(s, now)
  // Tell other screens this was a real expiry, even if their local clock is a few ms behind.
  const expiredAt = remainingMs <= 0 ? s.clock.since + s.clock.remainingMs : null
  return touch({ ...foldAll(s, now), clock: { remainingMs, running: false, since: null, expiredAt } })
}

// The whistle: pause or resume penalty clocks without touching the game clock
export function toggleWhistle(s) {
  return setPlayLive(s, s.playLive === false)
}

export function setPlayLive(s, live) {
  if ((s.playLive !== false) === live) return s
  return touch({ ...foldAll(s), playLive: live })
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

// `now`: the time of the press (clock.js nowAt), so STOP keeps exactly the time showing when it was pressed
export function toggleClock(s, now = wallNow()) {
  return s.clock.running ? stopClock(s, now) : startClock(s, { now })
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
// The penalty a goal by `team` would end now: { penalty, remainingMs, partial (double minor: only the current
// 2:00 ends) }, or null (not a power-play goal, or no running minor). The control page asks before releasing it.
export function releaseCandidate(s, team, now = wallNow()) {
  const opp = team === 'home' ? 'away' : 'home'
  const sk = skaters(s, now)
  if (sk[team] <= sk[opp]) return null
  const v = penaltyView(s, now)
  const cands = (s.penalties || []).filter(p => p.team === opp && takesSlot(p) && ['minor', 'double'].includes(kindOf(p)) && v[p.id]?.status === 'running')
  if (!cands.length) return null
  const target = cands.reduce((a, b) => (v[b.id].remainingMs < v[a.id].remainingMs ? b : a))
  const remainingMs = v[target.id].remainingMs
  return { penalty: target, remainingMs, partial: kindOf(target) === 'double' && remainingMs > 2 * MIN }
}

export function releaseOnGoal(s, team, now = wallNow()) {
  const f = foldPenalties(s, now)
  const c = releaseCandidate(f, team, now)
  if (!c) return f
  const target = c.penalty
  const rem = c.remainingMs
  if (kindOf(target) === 'double' && rem > 2 * MIN) {
    return { ...f, penalties: f.penalties.map(p => (p.id === target.id ? { ...p, elapsedMs: p.durationMs - 2 * MIN } : p)) }
  }
  return logPenaltyEnds({ ...f, penalties: f.penalties.filter(p => p.id !== target.id) }, [target], 'goal', now)
}

// IIHF goal situation from the skaters on the ice when the goal was scored:
// EQ even, PP1/PP2 power play by one/two, SH1/SH2 short-handed, PS penalty shot (EN is set by hand).
export function goalSituation(s, team, { penaltyShot = false } = {}, now = wallNow()) {
  if (penaltyShot) return 'PS'
  const sk = skaters(s, now)
  const d = sk[team] - sk[team === 'home' ? 'away' : 'home']
  return d === 0 ? 'EQ' : d > 0 ? `PP${d}` : `SH${-d}`
}

// release: false keeps the penalty a power-play goal would end (the operator said no); the goal's log entry
// records what happened to it: release = { penaltyId, player, done: true | false }
export function addScore(s, team, delta, { penaltyShot = false, release = true } = {}) {
  const score = Math.max(0, s[team].score + delta)
  const goalFlash = delta > 0 ? { team, at: wallNow() } : s.goalFlash
  const situation = delta > 0 ? goalSituation(s, team, { penaltyShot }) : null
  const cand = delta > 0 && !penaltyShot ? releaseCandidate(foldPenalties(s), team) : null
  const base = cand && release ? releaseOnGoal(s, team) : s
  let next = { ...base, [team]: { ...s[team], score }, goalFlash }
  const rel = cand ? { release: { penaltyId: cand.penalty.id, player: cand.penalty.player, done: Boolean(release) } } : {}
  if (delta > 0) next = logEvent(next, 'goal', { team, situation, scorer: '', a1: '', a2: '', ...rel, ...(penaltyShot ? { penaltyShot: true } : {}) })
  else if (score !== s[team].score) next = dropLastEvent(next, e => e.type === 'goal' && e.team === team) // undo a mistaken goal
  return touch(next)
}

// Game-sheet details for a goal already logged: scorer, assists, empty net, situation
export function editGoal(s, eventId, { scorer, a1, a2, en, situation }) {
  const num = v => String(v ?? '').replace(/[^0-9]/g, '').slice(0, 3)
  return touch({
    ...s,
    events: (s.events || []).map(e => (e.id !== eventId || e.type !== 'goal' ? e : {
      ...e,
      ...(scorer != null ? { scorer: num(scorer) } : {}),
      ...(a1 != null ? { a1: num(a1) } : {}),
      ...(a2 != null ? { a2: num(a2) } : {}),
      ...(en != null ? { en: Boolean(en) } : {}),
      ...(situation ? { situation } : {}),
    })),
  })
}

// Last logged goal of a team that still has no scorer (control page prompt)
export function goalNeedingScorer(s, team) {
  const g = [...(s.events || [])].reverse().find(e => e.type === 'goal' && e.team === team)
  return g && !g.scorer ? g : null
}

export function clearGoalFlash(s) {
  return s.goalFlash ? touch({ ...s, goalFlash: null }) : s
}

// Offside: counted per team, logged (time + side, no player) and shown on the display for a few seconds
export const OFFSIDE_SHOW_MS = 15000 // Pai: like a penalty call, 15 s
export function addOffside(s, team, delta) {
  const offsides = Math.max(0, (s[team].offsides || 0) + delta)
  if (offsides === (s[team].offsides || 0)) return s
  let next = { ...s, [team]: { ...s[team], offsides } }
  if (delta > 0) next = { ...logEvent(next, 'offside', { team }), offside: { team, at: wallNow() } }
  else next = { ...dropLastEvent(next, e => e.type === 'offside' && e.team === team), offside: null }
  return touch(next)
}
export function offsideActive(s, now = wallNow()) {
  return s.offside && now - s.offside.at < OFFSIDE_SHOW_MS ? s.offside.team : null
}

// Each shot on goal goes into the game log (time + team) for the timeline; −1 takes back the last one
export function addShot(s, team, delta) {
  const shots = Math.max(0, s[team].shots + delta)
  if (shots === s[team].shots) return s
  let next = { ...s, [team]: { ...s[team], shots } }
  next = delta > 0 ? logEvent(next, 'shot', { team }) : dropLastEvent(next, e => e.type === 'shot' && e.team === team)
  return touch(next)
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
  // the display announces the call for a few seconds; a second penalty on the same player right after
  // (fighting 5 + game misconduct) joins the same announcement
  const now = wallNow()
  const prev = f.penaltyCall
  const same = prev && prev.team === team && prev.player === p.player && now - prev.at < PENALTY_JOIN_MS
  const penaltyCall = { team, player: p.player, at: same ? prev.at : now, ids: same ? [...prev.ids, p.id] : [p.id] }
  return touch(logEvent({ ...f, penalties: [...f.penalties, p], penaltyCall }, 'penalty', {
    team, player: p.player, minutes: p.minutes, infraction: p.infraction, penaltyId: p.id, kind: p.kind, ...(p.coincidental ? { coincidental: true } : {}),
  }))
}

export const PENALTY_SHOW_MS = 15000 // Pai: the penalty stays on the scoreboard for 15 s
const PENALTY_JOIN_MS = 2000

// The penalty just called, for the display: { team, player, at, text } for PENALTY_SHOW_MS after it was
// added, e.g. text "#12 HOOKING 2:00" or "#7 FIGHTING 5:00 + GM". Follows edits; gone if it was removed.
export function penaltyCallActive(s, now = wallNow()) {
  const c = s.penaltyCall
  if (!c || now - c.at >= PENALTY_SHOW_MS) return null
  const items = c.ids.map(id => s.penalties.find(p => p.id === id)).filter(Boolean)
  if (!items.length) return null
  const one = (p, first) => {
    if (kindOf(p) === 'game') return first ? (p.infraction && !/game misconduct/i.test(p.infraction) ? `${p.infraction} · GAME MISCONDUCT` : 'GAME MISCONDUCT') : 'GM'
    const time = `${p.minutes}:00`
    return first ? [p.infraction || (kindOf(p) === 'misconduct' ? 'MISCONDUCT' : ''), time].filter(Boolean).join(' ') : time
  }
  const text = [items[0].player ? `#${items[0].player}` : '', items.map((p, i) => one(p, i === 0)).join(' + ')].filter(Boolean).join(' ')
  return { team: c.team, player: c.player, at: c.at, text: text.toUpperCase() }
}

export function removePenalty(s, id) {
  const f = foldPenalties(s)
  const p = f.penalties.find(x => x.id === id)
  let next = { ...f, penalties: f.penalties.filter(x => x.id !== id) }
  // a penalty removed before it ran at all was a mistake: drop it from the log too
  if (p && !p.elapsedMs) next = dropLastEvent(next, e => e.type === 'penalty' && e.penaltyId === id)
  else if (p) next = logPenaltyEnds(next, [p], 'removed')
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
  return touch({ ...s, opts, ...(opts.smallIce && !s.rinkB ? { rinkB: newRinkB() } : {}) })
}

export function resetGame(s) {
  return newGame({
    home: { ...s.home, score: 0, shots: 0, offsides: 0 },
    away: { ...s.away, score: 0, shots: 0, offsides: 0 },
    periodLengthMs: s.periodLengthMs,
    skaters: s.skaters,
    theme: s.theme,
    opts: s.opts,
    clock: { remainingMs: s.periodLengthMs, running: false, since: null },
    ...(s.rinkB ? { rinkB: newRinkB(s.rinkB) } : {}),
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
// ---- game sheet (IIHF Game Summary style) ----
// Times are game time counted up from the start of the game, as on an IIHF game sheet
// (2nd period 3:12 = 23:12 with 20-minute periods). The shootout has no time.
const pad2 = n => String(n).padStart(2, '0')
export function fmtGameTime(ms) {
  if (ms == null) return ''
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`
}
export function eventGameTimeMs(s, e) {
  if (e.period === 'SO') return null
  const inPeriod = Math.max(0, (e.periodMs ?? 0) - (e.clockMs ?? 0))
  const regular = s.periodLengthMs || 20 * MIN
  const periods = Math.max(1, Math.min(9, Number(s.opts?.periods) || 3))
  const before = e.period === 'OT' ? periods * regular : (Number(e.period) - 1) * regular
  return before + inPeriod
}

function periodTitle(s, p) {
  if (p === 'OT') return s.opts?.otLabel || 'OT'
  if (p === 'SO') return 'SO'
  return `${s.opts?.labels?.period || 'Period'} ${p}`
}
const periodShort = (s, p) => (p === 'OT' ? s.opts?.otLabel || 'OT' : p === 'SO' ? 'SO' : `P${p}`)

// Everything the game sheet needs, in one structure (text, CSV and the printable page all use it)
export function gameSheet(s) {
  const events = s.events || []
  const used = new Set(events.map(e => e.period))
  used.add(s.period)
  const periods = periodList(s).filter(p => /^\d+$/.test(p) || used.has(p))
  const time = e => fmtGameTime(eventGameTimeMs(s, e))
  const team = t => ({ name: s[t]?.name || t.toUpperCase(), color: s[t]?.color })
  let h = 0, a = 0
  const goals = []
  const goalsBy = { home: {}, away: {} }
  for (const e of events) {
    if (e.type !== 'goal') continue
    e.team === 'home' ? h++ : a++
    goalsBy[e.team][e.period] = (goalsBy[e.team][e.period] || 0) + 1
    const sit = e.situation || (e.penaltyShot ? 'PS' : '')
    goals.push({
      no: goals.length + 1, id: e.id, period: e.period, time: time(e), team: e.team, teamName: team(e.team).name,
      scorer: e.scorer || '', a1: e.a1 || '', a2: e.a2 || '',
      situation: [sit, e.en ? 'EN' : ''].filter(Boolean).join(' '), score: `${h}:${a}`,
      // what the power-play goal did to the opponent's minor (the operator is asked)
      release: e.release ? `${e.release.done ? 'ended' : 'kept'} ${e.release.player ? `#${e.release.player}` : 'penalty'}` : '',
    })
  }
  const ends = {}
  for (const e of events) if (e.type === 'penaltyEnd' && !ends[e.penaltyId]) ends[e.penaltyId] = time(e)
  const penalties = events.filter(e => e.type === 'penalty').map(e => {
    const game = e.kind === 'game'
    const pim = game ? 20 : Number(e.minutes) || 0
    const base = { 2: 'Minor', 4: 'Double minor', 5: 'Major', 10: 'Misconduct' }[pim] || ''
    const offence = game ? `Game misconduct${e.infraction ? ` – ${e.infraction}` : ''}` : e.infraction || base
    return {
      period: e.period, time: time(e), team: e.team, teamName: team(e.team).name, player: e.player || '', pim,
      offence: offence + (e.coincidental ? ' (coincidental)' : ''),
      end: game ? '' : ends[e.penaltyId] || '',
    }
  })
  const totals = t => ({
    goals: s[t].score,
    shots: s[t].shots,
    pim: penalties.filter(p => p.team === t).reduce((n, p) => n + p.pim, 0),
    offsides: events.filter(e => e.type === 'offside' && e.team === t).length,
    ppg: goals.filter(g => g.team === t && g.situation.startsWith('PP')).length,
    shg: goals.filter(g => g.team === t && g.situation.startsWith('SH')).length,
  })
  const timeouts = events.filter(e => e.type === 'timeout').map(e => ({ period: e.period, time: time(e), teamName: team(e.team).name }))
  // Everything in game order, with the side it happened on (shots on goal live only here)
  const penById = Object.fromEntries(events.filter(e => e.type === 'penalty').map(e => [e.penaltyId, e]))
  const goalById = Object.fromEntries(goals.map(x => [x.id, x]))
  const what = e => {
    if (e.type === 'shot') return ['SHOT', 'Shot on goal']
    if (e.type === 'offside') return ['OFFSIDE', 'Offside']
    if (e.type === 'goal') { const x = goalById[e.id]; return ['GOAL', `${num(x.scorer) || '?'}${x.a1 ? ` (${[num(x.a1), num(x.a2)].filter(Boolean).join(', ')})` : ''} ${x.situation} ${x.score}`] }
    if (e.type === 'penalty') return ['PENALTY', `${num(e.player)} ${e.kind === 'game' ? 'GM' : `${e.minutes} min`}${e.infraction ? ` ${e.infraction}` : ''}`.trim()]
    if (e.type === 'penaltyEnd') return ['PEN END', `${num(penById[e.penaltyId]?.player)} back on ice`.trim()]
    if (e.type === 'timeout') return ['TIMEOUT', `${e.seconds} s`]
    if (e.type === 'so') return ['SO', `attempt ${e.attempt} ${e.scored ? 'goal' : 'miss'}`]
    return null
  }
  const timeline = events.map(e => { const w = what(e); return w && { period: e.period, time: time(e), team: e.team, teamName: team(e.team).name, kind: w[0], text: w[1] } }).filter(Boolean)
  return {
    title: s.opts?.title || '',
    home: team('home'), away: team('away'),
    periods: periods.map(p => ({ id: p, label: periodShort(s, p) })),
    goalsBy, goals, penalties, timeouts, timeline,
    shootout: { home: s.shootout?.home || [], away: s.shootout?.away || [], homeGoals: soGoals(s, 'home'), awayGoals: soGoals(s, 'away') },
    totals: { home: totals('home'), away: totals('away') },
  }
}

const col = (v, w) => String(v ?? '').padEnd(w)
const num = n => (n ? `#${n}` : '')

export function summaryText(s, date = new Date(wallNow())) {
  const g = gameSheet(s)
  const out = []
  out.push(`GAME SUMMARY${g.title ? ' — ' + g.title : ''}`)
  out.push(date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))
  out.push('', `${g.home.name} ${g.totals.home.goals} – ${g.totals.away.goals} ${g.away.name}`)
  const w = Math.max(g.home.name.length, g.away.name.length, 4) + 2
  const head = col('', w) + g.periods.map(p => col(p.label, 5)).join('') + 'TOTAL'
  const line = (t, by, total) => col(g[t].name, w) + g.periods.map(p => col(by[t][p.id] || 0, 5)).join('') + total
  out.push('', 'GOALS BY PERIOD', head, line('home', g.goalsBy, g.totals.home.goals), line('away', g.goalsBy, g.totals.away.goals))
  if (g.shootout.home.length + g.shootout.away.length) {
    const mark = l => l.map(x => (x === 'goal' ? 'O' : 'X')).join(' ') || '-'
    out.push('', 'SHOOTOUT', `${col(g.home.name, w)}${mark(g.shootout.home)}  (${g.shootout.homeGoals})`, `${col(g.away.name, w)}${mark(g.shootout.away)}  (${g.shootout.awayGoals})`)
  }
  out.push('', 'GOALS')
  if (!g.goals.length) out.push('  —')
  else {
    out.push(col('No', 4) + col('Time', 7) + col('Team', w) + col('Goal', 6) + col('Assists', 12) + col('Sit.', 8) + 'Score')
    for (const x of g.goals) out.push(col(x.no, 4) + col(x.time, 7) + col(x.teamName, w) + col(num(x.scorer) || '?', 6) + col([num(x.a1), num(x.a2)].filter(Boolean).join(', '), 12) + col(x.situation, 8) + x.score + (x.release ? `  (${x.release})` : ''))
  }
  out.push('', 'PENALTIES')
  if (!g.penalties.length) out.push('  —')
  else {
    out.push(col('Time', 7) + col('Team', w) + col('No', 5) + col('PIM', 5) + col('Offence', 26) + 'End')
    for (const x of g.penalties) out.push(col(x.time, 7) + col(x.teamName, w) + col(num(x.player), 5) + col(x.pim, 5) + col(x.offence, 26) + x.end)
  }
  out.push('', 'TOTALS', col('', w) + col('SOG', 6) + col('PIM', 6) + col('PPG', 6) + col('SHG', 6) + 'OFFSIDE')
  for (const t of ['home', 'away']) { const x = g.totals[t]; out.push(col(g[t].name, w) + col(x.shots, 6) + col(x.pim, 6) + col(x.ppg, 6) + col(x.shg, 6) + x.offsides) }
  out.push('', 'TIMELINE')
  if (!g.timeline.length) out.push('  —')
  let cur = null
  for (const x of g.timeline) {
    if (x.period !== cur) { cur = x.period; out.push(periodTitle(s, cur)) }
    out.push('  ' + col(x.time, 7) + col(x.kind, 9) + col(x.teamName, w) + x.text)
  }
  out.push('', 'Sit.: EQ even strength · PP1/PP2 power play · SH1/SH2 short-handed · PS penalty shot · EN empty net')
  return out.join('\n')
}

const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }

export function summaryCsv(s) {
  const g = gameSheet(s)
  const head = ['section', 'period', 'time', 'team', 'number', 'assist1', 'assist2', 'situation', 'pim', 'offence', 'end', 'score']
  const lines = [head.join(',')]
  for (const x of g.goals) lines.push(['goal', x.period, x.time, x.teamName, x.scorer, x.a1, x.a2, x.situation, '', '', x.release, x.score].map(csvCell).join(','))
  for (const x of g.penalties) lines.push(['penalty', x.period, x.time, x.teamName, x.player, '', '', '', x.pim, x.offence, x.end, ''].map(csvCell).join(','))
  for (const x of g.timeline.filter(x => x.kind === 'SHOT' || x.kind === 'OFFSIDE')) lines.push([x.kind.toLowerCase(), x.period, x.time, x.teamName, '', '', '', '', '', '', '', ''].map(csvCell).join(','))
  return lines.join('\n')
}

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Printable game sheet (Control → Summary → Print / PDF)
export function summaryHtml(s, date = new Date(wallNow())) {
  const g = gameSheet(s)
  const byRow = (t, by, total) => `<tr><th style="border-left:6px solid ${esc(g[t].color)}">${esc(g[t].name)}</th>${g.periods.map(p => `<td>${by[t][p.id] || 0}</td>`).join('')}<td><b>${total}</b></td></tr>`
  const periodHead = `<tr><th></th>${g.periods.map(p => `<th>${esc(p.label)}</th>`).join('')}<th>Total</th></tr>`
  const rows = (list, cells) => list.length ? list.map(x => `<tr>${cells(x).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9">—</td></tr>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Game summary ${esc(g.home.name)} vs ${esc(g.away.name)}</title>
<style>
body{font:13px/1.35 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:2px}
.score{font-size:26px;font-weight:800;margin:8px 0}.muted{color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}thead th,tr:first-child th{background:#eee}
.tl td:nth-child(2),.tl td:nth-child(3){width:44%}.tl .k-shot{color:#666}.tl .k-goal{background:#fff6d6}.legend{margin-top:14px;font-size:11px;color:#555}@media print{body{margin:10mm}}
</style></head><body>
<h1>Game summary${g.title ? ' — ' + esc(g.title) : ''}</h1>
<div class="muted">${esc(date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
<div class="score">${esc(g.home.name)} ${g.totals.home.goals} – ${g.totals.away.goals} ${esc(g.away.name)}</div>
<h2>Goals by period</h2><table>${periodHead}${byRow('home', g.goalsBy, g.totals.home.goals)}${byRow('away', g.goalsBy, g.totals.away.goals)}</table>
<h2>Goals</h2><table><tr><th>No</th><th>Time</th><th>Team</th><th>Goal</th><th>A1</th><th>A2</th><th>Sit.</th><th>Score</th></tr>
${rows(g.goals, x => [x.no, x.time, x.teamName, num(x.scorer) || '?', num(x.a1), num(x.a2), x.situation + (x.release ? ` · ${x.release}` : ''), x.score])}</table>
<h2>Penalties</h2><table><tr><th>Time</th><th>Team</th><th>No</th><th>PIM</th><th>Offence</th><th>End</th></tr>
${rows(g.penalties, x => [x.time, x.teamName, num(x.player), x.pim, x.offence, x.end])}</table>
${g.shootout.home.length + g.shootout.away.length ? `<h2>Shootout</h2><table>${['home', 'away'].map(t => `<tr><th>${esc(g[t].name)}</th><td>${g.shootout[t].map(x => (x === 'goal' ? '●' : '○')).join(' ')}</td><td><b>${g.shootout[t + 'Goals']}</b></td></tr>`).join('')}</table>` : ''}
<h2>Totals</h2><table><tr><th>Team</th><th>Goals</th><th>SOG</th><th>PIM</th><th>PPG</th><th>SHG</th><th>Offside</th></tr>
${['home', 'away'].map(t => { const x = g.totals[t]; return `<tr><th>${esc(g[t].name)}</th><td>${x.goals}</td><td>${x.shots}</td><td>${x.pim}</td><td>${x.ppg}</td><td>${x.shg}</td><td>${x.offsides}</td></tr>` }).join('')}</table>
<h2>Timeline</h2><table class="tl"><tr><th>Time</th><th style="border-left:6px solid ${esc(g.home.color)}">${esc(g.home.name)}</th><th style="border-left:6px solid ${esc(g.away.color)}">${esc(g.away.name)}</th></tr>
${g.timeline.length ? g.timeline.map(x => { const c = `<b>${esc(x.kind)}</b> ${esc(x.text)}`; return `<tr class="k-${esc(x.kind.toLowerCase().replace(' ', '-'))}"><td>${esc(x.time)}</td><td>${x.team === 'home' ? c : ''}</td><td>${x.team === 'away' ? c : ''}</td></tr>` }).join('') : '<tr><td colspan="3">—</td></tr>'}</table>
<div class="legend">Times are game time from the start of the game. Sit.: EQ even strength · PP1/PP2 power play · SH1/SH2 short-handed · PS penalty shot · EN empty net. PIM = penalty minutes, PPG/SHG = power-play / short-handed goals.</div>
</body></html>`
}

// ---- small ice: two games on one rink (opts.smallIce) ----
// The rink is split in two halves that share ONE clock, period, whistle and shift timer; each half has its
// own teams, score, penalties and game log. Rink A is the normal state (s.home, s.away, s.penalties …),
// Rink B lives in s.rinkB with the same fields. rinkView() turns Rink B into an ordinary state, so every
// rule above (penalties, strength, goal release, game sheet) works for it unchanged; onRink() applies a
// mutation to one rink and puts the result back.
const RINK_FIELDS = ['home', 'away', 'penalties', 'penFoldAt', 'events', 'goalFlash', 'offside', 'penaltyCall', 'shootout']
const pickRink = x => Object.fromEntries(RINK_FIELDS.map(k => [k, x[k]]))

export function newRinkB(old) {
  return {
    home: { name: old?.home?.name || 'HOME B', score: 0, shots: 0, offsides: 0, color: old?.home?.color || '#f4a261' },
    away: { name: old?.away?.name || 'AWAY B', score: 0, shots: 0, offsides: 0, color: old?.away?.color || '#2a9d8f' },
    penalties: [], penFoldAt: null, events: [], goalFlash: null, offside: null, penaltyCall: null,
    shootout: { home: [], away: [] },
    homeLogo: old?.homeLogo || '', awayLogo: old?.awayLogo || '',
  }
}

export const isSmallIce = s => Boolean(s?.opts?.smallIce && s.rinkB)

export function rinkView(s, rink) {
  if (rink !== 'b' || !s.rinkB) return s
  const b = s.rinkB
  return { ...s, ...pickRink(b), rinkB: undefined, opts: { ...s.opts, homeLogo: b.homeLogo || '', awayLogo: b.awayLogo || '' } }
}

// Apply fn to one rink. For Rink B, Rink A's penalties are first brought up to date, so a shared change
// made through fn (clock, whistle) is correct for both halves.
export function onRink(s, rink, fn) {
  if (rink !== 'b' || !s.rinkB) return fn(s) ?? s
  const now = wallNow()
  const a = foldPenalties(s, now)
  const out = fn(rinkView(a, 'b'))
  if (!out) return s
  const rinkB = { ...s.rinkB, ...pickRink(out), homeLogo: out.opts.homeLogo, awayLogo: out.opts.awayLogo }
  return { ...out, ...pickRink(a), rinkB, opts: { ...out.opts, homeLogo: s.opts.homeLogo, awayLogo: s.opts.awayLogo } }
}

// Penalties of both rinks up to `now`: before the clock or the whistle changes whether play is live
function foldAll(s, now = wallNow()) {
  const a = foldPenalties(s, now)
  return a.rinkB ? { ...a, rinkB: { ...a.rinkB, ...pickRink(foldPenalties(rinkView(a, 'b'), now)) } } : a
}

// ---- shift (line change) timer: opts.shiftMs, 0 = off ----
// Counts down with the game clock (it pauses when the clock stops) and starts over by itself; the control
// every screen sounds its own buzzer the moment it shows 0 (useGameSounds). Derived from the game clock, so every screen agrees.
// s.shift = { period, atMs }: where the current cycle started, as period time played; a new period starts at 0.
export function shiftInfo(s, now = wallNow()) {
  const len = Number(s.opts?.shiftMs) || 0
  if (len <= 0 || s.period === 'SO') return null
  const played = Math.max(0, periodLength(s) - clockRemaining(s, now))
  const anchor = s.shift?.period === s.period ? Math.min(s.shift.atMs, played) : 0
  const d = played - anchor
  const remainingMs = len - (d % len)
  // seconds shown: cut like the game clock's (14:55.6 shows 14:55), so both tick on the same beat
  return { remainingMs, seconds: Math.floor(remainingMs / 1000), count: Math.floor(d / len), lengthMs: len }
}

// Start a new shift now (e.g. after a goal or a stoppage)
export function resetShift(s, now = wallNow()) {
  // on a whole second of the game clock, so the shift's seconds turn together with the clock's
  const played = Math.max(0, periodLength(s) - Math.ceil(clockRemaining(s, now) / 1000) * 1000)
  return touch({ ...s, shift: { period: s.period, atMs: played } })
}
