import React, { useEffect, useState } from 'react'
import { DESKTOP, ONLINE, getSession } from './sync.js'
import { desktopAddress } from '../lib/desktop-address.js'

// Namespaced addresses always resolve a desktop; legacy cloud games keep their route.
export default function DesktopLink({ children }) {
  const [state, setState] = useState(ONLINE && !DESKTOP ? 'loading' : 'game')
  const [error, setError] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  useEffect(() => {
    if (!ONLINE || DESKTOP) return
    let alive = true
    const abort = new AbortController()
    const resolve = async () => {
      const address = desktopAddress(window.location.pathname)
      if (!address) { setState('game'); return }
      if (address.invalid) { setError('Invalid desktop address.'); setState('error'); return }
      const {kind, code, username, namespaced} = address
      const login = '/login?' + new URLSearchParams({next:window.location.pathname + window.location.search,...(namespaced ? {account:username} : {})})
      const query = new URLSearchParams(window.location.search)
      const params = new URLSearchParams({code,kind:kind === 'c' ? 'b' : kind,...(namespaced ? {username} : {})})
      for (const option of ['rink','view']) if (query.has(option)) params.set(option,query.get(option))
      try {
        const r = await fetch('/api/desktop-link?' + params, {cache:'no-store',signal:abort.signal})
        const result = await r.json()
        if (!alive) return
        if (!r.ok) throw new Error(result.error || 'Could not find this desktop.')
        if (!result.desktop) {
          if (namespaced) throw new Error('Desktop not found.')
          setState('game'); return
        }
        // the desktop's online copy of its game: show it like any web game (/b/<game>, /o/<game>), same options
        if (kind !== 'c' && result.game && /^[a-z0-9-]{1,32}$/.test(result.game)) { window.location.replace(`/${kind}/${result.game}${window.location.search}`); return }
        if (kind === 'c' && !getSession()) { window.location.replace(login); return }
        let url = result.url
        if (kind === 'c') {
          const response = await fetch('/api/desktop-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,kind,action:'resolve',token:getSession(),rink:params.get('rink'),...(namespaced ? {version:2,username} : {})}),signal:abort.signal})
          const data = await response.json()
          if (!alive) return
          if (response.status === 401) { window.location.replace(login); return }
          if (response.status === 403) setLoginUrl(login)
          if (!response.ok) throw new Error(data.error || 'Could not open the controller.')
          if (!data.online) { setState('offline'); return }
          url = data.url
        } else if (!result.online) { setState('offline'); return }
        const target = new URL(url)
        if (target.protocol !== 'https:' || target.username || target.password || target.port || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(target.hostname)) throw new Error('Invalid desktop connection.')
        window.location.replace(url)
      } catch(e) { if (alive && e.name !== 'AbortError') { setError(e.message); setState('error') } }
    }
    resolve()
    return () => { alive=false; abort.abort() }
  }, [])
  if (state === 'game') return children
  return <main className="home"><h1>{state === 'offline' ? 'Desktop is offline' : state === 'error' ? 'Connection unavailable' : 'Connecting to desktop…'}</h1>
    <p>{state === 'offline' ? 'Open the desktop app and turn on Online link. This fixed address will work again when it reconnects.' : error || 'Finding the current connection…'}</p>
    {loginUrl && <a className="btn primary" href={loginUrl}>Sign in with the owning account</a>}
    {state !== 'loading' && <button className="btn primary" onClick={() => window.location.reload()}>Retry</button>}
    <a className="btn ghost" href="/">Home</a></main>
}
