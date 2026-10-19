// Desktop app past its licence date (desktop/license.cjs): everything keeps working, but every scoreboard and
// banner shows UNLICENSED across the middle and the control page opens "Contact for license" every 30 s.
// The app's own windows get { unlicensed, expires } from the preload; pages opened through the online link ask
// the desktop (/api/license). The web app never has it.
import React, { useEffect, useState } from 'react'
import { DESKTOP, VIEWER } from './sync.js'

export function useLicense() {
  const [lic, setLic] = useState(() => window.desktop?.license || null)
  useEffect(() => {
    if (lic || !DESKTOP || !VIEWER) return
    fetch('/api/license', { cache: 'no-store' }).then(r => r.json()).then(setLic, () => {})
  }, [])
  return lic
}

export function Watermark() {
  const lic = useLicense()
  return lic?.unlicensed ? <div className="unlicensed" aria-hidden="true">UNLICENSED</div> : null
}
