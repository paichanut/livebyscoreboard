import React, { useEffect, useState } from 'react'
import { useGame, useGameId, useTick } from './useGame.js'
import * as G from './game.js'
import { ONLINE } from './sync.js'
import { useTheme } from './App.jsx'

const THEMES = [
  ['dark', 'Dark arena'],
  ['light', 'Light'],
  ['led', 'LED classic'],
  ['ice', 'Ice'],
]

export default function Control() {
  const gameId = useGameId()
  const [s, update] = useGame(gameId)
  useTheme(s?.theme)
  useTick(100, Boolean(s?.clock.running || s?.timeout))
  const [sheet, setSheet] = useState(null) // 'pen-home' | 'pen-away' | 'settings' | 'qr' | 'setclock'

  // Operator is the authority: stop the clock when it reaches 0, prune expired penalties
  const remainingNow = s ? G.clockRemaining(s) : 0
  useEffect(() => {
    if (s?.clock.running && remainingNow <= 0) update(G.stopClock)
  }, [s?.clock.running, remainingNow <= 0])
  useEffect(() => {
    const id = setInterval(() => update(x => {
      let n = G.pruneExpiredPenalties(x)
      if (n.timeout && G.timeoutRemaining(n) <= 0) n = G.clearTimeout_(n)
      return n
    }), 1000)
    return () => clearInterval(id)
  }, [])

  // Keyboard shortcuts (laptop at the bench)
  useEffect(() => {
    const on = e => {
      if (sheet || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const k = e.key.toLowerCase()
      if (e.code === 'Space') { e.preventDefault(); update(G.toggleClock) }
      else if (k === 'h') update(x => G.addScore(x, 'home', 1))
      else if (k === 'a') update(x => G.addScore(x, 'away', 1))
      else if (k === 'j') update(x => G.addShot(x, 'home', 1))
      else if (k === 's') update(x => G.addShot(x, 'away', 1))
      else if (k === 'n') update(G.nextPeriod)
      else if (k === 'b') update(G.fireHorn)
      else if (e.key === 'ArrowUp') update(x => G.adjustClock(x, 1000))
      else if (e.key === 'ArrowDown') update(x => G.adjustClock(x, -1000))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [sheet])

  if (!s) return <div className="loading">connecting…</div>

  const remaining = G.clockRemaining(s)
  const running = s.clock.running
  const strength = G.strengthLabel(s)
  const boardUrl = `${window.location.origin}/board?g=${encodeURIComponent(gameId)}`

  return (
    <div className="control">
      <div className="top">
        <span>game · {gameId}</span>
        <span className={ONLINE ? 'live' : 'local'}>{ONLINE ? '● live' : '● local only'}</span>
      </div>

      <div className="card clockcard">
        <div className="p">
          <span>{s.period === 'OT' || s.period === 'SO' ? <b>{s.period}</b> : <>PERIOD <b>{s.period}</b></>}</span>
          {strength && <span className="st">{strength}</span>}
        </div>
        <div className={`c tnum ${remaining <= 0 ? 'final' : ''}`}>{G.fmtClock(remaining)}</div>
        <div className="row">
          <button className={`btn big ${running ? 'danger' : 'primary'}`} onClick={() => update(G.toggleClock)} disabled={!running && remaining <= 0}>
            {running ? 'STOP' : 'START'}
          </button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, -60000))}>−1:00</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, -1000))}>−0:01</button>
          <button className="btn sm accent" onClick={() => setSheet('setclock')}>SET</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, 1000))}>+0:01</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, 60000))}>+1:00</button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => { const i = G.PERIODS.indexOf(s.period); if (i > 0 && confirm(`Go back to period ${G.PERIODS[i - 1]}? Clock will reset.`)) update(x => G.setPeriod(x, G.PERIODS[i - 1])) }}>◀ Period</button>
          <button className="btn sm" onClick={() => { if (confirm('Next period? Clock will reset.')) update(G.nextPeriod) }}>Period ▶</button>
          <button className="btn sm" onClick={() => update(G.fireHorn)}>📯 Horn</button>
        </div>
        <div className="row">
          {s.timeout && G.timeoutRemaining(s) > 0 ? (
            <button className="btn sm accent" onClick={() => update(G.clearTimeout_)}>
              Timeout {s[s.timeout.team].name} · {G.fmtClock(G.timeoutRemaining(s))} — end
            </button>
          ) : (
            <>
              <button className="btn sm" onClick={() => setSheet('timeout-30')}>Timeout 0:30</button>
              <button className="btn sm" onClick={() => setSheet('timeout-60')}>Timeout 1:00</button>
            </>
          )}
        </div>
      </div>

      <div className="teams">
        {['home', 'away'].map(team => {
          const t = s[team]
          return (
            <div className="tc" key={team} style={{ '--c': t.color }}>
              <div className="n">{t.name}</div>
              <div className="s tnum">{t.score}</div>
              <button className="goal" onClick={() => update(x => G.addScore(x, team, 1))}>+ GOAL</button>
              <div className="mini">
                <button className="btn" onClick={() => update(x => G.addScore(x, team, -1))}>−1</button>
                <button className="btn" onClick={() => update(x => G.addShot(x, team, 1))}>Shot +</button>
                <button className="btn" onClick={() => setSheet(`pen-${team}`)}>Penalty</button>
              </div>
              <div className="sh">Shots <b className="tnum">{t.shots}</b> <button onClick={() => update(x => G.addShot(x, team, -1))}>−</button></div>
              {G.activePenalties(s, team).map(p => (
                <div className="pen" key={p.id}>
                  <div>{p.player ? `#${p.player}` : 'PEN'}</div>
                  <span className="tnum">{G.fmtClock(G.penaltyRemaining(s, p), { tenths: false })}</span>
                  <button onClick={() => update(x => G.removePenalty(x, p.id))}>✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="bottom">
        <button className="btn" onClick={() => setSheet('settings')}>⚙ Settings</button>
        <a className="btn" href={boardUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>📺 Display</a>
        <button className="btn" onClick={() => setSheet('qr')}>QR</button>
      </div>

      {sheet?.startsWith('pen-') && <PenaltySheet team={sheet.slice(4)} s={s} update={update} close={() => setSheet(null)} />}
      {sheet === 'setclock' && <SetClockSheet s={s} update={update} close={() => setSheet(null)} />}
      {sheet?.startsWith('timeout-') && (
        <Sheet close={() => setSheet(null)}>
          <h3>Timeout {sheet === 'timeout-30' ? '0:30' : '1:00'} — which team?</h3>
          <div className="choices">
            {['home', 'away'].map(team => (
              <button key={team} className="btn" style={{ background: s[team].color, color: '#fff' }}
                onClick={() => { update(x => G.startTimeout(x, team, sheet === 'timeout-30' ? 30 : 60)); setSheet(null) }}>{s[team].name}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setSheet(null)}>Cancel</button>
        </Sheet>
      )}
      {sheet === 'settings' && <SettingsSheet s={s} update={update} close={() => setSheet(null)} />}
      {sheet === 'qr' && <QrSheet url={boardUrl} close={() => setSheet(null)} />}
    </div>
  )
}

function Sheet({ children, close }) {
  return (
    <div className="sheet-bg" onClick={close}>
      <div className="sheet" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function PenaltySheet({ team, s, update, close }) {
  const [player, setPlayer] = useState('')
  const [mins, setMins] = useState(2)
  const add = () => { update(x => G.addPenalty(x, team, player, mins)); close() }
  return (
    <Sheet close={close}>
      <h3 style={{ color: s[team].color }}>Penalty · {s[team].name}</h3>
      <label>Player number
        <input inputMode="numeric" autoFocus value={player} onChange={e => setPlayer(e.target.value)} placeholder="#" onKeyDown={e => e.key === 'Enter' && add()} />
      </label>
      <label>Length
        <div className="choices">
          {[2, 4, 5, 10].map(m => <button key={m} className={`btn ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{m} min</button>)}
        </div>
      </label>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={add}>Add penalty</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </Sheet>
  )
}

function SetClockSheet({ s, update, close }) {
  const rem = G.clockRemaining(s)
  const [m, setM] = useState(Math.floor(rem / 60000))
  const [sec, setSec] = useState(Math.floor((rem % 60000) / 1000))
  const apply = () => { update(x => G.setClock(x, (Number(m) || 0) * 60000 + (Number(sec) || 0) * 1000)); close() }
  return (
    <Sheet close={close}>
      <h3>Set clock</h3>
      <div className="grid2">
        <label>Minutes<input inputMode="numeric" value={m} onChange={e => setM(e.target.value)} autoFocus /></label>
        <label>Seconds<input inputMode="numeric" value={sec} onChange={e => setSec(e.target.value)} /></label>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={apply}>Set</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </Sheet>
  )
}

function SettingsSheet({ s, update, close }) {
  const [home, setHome] = useState(s.home)
  const [away, setAway] = useState(s.away)
  const [periodMin, setPeriodMin] = useState(s.periodLengthMs / 60000)
  const [skaters, setSkaters] = useState(s.skaters)
  const [theme, setTheme] = useState(s.theme || 'dark')
  const save = () => {
    update(x => {
      let n = G.setTeam(x, 'home', { name: home.name.trim() || 'HOME', color: home.color })
      n = G.setTeam(n, 'away', { name: away.name.trim() || 'AWAY', color: away.color })
      n = G.setSettings(n, { periodLengthMs: Math.max(1, Number(periodMin) || 15) * 60000, skaters: Number(skaters), theme })
      return n
    })
    close()
  }
  return (
    <Sheet close={close}>
      <h3>Settings</h3>
      <div className="grid2">
        <label>Home team<input value={home.name} onChange={e => setHome({ ...home, name: e.target.value })} /></label>
        <label>Color<input type="color" value={home.color} onChange={e => setHome({ ...home, color: e.target.value })} /></label>
        <label>Away team<input value={away.name} onChange={e => setAway({ ...away, name: e.target.value })} /></label>
        <label>Color<input type="color" value={away.color} onChange={e => setAway({ ...away, color: e.target.value })} /></label>
        <label>Period length (min)<input inputMode="numeric" value={periodMin} onChange={e => setPeriodMin(e.target.value)} /></label>
        <label>Skaters per side
          <div className="choices">
            {[3, 4, 5].map(n => <button key={n} className={`btn ${skaters === n ? 'on' : ''}`} onClick={() => setSkaters(n)}>{n}v{n}</button>)}
          </div>
        </label>
      </div>
      <label>Theme
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {THEMES.map(([id, label]) => <button key={id} className={`btn sm ${theme === id ? 'on' : ''}`} onClick={() => setTheme(id)}>{label}</button>)}
        </div>
      </label>
      <div className="keys">
        Keyboard: <kbd>Space</kbd> start/stop · <kbd>H</kbd>/<kbd>A</kbd> goal · <kbd>J</kbd>/<kbd>S</kbd> shot · <kbd>N</kbd> next period · <kbd>B</kbd> horn · <kbd>↑</kbd><kbd>↓</kbd> ±1s
      </div>
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={save}>Save</button>
        <button className="btn ghost" onClick={close}>Cancel</button>
      </div>
      <button className="btn danger sm" onClick={() => { if (confirm('Reset scores, clock and penalties for a new game?')) { update(G.resetGame); close() } }}>Reset game</button>
    </Sheet>
  )
}

function QrSheet({ url, close }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=0&data=${encodeURIComponent(url)}`
  return (
    <Sheet close={close}>
      <h3>Share display</h3>
      <div className="qr">
        <img src={src} alt="QR code" />
        <div className="url">{url}</div>
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
      </div>
      <button className="btn ghost" onClick={close}>Close</button>
    </Sheet>
  )
}
