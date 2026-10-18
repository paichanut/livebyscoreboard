import React, { useEffect, useState } from 'react'
import { login, logout, getSession, sessionUser, checkSession, NEEDS_LOGIN } from './sync.js'

// Operator login. Watching a game (display, banner, /live) never needs this.
export default function Login() {
  const next = new URLSearchParams(window.location.search).get('next') || '/'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [who, setWho] = useState(getSession() ? sessionUser() : '')

  useEffect(() => { if (getSession()) checkSession().then(ok => { if (!ok) setWho('') }) }, [])

  if (!NEEDS_LOGIN) return <div className="home"><h1>Live by Scoreboard</h1><p>This test build has no login.</p><a className="btn" href="/">Home</a></div>

  const submit = async e => {
    e.preventDefault()
    if (!user.trim() || !pw) return
    setBusy(true); setErr('')
    try {
      if (await login(user, pw)) window.location.href = safeNext
      else { setErr('Wrong username or password.'); setPw('') }
    } catch (x) { setErr('Could not reach the server. Check the connection and try again.') }
    setBusy(false)
  }

  if (who) return (
    <div className="home login">
      <h1>Live by Scoreboard</h1>
      <p>Logged in as <b>{who}</b>. You can create and run any game on this device.</p>
      <div className="links">
        <a className="btn primary" href={safeNext}>Continue</a>
        <a className="btn" href="/live">Live games</a>
        <button className="btn ghost" onClick={async () => { await logout(); setWho('') }}>Log out</button>
      </div>
    </div>
  )

  return (
    <form className="home login" onSubmit={submit}>
      <h1>Live by Scoreboard</h1>
      <p>Operator login. Spectators, the TV display and the OBS banner do not need this.</p>
      <div className="fields">
        <input id="login-user" autoComplete="username" autoCapitalize="none" placeholder="username" value={user} onChange={e => setUser(e.target.value)} autoFocus />
        <input id="login-pass" type="password" autoComplete="current-password" placeholder="password" value={pw} onChange={e => setPw(e.target.value)} />
      </div>
      {err && <div className="err">{err}</div>}
      <div className="links">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
        <a className="btn ghost" href="/live">Watch live games</a>
      </div>
    </form>
  )
}
