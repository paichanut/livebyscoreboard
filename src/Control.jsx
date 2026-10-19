import React, { useEffect, useRef, useState } from 'react'
import { useGame, useGameId, useTick, useClockTick, useUrlKey } from './useGame.js'
import * as G from './game.js'
import DesktopUpdate from './DesktopUpdate.jsx'
import { ShareSheet } from './DesktopShare.jsx'
import { ONLINE, DESKTOP, NEEDS_LOGIN, shareTeamIfNew, randomKey, rememberKey, storedKey, getSession, sessionUser, logout, helperKey } from './sync.js'
import { useAppearance, useGameSounds, SoundToggle, useSound } from './useOptions.jsx'
import { translator } from './i18n.js'
import { saveTeam } from './teamLibrary.js'
import TimeBadge from './TimeBadge.jsx'
import { ContactLinks, DEV } from './Contact.jsx'
import Options, { SavedTeams, resizeImage } from './Options.jsx'
import { RINK_COLOR } from './Board.jsx'
import { KEY_GROUPS, KEY_LABELS, keyName } from './options.js'

// keys a rink controller (A / B) may use: its own score, shots, penalties and goal light, not the shared clock
const RINK_KEYS = ['homeGoal', 'homeGoalMinus', 'homeShot', 'homeShotMinus', 'awayGoal', 'awayGoalMinus', 'awayShot', 'awayShotMinus',
  'removePenalty', 'goalLightHome', 'goalLightAway', 'goalLightOff']

