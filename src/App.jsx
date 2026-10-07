import React, { useEffect, useState } from 'react'
import Home from './Home.jsx'
import Board from './Board.jsx'
import Control from './Control.jsx'

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
  return <Home />
}

export function useTheme(theme) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark')
  }, [theme])
}
