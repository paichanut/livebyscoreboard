import React, { useState } from 'react'
import { useGame, useGameId, useTick } from './useGame.js'
import { clockShown, fmtClock, strengthLabel, activePenalties, penaltyRemaining, skatersOnIce, timeoutRemaining, goalFlashActive, periodLabel, clockRemaining } from './game.js'
import { ONLINE } from './sync.js'
import { useAppearance, useGameSounds, SoundToggle } from './useOptions.jsx'

export default function Board() {
  const gameId = useGameId()
  const [s] = useGame(gameId)
  useAppearance(s)
  const [sound, setSound] = useState(false)
  useGameSounds(s, sound)
  useTick(100, Boolean(s?.clock.running || s?.timeout || s?.goalFlash))

  if (!s) return <div className="loading">connecting…</div>

  const o = s.opts
  const L = o.labels
  const minimal = o.layout === 'minimal'
  const strength = strengthLabel(s)
  const hOn = skatersOnIce(s, 'home'), aOn = skatersOnIce(s, 'away')
  const ppTeam = hOn !== aOn ? (hOn > aOn ? 'home' : 'away') : null
  const ppColor = ppTeam ? s[ppTeam].color : undefined
  const final = clockRemaining(s) <= 0 && s.period !== 'SO'
  const toRem = timeoutRemaining(s)
  const flash = goalFlashActive(s)
  const isNum = !['OT', 'SO'].includes(s.period)

  return (
    <div className={`board ${minimal ? 'minimal' : ''} ${o.digits === 'segments' ? 'segments' : ''}`}>
      <div className="status">{ONLINE ? 'live' : 'local'} · {gameId}</div>
      <SoundToggle sound={sound} setSound={setSound} className="sound" />

      {!minimal && (o.bannerImg || o.title || o.topLeftImg || o.topRightImg) && (
        <div className="topbar">
          <div className="side">{o.topLeftImg && <img src={o.topLeftImg} alt="" />}</div>
          <div className="title">{o.bannerImg ? <img src={o.bannerImg} alt="" /> : o.title}</div>
          <div className="side">{o.topRightImg && <img src={o.topRightImg} alt="" />}</div>
        </div>
      )}

      <Team t={s.home} logo={!minimal && o.homeLogo} flash={flash === 'home'} L={L} showShots={!minimal} />

      <div className="mid">
        {toRem > 0 && (
          <div className="timeout" style={{ '--c': s[s.timeout.team].color }}>
            {L.timeout} · {s[s.timeout.team].name} <b className="tnum">{fmtClock(toRem)}</b>
          </div>
        )}
        <div className="period">{isNum ? <>{L.period} <b>{periodLabel(s)}</b></> : <b>{periodLabel(s)}</b>}</div>
        <div className={`clock tnum ${final ? 'final' : ''}`}>{fmtClock(clockShown(s))}</div>
        <div className={`strength ${strength ? '' : 'empty'}`} style={ppColor ? { '--pp': ppColor } : undefined}>{strength}{ppTeam ? ` · ${L.pp}` : ''}</div>
        <div className="pens">
          <div className="col">{activePenalties(s, 'home').slice(0, 2).map(p => <Pen key={p.id} p={p} s={s} color={s.home.color} />)}</div>
          <div className="col">{activePenalties(s, 'away').slice(0, 2).map(p => <Pen key={p.id} p={p} s={s} color={s.away.color} />)}</div>
        </div>
      </div>

      <Team t={s.away} logo={!minimal && o.awayLogo} flash={flash === 'away'} L={L} showShots={!minimal} />
      {!minimal && o.logoImg ? <img className="brandlogo" src={o.logoImg} alt="" /> : <div className="brand">rinkboard</div>}
    </div>
  )
}

function Team({ t, logo, flash, L, showShots }) {
  return (
    <div className={`team ${flash ? 'flash' : ''}`} style={{ '--c': t.color }}>
      {flash && <div className="goalflash">{L.goal}</div>}
      {logo && <img className="logo" src={logo} alt="" />}
      <div className="name">{t.name}</div>
      <div className="score tnum">{t.score}</div>
      {showShots && <div className="shots">{L.shots} <b className="tnum">{t.shots}</b></div>}
    </div>
  )
}

function Pen({ p, s, color }) {
  return (
    <div className="pen" style={{ '--c': color }}>
      <div className="pp">{p.player ? `#${p.player}` : s.opts.labels.penalty}</div>
      <span className="pt tnum">{fmtClock(penaltyRemaining(s, p), { tenths: false })}</span>
    </div>
  )
}
