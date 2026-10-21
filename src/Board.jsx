import React, { useEffect, useState } from 'react'
import { useGame, useGameId, useTick, useClockTick } from './useGame.js'
import { clockShown, fmtClock, fmtTimeOfDay, strengthLabel, activePenalties, waitingPenalties, penaltyRemaining, skatersOnIce, timeoutRemaining, goalFlashActive, offsideActive, penaltyCallActive, periodLabel, clockRemaining, isSmallIce, rinkView, shiftInfo } from './game.js'
import { ONLINE } from './sync.js'
import { withDefaults } from './options.js'
import { now as serverNow } from './clock.js'
import { useAppearance, useGameSounds, AudioNotice, useSound } from './useOptions.jsx'
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

// Small ice (two games on one rink): /b/CODE is the center board (both games, the shared clock and the
// shift countdown), /b/CODE?rink=a and ?rink=b are the side boards: one game each, same clock.
const RINK = (() => { const q = new URLSearchParams(window.location.search).get('rink'); return q === 'a' || q === 'b' ? q : null })()
// one color per rink, the same on every screen, so players can tell the halves apart at a glance
export const RINK_COLOR = { a: '#ffd166', b: '#4cc9f0' }
export function RinkTag({ rink, label, className = 'rinkpill' }) {
  return <div className={className} style={{ '--rk': RINK_COLOR[rink] }}>{label}</div>
}

// /b/CODE?view=shift: the shift (line change) countdown alone, full screen (bench / extra screen)
const VIEW = new URLSearchParams(window.location.search).get('view')

// /b/CODE?preview=1 is the live preview inside Options (Options.jsx LivePreview): it shows the unsaved game the
// options page posts to it, never the stored one, and plays no sound.
const PREVIEW = new URLSearchParams(window.location.search).has('preview')

export default function Board() {
  return PREVIEW ? <PreviewBoard /> : <LiveBoard />
}

function LiveBoard() {
  const gameId = useGameId()
  const [raw, , access] = useGame(gameId)
  return <BoardView raw={raw} access={access} gameId={gameId} />
}

function PreviewBoard() {
  const [raw, setRaw] = useState(null)
  useEffect(() => {
    document.documentElement.classList.add('preview')
    const on = e => { if (e.source === window.parent && e.data?.type === 'lbs-preview') setRaw(withDefaults(e.data.state)) }
    window.addEventListener('message', on)
    window.parent.postMessage({ type: 'lbs-preview-ready' }, '*')
    return () => window.removeEventListener('message', on)
  }, [])
  return raw ? <BoardView raw={raw} access="ok" gameId="preview" preview /> : null
}

