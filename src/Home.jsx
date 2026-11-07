import React, { useEffect, useState } from 'react'
import { ONLINE, NEEDS_LOGIN, randomKey, rememberKey, getSession, sessionUser, logout } from './sync.js'
import { cleanCode } from './useGame.js'
import { newGame as blankGame } from './game.js'
import { FULLRINK_AUTH, useFullRinkUser, displayName, signIn, signOut, skippedSignIn, skipSignIn, myBoards, createBoard, boardKey } from './fullrink.js'
import { ContactLinks, DEV } from './Contact.jsx'

export default function Home() {
  const [code, setCode] = useState('')
  const [session, setSession] = useState(getSession())
  const [mode, setMode] = useState('full') // 'full' rink | 'small' ice: two games on one rink, one clock
  const g = cleanCode(code)
  const frUser = useFullRinkUser()
  const [skipped, setSkipped] = useState(skippedSignIn())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canCreate = !NEEDS_LOGIN || Boolean(session) || Boolean(frUser)
  // the public demo login (operators.is_demo, supabase/demo-account.sql) may only run "demo-…" games
  const demo = Boolean(session) && sessionUser() === 'demo'
  const newGame = async () => {
    // signed in with FullRink: the board belongs to this account (My boards); the server makes it and hands back its key
    if (frUser) {
      const id = g || `game-${randomKey(5)}`
      const go = () => { window.location.href = `/c/${id}${mode === 'small' ? '?mode=small' : ''}` }
      setBusy(true); setErr('')
      try { await createBoard(id, blankGame()); go(); return } catch (e) {
        // the code is taken: fine if it is already one of my boards
        if (e.status === 409 && await boardKey(id).then(() => true, () => false)) { go(); return }
        // the server is not set up for FullRink boards yet: an operator login still creates games as before
        if (!(e.setup && session)) { setErr(e.message); setBusy(false); return }
        setBusy(false)
      }
    }
    const raw = g || `game-${randomKey(5)}`
    const id = demo && !raw.startsWith('demo-') ? cleanCode(`demo-${raw}`) : raw
    const m = mode === 'small' ? 'mode=small' : ''
    if (NEEDS_LOGIN) { window.location.href = `/c/${id}${m ? `?${m}` : ''}`; return } // the session creates it
    const key = randomKey()
    rememberKey(id, key)
    window.location.href = `/c/${id}?k=${key}${m ? `&${m}` : ''}`
  }
  // FullRink: choose once on this device: sign in with the FullRink account, or use it as before without signing in
  if (FULLRINK_AUTH && frUser === null && !skipped && !session) return (
    <div className="home fullrink-choose">
      <h1>Live by Scoreboard</h1>
      <p>One FullRink account for every FullRink app. Sign in to keep your boards in <b>My boards</b> and run them from any device, or carry on without an account: boards, share links and public displays work as before.</p>
      <div className="links">
        <button className="btn primary" onClick={() => signIn('/')}>Sign in with FullRink account</button>
        <button className="btn" onClick={() => { skipSignIn(); setSkipped(true) }}>Use without signing in</button>
        <a className="btn ghost" href="/live">Live games</a>
      </div>
      <p className="hint">Got a share link for an operator screen? Just open it: it works without signing in.</p>
    </div>
  )
  return (
    <div className="home">
      <h1>Live by Scoreboard</h1>
      {frUser && <div className="who fullrink-user">Signed in as <b>{displayName(frUser)}</b> (FullRink) · <button className="linkbtn" onClick={() => signOut()}>sign out</button></div>}
      <p>Hockey scoreboard that runs in a browser. Operators log in to run games. The <b>display</b>, the <b>OBS banner</b> and <b>live games</b> are public: anyone with the link can watch.</p>
      <div className="code">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="game code (optional, e.g. rink-a)" />
      </div>
      {canCreate && (
        <div className="rinkmode" role="radiogroup" aria-label="rink mode">
          <button className={`btn ${mode === 'full' ? 'on' : ''}`} role="radio" aria-checked={mode === 'full'} onClick={() => setMode('full')}>
            <b>Full rink</b><span>one game</span>
          </button>
          <button className={`btn ${mode === 'small' ? 'on' : ''}`} role="radio" aria-checked={mode === 'small'} onClick={() => setMode('small')}>
            <b>Small ice</b><span>2 games, one clock, line-change buzzer</span>
          </button>
        </div>
      )}
      <div className="links">
        {canCreate
          ? <button className="btn primary" onClick={newGame} disabled={busy}>{busy ? 'Creating…' : g ? `Run game "${g}"` : 'Create new game'}</button>
          : <a className="btn primary" href="/login">Operator login</a>}
        {FULLRINK_AUTH && frUser === null && <button className="btn" onClick={() => signIn('/')}>Sign in with FullRink account</button>}
        {g && <a className="btn" href={`/b/${g}`}>View display for "{g}"</a>}
        <a className="btn ghost" href="/live">Live games</a>
        <a className="btn ghost" href="/referee-signals">Referee signals · animated</a>
        {canCreate && <a className="btn ghost" href="/teams">Team logos</a>}
      </div>
      {err && <div className="err">{err}</div>}
      {frUser && <MyBoards />}
      {NEEDS_LOGIN && session && (<>
        {demo && <p className="hint">Demo login: your games get the code <b>demo-…</b> and only demo games can be run with it.</p>}
        <div className="who">logged in as <b>{sessionUser()}</b> · <button className="linkbtn" onClick={async () => { await logout(); setSession('') }}>log out</button></div>
      </>)}
      <div className="mode">{ONLINE ? 'live sync on' : 'test build — local store, this browser only'}</div>
      <div className="contact">
        <div className="who">Contact for license · <b>{DEV.name}</b></div>
        <ContactLinks />
      </div>
    </div>
  )
}

// The boards this FullRink account created (api/fullrink.js). Boards made without signing in are not listed:
// they stay ownerless and keep working by link.
function MyBoards() {
  const [boards, setBoards] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { myBoards().then(setBoards).catch(e => { setErr(e.message); setBoards([]) }) }, [])
  return (
    <div className="myboards">
      <h2>My boards</h2>
      {boards === null && <div className="hint">loading…</div>}
      {err && <div className="err">{err}</div>}
      {boards && !err && !boards.length && <div className="hint">No boards yet. Create one above: it is saved to your FullRink account.</div>}
      {boards?.length > 0 && <ul>
        {boards.map(b => (
          <li key={b.id} data-board={b.id}>
            <span className="name"><b>{b.title || b.id}</b>{(b.home || b.away) && <span> · {b.home} – {b.away}</span>}</span>
            <a className="btn sm primary" href={`/c/${encodeURIComponent(b.id)}`}>Operate</a>
            <a className="btn sm" href={`/b/${encodeURIComponent(b.id)}`}>Display</a>
          </li>
        ))}
      </ul>}
    </div>
  )
}
