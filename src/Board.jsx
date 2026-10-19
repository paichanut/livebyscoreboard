import React, { useEffect, useState } from 'react'
import { useGame, useGameId, useTick } from './useGame.js'
import { clockShown, fmtClock, fmtTimeOfDay, strengthLabel, activePenalties, waitingPenalties, penaltyRemaining, skatersOnIce, timeoutRemaining, goalFlashActive, offsideActive, periodLabel, clockRemaining } from './game.js'
import { ONLINE } from './sync.js'
import { now as serverNow } from './clock.js'
import { useAppearance, useGameSounds, SoundToggle, useSound } from './useOptions.jsx'
import TimeBadge from './TimeBadge.jsx'

// Full screen (TV / projector): double-click anywhere, or the ⛶ button
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.()
  } catch {}
}
function FullscreenButton() {
  return <button className="fsbtn" aria-label="full screen" title="Full screen (or double-click)" onClick={toggleFullscreen}>⛶</button>
}

// "Double-click for full screen" for 4 s when the page opens, then it fades out. Not in OBS (it would be on
// the stream) and not when the window already fills the screen (desktop app on the HDMI screen).
const HINT_MS = 4000
function FullscreenHint() {
  const [show, setShow] = useState(() => !window.obsstudio && !document.fullscreenElement
    && !(window.innerWidth >= screen.width && window.innerHeight >= screen.height))
  useEffect(() => {
    if (!show) return
    const id = setTimeout(() => setShow(false), HINT_MS)
    return () => clearTimeout(id)
  }, [show])
  return show ? <div className="fshint" role="status">Double-click for full screen</div> : null
}

