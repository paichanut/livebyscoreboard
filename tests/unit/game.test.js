import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../../src/game.js'
import { withDefaults, defaultOptions } from '../../src/options.js'
import { now as clockNow, setGameSkew, setTimeOffset } from '../../src/clock.js'

const MIN = G.MIN
const game = (over = {}) => G.newGame(over)

test('periodList follows opts.periods and ends with OT, SO', () => {
  assert.deepEqual(G.periodList(game()), ['1', '2', '3', 'OT', 'SO'])
  const s = game({ opts: { ...defaultOptions(), periods: 2 } })
  assert.deepEqual(G.periodList(s), ['1', '2', 'OT', 'SO'])
})

test('fmtClock: mm:ss above a minute, s.t below', () => {
  assert.equal(G.fmtClock(15 * MIN), '15:00')
  assert.equal(G.fmtClock(61_500), '1:01')
  assert.equal(G.fmtClock(59_900), '59.9')
  assert.equal(G.fmtClock(59_900, { tenths: false }), '0:59')
  assert.equal(G.fmtClock(-5), '0.0')
})

test('clockRemaining derives from since/remainingMs; stop freezes it', () => {
  let s = game()
  const t0 = 1_000_000
  s = { ...s, clock: { remainingMs: 10_000, running: true, since: t0 } }
  assert.equal(G.clockRemaining(s, t0 + 2_500), 7_500)
  assert.equal(G.clockRemaining(s, t0 + 99_000), 0, 'never negative')
})

test('startClock refuses at 0; setClock clamps negatives', () => {
  let s = G.setClock(game(), -100)
  assert.equal(s.clock.remainingMs, 0)
  assert.equal(G.startClock(s), s)
  s = G.adjustClock(s, 1000)
  assert.equal(s.clock.remainingMs, 1000)
})

// live from t0: clock running, play live, penalties folded at t0
const T0 = 1_000_000
const liveAt = (s, clockMs = 10 * MIN) => ({ ...s, clock: { remainingMs: clockMs, running: true, since: T0 }, penFoldAt: T0, playLive: true })

test('penalty counts real live time; correcting the game clock never moves it', () => {
  let s = liveAt(G.addPenalty(game(), 'away', '12', 2))
  const p = s.penalties[0]
  assert.equal(p.kind, 'minor')
  assert.equal(G.penaltyRemaining(s, p, T0 + 30_000), 90_000)
  s = G.foldPenalties(s, T0 + 30_000)
  s = { ...s, clock: { remainingMs: 5 * MIN, running: false, since: null } } // operator fixes the game clock
  assert.equal(G.penaltyRemaining(s, s.penalties[0], T0 + 99_000), 90_000, 'stopped clock: frozen, and not moved by the correction')
  // live time ends when the game clock reaches 0, even before anyone presses stop
  let z = liveAt(G.addPenalty(game(), 'home', '4', 2), 20_000)
  assert.equal(G.penaltyRemaining(z, z.penalties[0], T0 + 60_000), 100_000)
})

test('whistle pauses penalty clocks while the game clock keeps running', () => {
  let s = liveAt(G.addPenalty(game(), 'away', '12', 2))
  s = { ...G.foldPenalties(s, T0 + 10_000), playLive: false } // whistle at 10 s
  assert.equal(G.penaltyRemaining(s, s.penalties[0], T0 + 40_000), 110_000)
  assert.equal(G.clockRemaining(s, T0 + 40_000), 10 * MIN - 40_000, 'game clock still runs')
  s = { ...G.foldPenalties(s, T0 + 40_000), playLive: true } // faceoff at 40 s
  assert.equal(G.penaltyRemaining(s, s.penalties[0], T0 + 50_000), 100_000)
  // the mutation flips the flag; starting the clock means play is live
  assert.equal(G.toggleWhistle(game()).playLive, false)
  assert.equal(G.startClock({ ...game(), playLive: false }).playLive, true)
})

test('at most two penalties run per side; the next one waits and starts when a slot frees', () => {
  let s = game()
  s = G.addPenalty(s, 'away', 'A', 2)
  s = G.addPenalty(s, 'away', 'B', 5)
  s = G.addPenalty(s, 'away', 'C', 2)
  s = liveAt(s)
  const [A, B, C] = s.penalties
  assert.equal(G.penaltyStatus(s, C, T0 + 60_000), 'waiting')
  assert.equal(G.penaltyRemaining(s, C, T0 + 60_000), 2 * MIN, 'waiting penalties do not count down')
  assert.equal(G.strengthLabel(s, T0 + 60_000), '5v3')
  assert.equal(G.waitingPenalties(s, 'away', T0 + 60_000).length, 1)
  // A ends at 2:00, C starts then
  assert.equal(G.penaltyStatus(s, A, T0 + 150_000), 'done')
  assert.equal(G.penaltyStatus(s, C, T0 + 150_000), 'running')
  assert.equal(G.penaltyRemaining(s, C, T0 + 150_000), 90_000)
  assert.equal(G.penaltyRemaining(s, B, T0 + 150_000), 5 * MIN - 150_000)
  assert.equal(G.strengthLabel(s, T0 + 150_000), '5v3')
  // after C ends (at 4:00) only B remains → 5v4
  assert.equal(G.strengthLabel(s, T0 + 250_000), '5v4')
  // folding drops finished penalties and keeps the rest consistent
  const f = G.foldPenalties(s, T0 + 150_000)
  assert.deepEqual(f.penalties.map(p => p.player), ['B', 'C'])
  assert.equal(G.penaltyRemaining(f, f.penalties[1], T0 + 150_000), 90_000)
})

