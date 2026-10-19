// Shared wall clock. Every clock calculation (game clock, penalties, timeouts, goal flash) goes
// through now() instead of Date.now(), so devices whose system time is off still agree once
// sync.js has measured the offset to the server. Pure: no React, no network.
let offset = 0
let synced = false

export const now = () => Date.now() + offset
// the wall-clock time of an input event (e.timeStamp): the clock stops at the instant of the press,
// even when the page was busy for a moment before the handler ran
export const nowAt = timeStamp => Math.round(now() - (Number.isFinite(timeStamp) ? Math.max(0, performance.now() - timeStamp) : 0))
export const timeOffset = () => offset
export const isTimeSynced = () => synced

export function setTimeOffset(ms) {
  offset = Math.round(ms)
  synced = true
}
