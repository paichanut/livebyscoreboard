import React, { useState } from 'react'
import { ONLINE, randomKey, rememberKey } from './sync.js'
import { cleanCode } from './useGame.js'

export default function Home() {
  const [code, setCode] = useState('')
  const g = cleanCode(code)
  const newGame = () => {
    const id = g || `game-${randomKey(5)}`
    const key = randomKey()
    rememberKey(id, key)
    window.location.href = `/c/${id}?k=${key}`
  }
  return (
    <div className="home">
      <h1>Rinkboard</h1>
      <p>Hockey scoreboard that runs in a browser. You get an <b>operator link</b> (keep it private) and a <b>public link</b> to put on the TV or share with spectators.</p>
      <div className="code">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="game code (optional, e.g. rink-a)" />
      </div>
      <div className="links">
        <button className="btn primary" onClick={newGame}>Create new game</button>
        {g && <a className="btn" href={`/b/${g}`}>View display for "{g}"</a>}
      </div>
      <div className="mode">{ONLINE ? 'live sync on' : 'local mode — set Supabase keys for cross-device sync'}</div>
    </div>
  )
}
