import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../../src/game.js'
import {
  correctEvent,
  undoCorrection,
  eventDetails,
  parseEventTime,
} from '../../src/statistics.js'
import { mergeGame } from '../../desktop/merge-game.mjs'
const game = () =>
  G.newGame({ opts: { ...G.newGame().opts, threeOnThree: false } })

test('late goal details correct the original time and assists without a second goal or clock change', () => {
  const s = G.addScore(game(), 'home', 1),
    e = s.events.find((e) => e.type === 'goal')
  const edited = correctEvent(
    s,
    e.id,
    {
      scorer: '17',
      a1: '9',
      a2: '4',
      en: true,
      ...parseEventTime(s, '1', '12:36'),
      detailsComplete: true,
    },
    eventDetails(e),
    'Stats keeper'
  )
  assert.equal(edited.home.score, 1)
  assert.equal(edited.events.filter((e) => e.type === 'goal').length, 1)
  assert.deepEqual(edited.clock, s.clock)
  assert.equal(edited.events[0].clockMs, 756000)
  assert.match(G.summaryText(edited), /#17 +#9, #4 +EQ EN/)
  const undone = undoCorrection(edited, edited.corrections[0].id, 'Scorekeeper')
  assert.equal(undone.events[0].scorer, '')
  assert.equal(undone.home.score, 1)
  assert.deepEqual(undone.clock, s.clock)
})
test('active penalty correction updates the scoreboard and summary while retaining served time', () => {
  let s = G.addPenalty(game(), 'away', '33', 2, 'Tripping')
  s = { ...s, penalties: s.penalties.map((p) => ({ ...p, elapsedMs: 45000 })) }
  const e = s.events.find((e) => e.type === 'penalty')
  const edited = correctEvent(
    s,
    e.id,
    { player: '55', infraction: 'Hooking', minutes: 4 },
    eventDetails(e),
    'Stats keeper'
  )
  assert.equal(edited.penalties[0].player, '55')
  assert.equal(edited.penalties[0].elapsedMs, 45000)
  assert.equal(edited.penalties[0].durationMs, 240000)
  assert.match(G.summaryText(edited), /#55 +4 +Hooking/)
  assert.deepEqual(edited.clock, s.clock)
})
test('stale correction and undo cannot overwrite another operator', () => {
  const s = G.addScore(game(), 'home', 1),
    e = s.events[0]
  const first = correctEvent(s, e.id, { scorer: '17' }, eventDetails(e), 'A')
  assert.throws(
    () => correctEvent(first, e.id, { scorer: '9' }, eventDetails(e), 'B'),
    /Another operator/
  )
  const second = correctEvent(
    first,
    e.id,
    { scorer: '88' },
    eventDetails(first.events[0]),
    'B'
  )
  assert.throws(
    () => undoCorrection(second, first.corrections[0].id, 'A'),
    /Another operator/
  )
  // A disjoint assist correction can still merge.
  assert.equal(
    correctEvent(first, e.id, { a1: '9' }, eventDetails(e), 'B').events[0]
      .scorer,
    '17'
  )
})
test('event times validate period boundaries without accepting malformed clocks', () => {
  const s = game()
  for (const input of ['12:99', '-1:00', '20:00', ''])
    assert.throws(() => parseEventTime(s, '1', input))
  assert.throws(() => parseEventTime(s, '99', '01:00'))
})
test('three-way merge retains independent events and rejects conflicting corrections or deleted events', () => {
  const base = {
    home: { score: 1 },
    events: [{ id: 'one', scorer: '' }],
    updatedAt: 1,
  }
  const local = { ...base, events: [{ id: 'one', scorer: '17' }], updatedAt: 2 }
  const current = {
    home: { score: 2 },
    events: [
      { id: 'one', scorer: '' },
      { id: 'two', scorer: '' },
    ],
    updatedAt: 3,
  }
  const merged = mergeGame(base, local, current)
  assert.deepEqual(merged.conflicts, [])
  assert.equal(merged.state.home.score, 2)
  assert.deepEqual(merged.state.events, [
    { id: 'one', scorer: '17' },
    { id: 'two', scorer: '' },
  ])
  assert.ok(
    mergeGame(base, local, { ...base, events: [{ id: 'one', scorer: '88' }] })
      .conflicts.length
  )
  assert.ok(mergeGame(base, local, { ...base, events: [] }).conflicts.length)
})

test('a live penalty keeps counting across a duration correction and an undo', () => {
  const realNow = Date.now
  let at = 100000
  Date.now = () => at
  try {
    let s = G.addPenalty(game(), 'home', '33', 2, 'Tripping')
    s = G.startClock(s, { now: at })
    at += 45000
    const event = s.events.find((e) => e.type === 'penalty')
    const changed = correctEvent(
      s,
      event.id,
      { minutes: 4, player: '55' },
      eventDetails(event),
      'Stats keeper'
    )
    assert.equal(
      G.penaltyView(changed, at)[changed.penalties[0].id].remainingMs,
      195000
    )
    assert.deepEqual(changed.clock, s.clock)
    at += 10000
    const undone = undoCorrection(
      changed,
      changed.corrections[0].id,
      'Scorekeeper'
    )
    assert.equal(
      G.penaltyView(undone, at)[undone.penalties[0].id].remainingMs,
      65000
    )
    assert.equal(undone.penalties[0].player, '33')
    assert.deepEqual(undone.clock, s.clock)
  } finally {
    Date.now = realNow
  }
})

test('simultaneous goals on one team preserve both goals and count each exactly once', () => {
  const base = game(),
    local = G.addScore(base, 'home', 1),
    current = G.addScore(base, 'home', 1)
  const merged = mergeGame(base, local, current)
  assert.deepEqual(merged.conflicts, [])
  assert.equal(merged.state.home.score, 2)
  assert.equal(merged.state.events.filter((e) => e.type === 'goal').length, 2)
  assert.equal(mergeGame(base, local, local).state.home.score, 1)
})

test('shootout result corrections update attempts without adding to the manual game score', () => {
  const s = G.soAttempt(game(), 'home', false),
    event = s.events.find((e) => e.type === 'so')
  const edited = correctEvent(
    s,
    event.id,
    { scored: true, player: '17' },
    eventDetails(event),
    'Stats keeper'
  )
  assert.deepEqual(edited.shootout.home, ['goal'])
  assert.equal(edited.home.score, 0)
  assert.match(G.summaryText(edited), /attempt 1 goal/)
  assert.deepEqual(
    undoCorrection(edited, edited.corrections[0].id, 'Stats keeper').shootout
      .home,
    ['miss']
  )
})

test('summary orders a late-entered goal by its corrected game time',()=>{
  let s=G.addScore(game(),'home',1)
  s=G.setClock(s,12*G.MIN)
  s=G.addScore(s,'away',1)
  const first=s.events.find(e=>e.type==='goal'&&e.team==='home')
  s=correctEvent(s,first.id,parseEventTime(s,'1','10:00'),eventDetails(first),'Stats keeper')
  assert.deepEqual(G.gameSheet(s).goals.map(e=>e.team),['away','home'])
  assert.deepEqual(G.gameSheet(s).goals.map(e=>e.score),['0:1','1:1'])
  assert.equal(s.home.score,1)
})
