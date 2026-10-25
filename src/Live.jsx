// Tournament page: every game on this Supabase project (or in this browser, local mode), newest first.
// Logged in (Pai 2026-10-25), it shows only this login's own games (the admin: every game; demo: demo-…), never
// another operator's; logged out it stays the public tournament list.
import React, { useEffect, useState } from 'react'
import { createGamesList, ONLINE, NEEDS_LOGIN, storedKey, getSession, deleteGame, myGames } from './sync.js'
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
  const [manage, setManage] = useState(false)
  const [mine, setMine] = useState(null)
  const [mineError, setMineError] = useState(false)
  const loggedIn = Boolean(getSession())
  const canManage = !NEEDS_LOGIN || loggedIn
  // logged in online: only the games my_games() names (none until it answers); otherwise every game
  const onlyMine = ONLINE && loggedIn
  const isMine = id => (onlyMine ? Boolean(mine?.has(id)) : canManage)
  const remove = async (id, name) => {
    if (!window.confirm(`Delete game "${name}" for good? Its display and banner links stop working.`)) return
    try {
      if (await deleteGame(id)) setRows(r => (r || []).filter(x => x.id !== id))
      else window.alert('Not deleted: log in again as an operator.')
    } catch (e) { window.alert(`Delete failed: ${e.message}`) }
  }
  useEffect(() => {
    const list = createGamesList()
    const unsub = list.subscribe(r => setRows(r))
    return () => { unsub(); list.destroy() }
  }, [])
  // which of them are mine: again whenever a game appears or goes
  const ids = (rows || []).map(r => r.id).sort().join(' ')
  useEffect(() => {
    let live = true
    myGames().then(set => { if (live) { setMine(set || new Set()); setMineError(false) } })
      .catch(() => { if (live) { setMine(new Set()); setMineError(true) } })
    return () => { live = false }
  }, [ids])
  useTick(1000, Boolean(rows?.some(r => r.state.clock?.running)))

  const now = serverNow()
  // skip rows that are not scoreboard games (a broken or foreign row must not take the page down)
  const games = (rows || []).filter(r => r.state?.home && r.state?.away && r.state?.clock).map(r => ({ ...r, state: withDefaults(r.state) }))
  // running clocks first, then most recently touched
  games.sort((a, b) => Number(Boolean(b.state.clock.running)) - Number(Boolean(a.state.clock.running)) || b.updatedAt - a.updatedAt)
  const shown = onlyMine ? games.filter(g => isMine(g.id)) : games
  const loading = rows === null || (onlyMine && mine === null)

  return (
    <div className="live">
      <div className="head">
        <h1>{onlyMine ? 'My games' : 'Live games'}</h1>
        <div className="mode">{ONLINE ? 'live sync on' : 'test build — games in this browser only'}</div>
        {canManage && <button className={`btn sm ${manage ? 'accent' : ''}`} onClick={() => setManage(!manage)}>{manage ? 'Done' : 'Manage games'}</button>}
      </div>
      {loading && <div className="loading">loading…</div>}
      {mineError && <div className="empty">Could not load your games. Check the connection, or log in again.</div>}
      {!loading && !mineError && !shown.length && <div className="empty">{onlyMine ? 'No games of yours yet.' : 'No games yet.'} <a href="/">Create one</a>.</div>}
      <div className="grid">
        {!loading && shown.map(({ id, state: s, updatedAt }) => {
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
              {manage && isMine(id) && <button className="btn sm del" aria-label={`delete game ${id}`} onClick={e => { e.preventDefault(); remove(id, s.opts.title || id) }}>🗑 Delete</button>}
              {(storedKey(id) || (loggedIn && isMine(id))) && <span className="op" onClick={e => { e.preventDefault(); window.location.href = `/c/${encodeURIComponent(id)}` }}>operate ▸</span>}
            </a>
          )
        })}
      </div>
      <div className="foot"><a href="/">Home</a></div>
    </div>
  )
}