test('misconduct runs but takes no slot and does not change strength', () => {
  let s = game()
  s = G.addPenalty(s, 'away', '1', 2)
  s = G.addPenalty(s, 'away', '2', 2)
  s = G.addPenalty(s, 'away', '3', 10)
  assert.equal(s.penalties[2].kind, 'misconduct')
  assert.equal(G.strengthLabel(s), '5v3')
  assert.equal(G.activePenalties(s, 'away').length, 2, 'misconduct is not on the display')
  assert.equal(G.waitingPenalties(s, 'away').length, 0)
  assert.equal(G.teamPenalties(s, 'away').length, 3, 'but it is on the control list')
})

test('goal by the side with more skaters ends the least-time minor (Rule 16.2)', () => {
  const pen = (team, player, minutes, elapsedMs = 0) => ({ id: player, team, player, minutes, kind: G.penaltyKind(minutes), durationMs: minutes * MIN, elapsedMs })
  const withPens = (...ps) => ({ ...game(), penalties: ps })
  // two away minors: the one with less time left goes
  let s = G.addScore(withPens(pen('away', 'A', 2, 60_000), pen('away', 'B', 2, 0)), 'home', 1)
  assert.deepEqual(s.penalties.map(p => p.player), ['B'])
  assert.equal(s.home.score, 1)
  // even strength (one each): nothing ends
  s = G.addScore(withPens(pen('away', 'A', 2), pen('home', 'H', 2)), 'home', 1)
  assert.equal(s.penalties.length, 2)
  // a major is never ended by a goal
  s = G.addScore(withPens(pen('away', 'M', 5)), 'home', 1)
  assert.equal(s.penalties.length, 1)
  // double minor: the goal ends only the current 2:00 portion
  s = G.addScore(withPens(pen('away', 'D', 4, 30_000)), 'home', 1)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 2 * MIN)
  s = G.addScore(s, 'home', 1)
  assert.equal(s.penalties.length, 0, 'second goal ends the second portion')
  // penalty-shot goal: nothing ends
  s = G.addScore(withPens(pen('away', 'A', 2)), 'home', 1, { penaltyShot: true })
  assert.equal(s.penalties.length, 1)
  // the short-handed side scoring does not free its own player
  s = G.addScore(withPens(pen('away', 'A', 2)), 'away', 1)
  assert.equal(s.penalties.length, 1)
})

test('penalty nudges add or remove time and stay within 0..duration', () => {
  let s = { ...game(), penalties: [{ id: 'x', team: 'home', player: '9', minutes: 2, kind: 'minor', durationMs: 2 * MIN, elapsedMs: 30_000 }] }
  s = G.nudgePenalty(s, 'x', 5_000)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 95_000)
  s = G.nudgePenalty(s, 'x', -1_000)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 94_000)
  s = G.nudgePenalty(s, 'x', 60 * MIN)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 2 * MIN, 'never more than the full penalty')
  s = G.nudgePenalty(s, 'x', -60 * MIN)
  assert.equal(G.pruneExpiredPenalties(s).penalties.length, 0)
})

test('strength: 5v5 → 5v4 → 5v3, capped at two penalties', () => {
  let s = game()
  assert.equal(G.strengthLabel(s), '')
  s = G.addPenalty(s, 'away', '1', 2)
  assert.equal(G.strengthLabel(s), '5v4')
  s = G.addPenalty(s, 'away', '2', 2)
  assert.equal(G.strengthLabel(s), '5v3')
  s = G.addPenalty(s, 'away', '3', 2)
  assert.equal(G.strengthLabel(s), '5v3', 'third penalty does not drop below 3')
  s = G.addPenalty(s, 'home', '9', 2)
  assert.equal(G.strengthLabel(s), '4v3')
})

test('strength in 3v3 overtime: one penalty lifts both sides → 4v3', () => {
  let s = game({ skaters: 3, period: 'OT', opts: { ...defaultOptions(), threeOnThreeRules: 'overtime' } })
  s = G.addPenalty(s, 'home', '1', 2)
  assert.equal(G.strengthLabel(s), '3v4')
  s = G.addPenalty(s, 'away', '2', 2)
  assert.equal(G.strengthLabel(s), '', 'coincidental minors: 3v3 again')
})

test('withDefaults converts penalties saved by the old game-clock model', () => {
  const old = { ...game(), clock: { remainingMs: 8 * MIN, running: false, since: null }, penalties: [{ id: 'o', team: 'away', player: '7', durationMs: 2 * MIN, clockAtStart: 9 * MIN }] }
  delete old.playLive
  const s = withDefaults(old)
  assert.equal(s.penalties[0].elapsedMs, 60_000)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 60_000)
  assert.equal(s.playLive, true)
})

test('period navigation resets clock; OT is 5:00, SO is 0:00', () => {
  let s = G.setClock(game(), 2 * MIN)
  s = G.nextPeriod(s)
  assert.equal(s.period, '2')
  assert.equal(s.clock.remainingMs, 15 * MIN)
  s = G.setPeriod(s, 'OT')
  assert.equal(s.clock.remainingMs, 5 * MIN)
  s = G.nextPeriod(s)
  assert.equal(s.period, 'SO')
  assert.equal(s.clock.remainingMs, 0)
  assert.equal(G.nextPeriod(s).period, 'SO', 'clamps at the end')
  assert.equal(G.prevPeriod(G.setPeriod(s, '1')).period, '1', 'clamps at the start')
})

