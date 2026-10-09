import React from 'react'
import { ONLINE } from './sync.js'
import { timeOffset, isTimeSynced } from './clock.js'

// Shows this device's clock offset to the server once it is bigger than half a second,
// so a phone or TV with a wrong system time is visible at a glance.
export default function TimeBadge() {
  if (!ONLINE || !isTimeSynced()) return null
  const off = timeOffset()
  if (Math.abs(off) < 500) return null
  return <span className="timebadge" title="this device's clock vs server"> · ⏱ {off > 0 ? '−' : '+'}{(Math.abs(off) / 1000).toFixed(1)}s</span>
}
