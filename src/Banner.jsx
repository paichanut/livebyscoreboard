// Score banner — compact strip for OBS / stream overlays. Transparent background (green screen optional).
// It is made for a 1920 px wide OBS canvas; on anything narrower (a phone) it shrinks to fit, so both teams show.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGame, useGameId, useTick, useClockTick } from './useGame.js'
import { clockShown, clockDisplay, fmtClock, fmtTimeOfDay, periodLabel, activePenalties, waitingPenalties, penaltyRemaining, strengthLabel, isSmallIce, rinkView } from './game.js'
import { useAppearance } from './useOptions.jsx'
import { Shootout, RinkTag } from './Board.jsx'

export default function Banner() {
  const gameId = useGameId()
  const [raw] = useGame(gameId)
  // small ice: /o/CODE?rink=b is Rink B's banner (default Rink A)
  const rink = new URLSearchParams(window.location.search).get('rink') === 'b' ? 'b' : 'a'
  const s = raw && isSmallIce(raw) ? rinkView(raw, rink) : raw
  useAppearance(s)
  const now = useClockTick(s, Boolean(s?.clock.running || s?.timeout || s?.warmup || s?.showTimeOfDay))
  const chroma = Boolean(s?.opts.banner.useChroma)
  useEffect(() => {
    document.documentElement.classList.toggle('clearbg', !chroma)
    return () => document.documentElement.classList.remove('clearbg')
  }, [chroma])
  const ref = useRef(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => { const w = ref.current?.scrollWidth; if (w) setScale(Math.min(1, (window.innerWidth - 16) / w)) }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  })
  if (!s) return null

  const b = s.opts.banner
  const sh = b.show
  const L = s.opts.labels
  const teams = b.mirror ? ['away', 'home'] : ['home', 'away']
  const strength = strengthLabel(s)
  // a timeout or the warm-up counts down in the clock (the label says which), then the game time comes back
  const cd = clockDisplay(s, now)

  return (
    <div className="bannerpage" style={{ background: chroma ? b.chroma : 'transparent' }}>
      <div className="banner" ref={ref} style={{ '--bbg': b.bg, '--bfg': b.fg, '--bclockbg': b.clockBg, '--bclockfg': b.clockFg, transform: scale < 1 ? `scale(${scale})` : undefined }}>
        {raw && isSmallIce(raw) && <RinkTag rink={rink} label={s.opts.labels[rink === 'a' ? 'rinkA' : 'rinkB']} className="brink" />}
        {sh.logo && s.opts.logoImg && <img className="blogo" src={s.opts.logoImg} alt="" />}
        {sh.title && s.opts.title && <div className="btitle">{s.opts.title}</div>}
        {teams.map((team, i) => {
          const t = s[team]
          const run = sh.penalties ? activePenalties(s, team) : []
          const pens = run.slice(0, 2)
          const more = sh.penalties ? run.length - pens.length + waitingPenalties(s, team).length : 0
          return (
            <div className="bteam" key={team} style={{ '--c': t.color, order: i === 0 ? 0 : 2 }}>
              {sh.teamLogo && s.opts[team + 'Logo'] && <img className="btlogo" src={s.opts[team + 'Logo']} alt="" />}
              {sh.teamName && <div className="btname">{t.name}</div>}
              {sh.score && <div className="btscore tnum">{t.score}</div>}
              {s.period === 'SO' && s.shootout[team].length > 0 && <Shootout attempts={s.shootout[team]} className="btso" />}
              {sh.shots && <div className="btshots">{L.shots} <b className="tnum">{t.shots}</b></div>}
              {pens.map(p => <div className="btpen tnum" key={p.id}>{p.player ? `#${p.player} ` : ''}{fmtClock(penaltyRemaining(s, p), { tenths: false })}</div>)}
              {more > 0 && <div className="btpen">+{more}</div>}
            </div>
          )
        })}
        {(sh.period || sh.clock) && (
          <div className="bclock">
            {sh.period && <div className="bperiod">{cd.kind === 'timeout' ? L.timeout : cd.kind === 'warmup' ? L.warmup : ['OT', 'SO'].includes(s.period) ? periodLabel(s) : `${L.period} ${periodLabel(s)}`}{cd.kind === 'game' && strength ? ` · ${strength}` : ''}</div>}
            {sh.clock && <div className="btime tnum">{fmtClock(cd.ms, cd.kind === 'game' ? { countdown: s.opts.clockDir !== 'up' } : { tenths: false })}</div>}
            {s.showTimeOfDay && <div className="btod tnum">{fmtTimeOfDay()}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