export default function Board() {
  const gameId = useGameId()
  const [s, , access] = useGame(gameId)
  useAppearance(s)
  const sound = useSound('rinkboard:sound:board', true)
  useGameSounds(s, sound.playing)
  // see-through page: the board sits on top of video (OBS, camera apps); cards stay solid
  const bgOpacity = Math.min(100, Math.max(0, Number(s?.opts.bgOpacity ?? 50)))
  const clear = Boolean(s) && bgOpacity < 100 && !(s.opts.layout === 'arena' && s.opts.bgImg)
  useEffect(() => {
    document.documentElement.classList.toggle('clearbg', clear)
    return () => document.documentElement.classList.remove('clearbg')
  }, [clear])
  useEffect(() => {
    const on = e => { if (!e.target.closest?.('button')) { window.getSelection?.()?.removeAllRanges(); toggleFullscreen() } }
    // a second click would start a word selection; stop it before it happens
    const down = e => { if (e.detail > 1) e.preventDefault() }
    document.addEventListener('dblclick', on)
    document.addEventListener('mousedown', down)
    return () => { document.removeEventListener('dblclick', on); document.removeEventListener('mousedown', down) }
  }, [])
  useTick(100, Boolean(s?.clock.running || s?.timeout || s?.goalFlash || s?.offside || s?.showTimeOfDay || s?.penalties?.length))

  if (!s && access === 'missing') return <div className="readonly"><h3>Board not found</h3>No board with code <b>{gameId}</b> yet. <div style={{ marginTop: 12 }}><a href="/">Home</a></div></div>
  if (!s) return <div className="loading">connecting…</div>

  const o = s.opts
  const L = o.labels
  const minimal = o.layout === 'minimal'
  const arena = o.layout === 'arena'
  const strength = strengthLabel(s)
  const hOn = skatersOnIce(s, 'home'), aOn = skatersOnIce(s, 'away')
  const ppTeam = hOn !== aOn ? (hOn > aOn ? 'home' : 'away') : null
  const ppColor = ppTeam ? s[ppTeam].color : undefined
  const final = clockRemaining(s) <= 0 && s.period !== 'SO'
  const toRem = timeoutRemaining(s)
  const flash = goalFlashActive(s)
  const isNum = !['OT', 'SO'].includes(s.period)
  const isSO = s.period === 'SO'

  if (o.layout === 'compact') {
    return (
      <div className={`board compactb ${clear ? 'clear' : ''}`} style={clear ? { '--bgop': `${bgOpacity}%` } : undefined}>
        <SoundToggle sound={sound} className="sound" />
        <FullscreenButton />
        <FullscreenHint />
        <Compact s={s} final={final} flash={flash} strength={strength} ppColor={ppColor} ppTeam={ppTeam} toRem={toRem} isNum={isNum} isSO={isSO} />
      </div>
    )
  }

  return (
    <div className={`board ${clear ? 'clear' : ''} ${minimal ? 'minimal' : ''} ${arena ? 'arena' : ''} ${arena && o.bgImg ? 'hasbg' : ''} ${o.digits === 'segments' ? 'segments' : ''}`}
      style={arena && o.bgImg ? { '--bgimg': `url("${o.bgImg}")` } : clear ? { '--bgop': `${bgOpacity}%` } : undefined}>
      {!clear && <div className="status">{ONLINE ? 'live' : 'local'} · {gameId}<TimeBadge /></div>}
      <SoundToggle sound={sound} className="sound" />
      <FullscreenButton />
      <FullscreenHint />

      {!minimal && (o.bannerImg || o.title || o.topLeftImg || o.topRightImg) && (
        <div className="topbar">
          <div className="side">{o.topLeftImg && <img src={o.topLeftImg} alt="" />}</div>
          <div className="title">{o.bannerImg ? <img src={o.bannerImg} alt="" /> : o.title}</div>
          <div className="side">{o.topRightImg && <img src={o.topRightImg} alt="" />}</div>
        </div>
      )}

      <Team key={`home-${flash === 'home' ? s.goalFlash.at : 0}`} t={s.home} logo={!minimal && o.homeLogo} logoTop={arena} flash={flash === 'home'} L={L} showShots={!minimal} so={isSO ? s.shootout.home : null} />

      <div className="mid">
        {toRem > 0 && (
          <div className="timeout" style={{ '--c': s[s.timeout.team].color }}>
            {L.timeout} · {s[s.timeout.team].name} <b className="tnum">{fmtClock(toRem)}</b>
          </div>
        )}
        {arena && o.logoImg && <img className="centerlogo top" src={o.logoImg} alt="" />}
        <div className="period">{isNum ? <>{L.period} <b>{periodLabel(s)}</b></> : <b>{periodLabel(s)}</b>}</div>
        <div className={`clock tnum ${final ? 'final' : ''}`}>{fmtClock(clockShown(s))}</div>
        {s.showTimeOfDay && <div className="tod tnum" aria-label="time of day">{fmtTimeOfDay()}</div>}
        <div className={`strength ${strength ? '' : 'empty'}`} style={ppColor ? { '--pp': ppColor } : undefined}>{strength}{ppTeam ? ` · ${L.pp}` : ''}</div>
        {/* reserved slot: always the same height, so GOAL! appearing moves nothing and covers nothing */}
        <div className="evslot"><EventText s={s} flash={flash} withName /></div>
        {!arena && <div className="pens">
          {['home', 'away'].map(team => {
            const run = activePenalties(s, team)
            const more = run.length - Math.min(run.length, 2) + waitingPenalties(s, team).length
            return (
              <div className="col" key={team}>
                {run.slice(0, 2).map(p => <Pen key={p.id} p={p} s={s} color={s[team].color} />)}
                {more > 0 && <div className="pen more" style={{ '--c': s[team].color }}>+{more}</div>}
              </div>
            )
          })}
        </div>}
        {!arena && o.logoImg && <div className="logofill"><img className="centerlogo" src={o.logoImg} alt="" /></div>}
      </div>

      <Team key={`away-${flash === 'away' ? s.goalFlash.at : 0}`} t={s.away} logo={!minimal && o.awayLogo} logoTop={arena} flash={flash === 'away'} L={L} showShots={!minimal} so={isSO ? s.shootout.away : null} />
      {arena && ['home', 'away'].map(team => <PenBox key={team} team={team} s={s} />)}
      {!o.logoImg && !clear && <div className="brand">live by scoreboard</div>}
    </div>
  )
}

// The reserved slot under the strength chip: GOAL! while the goal light is on, else OFFSIDE for a few seconds
function EventText({ s, flash, withName }) {
  const L = s.opts.labels
  const off = offsideActive(s)
  if (flash) return <div className="goalflash" style={{ '--c': s[flash].color }}>{L.goal}{withName && <span>{s[flash].name}</span>}</div>
  if (off) return <div className="goalflash offside" style={{ '--c': s[off].color }}>{L.offside || 'OFFSIDE'}{withName && <span>{s[off].name}</span>}</div>
  return null
}

