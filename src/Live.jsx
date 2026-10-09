// Tournament page: every game on this Supabase project (or in this browser, local mode), newest first.
import React, { useEffect, useState } from 'react'
import { createGamesList, ONLINE, storedKey } from './sync.js'
import { withDefaults } from './options.js'
import { clockShown, fmtClock, periodLabel, clockRemaining } from './game.js'
import { useTick } from './useGame.js'
import { now as serverNow } from './clock.js'

const ago = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export default function Live() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    const list = createGamesList()
    const unsub = list.subscribe(r => setRows(r))
    return () => { unsub(); list.destroy() }
  }, [])
  useTick(1000, Boolean(rows?.some(r => r.state?.clock?.running)))

  const now = serverNow()
  // skip rows that aren't games (e.g. a test row written straight to the table) instead of crashing
  const games = (rows || []).filter(r => r.state?.home && r.state?.clock).map(r => ({ ...r, state: withDefaults(r.state) }))
  // running clocks first, then most recently touched
  games.sort((a, b) => Number(Boolean(b.state.clock.running)) - Number(Boolean(a.state.clock.running)) || b.updatedAt - a.updatedAt)

  return (
    <div className="live">
      <div className="head">
        <h1>Live games</h1>
        <div className="mode">{ONLINE ? 'live sync on' : 'test build — games in this browser only'}</div>
      </div>
      {rows === null && <div className="loading">loading…</div>}
      {rows && !games.length && <div className="empty">No games yet. <a href="/">Create one</a>.</div>}
      <div className="grid">
        {games.map(({ id, state: s, updatedAt }) => {
          const running = s.clock.running && clockRemaining(s, now) > 0
          const isNum = !['OT', 'SO'].includes(s.period)
          return (
            <a className="game" key={id} href={`/b/${encodeURIComponent(id)}`} data-game={id}>
              <div className="meta">
                <span className="code">{s.opts.title || id}</span>
                <span className={`st ${running ? 'on' : ''}`}>{running ? 'LIVE' : ago(now - (updatedAt || s.updatedAt || now))}</span>
              </div>
              <div className="teams">
                <div className="t" style={{ '--c': s.home.color }}><span className="n">{s.home.name}</span><b className="tnum">{s.home.score}</b></div>
                <div className="t" style={{ '--c': s.away.color }}><span className="n">{s.away.name}</span><b className="tnum">{s.away.score}</b></div>
              </div>
              <div className="clock">
                <span>{isNum ? `${s.opts.labels.period} ${periodLabel(s)}` : periodLabel(s)}</span>
                <b className="tnum">{fmtClock(clockShown(s, now), { tenths: false })}</b>
              </div>
              {storedKey(id) && <span className="op" onClick={e => { e.preventDefault(); window.location.href = `/c/${encodeURIComponent(id)}` }}>operate ▸</span>}
            </a>
          )
        })}
      </div>
      <div className="foot"><a href="/">Home</a></div>
    </div>
  )
}
