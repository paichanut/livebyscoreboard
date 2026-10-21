import React, { useEffect, useState } from 'react'
import { DESKTOP, ONLINE, getSession } from './sync.js'

// A fixed address resolves to the desktop's current tunnel. Ordinary cloud games keep their route.
export default function DesktopLink({ children }) {
  const [state, setState] = useState(ONLINE && !DESKTOP ? 'loading' : 'game')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ONLINE || DESKTOP) return
    let alive = true
    const abort = new AbortController()
    const resolve = async () => {
      const [, kind, code] = window.location.pathname.split('/')
      if (!['b','c','o'].includes(kind) || !code) { setState('game'); return }
      const query = new URLSearchParams(window.location.search)
      const params = new URLSearchParams({code,kind:kind === 'c' ? 'b' : kind})
      for (const option of ['rink','view']) if (query.has(option)) params.set(option,query.get(option))
      try {
        const r = await fetch('/api/desktop-link?' + params, {cache:'no-store',signal:abort.signal})
        const result = await r.json()
        if (!alive) return
        if (r.status === 401 && kind === 'c' || result.desktop && kind === 'c' && !getSession()) {
          window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); return
        }
        if (!r.ok) throw new Error(result.error || 'Could not find this desktop.')
        if (!result.desktop) { setState('game'); return }
        if (!result.online) { setState('offline'); return }
        let url = result.url
        if (kind === 'c') {
          const response = await fetch('/api/desktop-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,kind,action:'resolve',token:getSession(),rink:params.get('rink')}),signal:abort.signal})
          const data = await response.json()
          if (response.status === 401) { window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); return }
          if (!response.ok) throw new Error(data.error || 'Could not open the controller.')
          if (!data.online) { setState('offline'); return }
          url = data.url
        }
        const target = new URL(url)
        if (target.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(target.hostname)) throw new Error('Invalid desktop connection.')
        window.location.replace(url)
      } catch(e) { if (alive && e.name !== 'AbortError') { setError(e.message); setState('error') } }
    }
    resolve()
    return () => { alive=false; abort.abort() }
  }, [])
  if (state === 'game') return children
  return <main className="home"><h1>{state === 'offline' ? 'Desktop is offline' : state === 'error' ? 'Connection unavailable' : 'Connecting to desktop…'}</h1>
    <p>{state === 'offline' ? 'Open the desktop app and turn on Online link. This fixed address will work again when it reconnects.' : error || 'Finding the current connection…'}</p>
    {state !== 'loading' && <button className="btn primary" onClick={() => window.location.reload()}>Retry</button>}
    <a className="btn ghost" href="/">Home</a></main>
}
