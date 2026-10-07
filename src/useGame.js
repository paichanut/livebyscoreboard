import { useEffect, useRef, useState } from 'react'
import { createStore } from './sync.js'
import { withDefaults } from './options.js'

export function useGame(gameId, opts = {}) {
  const storeRef = useRef(null)
  const [state, setState] = useState(null)
  const [access, setAccess] = useState('reading')

  useEffect(() => {
    const store = createStore(gameId, opts)
    storeRef.current = store
    const unsub = store.subscribe((s, a) => { setState(withDefaults(s)); setAccess(a) })
    return () => { unsub(); store.destroy(); storeRef.current = null }
  }, [gameId, opts.key])

  const update = fn => {
    const store = storeRef.current
    if (!store) return
    const cur = withDefaults(store.get())
    if (!cur) return
    const next = fn(cur)
    if (next !== cur) store.set(next)
  }

  return [state, update, access]
}

export function useTick(intervalMs, active = true) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setN(n => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
}

export const cleanCode = c => (c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)

// Game code from short path (/b/CODE, /c/CODE, /o/CODE) or ?g=CODE
export function useGameId() {
  const m = window.location.pathname.match(/^\/(b|c|o)\/([^/]+)/)
  const params = new URLSearchParams(window.location.search)
  return cleanCode(m ? decodeURIComponent(m[2]) : params.get('g')) || 'main'
}

export function useUrlKey() {
  return new URLSearchParams(window.location.search).get('k') || ''
}
