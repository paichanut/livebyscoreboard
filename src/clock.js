// Shared wall clock. Every clock calculation (game clock, penalties, timeouts, goal flash) goes
// through now() instead of Date.now(), so devices whose system time is off still agree once
// sync.js has measured the offset to the server. Pure: no React, no network.
import { shiftAt, steerShift } from './timesync.js'

let offset = 0
let accuracy = null
let synced = false
// A game copied online by the desktop app keeps the desktop computer's times (state.desktop.skew = its clock
// − the server's), so the pages showing it add that too and derive the same clock as its HDMI screen.
let gameSkew = 0
// the correction actually applied: offset + gameSkew, reached by steerShift (timesync.js)
let shift = { from: 0, to: 0, start: 0 }
// unknown until a game store reports it: then small corrections are spread out, as for a running clock
let clockRunning = true

// A page that syncs with a server counts from performance.now() (never jumps when the phone or computer
// sets its own clock mid-game); the offset to the server is re-measured every 10 s anyway.
const perf = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance : null
let base = 0
let monotonic = false
export const localNow = () => (monotonic ? base + perf.now() : Date.now())
export function useMonotonicClock() {
  if (!perf || monotonic) return
  base = Date.now() - perf.now()
  monotonic = true
}
// how far the counting clock has moved away from the system clock (a sleep, or the system clock set)
export const localDrift = () => localNow() - Date.now()

export const now = () => { const t = localNow(); return Math.round(t + shiftAt(shift, t)) }
// the wall-clock time of an input event (e.timeStamp): the clock stops at the instant of the press,
// even when the page was busy for a moment before the handler ran
export const nowAt = timeStamp => Math.round(now() - (perf && Number.isFinite(timeStamp) ? Math.max(0, perf.now() - timeStamp) : 0))
export const timeOffset = () => offset
// ± ms this device's clock may be off the server (half the fastest round trip), null before the first sync
export const timeAccuracy = () => accuracy
export const isTimeSynced = () => synced

const steer = jump => { shift = steerShift(shift, offset + gameSkew, localNow(), { jump: jump || !clockRunning }) }

export function setTimeOffset(ms, acc = null) {
  const first = !synced
  offset = Math.round(ms)
  accuracy = Number.isFinite(acc) ? Math.round(acc) : null
  synced = true
  steer(first)
}
export function setGameSkew(ms) {
  const next = Number.isFinite(ms) ? Math.round(ms) : 0
  if (next === gameSkew) return
  gameSkew = next
  steer(false)
}
// stores call this with the game: while the clock is stopped nothing on screen moves, so corrections apply at once
export function setClockRunning(running) {
  clockRunning = Boolean(running)
  if (!clockRunning) steer(true)
}
