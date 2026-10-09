// Shared wall clock. Every clock calculation (game clock, penalties, timeouts, goal flash) goes
// through now() instead of Date.now(), so devices whose system time is off still agree once
// sync.js has measured the offset to the server. Pure: no React, no network.
let offset = 0
let synced = false

export const now = () => Date.now() + offset
export const timeOffset = () => offset
export const isTimeSynced = () => synced

export function setTimeOffset(ms) {
  offset = Math.round(ms)
  synced = true
}
