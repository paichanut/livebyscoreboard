import { useEffect, useRef, useState } from 'react'
import { createStore } from './sync.js'

export function useGame(gameId) {
  const storeRef = useRef(null)
  const [state, setState] = useState(null)

  useEffect(() => {
    const store = createStore(gameId)
    storeRef.current = store
    const unsub = store.subscribe(s => setState(s))
    return () => {
      unsub()
      store.destroy()
      storeRef.current = null
    }
  }, [gameId])

  // update(fn): fn receives latest state, returns next state
  const update = fn => {
    const store = storeRef.current
    if (!store) return
    const cur = store.get()
    if (!cur) return
    const next = fn(cur)
    if (next !== cur) store.set(next)
  }

  return [state, update]
}

// Re-render on an interval (for ticking clocks)
export function useTick(intervalMs, active = true) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setN(n => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
}

export function useGameId() {
  const params = new URLSearchParams(window.location.search)
  return (params.get('g') || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'main'
}
