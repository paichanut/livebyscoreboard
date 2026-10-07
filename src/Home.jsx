import React, { useState } from 'react'
import { ONLINE } from './sync.js'

export default function Home() {
  const [code, setCode] = useState('main')
  const g = encodeURIComponent(code.trim().toLowerCase() || 'main')
  return (
    <div className="home">
      <h1>Rinkboard</h1>
      <p>Hockey scoreboard that runs in a browser. Open the <b>display</b> on the TV, the <b>control</b> on your phone. Same game code = same game.</p>
      <div className="code">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="game code (e.g. rink-a)" />
      </div>
      <div className="links">
        <a className="btn primary" href={`/control?g=${g}`}>Open control</a>
        <a className="btn" href={`/board?g=${g}`}>Open display</a>
      </div>
      <div className="mode">{ONLINE ? 'live sync on' : 'local mode — set Supabase keys for cross-device sync'}</div>
    </div>
  )
}
