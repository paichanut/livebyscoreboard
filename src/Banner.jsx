// Score banner — compact strip for OBS / stream overlays. Chroma-key background by default.
import React from 'react'
import { useGame, useGameId, useTick } from './useGame.js'
import { clockShown, fmtClock, fmtTimeOfDay, periodLabel, activePenalties, waitingPenalties, penaltyRemaining, strengthLabel, isSmallIce, rinkView } from './game.js'
import { useAppearance } from './useOptions.jsx'
import { Shootout } from './Board.jsx'

export default function Banner() {
  const gameId = useGameId()
  const [raw] = useGame(gameId)
  // small ice: /o/CODE?rink=b is Rink B's banner (default Rink A)
  const rink = new URLSearchParams(window.location.search).get('rink') === 'b' ? 'b' : 'a'
  const s = raw && isSmallIce(raw) ? rinkView(raw, rink) : raw
  useAppearance(s)
  useTick(100, Boolean(s?.clock.running || s?.showTimeOfDay))
  if (!s) return null

  const b = s.opts.banner
  const sh = b.show
  const L = s.opts.labels
  const teams = b.mirror ? ['away', 'home'] : ['home', 'away']
  const strength = strengthLabel(s)

  return (
    <div className="bannerpage" style={{ background: b.useChroma ? b.chroma : 'transparent' }}>
      <div className="banner" style={{ '--bbg': b.bg, '--bfg': b.fg, '--bclockbg': b.clockBg, '--bclockfg': b.clockFg }}>
        {sh.logo && s.opts.logoImg && <img className="blogo" src={s.opts.logoImg} alt="" />}
        {sh.title && s.opts.title && <div className="btitle">{s.opts.title}</div>}
        {teams.map(team => {
          const t = s[team]
          const run = sh.penalties ? activePenalties(s, team) : []
          const pens = run.slice(0, 2)
          const more = sh.penalties ? run.length - pens.length + waitingPenalties(s, team).length : 0
          return (
            <div className="bteam" key={team} style={{ '--c': t.color }}>
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
            {sh.period && <div className="bperiod">{['OT', 'SO'].includes(s.period) ? periodLabel(s) : `${L.period} ${periodLabel(s)}`}{strength ? ` · ${strength}` : ''}</div>}
            {sh.clock && <div className="btime tnum">{fmtClock(clockShown(s))}</div>}
            {s.showTimeOfDay && <div className="btod tnum">{fmtTimeOfDay()}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