test('scores and shots never go negative; goal sets flash', () => {
  let s = G.addScore(game(), 'home', -1)
  assert.equal(s.home.score, 0)
  assert.equal(s.goalFlash, null)
  s = G.addScore(s, 'home', 1)
  assert.equal(s.home.score, 1)
  assert.equal(s.goalFlash.team, 'home')
  assert.equal(G.goalFlashActive(s, s.goalFlash.at + 1000), 'home')
  assert.equal(G.goalFlashActive(s, s.goalFlash.at + 16_000), null)
  assert.equal(G.addShot(s, 'away', -1).away.shots, 0)
})

test('timeout stops the clock and counts down', () => {
  let s = G.startClock(game())
  assert.equal(s.clock.running, true)
  s = G.startTimeout(s, 'home', 30)
  assert.equal(s.clock.running, false)
  assert.equal(G.timeoutRemaining(s, s.timeout.since + 10_000), 20_000)
  assert.equal(G.timeoutRemaining(s, s.timeout.since + 60_000), 0)
  assert.equal(G.clearTimeout_(s).timeout, null)
})

test('resetGame keeps teams and options, clears scores and penalties', () => {
  let s = game()
  s = G.setTeam(s, 'home', { name: 'Bears', color: '#123456' })
  s = G.addScore(s, 'home', 3)
  s = G.addPenalty(s, 'away', '5', 2)
  s = G.resetGame(s)
  assert.equal(s.home.name, 'Bears')
  assert.equal(s.home.score, 0)
  assert.equal(s.penalties.length, 0)
  assert.equal(s.period, '1')
})

test('withDefaults deep-merges new options into an old saved game', () => {
  const old = { ...game(), opts: { labels: { period: 'ช่วง' } } }
  const s = withDefaults(old)
  assert.equal(s.opts.labels.period, 'ช่วง')
  assert.equal(s.opts.labels.shots, 'SHOT ON GOAL')
  assert.equal(s.opts.periods, 3)
  assert.deepEqual(s.opts.penaltyLengths, [2, 4, 5, 10])
})

// ---- game log, shootout, summary ----

test('goals and penalties are logged with period and clock; undo removes the last goal', () => {
  let s = { ...game(), clock: { remainingMs: 12 * MIN, running: false, since: null } }
  s = G.addScore(s, 'home', 1)
  s = G.addPenalty(s, 'away', '12', 2)
  s = G.setPeriod(s, '2')
  s = G.addScore(s, 'away', 1)
  assert.deepEqual(s.events.map(e => [e.type, e.team, e.period, e.clockMs]), [
    ['goal', 'home', '1', 12 * MIN], ['penalty', 'away', '1', 12 * MIN], ['goal', 'away', '2', 15 * MIN],
  ])
  s = G.addScore(s, 'away', -1)
  assert.equal(s.away.score, 0)
  assert.equal(s.events.filter(e => e.type === 'goal').length, 1, 'the mistaken goal left the log')
  s = G.addScore(s, 'away', -1)
  assert.equal(s.events.length, 2, 'nothing to undo at 0')
})

test('removing a penalty that never ran drops it from the log; one that ran stays', () => {
  let s = game()
  s = G.addPenalty(s, 'home', '4', 2)
  s = G.removePenalty(s, s.penalties[0].id)
  assert.equal(s.events.length, 0)
  s = G.addPenalty(s, 'home', '5', 2)
  const id = s.penalties[0].id
  s = { ...s, clock: { remainingMs: 15 * MIN, running: true, since: Date.now() - 30_000 }, penFoldAt: Date.now() - 30_000, playLive: true } // 30 s served
  s = G.removePenalty(s, id)
  assert.equal(s.events.filter(e => e.type === 'penalty').length, 1, 'early release stays in the log')
  assert.equal(s.events.filter(e => e.type === 'penaltyEnd' && e.penaltyId === id).length, 1, 'with its end time')
})

test('shootout attempts, undo, clear', () => {
  let s = G.setPeriod(game(), 'SO')
  s = G.soAttempt(s, 'home', true)
  s = G.soAttempt(s, 'home', false)
  s = G.soAttempt(s, 'away', true)
  assert.deepEqual(s.shootout, { home: ['goal', 'miss'], away: ['goal'] })
  assert.equal(G.soGoals(s, 'home'), 1)
  assert.equal(s.home.score, 0, 'shootout does not change the score by itself')
  s = G.soUndo(s, 'home')
  assert.deepEqual(s.shootout.home, ['goal'])
  assert.equal(s.events.filter(e => e.type === 'so').length, 2)
  const emptied = G.soUndo(s, 'away')
  assert.equal(G.soUndo(emptied, 'away'), emptied, 'undo on empty is a no-op')
  s = G.soClear(s)
  assert.deepEqual(s.shootout, { home: [], away: [] })
  assert.equal(s.events.filter(e => e.type === 'so').length, 0)
  assert.deepEqual(G.resetGame(G.soAttempt(s, 'home', true)).shootout, { home: [], away: [] })
})

