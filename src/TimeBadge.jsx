import React from 'react'
import { ONLINE, VIEWER } from './sync.js'
import { timeOffset, timeAccuracy, isTimeSynced } from './clock.js'

// How exactly this device follows the server clock ("sync ±12 ms": half the fastest round trip of the last
// minutes; red over 0.1 s), plus the device's own clock offset once that is over half a second, so a phone
// or TV with a wrong system time or a poor connection is visible at a glance.
export default function TimeBadge() {
  if (!(ONLINE || VIEWER) || !isTimeSynced()) return null
  const off = timeOffset()
  const acc = timeAccuracy()
  return (
    <span className={`timebadge ${acc > 100 ? 'poor' : ''}`} title="how exactly this screen follows the server clock">
      {acc !== null && <> · sync ±{acc} ms</>}
      {Math.abs(off) >= 500 && <> · ⏱ {off > 0 ? '−' : '+'}{(Math.abs(off) / 1000).toFixed(1)}s</>}
    </span>
  )
}
