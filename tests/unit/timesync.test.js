import test from 'node:test'
import assert from 'node:assert/strict'
import { createTimeFilter, shiftAt, steerShift, JUMP_MS, SLEW_MS } from '../../src/timesync.js'
import { now, setTimeOffset, setClockRunning, setGameSkew } from '../../src/clock.js'

test('the fastest round trip of the last minutes sets the offset; a slow lopsided one does not move it', () => {
  const f = createTimeFilter()
  f.add({ at: 0, rtt: 200, offset: 1080 })
  assert.equal(f.add({ at: 10_000, rtt: 30, offset: 1000 }).offset, 1000)
  // 4G hiccup: 300 ms round trip that went mostly one way, estimate 120 ms off; its range still holds 1000
  assert.equal(f.add({ at: 20_000, rtt: 300, offset: 1120 }).offset, 1000)
  // five minutes later the old fast one is gone
  assert.equal(f.add({ at: 320_000, rtt: 60, offset: 1010 }).offset, 1010)
})

test('a clock that really moved is taken once two fresh round trips agree on it', () => {
  const f = createTimeFilter()
  f.add({ at: 0, rtt: 20, offset: 0 })
  // the computer slept or set its clock: 400 ms now, impossible next to the old ±10 ms
  assert.equal(f.add({ at: 10_000, rtt: 40, offset: 400 }).offset, 0, 'one round trip alone is not trusted')
  assert.equal(f.add({ at: 20_000, rtt: 50, offset: 410 }).offset, 400, 'two that agree replace the old ones')
  // a single wild one after that is ignored again
  assert.equal(f.add({ at: 30_000, rtt: 30, offset: -300 }).offset, 400)
})

test('steering: over 0.1 s jumps at once, smaller changes slide over one second', () => {
  let s = { from: 0, to: 0, start: 0 }
  s = steerShift(s, 60, 1000)
  assert.equal(shiftAt(s, 1000), 0)
  assert.equal(shiftAt(s, 1000 + SLEW_MS / 2), 30)
  assert.equal(shiftAt(s, 1000 + SLEW_MS), 60)
  s = steerShift(s, 60 + JUMP_MS + 1, 5000)
  assert.equal(shiftAt(s, 5000), 161, 'more than 0.1 s: at once')
  s = steerShift(s, 140, 6000, { jump: true })
  assert.equal(shiftAt(s, 6000), 140, 'clock stopped: at once')
})

test('a running clock never repeats or skips a tenth while a small correction slides in', () => {
  let s = steerShift({ from: 0, to: 0, start: 0 }, -90, 0)
  let last = 600
  for (let t = 0; t <= 2000; t += 10) {
    const shown = Math.floor((60_000 - (t + shiftAt(s, t))) / 100)
    assert.ok(shown <= last && last - shown <= 1, `tenths step by one at ${t} ms`)
    last = shown
  }
})

test('clock.js: stopped clock takes a small correction at once, a running one slides', () => {
  setTimeOffset(0)
  setClockRunning(true)
  setTimeOffset(50)
  assert.ok(Math.abs(now() - Date.now()) < 10, 'running: the 50 ms has not arrived yet')
  setClockRunning(false)
  assert.ok(Math.abs(now() - Date.now() - 50) < 10, 'stopped: at once')
  setClockRunning(true)
  setGameSkew(undefined); setTimeOffset(0); setClockRunning(false); setClockRunning(true)
})
