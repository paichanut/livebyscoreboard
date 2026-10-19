// /handoff?to=https://….trycloudflare.com&next=/c/main — a controller link from the desktop app's online link.
// That page lives on another web address and can't see this site's saved login, so: logged in here → make
// a one-time code (60 s) and go back with it; not logged in → log in first, then come back here.
import React, { useEffect, useState } from 'react'
import { getSession, createHandoff } from './sync.js'

const TUNNEL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/

export default function Handoff() {
  const q = new URLSearchParams(window.location.search)
  const to = q.get('to') || ''
  const next = q.get('next') || '/c/main'
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!TUNNEL.test(to) || !/^\/c\/[\w-]+(\?[\w=&-]*)?$/.test(next)) { setErr('This link is not from a Live by Scoreboard desktop app.'); return }
    if (!getSession()) { window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return }
    createHandoff().then(code => {
      if (!code) { window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return }
      window.location.replace(`${to}/auth?code=${code}&next=${encodeURIComponent(next)}`)
    }, e => setErr(`Could not reach the server: ${e.message}`))
  }, [])
  return (
    <div className="home">
      <h1>Live by Scoreboard</h1>
      {err ? <div className="err">{err}</div> : <p>Opening the controller…</p>}
    </div>
  )
}
