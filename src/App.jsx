import React, { useEffect, useState } from 'react'
import Home from './Home.jsx'
import Board from './Board.jsx'
import Control from './Control.jsx'
import Banner from './Banner.jsx'
import Live from './Live.jsx'

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
  if (path === '/board' || path.startsWith('/b/')) return <Board />
  if (path === '/control' || path.startsWith('/c/')) return <Control />
  if (path === '/banner' || path.startsWith('/o/')) return <Banner />
  if (path === '/live' || path === '/games') return <Live />
  return <Home />
}