// Compact layout: one broadcast-style panel (the operator's earlier OBS design). Home | clock box,
// period, tournament logo | away; scores in team colors; penalties under each team only when there
// are any (space is reserved so nothing moves); date + time of day along the bottom when it is on.
function Compact({ s, final, flash, strength, ppColor, ppTeam, toRem, isNum, isSO }) {
  const o = s.opts
  const L = o.labels
  const side = team => {
    const t = s[team]
    const pens = [...activePenalties(s, team), ...waitingPenalties(s, team)]
    const running = new Set(activePenalties(s, team).map(p => p.id))
    return (
      <div key={`${team}-${flash === team ? s.goalFlash.at : 0}`} className={`cteam ${flash === team ? 'flash' : ''}`} style={{ '--c': t.color }}>
        <div className="clogo">{o[`${team}Logo`] && <img src={o[`${team}Logo`]} alt="" />}</div>
        <div className="cname">{t.name}</div>
        <div className="cscore tnum">{t.score}</div>
        {isSO
          ? <Shootout attempts={s.shootout[team]} className="so" />
          : <><div className="clabel">{L.shots}</div><div className="cshots tnum">{t.shots}</div></>}
        <div className="cpens">
          {pens.slice(0, 3).map(p => (
            <div key={p.id} className={`cpen ${running.has(p.id) ? '' : 'wait'}`}>
              <span>{p.player ? `#${p.player}` : L.penalty}</span>
              <b className="tnum">{fmtClock(penaltyRemaining(s, p), { tenths: false })}</b>
            </div>
          ))}
          {pens.length > 3 && <div className="cpen more">+{pens.length - 3}</div>}
        </div>
      </div>
    )
  }
  const d = new Date(serverNow())
  return (
    <div className="cpanel">
      {side('home')}
      <div className="cmid">
        <div className={`cclock tnum ${final ? 'final' : ''}`}>{fmtClock(clockShown(s))}</div>
        <div className="clabel">{isNum ? L.period : ''}</div>
        <div className="cperiod">{periodLabel(s)}</div>
        <div className={`cstrength ${strength ? '' : 'empty'}`} style={ppColor ? { '--pp': ppColor } : undefined}>{strength}{ppTeam ? ` · ${L.pp}` : ''}</div>
        <div className="evslot"><EventText s={s} flash={flash} /></div>
        {toRem > 0 && <div className="ctimeout" style={{ '--c': s[s.timeout.team].color }}>{L.timeout} <b className="tnum">{fmtClock(toRem)}</b></div>}
        {/* the tournament logo takes all the space left in the middle column */}
        {o.logoImg && <div className="cllogo"><img src={o.logoImg} alt="" /></div>}
      </div>
      {side('away')}
      {s.showTimeOfDay && (
        <div className="cdate tnum">
          {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/,/g, '')} <b>{fmtTimeOfDay()}</b>
        </div>
      )}
    </div>
  )
}

function Team({ t, logo, logoTop, flash, L, showShots, so }) {
  return (
    <div className={`team ${flash ? 'flash' : ''}`} style={{ '--c': t.color }}>
      {logo && !logoTop && <img className="bglogo" src={logo} alt="" aria-hidden="true" />}
      {logo && logoTop && <img className="toplogo" src={logo} alt="" />}
      <div className="name">{t.name}</div>
      <div className="score tnum">{t.score}</div>
      {so ? <Shootout attempts={so} /> : showShots && <div className="shots">{L.shots} <b className="tnum">{t.shots}</b></div>}
    </div>
  )
}

// Shootout attempts: ● goal, ○ miss. Always shows at least 3 slots so the row doesn't jump.
export function Shootout({ attempts, className = 'so' }) {
  const slots = Math.max(3, attempts.length)
  return (
    <div className={className} aria-label="shootout">
      {Array.from({ length: slots }, (_, i) => {
        const a = attempts[i]
        // class names are so-* on purpose: a plain "goal" class would pick up the control page's goal-button style
        return <span key={i} className={a ? `so-${a}` : 'so-empty'}>{a === 'goal' ? '●' : a === 'miss' ? '○' : '·'}</span>
      })}
    </div>
  )
}

// Arena layout: one box per team under its card, 3 positions (IIHF off-ice handbook). Running penalties
// first, then the next waiting ones (dimmed, full time); anything beyond 3 is "+N".
function PenBox({ team, s }) {
  const L = s.opts.labels
  const list = [...activePenalties(s, team), ...waitingPenalties(s, team)]
  const shown = list.slice(0, 3)
  return (
    <div className={`penbox pb-${team}`} style={{ '--c': s[team].color }}>
      {shown.map((p, i) => (
        <div className={`prow ${i >= 2 || !activePenalties(s, team).some(a => a.id === p.id) ? 'wait' : ''}`} key={p.id}>
          <span className="pp">{p.player ? `#${p.player}` : L.penalty}</span>
          <span className="pt tnum">{fmtClock(penaltyRemaining(s, p), { tenths: false })}</span>
        </div>
      ))}
      {list.length > 3 && <div className="pmore">+{list.length - 3}</div>}
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
