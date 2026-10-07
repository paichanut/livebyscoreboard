import React, { useEffect, useState } from 'react'
import { useGame, useGameId, useTick, useUrlKey } from './useGame.js'
import * as G from './game.js'
import { ONLINE, randomKey, rememberKey, storedKey } from './sync.js'
import { useAppearance } from './useOptions.jsx'
import Options from './Options.jsx'

export default function Control() {
  const gameId = useGameId()
  // operator key: from URL ?k=, else remembered in this browser, else a fresh one (creates the game if it doesn't exist)
  const [key] = useState(() => {
    const k = useUrlKey() || storedKey(gameId) || randomKey()
    rememberKey(gameId, k)
    return k
  })
  const [s, update, access] = useGame(gameId, { key, canWrite: true })
  useAppearance(s)
  useEffect(() => {
    const u = new URL(window.location.href)
    if (u.searchParams.get('k') !== key) { u.searchParams.set('k', key); window.history.replaceState(null, '', u) }
  }, [key])
  useTick(100, Boolean(s?.clock.running || s?.timeout))
  const [sheet, setSheet] = useState(null)

  const ask = (key, msg) => !s.opts.confirm[key] || confirm(msg)

  // Operator is the authority: stop clock at 0, prune expired penalties, end timeouts
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

  // Keyboard shortcuts — rebindable in Options → Keys
  useEffect(() => {
    if (!s) return
    const on = e => {
      if (sheet || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      const k = s.opts.keys
      const code = e.code
      const act = Object.keys(k).find(name => k[name] && k[name] === code)
      if (!act) return
      e.preventDefault()
      const map = {
        startStop: G.toggleClock,
        homeGoal: x => G.addScore(x, 'home', 1), homeGoalMinus: x => G.addScore(x, 'home', -1),
        homeShot: x => G.addShot(x, 'home', 1), homeShotMinus: x => G.addShot(x, 'home', -1),
        awayGoal: x => G.addScore(x, 'away', 1), awayGoalMinus: x => G.addScore(x, 'away', -1),
        awayShot: x => G.addShot(x, 'away', 1), awayShotMinus: x => G.addShot(x, 'away', -1),
        periodPlus: x => (ask('period', 'Next period? Clock will reset.') ? G.nextPeriod(x) : x),
        periodMinus: x => (ask('period', 'Previous period? Clock will reset.') ? G.prevPeriod(x) : x),
        clockPlus: x => G.adjustClock(x, 1000), clockMinus: x => G.adjustClock(x, -1000),
        horn: G.fireHorn, buzzer: G.fireBuzzer,
        timeout1: () => { setSheet('timeout-1'); return null }, timeout2: () => { setSheet('timeout-2'); return null },
        newGame: x => (ask('newGame', 'Start a new game? Scores and clock reset.') ? G.resetGame(x) : x),
      }
      const fn = map[act]
      if (fn) update(x => fn(x) ?? x)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [sheet, s?.opts?.keys, s?.opts?.confirm])

  if (access === 'locked') return <LockedScreen gameId={gameId} />
  if (!s) return <div className="loading">connecting…</div>

  const o = s.opts
  const remaining = G.clockRemaining(s)
  const running = s.clock.running
  const strength = G.strengthLabel(s)
  const origin = window.location.origin
  const boardUrl = `${origin}/b/${encodeURIComponent(gameId)}`
  const bannerUrl = `${origin}/o/${encodeURIComponent(gameId)}`
  const controlUrl = `${origin}/c/${encodeURIComponent(gameId)}?k=${key}`
  const isNum = !['OT', 'SO'].includes(s.period)

  return (
    <div className="control">
      <div className="top">
        <span>game · {gameId}</span>
        <span className={ONLINE ? 'live' : 'local'}>{ONLINE ? '● live' : '● local only'}</span>
      </div>

      <div className="card clockcard">
        <div className="p">
          <span>{isNum ? <>{o.labels.period} <b>{G.periodLabel(s)}</b></> : <b>{G.periodLabel(s)}</b>}</span>
          {strength && <span className="st">{strength}</span>}
          {o.clockDir === 'up' && <span style={{ fontSize: 12 }}>▲ up</span>}
        </div>
        <div className={`c tnum ${remaining <= 0 ? 'final' : ''}`}>{G.fmtClock(G.clockShown(s))}</div>
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
          <button className="btn sm" onClick={() => { if (ask('period', 'Previous period? Clock will reset.')) update(G.prevPeriod) }}>◀ Period</button>
          <button className="btn sm" onClick={() => { if (ask('period', 'Reset period clock?')) update(G.resetClock) }}>Reset</button>
          <button className="btn sm" onClick={() => { if (ask('period', 'Next period? Clock will reset.')) update(G.nextPeriod) }}>Period ▶</button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => update(G.fireHorn)}>📯 Horn</button>
          <button className="btn sm" onClick={() => update(G.fireBuzzer)}>🔔 Buzzer</button>
          {s.timeout && G.timeoutRemaining(s) > 0 ? (
            <button className="btn sm accent" onClick={() => update(G.clearTimeout_)} style={{ flex: 2 }}>
              {o.labels.timeout} {s[s.timeout.team].name} · {G.fmtClock(G.timeoutRemaining(s))} — end
            </button>
          ) : (
            <>
              <button className="btn sm" onClick={() => setSheet('timeout-1')}>T/O {G.fmtClock(o.timeout1Sec * 1000, { tenths: false })}</button>
              <button className="btn sm" onClick={() => setSheet('timeout-2')}>T/O {G.fmtClock(o.timeout2Sec * 1000, { tenths: false })}</button>
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
              <div className="sh">{o.labels.shots} <b className="tnum">{t.shots}</b> <button onClick={() => update(x => G.addShot(x, team, -1))}>−</button></div>
              {G.activePenalties(s, team).map(p => (
                <div className="pen" key={p.id}>
                  <div>{p.player ? `#${p.player}` : 'PEN'}</div>
                  <span className="tnum">{G.fmtClock(G.penaltyRemaining(s, p), { tenths: false })}</span>
                  <button onClick={() => { if (ask('removePenalty', 'Remove this penalty?')) update(x => G.removePenalty(x, p.id)) }}>✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="bottom">
        <button className="btn" onClick={() => setSheet('options')}>⚙ Options</button>
        <a className="btn" href={boardUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>📺 Display</a>
        <button className="btn" onClick={() => setSheet('qr')}>QR</button>
      </div>

      {sheet?.startsWith('pen-') && <PenaltySheet team={sheet.slice(4)} s={s} update={update} close={() => setSheet(null)} />}
      {sheet === 'setclock' && <SetClockSheet s={s} update={update} close={() => setSheet(null)} />}
      {sheet?.startsWith('timeout-') && (
        <Sheet close={() => setSheet(null)}>
          <h3>{o.labels.timeout} {G.fmtClock((sheet === 'timeout-1' ? o.timeout1Sec : o.timeout2Sec) * 1000, { tenths: false })} — which team?</h3>
          <div className="choices">
            {['home', 'away'].map(team => (
              <button key={team} className="btn" style={{ background: s[team].color, color: '#fff' }}
                onClick={() => { update(x => G.startTimeout(x, team, sheet === 'timeout-1' ? o.timeout1Sec : o.timeout2Sec)); setSheet(null) }}>{s[team].name}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setSheet(null)}>Cancel</button>
        </Sheet>
      )}
      {sheet === 'options' && <Options s={s} update={update} close={() => setSheet(null)} />}
      {sheet === 'qr' && <QrSheet boardUrl={boardUrl} bannerUrl={bannerUrl} controlUrl={controlUrl} close={() => setSheet(null)} />}
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
  const lens = s.opts.penaltyLengths?.length ? s.opts.penaltyLengths : [2, 5, 10]
  const [player, setPlayer] = useState('')
  const [mins, setMins] = useState(lens[0])
  const add = () => { update(x => G.addPenalty(x, team, player, mins)); close() }
  return (
    <Sheet close={close}>
      <h3 style={{ color: s[team].color }}>{s.opts.labels.penalty} · {s[team].name}</h3>
      <label>{s.opts.labels.player}
        <input inputMode="numeric" autoFocus value={player} onChange={e => setPlayer(e.target.value)} placeholder="#" onKeyDown={e => e.key === 'Enter' && add()} />
      </label>
      <div className="field">Length
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {lens.map(m => <button key={m} className={`btn ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{m} min</button>)}
        </div>
      </div>
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
      <h3>Set clock {s.opts.clockDir === 'up' ? '(remaining time)' : ''}</h3>
      <div className="grid2">
        <label>Minutes<input inputMode="numeric" value={m} onChange={e => setM(e.target.value)} autoFocus /></label>
        <label>Seconds<input inputMode="numeric" value={sec} onChange={e => setSec(e.target.value)} /></label>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={apply}>Set</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </Sheet>
  )
}

function QrSheet({ boardUrl, bannerUrl, controlUrl, close }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=0&data=${encodeURIComponent(boardUrl)}`
  const share = () => navigator.share?.({ title: 'Live scoreboard', url: boardUrl }).catch(() => {})
  return (
    <Sheet close={close}>
      <h3>Public link (read-only)</h3>
      <div className="qr">
        <img src={src} alt="QR code" />
        <div className="url">{boardUrl}</div>
        <div className="row">
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(boardUrl)}>Copy link</button>
          {navigator.share && <button className="btn sm" onClick={share}>Share…</button>}
        </div>
        <div className="hint" style={{ textAlign: 'center' }}>Anyone with this link can watch. Nobody can change scores without your operator link.</div>
        <div className="url" style={{ marginTop: 8 }}>OBS overlay: {bannerUrl}</div>
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(bannerUrl)}>Copy banner link</button>
        <div className="url" style={{ marginTop: 8 }}>Operator link (keep private)</div>
        <button className="btn sm accent" onClick={() => navigator.clipboard?.writeText(controlUrl)}>Copy operator link</button>
      </div>
      <button className="btn ghost" onClick={close}>Close</button>
    </Sheet>
  )
}

function LockedScreen({ gameId }) {
  const [k, setK] = useState('')
  const go = () => { if (k.trim()) { rememberKey(gameId, k.trim()); window.location.href = `/c/${gameId}?k=${encodeURIComponent(k.trim())}` } }
  return (
    <div className="home">
      <h1>Locked</h1>
      <p>Game <b>{gameId}</b> exists and this browser doesn't have its operator key. Paste the key from the operator link, or open the public display.</p>
      <div className="code"><input value={k} onChange={e => setK(e.target.value)} placeholder="operator key" onKeyDown={e => e.key === 'Enter' && go()} /></div>
      <div className="links">
        <button className="btn primary" onClick={go}>Unlock</button>
        <a className="btn" href={`/b/${gameId}`}>Open public display</a>
        <a className="btn ghost" href="/">New game</a>
      </div>
    </div>
  )
}