export default function Control() {
  const gameId = useGameId()
  // Write access: a logged-in operator's session (any game; never put in the URL), else a single-game
  // key from ?k= or remembered in this browser. The test build has no login and makes up a key.
  const urlKey = useUrlKey()
  const session = NEEDS_LOGIN ? getSession() : ''
  const [key] = useState(() => {
    if (session) return session
    const k = urlKey || storedKey(gameId) || (NEEDS_LOGIN ? '' : randomKey())
    if (k) rememberKey(gameId, k)
    return k
  })
  const usingSession = Boolean(session) && key === session
  const [s, update, access] = useGame(gameId, { key, canWrite: true })
  useAppearance(s)
  useEffect(() => {
    if (usingSession || !key) return
    const u = new URL(window.location.href)
    if (u.searchParams.get('k') !== key) { u.searchParams.set('k', key); window.history.replaceState(null, '', u) }
  }, [key, usingSession])

  // the single-game link to share with a helper; fetched once the game exists on the server
  const [shareKey, setShareKey] = useState(usingSession ? '' : key)
  useEffect(() => { if (usingSession && access === 'ok' && !shareKey) helperKey(gameId).then(setShareKey) }, [usingSession, gameId, access, shareKey])
  useClockTick(s, Boolean(s?.clock.running || s?.timeout || s?.goalFlash))
  const [sheet, setSheet] = useState(null)
  // small ice (two games on one rink): the team cards, goal light and penalty / team / goal sheets work on
  // the chosen half; the clock, period, whistle and shift are shared (game.js rinkView / onRink)
  const [rink, setRink] = useState('a')
  const rinkRef = useRef('a')
  const small = G.isSmallIce(s)
  // controller A / B (/c/CODE?rink=a|b): only that half's score and penalties; the clock is the center's
  const [lock] = useState(() => { const q = new URLSearchParams(window.location.search).get('rink'); return q === 'a' || q === 'b' ? q : null })
  const locked = small ? lock : null
  const r = small ? (locked || rink) : 'a'
  rinkRef.current = r
  const lockRef = useRef(null)
  lockRef.current = locked
  const v = s && r === 'b' ? G.rinkView(s, 'b') : s
  const ur = fn => update(x => G.onRink(x, rinkRef.current, fn))
  const shift = s ? G.shiftInfo(s) : null
  // IIHF Rule 16: a power-play goal ends the opponent's minor. Ask first (Options → Other can turn the question off).
  const askRelease = (x, team) => x.opts.confirm?.releaseOnGoal !== false && G.releaseCandidate(G.foldPenalties(x), team)
  const scoreGoal = (team, horn = false) => {
    if (askRelease(v, team)) { setSheet(`release-${team}-${horn ? 1 : 0}`); return }
    ur(x => { const n = G.addScore(x, team, 1); return horn ? G.fireHorn(n) : n })
  }
  const [openPen, setOpenPen] = useState(null) // penalty row showing its ±1/±5 s buttons
  // optional: play horn/buzzer on this device too (phone speaker / laptop plugged into the PA)
  // horn / buzzer play here too, not only on the display (new key so everyone starts with sound on)
  const sound = useSound('rinkboard:sound:ctl', true)
  useGameSounds(s, sound.playing)
  const t = translator(s?.opts?.uiLang)

  const ask = (key, msg) => !s.opts.confirm[key] || confirm(msg)

  // Operator is the authority: stop clock at 0, prune expired penalties, end timeouts
  const remainingNow = s ? G.clockRemaining(s) : 0
  useEffect(() => {
    if (s?.clock.running && remainingNow <= 0) update(G.stopClock)
  }, [s?.clock.running, remainingNow <= 0])
  useEffect(() => {
    const id = setInterval(() => update(x => {
      let n = G.pruneExpiredPenalties(x)
      if (G.isSmallIce(n)) { const b = G.rinkView(n, 'b'); if (G.pruneExpiredPenalties(b) !== b) n = G.onRink(n, 'b', G.pruneExpiredPenalties) }
      if (n.timeout && G.timeoutRemaining(n) <= 0) n = G.clearTimeout_(n)
      return n
    }), 1000)
    return () => clearInterval(id)
  }, [])
  // Home → "Small ice" opens /c/CODE?mode=small: turn the new game into two rinks once, then drop the flag
  useEffect(() => {
    if (!s || access !== 'ok') return
    const u = new URL(window.location.href)
    const mode = u.searchParams.get('mode')
    if (!mode) return
    if (mode === 'small' && !s.opts.smallIce) update(x => G.setOptions(x, { ...x.opts, smallIce: true, shiftMs: x.opts.shiftMs || 90_000 }))
    if (mode === 'full' && s.opts.smallIce) update(x => G.setOptions(x, { ...x.opts, smallIce: false }))
    u.searchParams.delete('mode')
    window.history.replaceState(null, '', u)
  }, [Boolean(s), access])

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
        startAll: x => G.startClock(x), stopAll: G.stopClock,
        startClockOnly: x => G.startClock(x, { penalties: false }), stopClockOnly: G.stopClock,
        resetClock: x => (ask('period', t('confirmResetClock')) ? G.resetClock(x) : x),
        penaltiesOn: x => G.setPlayLive(x, true), penaltiesOff: x => G.setPlayLive(x, false),
        penaltyOn: x => G.setPlayLive(x, true), penaltyOff: x => G.setPlayLive(x, false),
        removePenalty: x => (ask('removePenalty', t('confirmRemovePenalty')) ? G.removeLastPenalty(x) : x),
        timeOfDay: G.toggleTimeOfDay,
        homeGoal: x => { if (askRelease(x, 'home')) { setSheet('release-home-0'); return null } return G.addScore(x, 'home', 1) }, homeGoalMinus: x => G.addScore(x, 'home', -1),
        homeShot: x => G.addShot(x, 'home', 1), homeShotMinus: x => G.addShot(x, 'home', -1),
        awayGoal: x => { if (askRelease(x, 'away')) { setSheet('release-away-0'); return null } return G.addScore(x, 'away', 1) }, awayGoalMinus: x => G.addScore(x, 'away', -1),
        awayShot: x => G.addShot(x, 'away', 1), awayShotMinus: x => G.addShot(x, 'away', -1),
        periodPlus: x => (ask('period', t('confirmNext')) ? G.nextPeriod(x) : x),
        periodMinus: x => (ask('period', t('confirmPrev')) ? G.prevPeriod(x) : x),
        clockPlus: x => G.adjustClock(x, 1000), clockMinus: x => G.adjustClock(x, -1000),
        goalLightHome: x => G.setGoalLight(x, 'home'), goalLightAway: x => G.setGoalLight(x, 'away'), goalLightOff: x => G.setGoalLight(x, null),
        horn: G.fireHorn, buzzer: G.fireBuzzer,
        timeout1: () => { setSheet('timeout-1'); return null }, timeout2: () => { setSheet('timeout-2'); return null },
        showDisplay: () => { window.open(`/b/${encodeURIComponent(gameId)}`, '_blank'); return null },
        correction: () => { setSheet('setclock'); return null },
        newGame: x => (ask('newGame', t('confirmNewGame')) ? G.resetGame(x) : x),
      }
      const fn = lockRef.current && !RINK_KEYS.includes(act) ? null : map[act]
      if (fn) update(x => G.onRink(x, rinkRef.current, y => fn(y) ?? y))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [sheet, s?.opts?.keys, s?.opts?.confirm, s?.opts?.uiLang])

  if (access === 'locked' || access === 'missing' || (NEEDS_LOGIN && !key)) return <LockedScreen gameId={gameId} t={t} />
  if (!s) return <div className="loading">{t('connecting')}</div>

  const o = s.opts
  const remaining = G.clockRemaining(s)
  const running = s.clock.running
  const strength = G.strengthLabel(v)
  const origin = window.location.origin
  const boardUrl = `${origin}/b/${encodeURIComponent(gameId)}`
  const bannerUrl = `${origin}/o/${encodeURIComponent(gameId)}`
  const controlUrl = shareKey ? `${origin}/c/${encodeURIComponent(gameId)}?k=${shareKey}` : `${origin}/c/${encodeURIComponent(gameId)}`
  const isNum = !['OT', 'SO'].includes(s.period)
  const isSO = s.period === 'SO'

  return (
    <div className={`control ${small ? 'small' : ''}`} style={small ? { '--rk': RINK_COLOR[r] } : undefined}>

      <div className="card clockcard">
        {locked && <div className="rinkctlbig" style={{ '--rk': RINK_COLOR[locked] }}>{o.labels[locked === 'a' ? 'rinkA' : 'rinkB']}</div>}
        {locked && <div className="rinkctl">🎮 {t('rinkController', { rink: o.labels[locked === 'a' ? 'rinkA' : 'rinkB'] })}</div>}
        {small && !locked && (
          <div className="rinktabs">
            {['a', 'b'].map(k => {
              const x = G.rinkView(s, k)
              return <button key={k} className={`btn ${r === k ? 'on' : ''}`} style={{ '--rk': RINK_COLOR[k] }} aria-label={`rink ${k}`} onClick={() => setRink(k)}>
                {o.labels[k === 'a' ? 'rinkA' : 'rinkB']} · <span className="tnum">{x.home.score}–{x.away.score}</span>
              </button>
            })}
          </div>
        )}
        <div className="p">
          <span className={`run ${running ? 'on' : ''}`}>{running ? t('running') : t('paused')}</span>
          <span>{isNum ? <>{o.labels.period} <b>{G.periodLabel(s)}</b></> : <b>{G.periodLabel(s)}</b>}</span>
          {strength && <span className="st">{strength}</span>}
          {o.clockDir === 'up' && <span style={{ fontSize: 12 }}>{t('up')}</span>}
          {s.showTimeOfDay && <span className="tod">{t('todOnDisplay')}</span>}
        </div>
        <div className="clockline">
          {!locked && <div className="adj">
            {[-5, -1].map(d => <button key={d} className="btn sm minus" aria-label={`clock ${d} s`} onClick={() => update(x => G.adjustClock(x, d * 1000))}>−{-d}</button>)}
          </div>}
          <div className={`c tnum ${remaining <= 0 ? 'final' : ''}`}>{G.fmtClock(G.clockShown(s))}</div>
          {!locked && <div className="adj">
            {[1, 5].map(d => <button key={d} className="btn sm plus" aria-label={`clock +${d} s`} onClick={() => update(x => G.adjustClock(x, d * 1000))}>+{d}</button>)}
          </div>}
        </div>
        {shift && (
          <div className="shiftrow">
            <span className="gl">{o.labels.shift}</span>
            <b className="tnum" aria-label="shift">{shift.seconds}</b>
            {!locked && <button className="btn sm" aria-label="reset shift" onClick={() => { if (ask('newShift', t('confirmNewShift'))) update(G.resetShift) }}>↺ {t('shiftReset')}</button>}
          </div>
        )}
        {!locked && <>
        <div className="row">
          <button className={`btn big ${running ? 'danger' : 'primary'}`} onClick={() => update(G.toggleClock)} disabled={!running && remaining <= 0}>
            {running ? t('stop') : t('start')}
          </button>
        </div>

        {/* PC Scoreboards control groups */}
        <div className="groups">
          <div className="grp">
      <span className="gl">{t('allTimes')}</span>
      <button className={`btn sm go ${running && s.playLive !== false ? 'lit' : ''}`} aria-label="start all times" onClick={() => update(x => G.startClock(x))} disabled={remaining <= 0}>{t('startBtn')}</button>
      <button className="btn sm" aria-label="stop all times" onClick={() => update(G.stopClock)}>{t('stopBtn')}</button>
          </div>
          <div className="grp">
      <span className="gl">{t('periodTime')}</span>
      <button className={`btn sm go ${running ? 'lit' : ''}`} aria-label="start period time" onClick={() => update(x => G.startClock(x, { penalties: false }))} disabled={remaining <= 0}>{t('startBtn')}</button>
      <button className="btn sm" aria-label="stop period time" onClick={() => update(G.stopClock)}>{t('stopBtn')}</button>
      <button className="btn sm" aria-label="reset period time" onClick={() => { if (ask('period', t('confirmResetClock'))) update(G.resetClock) }}>{t('reset')}</button>
          </div>
          <div className="grp">
      <span className="gl">{t('allPenalties')}</span>
      <button className={`btn sm go ${s.playLive !== false ? 'lit' : ''}`} aria-label="start all penalties" onClick={() => update(x => G.setPlayLive(x, true))}>{t('startBtn')}</button>
      <button className={`btn sm ${s.playLive === false ? 'held' : ''}`} aria-label="stop all penalties" onClick={() => update(x => G.setPlayLive(x, false))}>{t('stopBtn')}</button>
          </div>
        </div>
        {s.playLive === false && <div className="hint whistlehint">{t('whistleHintPaused')}</div>}

        <div className="row">
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, -60000))}>−1:00</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, -1000))}>−0:01</button>
          <button className="btn sm accent" onClick={() => setSheet('setclock')}>{t('set')}</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, 1000))}>+0:01</button>
          <button className="btn sm" onClick={() => update(x => G.adjustClock(x, 60000))}>+1:00</button>
        </div>
        <div className="row period">
          <button className="btn sm minus" onClick={() => { if (ask('period', t('confirmPrev'))) update(G.prevPeriod) }}>{t('periodPrev')}</button>
          <span className="pv tnum">{G.periodLabel(s)}</span>
          <button className="btn sm plus" onClick={() => { if (ask('period', t('confirmNext'))) update(G.nextPeriod) }}>{t('periodNext')}</button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => update(G.fireHorn)}>{t('horn')}</button>
          <button className="btn sm" onClick={() => update(G.fireBuzzer)}>{t('buzzer')}</button>
          <button className={`btn sm ${s.showTimeOfDay ? 'accent' : ''}`} onClick={() => update(G.toggleTimeOfDay)}>{s.showTimeOfDay ? t('showPeriodTime') : t('showTimeOfDay')}</button>
        </div>
        <div className="row">
          {s.timeout && G.timeoutRemaining(s) > 0 ? (
            <button className="btn sm accent" onClick={() => update(G.clearTimeout_)} style={{ flex: 2 }}>
              {o.labels.timeout} {s[s.timeout.team].name} · {G.fmtClock(G.timeoutRemaining(s))} — {t('end')}
            </button>
          ) : (
            <>
              <button className="btn sm" onClick={() => setSheet('timeout-1')}>{t('timeoutBtn')} ({G.fmtClock(o.timeout1Sec * 1000, { tenths: false })})</button>
              <button className="btn sm" onClick={() => setSheet('timeout-2')}>{t('timeoutBtn')} ({G.fmtClock(o.timeout2Sec * 1000, { tenths: false })})</button>
            </>
          )}
        </div>
        </>}
        <div className="goallight">
          <span className="gl">{t('goalLight')}</span>
          <div className="row">
            <button className={`btn sm ${G.goalFlashActive(v) === 'home' ? 'lit' : ''}`} aria-label="goal light home" onClick={() => ur(x => G.setGoalLight(x, 'home'))}>◁ {v.home.name}</button>
            <button className="btn sm" aria-label="goal light off" onClick={() => ur(x => G.setGoalLight(x, null))}>{t('none')}</button>
            <button className={`btn sm ${G.goalFlashActive(v) === 'away' ? 'lit' : ''}`} aria-label="goal light away" onClick={() => ur(x => G.setGoalLight(x, 'away'))}>{v.away.name} ▷</button>
          </div>
        </div>
        {isSO && <div className="hint sohint">{t('soHint')}</div>}
      </div>

      <div className="teams">
        {['home', 'away'].map(team => {
          const tm = v[team]
          const so = v.shootout?.[team] || []
          return (
            // the scoring team's card blinks on the control page too, for as long as the goal light is on
            <div className={`tc ${G.goalFlashActive(v) === team ? 'flash' : ''}`} key={`${team}-${G.goalFlashActive(v) === team ? v.goalFlash.at : 0}`} style={{ '--c': tm.color }}>
              {small && <span className="rinkbadge" style={{ '--rk': RINK_COLOR[r] }}>{o.labels[r === 'a' ? 'rinkA' : 'rinkB']}</span>}
              <button className="n" aria-label={`rename ${team}`} title={t('editTeam')} onClick={() => setSheet(`team-${team}`)}>{tm.name}</button>
              <div className="s tnum">{tm.score}</div>
              <div className="goalrow">
                <button className="goal" onClick={() => scoreGoal(team)}>{t('goal')}</button>
                <button className="goal horn" aria-label={`goal and horn ${team}`} onClick={() => scoreGoal(team, true)}>{t('goalHorn')}</button>
              </div>
              {(() => {
                const g = G.goalNeedingScorer(v, team)
                return g && <button className="btn sm scorerbtn" aria-label={`goal details ${team}`} onClick={() => setSheet(`goal-${g.id}`)}>✎ {t('addScorer')} · {G.fmtGameTime(G.eventGameTimeMs(v, g))}</button>
              })()}
              {isSO && (
                <div className="so">
                  <div className="marks" aria-label={`shootout ${team}`}>{so.length ? so.map((a, i) => <span key={i} className={`so-${a}`}>{a === 'goal' ? '●' : '○'}</span>) : <span className="none">—</span>}</div>
                  <div className="mini">
                    <button className="btn on" onClick={() => ur(x => G.soAttempt(x, team, true))}>{t('soGoal')}</button>
                    <button className="btn" onClick={() => ur(x => G.soAttempt(x, team, false))}>{t('soMiss')}</button>
                    <button className="btn" onClick={() => ur(x => G.soUndo(x, team))} disabled={!so.length}>↶</button>
                  </div>
                </div>
              )}
              <div className="mini">
                <span className="ml">{t('scoreLbl')}</span>
                <button className="btn minus" onClick={() => ur(x => G.addScore(x, team, -1))}>{t('minus1')}</button>
                <button className="btn plus" aria-label="score +1" onClick={() => scoreGoal(team)}>+1</button>
              </div>
              <div className="mini">
                <span className="ml">{o.labels.shots} <b className="tnum">{tm.shots}</b></span>
                <button className="btn minus" aria-label="shot −1" onClick={() => ur(x => G.addShot(x, team, -1))}>−1</button>
                <button className="btn plus" aria-label="Shot +" onClick={() => ur(x => G.addShot(x, team, 1))}>+1</button>
              </div>
              <div className="mini">
                <span className="ml">{t('offside')} <b className="tnum">{tm.offsides || 0}</b></span>
                <button className="btn minus" aria-label={`offside −1 ${team}`} onClick={() => ur(x => G.addOffside(x, team, -1))}>−1</button>
                <button className="btn plus" aria-label={`offside +1 ${team}`} onClick={() => ur(x => G.addOffside(x, team, 1))}>+1</button>
              </div>
              <div className="penhead">
                <span>{o.labels.player} · {o.labels.penalty}</span>
                <button className="btn addpen" aria-label="add penalty" onClick={() => setSheet(`pen-${team}`)}>+</button>
              </div>
              {G.teamPenalties(v, team).map(p => (
                <div className={`pen ${p.status}`} key={p.id} data-status={p.status}>
                  <div className="who">{p.player ? `#${p.player}` : t('pen')} <small>{p.infraction || t('kind_' + p.kind)}{p.coincidental ? ` · ${t('coincShort')}` : ''}{!G.onPenaltyClock(p) && p.kind !== 'game' ? ` · ${t('notOnDisplay')}` : ''}</small></div>
                  <span className="pt tnum">{p.status === 'game'
                    ? `${t('gmShort')} · ${t('restOfGame')}`
                    : `${p.status === 'waiting' ? t('waiting') + ' · ' : ''}${G.fmtClock(p.remainingMs, { tenths: false })}`}</span>
                  <div className="acts">
                    <button aria-label="edit penalty" onClick={() => setSheet(`edit-${team}-${p.id}`)}>✎</button>
                    <button aria-label="remove penalty" onClick={() => { if (ask('removePenalty', t('confirmRemovePenalty'))) ur(x => G.removePenalty(x, p.id)) }}>✕</button>
                    {p.status !== 'game' && <button aria-label="more" className={openPen === p.id ? 'on' : ''} onClick={() => setOpenPen(openPen === p.id ? null : p.id)}>•••</button>}
                  </div>
                  {openPen === p.id && (
                    <div className="nudge">
                      {[-5, -1, 1, 5].map(d => (
                        <button key={d} onClick={() => ur(x => G.nudgePenalty(x, p.id, d * 1000))}>{d > 0 ? `+${d}` : `−${-d}`}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button className="btn psgoal" aria-label={`penalty shot goal ${team}`} onClick={() => ur(x => G.addScore(x, team, 1, { penaltyShot: true }))}>{t('psGoal')}</button>
            </div>
          )
        })}
      </div>

      <div className="bottom">
        {!DESKTOP && <button className="btn" aria-label="home" onClick={() => { if (confirm(t('confirmHome'))) window.location.href = '/' }}>🏠 {t('home')}</button>}
        {!locked && <button className="btn" onClick={() => setSheet('options')}>{t('options')}</button>}
        <a className="btn" href={locked ? `${boardUrl}?rink=${locked}` : boardUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>{t('display')}</a>
        <button className="btn" onClick={() => setSheet('summary')}>{t('summary')}</button>
        {!DESKTOP && <button className="btn" onClick={() => setSheet('qr')}>{t('qr')}</button>}
        {DESKTOP && window.desktop?.getShare && <button className="btn" onClick={() => setSheet('share')}>🌐 {t('shareBtn')}</button>}
        {!locked && <button className="btn" onClick={() => setSheet('setclock')}>{t('correction')}</button>}
        {!locked && <button className="btn" onClick={() => { if (ask('newGame', t('confirmNewGame'))) update(G.resetGame) }}>{t('newGame')}</button>}
        <SoundToggle sound={sound} className="btn csound" />
        <button className="btn keysbtn" onClick={() => setSheet('keys')} aria-label="keyboard shortcuts">⌨ {t('help')}</button>
      </div>
      <div className="status">
        <span>{t('game')} · {gameId}</span>
        {NEEDS_LOGIN && (usingSession
          ? <span className="who">👤 {sessionUser()} · <button className="linkbtn" onClick={async () => { await logout(); window.location.reload() }}>{t('logout')}</button></span>
          : <a className="who" href={`/login?next=/c/${encodeURIComponent(gameId)}`}>🔑 {t('keyOnly')} · {t('login')}</a>)}
        <span className={ONLINE ? 'live' : 'local'}>{ONLINE ? t('live') : DESKTOP ? t('offlineApp') : t('local')}<TimeBadge /></span>
        {DESKTOP && <DesktopUpdate t={t} />}
        <button className="linkbtn who" onClick={() => setSheet('contact')}>💬 {t('contactDev')}</button>
      </div>

      {sheet?.startsWith('pen-') && <PenaltySheet team={sheet.slice(4)} s={v} update={ur} close={() => setSheet(null)} t={t} />}
      {sheet?.startsWith('edit-') && (() => {
        const [, team, id] = sheet.split('-')
        const pen = v.penalties.find(p => p.id === id)
        return pen ? <PenaltySheet team={team} s={v} update={ur} close={() => setSheet(null)} t={t} edit={pen} /> : null
      })()}
      {sheet?.startsWith('team-') && <TeamSheet team={sheet.slice(5)} s={v} update={ur} close={() => setSheet(null)} t={t} />}
      {sheet === 'setclock' && <SetClockSheet s={s} update={update} close={() => setSheet(null)} t={t} />}
      {sheet?.startsWith('timeout-') && (
        <Sheet close={() => setSheet(null)}>
          <h3>{o.labels.timeout} {G.fmtClock((sheet === 'timeout-1' ? o.timeout1Sec : o.timeout2Sec) * 1000, { tenths: false })} {t('whichTeam')}</h3>
          <div className="choices">
            {['home', 'away'].map(team => (
              <button key={team} className="btn" style={{ background: s[team].color, color: '#fff' }}
                onClick={() => { update(x => G.startTimeout(x, team, sheet === 'timeout-1' ? o.timeout1Sec : o.timeout2Sec)); setSheet(null) }}>{s[team].name}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setSheet(null)}>{t('cancel')}</button>
        </Sheet>
      )}
      {sheet === 'keys' && (
        <Sheet close={() => setSheet(null)}>
          <h3>⌨ {t('keysTitle')}</h3>
          <a className="btn sm" href="/referee-signals.pdf" target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>📄 {t('refSignals')}</a>
          <div className="keysheet">
            {KEY_GROUPS.map(([group, names]) => (
              <div key={group}>
                <h4>{group}</h4>
                {names.map(n => <div className="kr" key={n}><span>{KEY_LABELS[n]}</span><kbd>{keyName(o.keys[n])}</kbd></div>)}
              </div>
            ))}
          </div>
          <div className="hint">{t('keysHint')}</div>
          <button className="btn ghost" onClick={() => setSheet(null)}>{t('close')}</button>
        </Sheet>
      )}
      {sheet === 'options' && <Options s={s} update={update} close={() => setSheet(null)} />}
      {sheet === 'summary' && <SummarySheet s={v} gameId={gameId} close={() => setSheet(null)} t={t} editGoal={id => setSheet(`goal-${id}`)} />}
      {sheet === 'contact' && (
        <Sheet close={() => setSheet(null)}>
          <h3>{t('contactDev')} · {DEV.name}</h3>
          <ContactLinks />
          <button className="btn ghost" onClick={() => setSheet(null)}>{t('close')}</button>
        </Sheet>
      )}
      {sheet?.startsWith('goal-') && <GoalSheet s={v} id={sheet.slice(5)} update={ur} close={() => setSheet(null)} t={t} />}
      {sheet === 'share' && <ShareSheet t={t} close={() => setSheet(null)} Sheet={Sheet} />}
      {sheet?.startsWith('release-') && (() => {
        const [, team, horn] = sheet.split('-')
        const opp = team === 'home' ? 'away' : 'home'
        const c = G.releaseCandidate(G.foldPenalties(v), team)
        const done = release => { ur(x => { const n = G.addScore(x, team, 1, { release }); return horn === '1' ? G.fireHorn(n) : n }); setSheet(null) }
        const who = c ? (c.penalty.player ? `#${c.penalty.player}` : t('pen')) : ''
        return (
          <Sheet close={() => setSheet(null)}>
            <h3>{t('goal')} · {v[team].name}</h3>
            {c ? <>
              <p className="hint">{t('relText', { team: v[opp].name, who, inf: c.penalty.infraction ? ` (${c.penalty.infraction})` : '', time: G.fmtClock(c.remainingMs, { tenths: false }) })}</p>
              {c.partial && <p className="hint">{t('relDouble')}</p>}
              <button className="btn primary" aria-label="goal and release" onClick={() => done(true)}>{t('relYes', { who })}</button>
              <button className="btn" aria-label="goal and keep" onClick={() => done(false)}>{t('relNo', { who })}</button>
            </> : <button className="btn primary" onClick={() => done(true)}>{t('goal')}</button>}
            <button className="btn ghost" onClick={() => setSheet(null)}>{t('cancel')}</button>
          </Sheet>
        )
      })()}
      {sheet === 'qr' && <QrSheet small={small && !locked} labels={o.labels} boardUrl={boardUrl} bannerUrl={bannerUrl} controlUrl={controlUrl} close={() => setSheet(null)} t={t} />}
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

function PenaltySheet({ team, s, update, close, t, edit }) {
  const lens = s.opts.penaltyLengths?.length ? s.opts.penaltyLengths : [2, 4, 5, 10]
  const templates = s.opts.penaltyTemplates || []
  const [player, setPlayer] = useState(edit?.player || '')
  // a number of minutes, or 'game' for a game misconduct
  const [mins, setMins] = useState(edit ? (edit.kind === 'game' ? 'game' : Math.round(edit.durationMs / 60000)) : lens[0])
  const [infraction, setInfraction] = useState(edit?.infraction || '')
  const [coinc, setCoinc] = useState(!!edit?.coincidental)
  const [alsoGame, setAlsoGame] = useState(false)
  const game = mins === 'game'
  const add = () => {
    const kind = game ? 'game' : undefined
    update(x => {
      if (edit) return G.editPenalty(x, edit.id, { player, minutes: game ? null : mins, infraction, kind: kind || 'auto', coincidental: coinc })
      let next = G.addPenalty(x, team, player, game ? 0 : mins, infraction, { kind, coincidental: coinc })
      if (alsoGame && !game) next = G.addPenalty(next, team, player, 0, infraction, { kind: 'game' })
      return next
    })
    close()
  }
  const pick = tp => {
    setInfraction(tp.name)
    setMins(tp.kind === 'game' ? 'game' : tp.minutes)
    setAlsoGame(!!tp.alsoGame || (tp.majorGM && tp.minutes === 5))
  }
  // IIHF: a major for these infractions always comes with a game misconduct
  const chooseMins = m => {
    setMins(m)
    const tp = templates.find(x => x.name === infraction)
    if (!edit && m === 5 && tp?.majorGM) setAlsoGame(true)
  }
  return (
    <Sheet close={close}>
      <h3 style={{ color: s[team].color }}>{s.opts.labels.penalty} · {s[team].name}</h3>
      <label>{s.opts.labels.player}
        <input inputMode="numeric" autoFocus value={player} onChange={e => setPlayer(e.target.value)} placeholder="#" onKeyDown={e => e.key === 'Enter' && add()} />
      </label>
      {templates.length > 0 && (
        <div className="field">{t('infraction')}
          <div className="templates">
            {templates.map(tp => (
              <button key={tp.name} className={`btn ${infraction === tp.name ? 'on' : ''}`} onClick={() => pick(tp)}>
                {tp.name} <small>{tp.kind === 'game' ? t('gmShort') : `${tp.minutes}′${tp.alsoGame ? `+${t('gmShort')}` : ''}`}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* a <div>, not a <label>: label text would "click" the first button */}
      <div className="field">{t('length')}
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {lens.map(m => <button key={m} className={`btn ${mins === m ? 'on' : ''}`} onClick={() => chooseMins(m)}>{m} {t('min')}</button>)}
          <button className={`btn ${game ? 'on' : ''}`} aria-label="game misconduct" onClick={() => { setMins('game'); setAlsoGame(false) }}>{t('gmShort')}</button>
        </div>
      </div>
      <div className="field">
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {!game && <button className={`btn ${coinc ? 'on' : ''}`} aria-pressed={coinc} onClick={() => setCoinc(!coinc)}>{t('coincidental')}</button>}
          {!game && !edit && <button className={`btn ${alsoGame ? 'on' : ''}`} aria-pressed={alsoGame} onClick={() => setAlsoGame(!alsoGame)}>+ {t('kind_game')}</button>}
        </div>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={add}>{edit ? t('savePenalty') : t('addPenalty')}{infraction ? ` · ${infraction}` : ''}</button><button className="btn ghost" onClick={close}>{t('cancel')}</button></div>
    </Sheet>
  )
}

function TeamSheet({ team, s, update, close, t }) {
  const logoKey = `${team}Logo`
  const [name, setName] = useState(s[team].name)
  const [color, setColor] = useState(s[team].color)
  const [logo, setLogo] = useState(s.opts[logoKey] || '')
  const save = () => {
    const n = name.trim() || s[team].name
    update(x => G.setOptions(G.setTeam(x, team, { name: n, color }), { ...x.opts, [logoKey]: logo }))
    saveTeam({ name: n, color, logo })
    shareTeamIfNew({ name: n, color, logo })
    close()
  }
  return (
    <Sheet close={close}>
      <h3>{team === 'home' ? t('homeTeam') : t('awayTeam')}</h3>
      <SavedTeams label={t('savedTeams')} onPick={tm => { setName(tm.name); setColor(tm.color); setLogo(tm.logo || '') }} />
      <label>{t('teamName')}
        <input autoFocus value={name} maxLength={24} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
      </label>
      <label>{t('teamColor')}
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 44 }} />
      </label>
      <div className="field">{t('teamLogo')}
        <div className="row" style={{ alignItems: 'center' }}>
          {logo ? <img src={logo} alt="" style={{ height: 44, width: 44, objectFit: 'contain' }} /> : <span className="hint">—</span>}
          <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) setLogo(await resizeImage(f, 512)) }} />
          {logo && <button className="btn sm" onClick={() => setLogo('')}>✕</button>}
        </div>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={save}>{t('save')}</button><button className="btn ghost" onClick={close}>{t('cancel')}</button></div>
    </Sheet>
  )
}

function SetClockSheet({ s, update, close, t }) {
  const rem = G.clockRemaining(s)
  const [m, setM] = useState(Math.floor(rem / 60000))
  const [sec, setSec] = useState(Math.floor((rem % 60000) / 1000))
  const apply = () => { update(x => G.setClock(x, (Number(m) || 0) * 60000 + (Number(sec) || 0) * 1000)); close() }
  return (
    <Sheet close={close}>
      <h3>{t('setClock')} {s.opts.clockDir === 'up' ? t('remainingTime') : ''}</h3>
      <div className="grid2">
        <label>{t('minutes')}<input inputMode="numeric" value={m} onChange={e => setM(e.target.value)} autoFocus /></label>
        <label>{t('seconds')}<input inputMode="numeric" value={sec} onChange={e => setSec(e.target.value)} /></label>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={apply}>{t('setBtn')}</button><button className="btn ghost" onClick={close}>{t('cancel')}</button></div>
    </Sheet>
  )
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function SummarySheet({ s, gameId, close, t, editGoal }) {
  const text = G.summaryText(s)
  const sheet = G.gameSheet(s)
  const [copied, setCopied] = useState(false)
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `${gameId}-${stamp}`
  // printable IIHF-style game sheet; "Save as PDF" in the print dialog gives the PDF
  const print = () => {
    const html = G.summaryHtml(s)
    const w = window.open('', '_blank')
    if (!w) { download(`${base}.html`, html, 'text/html'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }
  return (
    <Sheet close={close}>
      <h3>{t('summaryTitle')}</h3>
      {sheet.goals.length > 0 && (
        <div className="goallist">
          {sheet.goals.map(g => (
            <button key={g.id} className="btn sm" aria-label={`edit goal ${g.no}`} onClick={() => editGoal(g.id)}>
              <span className="tnum">{g.time}</span> <b>{g.teamName}</b> {g.scorer ? `#${g.scorer}` : '?'}{g.a1 ? ` (${[g.a1, g.a2].filter(Boolean).map(n => '#' + n).join(', ')})` : ''} <small>{g.situation}</small> <span className="tnum">{g.score}</span> ✎
            </button>
          ))}
        </div>
      )}
      <pre className="summary">{text}</pre>
      <div className="row">
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? t('copied') : t('copy')}</button>
        <button className="btn sm" onClick={() => download(`${base}.txt`, text, 'text/plain')}>{t('downloadTxt')}</button>
        <button className="btn sm" onClick={() => download(`${base}.csv`, G.summaryCsv(s), 'text/csv')}>{t('downloadCsv')}</button>
        <button className="btn sm accent" onClick={print}>{t('printPdf')}</button>
      </div>
      <button className="btn ghost" onClick={close}>{t('close')}</button>
    </Sheet>
  )
}

// Game-sheet details for one goal: scorer, assists, situation, empty net
const SITUATIONS = ['EQ', 'PP1', 'PP2', 'SH1', 'SH2', 'PS']
function GoalSheet({ s, id, update, close, t }) {
  const e = (s.events || []).find(x => x.id === id && x.type === 'goal')
  const [scorer, setScorer] = useState(e?.scorer || '')
  const [a1, setA1] = useState(e?.a1 || '')
  const [a2, setA2] = useState(e?.a2 || '')
  const [situation, setSituation] = useState(e?.situation || 'EQ')
  const [en, setEn] = useState(Boolean(e?.en))
  if (!e) return null
  const save = () => { update(x => G.editGoal(x, id, { scorer, a1, a2, situation, en })); close() }
  const enter = ev => ev.key === 'Enter' && save()
  return (
    <Sheet close={close}>
      <h3 style={{ color: s[e.team].color }}>{t('goalDetails')} · {s[e.team].name} · <span className="tnum">{G.fmtGameTime(G.eventGameTimeMs(s, e))}</span></h3>
      <div className="grid3">
        <label>{t('scorer')}<input inputMode="numeric" autoFocus value={scorer} onChange={ev => setScorer(ev.target.value)} placeholder="#" onKeyDown={enter} /></label>
        <label>{t('assist1')}<input inputMode="numeric" value={a1} onChange={ev => setA1(ev.target.value)} placeholder="#" onKeyDown={enter} /></label>
        <label>{t('assist2')}<input inputMode="numeric" value={a2} onChange={ev => setA2(ev.target.value)} placeholder="#" onKeyDown={enter} /></label>
      </div>
      {/* a <div>, not a <label>: label text would "click" the first button */}
      <div className="field">{t('situation')}
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {SITUATIONS.map(x => <button key={x} className={`btn sm ${situation === x ? 'on' : ''}`} onClick={() => setSituation(x)}>{x}</button>)}
          <button className={`btn sm ${en ? 'on' : ''}`} aria-pressed={en} onClick={() => setEn(!en)}>EN · {t('emptyNet')}</button>
        </div>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={save}>{t('save')}</button><button className="btn ghost" onClick={close}>{t('cancel')}</button></div>
    </Sheet>
  )
}

// Every link of this game, in full: what people watch (public) and the controllers (keep private)
function QrSheet({ boardUrl, bannerUrl, controlUrl, close, t, small, labels }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=0&data=${encodeURIComponent(boardUrl)}`
  const share = () => navigator.share?.({ title: 'Live scoreboard', url: boardUrl }).catch(() => {})
  const withParam = (url, k, val) => { const u = new URL(url); u.searchParams.set(k, val); return u.toString() }
  const rinkName = k => labels[k === 'a' ? 'rinkA' : 'rinkB']
  const watch = [
    [small ? t('linkCenterBoard') : t('linkBoard'), boardUrl],
    ...(small ? ['a', 'b'].map(k => [`${t('linkBoard')} · ${rinkName(k)}`, withParam(boardUrl, 'rink', k)]) : []),
    [t('linkShift'), withParam(boardUrl, 'view', 'shift')],
    ...(small ? ['a', 'b'].map(k => [`${t('obsOverlay')} ${rinkName(k)}`, withParam(bannerUrl, 'rink', k)]) : [[t('obsOverlay'), bannerUrl]]),
  ]
  const run = [
    [small ? t('linkCenterControl') : t('operatorLink'), controlUrl],
    ...(small ? ['a', 'b'].map(k => [`${t('linkRinkControl')} · ${rinkName(k)}`, withParam(controlUrl, 'rink', k)]) : []),
  ]
  const Link = ([label, url]) => (
    <div className="lk" key={url}>
      <span>{label}</span>
      <code>{url}</code>
      <button className="btn sm" onClick={() => navigator.clipboard?.writeText(url)}>{t('copyLink')}</button>
    </div>
  )
  return (
    <Sheet close={close}>
      <h3>{t('publicLink')}</h3>
      <div className="qr">
        <img src={src} alt="QR code" />
        <div className="row">
          {navigator.share && <button className="btn sm" onClick={share}>{t('share')}</button>}
        </div>
        <div className="hint" style={{ textAlign: 'center' }}>{t('publicHint')}</div>
        <div className="links">
          <h4>{t('linksWatch')}</h4>
          {watch.map(Link)}
          <h4>{t('linksRun')}</h4>
          {run.map(Link)}
        </div>
      </div>
      <button className="btn ghost" onClick={close}>{t('close')}</button>
    </Sheet>
  )
}

function LockedScreen({ gameId, t }) {
  const [k, setK] = useState('')
  const go = () => { if (k.trim()) { rememberKey(gameId, k.trim()); window.location.href = `/c/${gameId}?k=${encodeURIComponent(k.trim())}` } }
  return (
    <div className="home">
      <h1>{t('lockedTitle')}</h1>
      <p>{t('lockedText', { id: gameId })}</p>
      <div className="code"><input value={k} onChange={e => setK(e.target.value)} placeholder={t('keyPlaceholder')} onKeyDown={e => e.key === 'Enter' && go()} /></div>
      <div className="links">
        {NEEDS_LOGIN && <a className="btn primary" href={`/login?next=${encodeURIComponent('/c/' + gameId)}`}>{t('login')}</a>}
        <button className={`btn ${NEEDS_LOGIN ? '' : 'primary'}`} onClick={go}>{t('unlock')}</button>
        <a className="btn" href={`/b/${gameId}`}>{t('openDisplay')}</a>
      </div>
    </div>
  )
}
