import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../../src/game.js'
import { withDefaults, defaultOptions } from '../../src/options.js'

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

test('penalty remaining is derived from the game clock', () => {
  let s = { ...game(), clock: { remainingMs: 10 * MIN, running: false, since: null } }
  s = G.addPenalty(s, 'away', '12', 2)
  const p = s.penalties[0]
  assert.equal(p.clockAtStart, 10 * MIN)
  assert.equal(G.penaltyRemaining(s, p), 2 * MIN)
  // clock runs 30 s
  const t0 = 5_000
  s = { ...s, clock: { remainingMs: 10 * MIN, running: true, since: t0 } }
  assert.equal(G.penaltyRemaining(s, p, t0 + 30_000), 2 * MIN - 30_000)
  // clock expires: penalty freezes with the clock
  assert.equal(G.penaltyRemaining(s, p, t0 + 20 * MIN), 0)
})

test('setClock keeps penalty remaining time', () => {
  let s = { ...game(), clock: { remainingMs: 10 * MIN, running: false, since: null } }
  s = G.addPenalty(s, 'home', '4', 2)
  s = { ...s, clock: { remainingMs: 10 * MIN - 45_000, running: false, since: null } } // 45 s elapsed
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 2 * MIN - 45_000)
  s = G.setClock(s, 3 * MIN)
  assert.equal(G.penaltyRemaining(s, s.penalties[0]), 2 * MIN - 45_000)
  assert.equal(s.penalties[0].clockAtStart, 3 * MIN)
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

test('strength in 3v3: one penalty lifts both sides → 4v3', () => {
  let s = game({ skaters: 3 })
  s = G.addPenalty(s, 'home', '1', 2)
  assert.equal(G.strengthLabel(s), '3v4')
  s = G.addPenalty(s, 'away', '2', 2)
  assert.equal(G.strengthLabel(s), '', 'coincidental minors: 3v3 again')
})

test('expired penalties are not active and get pruned', () => {
  let s = { ...game(), clock: { remainingMs: 1 * MIN, running: false, since: null } }
  s = G.addPenalty(s, 'away', '1', 2)
  s = { ...s, clock: { remainingMs: 1 * MIN, running: true, since: 0 } }
  assert.equal(G.activePenalties(s, 'away', 10_000).length, 1)
  assert.equal(G.activePenalties(s, 'away', 3 * MIN).length, 1, 'clock stops at 0 so penalty freezes at 1:00 left')
  s = G.setClock({ ...s, clock: { remainingMs: 0, running: false, since: null } }, 0)
  assert.equal(s.penalties.length, 1)
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
  assert.equal(s.opts.labels.shots, 'SHOTS')
  assert.equal(s.opts.periods, 3)
  assert.deepEqual(s.opts.penaltyLengths, [2, 5, 10])
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
  s = { ...s, clock: { remainingMs: 15 * MIN, running: true, since: Date.now() - 30_000 } } // 30 s served
  s = G.removePenalty(s, id)
  assert.equal(s.events.length, 1, 'early release stays in the log')
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

test('summary text and CSV', () => {
  let s = G.setTeam(G.setTeam(game(), 'home', { name: 'Bears' }), 'away', { name: 'Sharks' })
  s = { ...s, clock: { remainingMs: 10 * MIN + 30_000, running: false, since: null } }
  s = G.addScore(s, 'home', 1)
  s = G.addPenalty(s, 'away', '12', 2)
  s = G.setPeriod(s, 'OT')
  s = { ...s, clock: { remainingMs: 4 * MIN, running: false, since: null } }
  s = G.addScore(s, 'away', 1)
  s = G.addShot(G.addShot(s, 'home', 1), 'away', 1)
  const text = G.summaryText(s)
  assert.match(text, /^Bears 1 - 1 Sharks\n/)
  assert.match(text, /SHOTS: Bears 1 - 1 Sharks/)
  assert.match(text, /PERIOD 1\n  10:30  GOAL  Bears \(1-0\)\n  10:30  PENALTY  Sharks #12 2 min/)
  assert.match(text, /\nOT\n  4:00  GOAL  Sharks \(1-1\)/)
  // count-up clock shows elapsed time
  const up = { ...s, opts: { ...s.opts, clockDir: 'up' } }
  assert.match(G.summaryText(up), /4:30  GOAL  Bears/)
  const csv = G.summaryCsv(s).split('\n')
  assert.equal(csv[0], 'period,time,event,team,player,minutes,detail,home,away')
  assert.equal(csv[1], '1,10:30,goal,Bears,,,,1,0')
  assert.equal(csv[2], '1,10:30,penalty,Sharks,12,2,#12 2 min,1,0')
  assert.equal(csv[3], 'OT,4:00,goal,Sharks,,,,1,1')
  // quoting
  const q = G.setTeam(game(), 'home', { name: 'A, "B"' })
  assert.match(G.summaryCsv(G.addScore(q, 'home', 1)), /"A, ""B"""/)
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