test('game sheet (IIHF style): game time, scorer/assists, situation, penalty end, timeline', () => {
  let s = G.setTeam(G.setTeam(game({ periodLengthMs: 15 * MIN }), 'home', { name: 'Bears' }), 'away', { name: 'Sharks' })
  const at = (ms, period = s.period) => { s = { ...s, period, clock: { remainingMs: ms, running: false, since: null } } }
  at(10 * MIN + 30_000)
  s = G.addShot(s, 'home', 1)
  s = G.addScore(s, 'home', 1)
  s = G.editGoal(s, s.events.at(-1).id, { scorer: '17', a1: '9', a2: '#4x' })
  s = G.addPenalty(s, 'away', '12', 2, 'Tripping')
  at(9 * MIN)
  s = G.addScore(s, 'home', 1) // power play: releases #12
  assert.equal(s.events.filter(e => e.type === 'goal').at(-1).situation, 'PP1')
  s = G.setPeriod(s, 'OT')
  at(4 * MIN)
  s = G.addShot(s, 'away', 1)
  s = G.addScore(s, 'away', 1)
  s = G.editGoal(s, s.events.at(-1).id, { en: true, scorer: '8' })
  const g = G.gameSheet(s)
  assert.deepEqual(g.goals.map(x => [x.time, x.teamName, x.scorer, x.a1, x.a2, x.situation, x.score]), [
    ['04:30', 'Bears', '17', '9', '4', 'EQ', '1:0'],
    ['06:00', 'Bears', '', '', '', 'PP1', '2:0'],
    ['46:00', 'Sharks', '8', '', '', 'EQ EN', '2:1'], // OT: 3 × 15:00 + 1:00
  ])
  assert.deepEqual(g.penalties.map(x => [x.time, x.player, x.pim, x.offence, x.end]), [['04:30', '12', 2, 'Tripping', '06:00']])
  assert.deepEqual(g.periods.map(p => p.label), ['P1', 'P2', 'P3', 'OT'])
  // timeline: every shot, goal and penalty in order, with its side
  assert.deepEqual(g.timeline.map(x => [x.time, x.kind, x.team]), [
    ['04:30', 'SHOT', 'home'], ['04:30', 'GOAL', 'home'], ['04:30', 'PENALTY', 'away'],
    ['06:00', 'PEN END', 'away'], ['06:00', 'GOAL', 'home'], ['46:00', 'SHOT', 'away'], ['46:00', 'GOAL', 'away'],
  ])
  assert.equal(g.timeline[3].text, '#12 back on ice')
  assert.deepEqual(g.totals.home, { goals: 2, shots: 1, pim: 0, offsides: 0, ppg: 1, shg: 0 })
  assert.equal(g.totals.away.pim, 2)
  const text = G.summaryText(s)
  assert.match(text, /^GAME SUMMARY/)
  assert.match(text, /Bears 2 – 1 Sharks/)
  assert.match(text, /04:30 +Bears +#17 +#9, #4 +EQ +1:0/)
  assert.match(text, /04:30 +Sharks +#12 +2 +Tripping +06:00/)
  const csv = G.summaryCsv(s).split('\n')
  assert.equal(csv[0], 'section,period,time,team,number,assist1,assist2,situation,pim,offence,end,score')
  assert.equal(csv[1], 'goal,1,04:30,Bears,17,9,4,EQ,,,,1:0')
  assert.ok(csv.includes('penalty,1,04:30,Sharks,12,,,,2,Tripping,06:00,'))
  assert.ok(csv.includes('shot,1,04:30,Bears,,,,,,,,'))
  assert.match(text, /TIMELINE\nPERIOD 1\n  04:30  SHOT     Bears +Shot on goal/)
  assert.match(G.summaryHtml(s), /<td>#17<\/td><td>#9<\/td><td>#4<\/td><td>EQ<\/td>/)
  // quoting
  const q = G.setTeam(game(), 'home', { name: 'A, "B"' })
  assert.match(G.summaryCsv(G.addScore(q, 'home', 1)), /"A, ""B"""/)
})

test('short-handed and penalty-shot goals; −1 shot takes the last shot out of the log', () => {
  let s = G.addPenalty(game(), 'home', '3', 2)
  s = { ...s, clock: { remainingMs: 10 * MIN, running: false, since: null } }
  s = G.addScore(s, 'home', 1)
  s = G.addScore(s, 'away', 1, { penaltyShot: true })
  assert.deepEqual(s.events.filter(e => e.type === 'goal').map(e => e.situation), ['SH1', 'PS'])
  s = G.addShot(G.addShot(G.addShot(s, 'away', 1), 'away', 1), 'away', -1)
  assert.equal(s.away.shots, 1)
  assert.equal(s.events.filter(e => e.type === 'shot').length, 1)
  assert.equal(G.gameSheet(s).totals.home.shg, 1)
})

test('withDefaults adds events and shootout to games saved before they existed', () => {
  const old = { ...game() }
  delete old.events; delete old.shootout
  const s = withDefaults(old)
  assert.deepEqual(s.events, [])
  assert.deepEqual(s.shootout, { home: [], away: [] })
  assert.equal(s.opts.uiLang, 'en')
})

test('default sounds are valid choices', async () => {
  const { SOUND_CHOICES } = await import('../../src/options.js')
  const valid = new Set(SOUND_CHOICES.map(([v]) => v))
  for (const [event, kind] of Object.entries(defaultOptions().sounds)) assert.ok(valid.has(kind), `${event}: ${kind}`)
})

test('all clock math uses the server-synced clock', async () => {
  const { setTimeOffset, now } = await import('../../src/clock.js')
  const before = Date.now()
  setTimeOffset(90_000) // this device is 90 s behind the server
  assert.ok(now() - before >= 90_000)
  let s = G.startClock(game())
  assert.ok(Math.abs(s.clock.since - now()) < 50, 'start stamps server time, not device time')
  assert.ok(Math.abs(G.clockRemaining(s) - 15 * MIN) < 50)
  s = G.startTimeout(s, 'home', 30)
  assert.ok(Math.abs(G.timeoutRemaining(s) - 30_000) < 50)
  s = G.addScore(s, 'away', 1)
  assert.equal(G.goalFlashActive(s), 'away')
  setTimeOffset(0)
})

test('editPenalty changes player, infraction and length but keeps time served', () => {
  let s = { ...game(), penalties: [{ id: 'e', team: 'away', player: '9', minutes: 2, kind: 'minor', durationMs: 2 * MIN, elapsedMs: 30_000 }] }
  s = G.editPenalty(s, 'e', { player: '19', infraction: 'Boarding', minutes: 5 })
  const p = s.penalties[0]
  assert.equal(p.player, '19')
  assert.equal(p.infraction, 'Boarding')
  assert.equal(p.kind, 'major')
  assert.equal(G.penaltyRemaining(s, p), 5 * MIN - 30_000)
})

test('default keys follow the PC Scoreboards layout and do not collide', async () => {
  const { DEFAULT_KEYS, KEY_GROUPS, KEY_LABELS } = await import('../../src/options.js')
  const codes = Object.values(DEFAULT_KEYS)
  assert.equal(new Set(codes).size, codes.length, 'every action has its own key')
  for (const [k, v] of Object.entries({ homeGoal: 'KeyQ', awayGoal: 'KeyA', startAll: 'KeyY', stopAll: 'KeyH', startClockOnly: 'KeyO', stopClockOnly: 'KeyP', resetClock: 'KeyL', penaltiesOn: 'KeyU', penaltiesOff: 'KeyJ', removePenalty: 'F7', timeOfDay: 'KeyM', goalLightHome: 'ArrowLeft', goalLightAway: 'ArrowRight', goalLightOff: 'F8', horn: 'F9', buzzer: 'F12', newGame: 'F5' })) assert.equal(DEFAULT_KEYS[k], v, k)
  const grouped = KEY_GROUPS.flatMap(([, names]) => names)
  assert.deepEqual([...grouped].sort(), Object.keys(DEFAULT_KEYS).sort(), 'every key is listed in a group')
  for (const k of grouped) assert.ok(KEY_LABELS[k], `label for ${k}`)
})

const live = (s, t0 = 1_000_000) => ({ ...s, clock: { remainingMs: 15 * MIN, running: true, since: t0 }, penFoldAt: t0, playLive: true })

test('coincidental penalties run but are off the display and do not change strength', () => {
  let s = G.addPenalty(game(), 'home', '5', 2, 'Roughing', { coincidental: true })
  s = G.addPenalty(s, 'away', '7', 2, 'Roughing', { coincidental: true })
  s = G.addPenalty(s, 'away', '9', 2)
  s = live(s)
  const t = 1_000_000 + 30_000
  assert.equal(G.strengthLabel(s, t), '5v4')
  assert.deepEqual(G.activePenalties(s, 'away', t).map(p => p.player), ['9'])
  assert.equal(G.activePenalties(s, 'home', t).length, 0)
  assert.equal(G.teamPenalties(s, 'home', t)[0].remainingMs, 90_000)
  assert.match(G.summaryText(s), /\(coincidental\)/)
})

test('a goal does not release a coincidental penalty', () => {
  let s = G.addPenalty(game(), 'away', '7', 2, '', { coincidental: true })
  s = G.addScore(live(s, Date.now()), 'home', 1)
  assert.equal(s.penalties.length, 1)
})

test('misconduct is off the display and starts after the same player\'s minor', () => {
  let s = G.addPenalty(game(), 'away', '12', 2)
  s = G.addPenalty(s, 'away', '12', 10)
  s = G.addPenalty(s, 'away', '30', 10)
  s = live(s)
  const t0 = 1_000_000
  const at = (ms, who) => G.teamPenalties(s, 'away', t0 + ms).find(p => p.player === who && p.kind === 'misconduct')
  assert.equal(at(60_000, '12').status, 'waiting')
  assert.equal(at(60_000, '12').remainingMs, 10 * MIN)
  assert.equal(at(60_000, '30').remainingMs, 9 * MIN, 'a misconduct alone starts at once')
  assert.equal(at(150_000, '12').remainingMs, 10 * MIN - 30_000)
  assert.deepEqual(G.activePenalties(s, 'away', t0 + 60_000).map(p => p.kind), ['minor'])
  assert.equal(G.strengthLabel(s, t0 + 150_000), G.strengthLabel(game()), 'even strength once the minor is over')
  // folding mid-way keeps the delayed start
  const f = G.foldPenalties(s, t0 + 60_000)
  assert.equal(G.teamPenalties(f, 'away', t0 + 150_000).find(p => p.player === '12').remainingMs, 10 * MIN - 30_000)
})

test('a goal releasing the minor starts the same player\'s misconduct', () => {
  let s = G.addPenalty(game(), 'away', '12', 2)
  s = G.addPenalty(s, 'away', '12', 10)
  s = live(s)
  const t0 = 1_000_000
  // goal at 0:00 elapsed (now() ~ real time is far past t0, so use fold at a known time)
  const f = G.foldPenalties(s, t0 + 20_000)
  const r = G.releaseOnGoal(f, 'home', t0 + 20_000)
  const left = G.teamPenalties(r, 'away', t0 + 20_000)
  assert.deepEqual(left.map(p => p.kind), ['misconduct'])
  assert.equal(left[0].status, 'running')
})

test('game misconduct: no clock, no strength, not displayed, 20 min in the log', () => {
  let s = G.addPenalty(game(), 'home', '4', 5, 'Checking from behind')
  s = G.addPenalty(s, 'home', '4', 0, 'Checking from behind', { kind: 'game' })
  s = live(s)
  const t = 1_000_000 + 2 * MIN
  const gm = G.teamPenalties(s, 'home', t).find(p => p.kind === 'game')
  assert.equal(gm.status, 'game')
  assert.equal(gm.minutes, 20)
  assert.equal(G.activePenalties(s, 'home', t).length, 1)
  assert.equal(G.strengthLabel(s, t), '4v5')
  assert.match(G.summaryText(s), /Game misconduct – Checking from behind/)
  // still there after the major is over and after a fold
  const f = G.pruneExpiredPenalties({ ...s, clock: { ...s.clock, since: Date.now() - 20 * MIN } })
  assert.deepEqual(f.penalties.map(p => p.kind), ['game'])
})

test('penalty-shot goal counts but releases no one', () => {
  let s = G.addPenalty(game(), 'away', '9', 2)
  s = G.addScore(live(s, Date.now()), 'home', 1, { penaltyShot: true })
  assert.equal(s.home.score, 1)
  assert.equal(s.penalties.length, 1)
  assert.equal(s.events.at(-1).penaltyShot, true)
  assert.match(G.summaryText(s), /penalty shot/)
})

test('overtime length comes from opts.otMinutes', () => {
  const s = game()
  assert.equal(G.periodLength({ ...s, period: 'OT' }), 5 * MIN)
  assert.equal(G.periodLength({ ...s, period: 'OT', opts: { ...s.opts, otMinutes: 10 } }), 10 * MIN)
  assert.equal(withDefaults({ opts: {} }).opts.otMinutes, 5)
})

test('older games move from the old default horns to the NHL horn once; later choices stay', () => {
  const old = withDefaults({ opts: { sounds: { horn: 'horn-loop', timeoutStart: 'horn', buzzer: 'buzzer' } } })
  assert.equal(old.opts.sounds.horn, 'horn-nhl')
  assert.equal(old.opts.sounds.timeoutStart, 'horn-nhl-short')
  const picked = withDefaults({ opts: { soundsV: 2, sounds: { horn: 'horn-loop' } } })
  assert.equal(picked.opts.sounds.horn, 'horn-loop')
  const other = withDefaults({ opts: { sounds: { horn: 'buzzer' } } })
  assert.equal(other.opts.sounds.horn, 'buzzer')
})

test('offside: counted per team, logged with time and side (no player), shown for a few seconds, −1 undoes', () => {
  let s = { ...game(), clock: { remainingMs: 12 * MIN, running: false, since: null } }
  s = G.addOffside(s, 'away', 1)
  s = G.addOffside(s, 'away', 1)
  assert.equal(s.away.offsides, 2)
  assert.equal(G.offsideActive(s), 'away')
  assert.equal(G.offsideActive(s, s.offside.at + G.OFFSIDE_SHOW_MS + 1), null)
  const g = G.gameSheet(s)
  assert.deepEqual(g.timeline.map(x => [x.time, x.kind, x.team, x.text]), [['03:00', 'OFFSIDE', 'away', 'Offside'], ['03:00', 'OFFSIDE', 'away', 'Offside']])
  assert.equal(g.totals.away.offsides, 2)
  assert.ok(G.summaryCsv(s).includes('offside,1,03:00,AWAY,'))
  s = G.addOffside(s, 'away', -1)
  assert.equal(s.away.offsides, 1)
  assert.equal(s.events.filter(e => e.type === 'offside').length, 1)
  assert.equal(G.offsideActive(s), null)
})

test('penalty quick picks follow IIHF and older games get them once', async () => {
  const { defaultOptions } = await import('../../src/options.js')
  const t = Object.fromEntries(defaultOptions().penaltyTemplates.map(x => [x.name, x]))
  assert.deepEqual([t.Fighting.minutes, t.Fighting.alsoGame], [5, true])
  assert.equal(t['Checking from behind'].minutes, 2)
  assert.equal(t['Checking from behind'].majorGM, true)
  assert.equal(t.Boarding.minutes, 2)
  assert.equal(t.Spearing.minutes, 4)
  const old = withDefaults({ opts: { penaltyTemplates: [{ name: 'Fighting', minutes: 5 }] } })
  assert.equal(old.opts.penaltyTemplates.find(x => x.name === 'Fighting').alsoGame, true)
  assert.equal(old.opts.templatesV, 2)
})

test('a new penalty is announced on the display for 5 s: number, infraction, minutes', () => {
  let s = G.addPenalty(game(), 'home', '12', 2, 'Hooking')
  assert.equal(G.penaltyCallActive(s).text, '#12 HOOKING 2:00')
  assert.equal(G.penaltyCallActive(s).team, 'home')
  assert.equal(G.penaltyCallActive(s, s.penaltyCall.at + G.PENALTY_SHOW_MS + 1), null)
  // fighting 5 + game misconduct on the same player: one announcement
  s = G.addPenalty(G.addPenalty(game(), 'away', '7', 5, 'Fighting'), 'away', '7', 0, 'Fighting', { kind: 'game' })
  assert.equal(G.penaltyCallActive(s).text, '#7 FIGHTING 5:00 + GM')
  // removed by mistake: the announcement goes too
  s = G.addPenalty(game(), 'home', '9', 2, 'Tripping')
  s = G.removePenalty(s, s.penalties[0].id)
  assert.equal(G.penaltyCallActive(s), null)
  // bench minor without a number, misconduct without an infraction
  assert.equal(G.penaltyCallActive(G.addPenalty(game(), 'home', '', 2, 'Too many players')).text, 'TOO MANY PLAYERS 2:00')
  assert.equal(G.penaltyCallActive(G.addPenalty(game(), 'home', '4', 10)).text, '#4 MISCONDUCT 10:00')
})

test('small ice: Rink B has its own teams, score and penalties but shares the clock', () => {
  let s = G.newGame()
  s = G.setOptions(s, { ...s.opts, smallIce: true })
  assert.ok(G.isSmallIce(s))
  s = G.onRink(s, 'b', x => G.setTeam(x, 'home', { name: 'Vikings 2' }))
  s = G.onRink(s, 'b', x => G.addScore(x, 'home', 1))
  s = G.onRink(s, 'b', x => G.addPenalty(x, 'away', '76', 2, 'Tripping'))
  assert.equal(s.home.score, 0)
  assert.equal(s.penalties.length, 0)
  const b = G.rinkView(s, 'b')
  assert.equal(b.home.name, 'Vikings 2')
  assert.equal(b.home.score, 1)
  assert.equal(b.penalties.length, 1)
  assert.equal(G.strengthLabel(b), '5v4')
  assert.equal(G.strengthLabel(s), '')
  // the shared clock runs both rinks' penalties
  s = G.addPenalty(s, 'home', '32', 2, 'Hooking')
  s = G.startClock(s)
  assert.equal(G.rinkView(s, 'b').clock.running, true)
  const t0 = s.clock.since
  const later = t0 + 30_000
  assert.equal(G.penaltyRemaining(G.rinkView(s, 'b'), G.rinkView(s, 'b').penalties[0], later), 90_000)
  assert.equal(G.penaltyRemaining(s, s.penalties[0], later), 90_000)
  // a goal on Rink B goes in Rink B's log only
  assert.equal(G.rinkView(s, 'b').events.filter(e => e.type === 'goal').length, 1)
  assert.equal(s.events.filter(e => e.type === 'goal').length, 0)
  // logos per rink
  s = G.onRink(s, 'b', x => G.setOptions(x, { ...x.opts, homeLogo: 'data:b' }))
  assert.equal(s.opts.homeLogo, defaultOptions().homeLogo)
  assert.equal(G.rinkView(s, 'b').opts.homeLogo, 'data:b')
  // new game keeps Rink B's team names, clears the score
  s = G.resetGame(s)
  assert.equal(G.rinkView(s, 'b').home.name, 'Vikings 2')
  assert.equal(G.rinkView(s, 'b').home.score, 0)
})

test('shift timer counts down with the game clock and starts over', () => {
  let s = G.newGame()
  s = G.setOptions(s, { ...s.opts, shiftMs: 90_000 })
  assert.equal(G.shiftInfo(s).remainingMs, 90_000)
  s = G.setClock(s, 15 * MIN - 100_000) // 1:40 played
  let info = G.shiftInfo(s)
  assert.equal(info.count, 1)
  assert.equal(info.remainingMs, 80_000)
  s = G.resetShift(s)
  assert.equal(G.shiftInfo(s).remainingMs, 90_000)
  assert.equal(G.shiftInfo(s).count, 0)
  // a new period starts a new shift
  s = G.nextPeriod(s)
  assert.equal(G.shiftInfo(s).remainingMs, 90_000)
  // off
  s = G.setOptions(s, { ...s.opts, shiftMs: 0 })
  assert.equal(G.shiftInfo(s), null)
})

test('power-play goal: release or keep the minor, and the goal records which', () => {
  let s = G.addPenalty(G.newGame(), 'away', '12', 2, 'Hooking')
  s = G.startClock(s)
  const c = G.releaseCandidate(s, 'home')
  assert.equal(c.penalty.player, '12')
  assert.equal(G.releaseCandidate(s, 'away'), null) // the short-handed side scoring releases nobody
  const kept = G.addScore(s, 'home', 1, { release: false })
  assert.equal(kept.penalties.length, 1)
  assert.deepEqual(kept.events.find(e => e.type === 'goal').release, { penaltyId: c.penalty.id, player: '12', done: false })
  assert.equal(G.gameSheet(kept).goals[0].release, 'kept #12')
  const rel = G.addScore(s, 'home', 1)
  assert.equal(rel.penalties.length, 0)
  assert.equal(G.gameSheet(rel).goals[0].release, 'ended #12')
  assert.ok(G.summaryText(rel).includes('(ended #12)'))
  assert.ok(rel.events.some(e => e.type === 'penaltyEnd' && e.reason === 'goal'))
})

test('the display layout defaults to compact', () => {
  assert.equal(defaultOptions().layout, 'compact')
})

test('shift seconds tick with the game clock seconds', () => {
  let s = G.newGame()
  s = G.setOptions(s, { ...s.opts, shiftMs: 60_000 })
  s = G.setClock(s, 15 * MIN - 4_400) // the clock shows 14:55 (14:55.6 left)
  assert.equal(G.fmtClock(G.clockRemaining(s)), '14:55')
  assert.equal(G.shiftInfo(s).seconds, 55)
})

test('STOP keeps the time of the press, even when it is handled later', () => {
  const t0 = 1_000_000
  let s = G.startClock(G.newGame(), { now: t0 })
  const pressed = t0 + 12_345
  s = G.toggleClock(s, pressed) // handled late, but stamped with the press time
  assert.equal(s.clock.running, false)
  assert.equal(s.clock.remainingMs, s.periodLengthMs - 12_345)
  assert.equal(G.clockRemaining(s, pressed + 5_000), s.periodLengthMs - 12_345)
})

test('banner: transparent by default; games saved when it was green by default switch once, a later choice stays', () => {
  assert.equal(defaultOptions().banner.useChroma, false)
  const old = withDefaults({ ...G.newGame(), opts: { banner: { useChroma: true } } })
  assert.equal(old.opts.banner.useChroma, false)
  const chosen = withDefaults({ ...G.newGame(), opts: { bannerV: 2, banner: { useChroma: true } } })
  assert.equal(chosen.opts.banner.useChroma, true)
})

test('correction key: F2 by default; games still on ` move to F2 once, another key chosen later stays', () => {
  assert.equal(defaultOptions().keys.correction, 'F2')
  assert.equal(withDefaults({ ...G.newGame(), opts: { keys: { correction: 'Backquote' } } }).opts.keys.correction, 'F2')
  assert.equal(withDefaults({ ...G.newGame(), opts: { keysV: 2, keys: { correction: 'Backquote' } } }).opts.keys.correction, 'Backquote')
})

test('countdowns show zero only when no time remains', () => {
  for (const ms of [1, 49, 99]) assert.equal(G.fmtClock(ms), '0.1')
  for (const ms of [1, 99, 999]) assert.equal(G.fmtClock(ms, { tenths: false }), '0:01')
  assert.equal(G.fmtClock(0), '0.0')
  assert.equal(G.fmtClock(0, { tenths: false }), '0:00')
  assert.equal(G.fmtClock(49, { countdown: false }), '0.0', 'count-up clocks still truncate elapsed time')
})

test('silent arena sound settings migrate to audible defaults', () => {
  const sounds = Object.fromEntries(Object.keys(G.newGame().opts.sounds).map(k => [k, 'none']))
  assert.deepEqual(withDefaults({ opts: { sounds } }).opts.sounds, G.newGame().opts.sounds)
  const custom = withDefaults({ opts: { sounds: { endPeriod: 'synth-buzzer' } } })
  assert.equal(custom.opts.sounds.endPeriod, 'synth-buzzer')
})


test('stopping at expiry marks the deadline for other screens; pause and corrections do not', () => {
  const running = { ...G.newGame(), clock: { running: true, since: 1000, remainingMs: 2000 } }
  assert.equal(G.stopClock(running, 2999).clock.expiredAt, null)
  assert.equal(G.stopClock(running, 3000).clock.expiredAt, 3000)
  assert.equal(G.stopClock(running, 4000).clock.expiredAt, 3000)
  assert.equal(G.setClock(G.stopClock(running, 4000), 2000).clock.expiredAt, undefined)
})

test('a game copied online by the desktop app is shown with the desktop computer\'s clock', () => {
  setTimeOffset(-1500) // this phone is 1.5 s ahead of the server
  setGameSkew(4000)    // the desktop's clock is 4 s ahead of the server
  const game = G.startClock({ ...G.newGame(), periodLengthMs: 60000, clock: { remainingMs: 60000, running: false, since: null } }, { now: Date.now() + 2500 - 10000 })
  // started 10 s ago on the desktop's clock: every viewer shows 0:50, whatever its own clock says
  assert.ok(Math.abs(G.clockRemaining(game, clockNow()) - 50000) < 50)
  setGameSkew(undefined); setTimeOffset(0)
  assert.ok(Math.abs(clockNow() - Date.now()) < 5)
})

test('the shots label reads SHOT ON GOAL; a label the operator typed stays', () => {
  assert.equal(withDefaults({ ...G.newGame(), opts: { labels: { shots: 'SHOTS' } } }).opts.labels.shots, 'SHOT ON GOAL')
  assert.equal(withDefaults({ ...G.newGame(), opts: { labels: { shots: 'ยิง' } } }).opts.labels.shots, 'ยิง')
})

test('typing the clock: m:ss, tenths, digits only; anything else is refused', () => {
  assert.equal(G.parseClockInput('12:34'), 12 * MIN + 34_000)
  assert.equal(G.parseClockInput('0:45.5'), 45_500)
  assert.equal(G.parseClockInput('45.5'), 45_500)
  assert.equal(G.parseClockInput('1234'), 12 * MIN + 34_000)
  assert.equal(G.parseClockInput('930'), 9 * MIN + 30_000)
  assert.equal(G.parseClockInput('45'), 45_000)
  for (const bad of ['', 'abc', '1:7', '12:75', '1275', '-1:00']) assert.equal(G.parseClockInput(bad), null, bad)
})

test('a timeout counts down in the big clock, then the game time comes back as it was', () => {
  const t0 = 1_000_000
  let s = G.startClock(game(), { now: t0 })
  s = G.stopClock(s, t0 + 60_000) // 14:00 left
  s = { ...s, timeout: { team: 'home', durationMs: 30_000, since: t0 + 70_000 } }
  assert.deepEqual(G.clockDisplay(s, t0 + 80_000), { kind: 'timeout', ms: 20_000 })
  assert.deepEqual(G.clockDisplay(s, t0 + 100_001), { kind: 'game', ms: 14 * MIN })
})

test('warm-up: stops the clock, counts down in its place, ends at faceoff', () => {
  const t0 = 2_000_000
  let s = G.startWarmup(game(), 60, t0)
  assert.equal(s.clock.running, false)
  assert.deepEqual(G.clockDisplay(s, t0 + 15_000), { kind: 'warmup', ms: 45_000 })
  assert.equal(G.warmupRemaining(s, t0 + 61_000), 0)
  assert.equal(G.clockDisplay(s, t0 + 61_000).kind, 'game')
  assert.equal(G.clockDisplay(s, t0 + 61_000).ms, G.periodLength(s), 'the period time is untouched')
  assert.equal(G.startClock(s, { now: t0 + 20_000 }).warmup, null, 'starting the game ends the warm-up')
  assert.equal(G.clearWarmup(s).warmup, null)
  assert.equal(defaultOptions().warmupSec, 60)
})