function BoardView({ raw, access, gameId, preview = false }) {
  const small = isSmallIce(raw)
  const s = raw && small && RINK ? rinkView(raw, RINK) : raw
  useAppearance(s)
  const now = useClockTick(s, Boolean(s?.clock.running || s?.timeout || s?.goalFlash || s?.offside || s?.penaltyCall || s?.showTimeOfDay || s?.penalties?.length))
  const sound = useSound(!preview)
  useGameSounds(s, sound.playing, now)
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

  if (!s && access === 'missing') return <div className="readonly"><h3>Board not found</h3>No board with code <b>{gameId}</b> yet. <div style={{ marginTop: 12 }}><a href="/">Home</a></div></div>
  if (!s) return <div className="loading">connecting…</div>

  const clockText = fmtClock(clockShown(s, now), { countdown: s.opts.clockDir !== 'up' })

  if (VIEW === 'shift') return <ShiftBoard s={raw} sound={sound} clockText={clockText} now={now} />
  if (small && !RINK) return <DualBoard s={s} sound={sound} clockText={clockText} now={now} clear={clear} bgOpacity={bgOpacity} />

  const o = s.opts
  const L = o.labels
  const minimal = o.layout === 'minimal'
  // side board: every card frame in its rink's color (the same color as on the center board)
  const rinkStyle = small && RINK ? { '--frame': RINK_COLOR[RINK] } : null
  // the line-change countdown: on every layout when the shift clock is on (side boards too)
  const shift = shiftInfo(s, now)
  const arena = o.layout === 'arena'
  const strength = strengthLabel(s)
  const hOn = skatersOnIce(s, 'home'), aOn = skatersOnIce(s, 'away')
  const ppTeam = hOn !== aOn ? (hOn > aOn ? 'home' : 'away') : null
  const ppColor = ppTeam ? s[ppTeam].color : undefined
  const final = clockRemaining(s, now) <= 0 && s.period !== 'SO'
  const toRem = timeoutRemaining(s)
  const flash = goalFlashActive(s)
  const isNum = !['OT', 'SO'].includes(s.period)
  const isSO = s.period === 'SO'

  if (o.layout === 'compact') {
    return (
      <div className={`board compactb ${clear ? 'clear' : ''}`} style={{ ...(clear ? { '--bgop': `${bgOpacity}%` } : {}), ...rinkStyle }}>
        <AudioNotice sound={sound} className="sound" />
        <FullscreenButton />
        <FullscreenHint />
        <Compact clockText={clockText} shift={shift} rinkTag={small && RINK ? <RinkTag rink={RINK} label={L[RINK === 'a' ? 'rinkA' : 'rinkB']} /> : null} s={s} final={final} flash={flash} strength={strength} ppColor={ppColor} ppTeam={ppTeam} toRem={toRem} isNum={isNum} isSO={isSO} />
      </div>
    )
  }

  return (
    <div className={`board ${clear ? 'clear' : ''} ${minimal ? 'minimal' : ''} ${arena ? 'arena' : ''} ${arena && o.bgImg ? 'hasbg' : ''} ${o.digits === 'segments' ? 'segments' : ''}`}
      style={{ ...(arena && o.bgImg ? { '--bgimg': `url("${o.bgImg}")` } : clear ? { '--bgop': `${bgOpacity}%` } : {}), ...rinkStyle }}>
      {!clear && <div className="status">{ONLINE ? 'live' : 'local'} · {gameId}<TimeBadge /></div>}
      <AudioNotice sound={sound} className="sound" />
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
        {small && RINK && <RinkTag rink={RINK} label={L[RINK === 'a' ? 'rinkA' : 'rinkB']} />}
        {toRem > 0 && (
          <div className="timeout" style={{ '--c': s[s.timeout.team].color }}>
            {L.timeout} · {s[s.timeout.team].name} <b className="tnum">{fmtClock(toRem)}</b>
          </div>
        )}
        {arena && o.logoImg && <img className="centerlogo top" src={o.logoImg} alt="" />}
        <div className="period">{isNum ? <>{L.period} <b>{periodLabel(s)}</b></> : <b>{periodLabel(s)}</b>}</div>
        <div className={`clock tnum ${final ? 'final' : ''}`}>{clockText}</div>
        {s.showTimeOfDay && <div className="tod tnum" aria-label="time of day">{fmtTimeOfDay()}</div>}
        {shift && <div className="shiftbox"><span>{L.shift}</span><b className="tnum" aria-label="shift">{shift.seconds}</b></div>}
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

// The reserved slot under the strength chip: GOAL! while the goal light is on, else the latest of
// OFFSIDE / the penalty just called ("PENALTY · team" over "#12 HOOKING 2:00") for a few seconds
// Offside and penalty point at the side that committed it: "◀ OFFSIDE" for the team on the left (home),
// "OFFSIDE ▶" for the one on the right (away). \uFE0E keeps the arrows as text, never emoji.
function Pointed({ team, children }) {
  return <>{team === 'home' && <b className="ptr">{'\u25C0\uFE0E'}</b>}{children}{team === 'away' && <b className="ptr">{'\u25B6\uFE0E'}</b>}</>
}

function EventText({ s, flash, withName }) {
  const L = s.opts.labels
  const off = offsideActive(s)
  const pen = penaltyCallActive(s)
  if (flash) return <div className="goalflash" style={{ '--c': s[flash].color }}>{L.goal}{withName && <span>{s[flash].name}</span>}</div>
  if (pen && (!off || pen.at >= s.offside.at)) return (
    <div className="pencall" style={{ '--c': s[pen.team].color }}>
      <div className="pclabel"><Pointed team={pen.team}>{L.penalty || 'PENALTY'}</Pointed></div>
      {/* long infractions ("#24 CHECKING FROM BEHIND 2:00") get smaller so the line always fits the middle */}
      <div className="pctext" style={{ fontSize: `calc(${Math.min(3.6, 72 / pen.text.length).toFixed(2)} * var(--u))` }}>{pen.text}</div>
    </div>
  )
  if (off) return <div className="goalflash offside" style={{ '--c': s[off].color }}><Pointed team={off}>{L.offside || 'OFFSIDE'}</Pointed></div>
  return null
}

function ShiftBoard({ s, sound, clockText, now }) {
  const sh = shiftInfo(s, now)
  const L = s.opts.labels
  return (
    <div className="board shiftb">
      <AudioNotice sound={sound} className="sound" />
      <FullscreenButton />
      <FullscreenHint />
      <div className="slabel">{L.shift}</div>
      <div className="sbig tnum" aria-label="shift">{sh ? sh.seconds : '—'}</div>
      <div className="sclock tnum">{L.period} {periodLabel(s)} · {clockText}</div>
      {!sh && <div className="soff">Shift clock is off · Control → Options → Game → Line change buzzer</div>}
    </div>
  )
}

// Small ice center board: Rink A | clock, period, shift countdown | Rink B (PC Scoreboards' two-game board)
function DualBoard({ s, sound, clear, bgOpacity, clockText, now }) {
  const o = s.opts
  const L = o.labels
  const shift = shiftInfo(s, now)
  const final = clockRemaining(s, now) <= 0 && s.period !== 'SO'
  const isNum = !['OT', 'SO'].includes(s.period)
  const toRem = timeoutRemaining(s)
  return (
    <div className={`board dual ${clear ? 'clear' : ''}`} style={clear ? { '--bgop': `${bgOpacity}%` } : undefined}>
      <AudioNotice sound={sound} className="sound" />
      <FullscreenButton />
      <FullscreenHint />
      {(o.bannerImg || o.title || o.topLeftImg || o.topRightImg) && (
        <div className="dtop">
          <div className="side">{o.topLeftImg && <img src={o.topLeftImg} alt="" />}</div>
          <div className="title">{o.bannerImg ? <img src={o.bannerImg} alt="" /> : o.title}</div>
          <div className="side">{o.topRightImg && <img src={o.topRightImg} alt="" />}</div>
        </div>
      )}
      <DualGame s={rinkView(s, 'a')} label={L.rinkA} rink="a" />
      <div className="dmid">
        {o.logoImg && <img className="dlogo" src={o.logoImg} alt="" />}
        <div className={`dclock tnum ${final ? 'final' : ''}`}>{clockText}</div>
        <div className="period">{isNum ? <>{L.period} <b>{periodLabel(s)}</b></> : <b>{periodLabel(s)}</b>}</div>
        {s.showTimeOfDay && <div className="tod tnum" aria-label="time of day">{fmtTimeOfDay()}</div>}
        {toRem > 0 && <div className="timeout" style={{ '--c': s[s.timeout.team].color }}>{L.timeout} <b className="tnum">{fmtClock(toRem)}</b></div>}
        {shift && (
          <div className="dshift">
            <span>{L.shift}</span>
            <b className="tnum" aria-label="shift">{shift.seconds}</b>
          </div>
        )}
      </div>
      <DualGame s={rinkView(s, 'b')} label={L.rinkB} rink="b" />
    </div>
  )
}

function DualGame({ s, label, rink }) {
  const flash = goalFlashActive(s)
  const strength = strengthLabel(s)
  return (
    <div className="dgame" style={{ '--rk': RINK_COLOR[rink] }}>
      <div className="dlabel"><RinkTag rink={rink} label={label} />{strength && <span className="dstr">{strength}</span>}</div>
      <div className="dteams">
        {['home', 'away'].map(team => {
          const run = activePenalties(s, team)
          const more = run.length - Math.min(run.length, 2) + waitingPenalties(s, team).length
          return (
            <div key={`${team}-${flash === team ? s.goalFlash.at : 0}`} className={`dteam ${flash === team ? 'flash' : ''}`} style={{ '--c': s[team].color }}>
              {s.opts[`${team}Logo`] && <img className="dtlogo" src={s.opts[`${team}Logo`]} alt="" />}
              <div className="dname">{s[team].name}</div>
              <div className="dscore tnum">{s[team].score}</div>
              <div className="dpens">
                {run.slice(0, 2).map(p => (
                  <div className="dpen" key={p.id}><span>{p.player ? `#${p.player}` : s.opts.labels.penalty}</span><b className="tnum">{fmtClock(penaltyRemaining(s, p), { tenths: false })}</b></div>
                ))}
                {more > 0 && <div className="dpen more">+{more}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="evslot"><EventText s={s} flash={flash} withName /></div>
    </div>
  )
}

// Compact layout: one broadcast-style panel (the operator's earlier OBS design). Home | clock box,
// period, tournament logo | away; scores in team colors; penalties under each team only when there
// are any (space is reserved so nothing moves); date + time of day along the bottom when it is on.
function Compact({ clockText, shift, rinkTag, s, final, flash, strength, ppColor, ppTeam, toRem, isNum, isSO }) {
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
        {rinkTag}
        <div className={`cclock tnum ${final ? 'final' : ''}`}>{clockText}</div>
        <div className="clabel">{isNum ? L.period : ''}</div>
        <div className="cperiod">{periodLabel(s)}</div>
        {shift && <div className="cshift"><span className="clabel">{L.shift}</span><b className="tnum" aria-label="shift">{shift.seconds}</b></div>}
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
