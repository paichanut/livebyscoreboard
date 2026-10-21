import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../../src/game.js'

test('3x3 penalties award a shot, keep 3v3, preserve the call in the game log, and do not auto-score', () => {
  let s = G.newGame({skaters:3})
  s = G.addPenalty(s,'away','98',2,'Charging')
  const p = s.penalties[0]
  assert.equal(p.kind,'shot')
  assert.equal(G.penaltyStatus(s,p),'shot')
  assert.deepEqual(G.skaters(s),{home:3,away:3})
  assert.equal(G.releaseCandidate(s,'home'),null)
  assert.match(G.penaltyCallActive(s).text,/CHARGING · PENALTY SHOT/)
  assert.equal(G.activePenalties(s,'away').length,0)
  s = G.foldPenalties(s,Date.now()+300000)
  assert.equal(s.penalties.length,1,'a shot does not expire on a penalty timer')
  s = G.completePenaltyShot(s,p.id)
  assert.equal(s.penalties.length,0)
  assert.equal(s.home.score,0)
  assert.equal(s.events.filter(e=>e.type==='penalty').length,1)
  assert.equal(s.events.at(-1).reason,'penalty-shot')
  assert.match(G.gameSheet(s).penalties[0].offence,/Penalty shot/)
})

test('saved 3x3 timed penalties do not create a manpower advantage; ordinary games never fall below three', () => {
  let s = G.addPenalty(G.newGame(),'away','98',2,'Charging')
  s = {...s,skaters:3}
  assert.equal(G.penaltyStatus(s,s.penalties[0]),'shot')
  assert.deepEqual(G.skaters(s),{home:3,away:3})
  s = G.newGame()
  for (let i=0;i<5;i++) s=G.addPenalty(s,'away',i+1,2)
  assert.deepEqual(G.skaters(s),{home:5,away:3})
})
