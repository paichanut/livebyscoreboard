import React, { useEffect, useRef, useState } from 'react'
import { useGame, useGameId, useTick } from './useGame.js'
import { clockRemaining, fmtClock, strengthLabel, activePenalties, penaltyRemaining, skatersOnIce, timeoutRemaining } from './game.js'
import { unlockAudio, playHorn, audioReady } from './horn.js'
import { ONLINE } from './sync.js'
import { useTheme } from './App.jsx'

export default function Board() {
  const gameId = useGameId()
  const [s] = useGame(gameId)
  useTheme(s?.theme)
  useTick(100, Boolean(s?.clock.running || s?.timeout || (s?.goalFlash && Date.now() - s.goalFlash.at < 4000)))
  const [sound, setSound] = useState(false)
  const lastHorn = useRef(null)
  const zeroFired = useRef(false)

  // Horn from operator button
  useEffect(() => {
    if (!s) return
    if (lastHorn.current === null) { lastHorn.current = s.horn; return }
    if (s.horn !== lastHorn.current) { lastHorn.current = s.horn; if (sound) playHorn() }
  }, [s?.horn, sound])

  // Horn when clock hits zero
  const remaining = s ? clockRemaining(s) : 0
  useEffect(() => {
    if (!s) return
    if (s.clock.running && remaining <= 0 && !zeroFired.current) {
      zeroFired.current = true
      if (sound) playHorn()
    }
    if (remaining > 0) zeroFired.current = false
  }, [remaining, s?.clock.running, sound])

  if (!s) return <div className="loading">connecting…</div>

  const strength = strengthLabel(s)
  const hOn = skatersOnIce(s, 'home'), aOn = skatersOnIce(s, 'away')
  const ppTeam = hOn !== aOn ? (hOn > aOn ? 'home' : 'away') : null
  const pp = ppTeam ? ' · PP' : ''
  const ppColor = ppTeam ? s[ppTeam].color : undefined
  const final = remaining <= 0 && s.period !== 'SO'
  const toRem = timeoutRemaining(s)
  const flash = s.goalFlash && Date.now() - s.goalFlash.at < 4000 ? s.goalFlash.team : null

  return (
    <div className="board">
      <div className="status">{ONLINE ? 'live' : 'local'} · {gameId}</div>
      <button className={`sound ${sound ? 'on' : ''}`} onClick={() => { unlockAudio(); setSound(true); if (!audioReady()) setTimeout(() => setSound(audioReady()), 200) }}>
        {sound ? '🔊 horn on' : '🔈 tap to enable horn'}
      </button>

      <Team t={s.home} flash={flash === 'home'} />

      <div className="mid">
        {toRem > 0 && (
          <div className="timeout" style={{ '--c': s[s.timeout.team].color }}>
            TIMEOUT · {s[s.timeout.team].name} <b className="tnum">{fmtClock(toRem)}</b>
          </div>
        )}
        <div className="period">{s.period === 'OT' || s.period === 'SO' ? <b>{s.period}</b> : <>PERIOD <b>{s.period}</b></>}</div>
        <div className={`clock tnum ${final ? 'final' : ''}`}>{fmtClock(remaining)}</div>
        <div className={`strength ${strength ? '' : 'empty'}`} style={ppColor ? { '--pp': ppColor } : undefined}>{strength}{pp}</div>
        <div className="pens">
          <div className="col">{activePenalties(s, 'home').map(p => <Pen key={p.id} p={p} s={s} color={s.home.color} />)}</div>
          <div className="col">{activePenalties(s, 'away').map(p => <Pen key={p.id} p={p} s={s} color={s.away.color} />)}</div>
        </div>
      </div>

      <Team t={s.away} flash={flash === 'away'} />
      <div className="brand">rinkboard</div>
    </div>
  )
}

function Team({ t, flash }) {
  return (
    <div className={`team ${flash ? 'flash' : ''}`} style={{ '--c': t.color }}>
      {flash && <div className="goalflash">GOAL!</div>}
      <div className="name">{t.name}</div>
      <div className="score tnum">{t.score}</div>
      <div className="shots">Shots <b className="tnum">{t.shots}</b></div>
    </div>
  )
}

function Pen({ p, s, color }) {
  return (
    <div className="pen" style={{ '--c': color }}>
      <div>{p.player ? `#${p.player}` : 'PEN'}</div>
      <span className="tnum">{fmtClock(penaltyRemaining(s, p), { tenths: false })}</span>
    </div>
  )
}
