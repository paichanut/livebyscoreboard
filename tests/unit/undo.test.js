import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../../src/game.js'
import { mergeGame } from '../../desktop/merge-game.mjs'
import { captureUndo, undoAction } from '../../src/undo.js'
import { correctEvent, eventDetails } from '../../src/statistics.js'

test('undo adds and removals without rewinding a running clock', () => {
  const initial = G.startClock(G.newGame()),
    goal = G.addScore(initial, 'home', 1)
  const undo = undoAction(goal, captureUndo(initial, goal))
  assert.equal(undo.home.score, 0)
  assert.equal(undo.events.length, 0)
  assert.deepEqual(undo.clock, goal.clock)
  const minus = G.addScore(goal, 'home', -1)
  const restored = undoAction(minus, captureUndo(goal, minus))
  assert.equal(restored.home.score, 1)
  assert.equal(restored.events[0].id, goal.events[0].id)
  assert.equal(captureUndo(initial, G.stopClock(initial)), null)
})
test('undo preserves the other operator’s new goal and rejects conflicting goal details', () => {
  const initial = G.newGame(),
    local = G.addScore(initial, 'home', 1),
    action = captureUndo(initial, local)
  const remote = G.addScore(local, 'away', 1),
    undone = undoAction(remote, action)
  assert.equal(undone.home.score, 0)
  assert.equal(undone.away.score, 1)
  assert.equal(undone.events.length, 1)
  assert.equal(undone.events[0].team, 'away')
  const corrected = correctEvent(
    local,
    local.events[0].id,
    { scorer: '17' },
    eventDetails(local.events[0]),
    'Other operator'
  )
  assert.throws(() => undoAction(corrected, action), /Another operator/)
})
test('undo a live penalty addition removes its call without touching the game clock', () => {
  const initial = G.startClock(G.newGame()),
    pen = G.addPenalty(initial, 'home', '33', 2, 'Tripping')
  const undone = undoAction(pen, captureUndo(initial, pen))
  assert.equal(undone.penalties.length, 0)
  assert.equal(undone.events.filter((e) => e.type === 'penalty').length, 0)
  assert.deepEqual(undone.clock, pen.clock)
})
test('undo corrections uses the existing audit history and keeps served time', () => {
  const initial = G.addPenalty(G.newGame(), 'home', '33', 2, 'Tripping'),
    event = initial.events[0]
  const edited = correctEvent(
    initial,
    event.id,
    { player: '55' },
    eventDetails(event),
    'Stats keeper'
  )
  const undone = undoAction(edited, captureUndo(initial, edited))
  assert.equal(undone.penalties[0].player, '33')
  assert.equal(undone.corrections.at(-1).undoOf, edited.corrections[0].id)
})
test('a penalty released by a mistaken goal can be restored while the clock stays paused', () => {
  const initial = G.addPenalty(G.newGame(), 'away', '33', 2, 'Tripping')
  const goal = G.addScore(initial, 'home', 1)
  assert.equal(goal.penalties.length, 0)
  const undone = undoAction(goal, captureUndo(initial, goal))
  assert.equal(undone.home.score, 0)
  assert.equal(undone.penalties[0].player, '33')
  const running = G.startClock(goal)
  assert.throws(
    () => undoAction(running, captureUndo(initial, goal)),
    /clock advanced/
  )
})
test('undo cannot restore data from the previous game after New game', () => {
  const initial = G.addScore(G.newGame(), 'home', 1),
    minus = G.addScore(initial, 'home', -1)
  const action = captureUndo(initial, minus),
    reset = G.resetGame(minus)
  assert.throws(() => undoAction(reset, action), /previous game/)
  assert.equal(reset.home.score, 0)
})
test('undoing details and then the goal handles optional empty metadata correctly', () => {
  const original = G.newGame(),
    goal = G.addScore(original, 'home', 1),
    goalAction = captureUndo(original, goal)
  const details = correctEvent(
    goal,
    goal.events[0].id,
    { scorer: '17', detailsComplete: true },
    eventDetails(goal.events[0]),
    'Stats keeper'
  )
  const reverted = undoAction(details, captureUndo(goal, details))
  const removed = undoAction(reverted, goalAction)
  assert.equal(removed.home.score, 0)
  assert.equal(removed.events.length, 0)
})

test('undo keeps downloaded team names, colors, logos and options intact', () => {
  const original = G.newGame()
  original.home = {
    ...original.home,
    name: 'Phoenix',
    color: '#ff8800',
    logo: 'cached-logo',
  }
  const scored = G.addScore(original, 'home', 1)
  const undone = undoAction(scored, captureUndo(original, scored))
  assert.equal(undone.home.name, 'Phoenix')
  assert.equal(undone.home.color, '#ff8800')
  assert.equal(undone.home.logo, 'cached-logo')
  assert.deepEqual(undone.opts, original.opts)
})

test('undoing a shot preserves raw fields so an unseen scorer correction can merge', () => {
  const goal = G.addScore(G.newGame(), 'home', 1),
    shot = G.addShot(goal, 'home', 1)
  const candidate = undoAction(shot, captureUndo(goal, shot))
  assert.deepEqual(candidate.events[0], goal.events[0])
  const remote = correctEvent(
    shot,
    goal.events[0].id,
    { scorer: '17' },
    eventDetails(goal.events[0]),
    'Other operator'
  )
  const merged = mergeGame(shot, candidate, remote)
  assert.deepEqual(merged.conflicts, [])
  assert.equal(merged.state.events[0].scorer, '17')
  assert.equal(merged.state.home.shots, 0)
})
