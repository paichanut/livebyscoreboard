import React, { useEffect, useState } from 'react'
import Home from './Home.jsx'
import Board from './Board.jsx'
import Control from './Control.jsx'
import Banner from './Banner.jsx'

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
  if (path === '/board') return <Board />
  if (path === '/control') return <Control />
  if (path === '/banner') return <Banner />
  return <Home />
}
