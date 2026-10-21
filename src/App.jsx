import React, { lazy, Suspense, useEffect, useState } from 'react'
import Home from './Home.jsx'
import DesktopLink from './DesktopLink.jsx'
import Board from './Board.jsx'
import Control from './Control.jsx'
import Banner from './Banner.jsx'
import Live from './Live.jsx'
import Setup from './Setup.jsx'
import Login from './Login.jsx'
import Teams from './Teams.jsx'
import { CONFIGURED } from './sync.js'
import { Watermark } from './License.jsx'

const RefereeSignals = lazy(() => import('./RefereeSignals.jsx'))

function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path.replace(/\/+$/, '') || '/'
}

export default function App() {
  const path = usePath()
  if (path === '/referee-signals') return <Suspense fallback={<div className="loading">Loading referee signals…</div>}><RefereeSignals /></Suspense>
  if (!CONFIGURED) return <Setup />
  if (path === '/board' || path.startsWith('/b/')) return <DesktopLink><Board /><Watermark /></DesktopLink>
  if (path === '/control' || path.startsWith('/c/')) return <DesktopLink><Control /></DesktopLink>
  if (path === '/banner' || path.startsWith('/o/')) return <DesktopLink><Banner /><Watermark /></DesktopLink>
  if (path === '/live' || path === '/games') return <Live />
  if (path === '/login') return <Login />
  if (path === '/teams') return <Teams />
  return <Home />
}
