import React, { useState } from 'react'
import { ONLINE, NEEDS_LOGIN, randomKey, rememberKey, getSession, sessionUser, logout } from './sync.js'
import { cleanCode } from './useGame.js'
import { ContactLinks, DEV } from './Contact.jsx'

export default function Home() {
  const [code, setCode] = useState('')
  const [session, setSession] = useState(getSession())
  const g = cleanCode(code)
  const canCreate = !NEEDS_LOGIN || Boolean(session)
  const newGame = () => {
    const id = g || `game-${randomKey(5)}`
    if (NEEDS_LOGIN) { window.location.href = `/c/${id}`; return } // the session creates it
    const key = randomKey()
    rememberKey(id, key)
    window.location.href = `/c/${id}?k=${key}`
  }
  return (
    <div className="home">
      <h1>Live by Scoreboard</h1>
      <p>Hockey scoreboard that runs in a browser. Operators log in to run games. The <b>display</b>, the <b>OBS banner</b> and <b>live games</b> are public: anyone with the link can watch.</p>
      <div className="code">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="game code (optional, e.g. rink-a)" />
      </div>
      <div className="links">
        {canCreate
          ? <button className="btn primary" onClick={newGame}>{g ? `Run game "${g}"` : 'Create new game'}</button>
          : <a className="btn primary" href="/login">Operator login</a>}
        {g && <a className="btn" href={`/b/${g}`}>View display for "{g}"</a>}
        <a className="btn ghost" href="/live">Live games</a>
        {canCreate && <a className="btn ghost" href="/teams">Team logos</a>}
      </div>
      {NEEDS_LOGIN && session && (
        <div className="who">logged in as <b>{sessionUser()}</b> · <button className="linkbtn" onClick={async () => { await logout(); setSession('') }}>log out</button></div>
      )}
      <div className="mode">{ONLINE ? 'live sync on' : 'test build — local store, this browser only'}</div>
      <div className="contact">
        <div className="who">Contact developer · <b>{DEV.name}</b></div>
        <ContactLinks />
      </div>
    </div>
  )
}
