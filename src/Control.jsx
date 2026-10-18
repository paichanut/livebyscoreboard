import React, { useEffect, useState } from 'react'
import { useGame, useGameId, useTick, useUrlKey } from './useGame.js'
import * as G from './game.js'
import { ONLINE, NEEDS_LOGIN, randomKey, rememberKey, storedKey, getSession, helperKey } from './sync.js'
import { useAppearance, useGameSounds, SoundToggle, useSound } from './useOptions.jsx'
import { translator } from './i18n.js'
import TimeBadge from './TimeBadge.jsx'
import Options from './Options.jsx'
import { KEY_GROUPS, KEY_LABELS, keyName } from './options.js'

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
  useTick(100, Boolean(s?.clock.running || s?.timeout))
  const [sheet, setSheet] = useState(null)
  const [openPen, setOpenPen] = useState(null) // penalty row showing its ±1/±5 s buttons
  // optional: play horn/buzzer on this device too (phone speaker / laptop plugged into the PA)
  const sound = useSound('rinkboard:sound:control', false)
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
        startAll: x => G.startClock(x), stopAll: G.stopClock,
        startClockOnly: x => G.startClock(x, { penalties: false }), stopClockOnly: G.stopClock,
        resetClock: x => (ask('period', t('confirmResetClock')) ? G.resetClock(x) : x),
        penaltiesOn: x => G.setPlayLive(x, true), penaltiesOff: x => G.setPlayLive(x, false),
        penaltyOn: x => G.setPlayLive(x, true), penaltyOff: x => G.setPlayLive(x, false),
        removePenalty: x => (ask('removePenalty', t('confirmRemovePenalty')) ? G.removeLastPenalty(x) : x),
        timeOfDay: G.toggleTimeOfDay,
        homeGoal: x => G.addScore(x, 'home', 1), homeGoalMinus: x => G.addScore(x, 'home', -1),
        homeShot: x => G.addShot(x, 'home', 1), homeShotMinus: x => G.addShot(x, 'home', -1),
        awayGoal: x => G.addScore(x, 'away', 1), awayGoalMinus: x => G.addScore(x, 'away', -1),
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
      const fn = map[act]
      if (fn) update(x => fn(x) ?? x)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [sheet, s?.opts?.keys, s?.opts?.confirm, s?.opts?.uiLang])

  if (access === 'locked' || access === 'missing' || (NEEDS_LOGIN && !key)) return <LockedScreen gameId={gameId} t={t} />
  if (!s) return <div className="loading">{t('connecting')}</div>

  const o = s.opts
  const remaining = G.clockRemaining(s)
  const running = s.clock.running
  const strength = G.strengthLabel(s)
  const origin = window.location.origin
  const boardUrl = `${origin}/b/${encodeURIComponent(gameId)}`
  const bannerUrl = `${origin}/o/${encodeURIComponent(gameId)}`
  const controlUrl = shareKey ? `${origin}/c/${encodeURIComponent(gameId)}?k=${shareKey}` : `${origin}/c/${encodeURIComponent(gameId)}`
  const isNum = !['OT', 'SO'].includes(s.period)
  const isSO = s.period === 'SO'

  return (
    <div className="control">
      <div className="top">
        <span>{t('game')} · {gameId}</span>
        <span className={ONLINE ? 'live' : 'local'}>{ONLINE ? t('live') : t('local')}<TimeBadge /></span>
      </div>
      <SoundToggle sound={sound} className="btn sm csound" />

      <div className="card clockcard">
        <div className="p">
          <span className={`run ${running ? 'on' : ''}`}>{running ? t('running') : t('paused')}</span>
          <span>{isNum ? <>{o.labels.period} <b>{G.periodLabel(s)}</b></> : <b>{G.periodLabel(s)}</b>}</span>
          {strength && <span className="st">{strength}</span>}
          {o.clockDir === 'up' && <span style={{ fontSize: 12 }}>{t('up')}</span>}
          {s.showTimeOfDay && <span className="tod">{t('todOnDisplay')}</span>}
        </div>
        <div className={`c tnum ${remaining <= 0 ? 'final' : ''}`}>{G.fmtClock(G.clockShown(s))}</div>
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
        <div className="goallight">
          <span className="gl">{t('goalLight')}</span>
          <div className="row">
            <button className={`btn sm ${G.goalFlashActive(s) === 'home' ? 'lit' : ''}`} aria-label="goal light home" onClick={() => update(x => G.setGoalLight(x, 'home'))}>◁ {s.home.name}</button>
            <button className="btn sm" aria-label="goal light off" onClick={() => update(x => G.setGoalLight(x, null))}>{t('none')}</button>
            <button className={`btn sm ${G.goalFlashActive(s) === 'away' ? 'lit' : ''}`} aria-label="goal light away" onClick={() => update(x => G.setGoalLight(x, 'away'))}>{s.away.name} ▷</button>
          </div>
        </div>
        {isSO && <div className="hint sohint">{t('soHint')}</div>}
      </div>

      <div className="teams">
        {['home', 'away'].map(team => {
          const tm = s[team]
          const so = s.shootout?.[team] || []
          return (
            <div className="tc" key={team} style={{ '--c': tm.color }}>
              <div className="n">{tm.name}</div>
              <div className="s tnum">{tm.score}</div>
              <button className="goal" onClick={() => update(x => G.addScore(x, team, 1))}>{t('goal')}</button>
              {isSO && (
                <div className="so">
                  <div className="marks" aria-label={`shootout ${team}`}>{so.length ? so.map((a, i) => <span key={i} className={`so-${a}`}>{a === 'goal' ? '●' : '○'}</span>) : <span className="none">—</span>}</div>
                  <div className="mini">
                    <button className="btn on" onClick={() => update(x => G.soAttempt(x, team, true))}>{t('soGoal')}</button>
                    <button className="btn" onClick={() => update(x => G.soAttempt(x, team, false))}>{t('soMiss')}</button>
                    <button className="btn" onClick={() => update(x => G.soUndo(x, team))} disabled={!so.length}>↶</button>
                  </div>
                </div>
              )}
              <div className="mini">
                <span className="ml">{t('scoreLbl')}</span>
                <button className="btn minus" onClick={() => update(x => G.addScore(x, team, -1))}>{t('minus1')}</button>
                <button className="btn plus" aria-label="score +1" onClick={() => update(x => G.addScore(x, team, 1))}>+1</button>
              </div>
              <div className="mini">
                <span className="ml">{o.labels.shots} <b className="tnum">{tm.shots}</b></span>
                <button className="btn minus" aria-label="shot −1" onClick={() => update(x => G.addShot(x, team, -1))}>−1</button>
                <button className="btn plus" aria-label="Shot +" onClick={() => update(x => G.addShot(x, team, 1))}>+1</button>
              </div>
              <div className="penhead">
                <span>{o.labels.player} · {o.labels.penalty}</span>
                <button className="btn addpen" aria-label="add penalty" onClick={() => setSheet(`pen-${team}`)}>+</button>
              </div>
              {G.teamPenalties(s, team).map(p => (
                <div className={`pen ${p.status}`} key={p.id} data-status={p.status}>
                  <div className="who">{p.player ? `#${p.player}` : t('pen')} <small>{p.infraction || t('kind_' + p.kind)}</small></div>
                  <span className="pt tnum">{p.status === 'waiting' ? t('waiting') + ' · ' : ''}{G.fmtClock(p.remainingMs, { tenths: false })}</span>
                  <div className="acts">
                    <button aria-label="edit penalty" onClick={() => setSheet(`edit-${team}-${p.id}`)}>✎</button>
                    <button aria-label="remove penalty" onClick={() => { if (ask('removePenalty', t('confirmRemovePenalty'))) update(x => G.removePenalty(x, p.id)) }}>✕</button>
                    <button aria-label="more" className={openPen === p.id ? 'on' : ''} onClick={() => setOpenPen(openPen === p.id ? null : p.id)}>•••</button>
                  </div>
                  {openPen === p.id && (
                    <div className="nudge">
                      {[-5, -1, 1, 5].map(d => (
                        <button key={d} onClick={() => update(x => G.nudgePenalty(x, p.id, d * 1000))}>{d > 0 ? `+${d}` : `−${-d}`}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="bottom">
        <button className="btn" onClick={() => setSheet('options')}>{t('options')}</button>
        <a className="btn" href={boardUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>{t('display')}</a>
        <button className="btn" onClick={() => setSheet('summary')}>{t('summary')}</button>
        <button className="btn" onClick={() => setSheet('qr')}>{t('qr')}</button>
        <button className="btn" onClick={() => setSheet('setclock')}>{t('correction')}</button>
        <button className="btn" onClick={() => { if (ask('newGame', t('confirmNewGame'))) update(G.resetGame) }}>{t('newGame')}</button>
        <button className="btn keysbtn" onClick={() => setSheet('keys')} aria-label="keyboard shortcuts">⌨ {t('help')}</button>
      </div>

      {sheet?.startsWith('pen-') && <PenaltySheet team={sheet.slice(4)} s={s} update={update} close={() => setSheet(null)} t={t} />}
      {sheet?.startsWith('edit-') && (() => {
        const [, team, id] = sheet.split('-')
        const pen = s.penalties.find(p => p.id === id)
        return pen ? <PenaltySheet team={team} s={s} update={update} close={() => setSheet(null)} t={t} edit={pen} /> : null
      })()}
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
      {sheet === 'summary' && <SummarySheet s={s} gameId={gameId} close={() => setSheet(null)} t={t} />}
      {sheet === 'qr' && <QrSheet boardUrl={boardUrl} bannerUrl={bannerUrl} controlUrl={controlUrl} close={() => setSheet(null)} t={t} />}
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
  const [mins, setMins] = useState(edit ? Math.round(edit.durationMs / 60000) : lens[0])
  const [infraction, setInfraction] = useState(edit?.infraction || '')
  const add = () => {
    update(x => (edit ? G.editPenalty(x, edit.id, { player, minutes: mins, infraction }) : G.addPenalty(x, team, player, mins, infraction)))
    close()
  }
  const pick = tp => { setInfraction(tp.name); setMins(tp.minutes) }
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
                {tp.name} <small>{tp.minutes}′</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* a <div>, not a <label>: label text would "click" the first button */}
      <div className="field">{t('length')}
        <div className="choices" style={{ flexWrap: 'wrap' }}>
          {lens.map(m => <button key={m} className={`btn ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{m} {t('min')}</button>)}
        </div>
      </div>
      <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={add}>{edit ? t('savePenalty') : t('addPenalty')}{infraction ? ` · ${infraction}` : ''}</button><button className="btn ghost" onClick={close}>{t('cancel')}</button></div>
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

function SummarySheet({ s, gameId, close, t }) {
  const text = G.summaryText(s)
  const [copied, setCopied] = useState(false)
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `${gameId}-${stamp}`
  return (
    <Sheet close={close}>
      <h3>{t('summaryTitle')}</h3>
      <pre className="summary">{text}</pre>
      <div className="row">
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? t('copied') : t('copy')}</button>
        <button className="btn sm" onClick={() => download(`${base}.txt`, text, 'text/plain')}>{t('downloadTxt')}</button>
        <button className="btn sm" onClick={() => download(`${base}.csv`, G.summaryCsv(s), 'text/csv')}>{t('downloadCsv')}</button>
      </div>
      <button className="btn ghost" onClick={close}>{t('close')}</button>
    </Sheet>
  )
}

function QrSheet({ boardUrl, bannerUrl, controlUrl, close, t }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=0&data=${encodeURIComponent(boardUrl)}`
  const share = () => navigator.share?.({ title: 'Live scoreboard', url: boardUrl }).catch(() => {})
  return (
    <Sheet close={close}>
      <h3>{t('publicLink')}</h3>
      <div className="qr">
        <img src={src} alt="QR code" />
        <div className="url">{boardUrl}</div>
        <div className="row">
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(boardUrl)}>{t('copyLink')}</button>
          {navigator.share && <button className="btn sm" onClick={share}>{t('share')}</button>}
        </div>
        <div className="hint" style={{ textAlign: 'center' }}>{t('publicHint')}</div>
        <div className="url" style={{ marginTop: 8 }}>{t('obsOverlay')} {bannerUrl}</div>
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(bannerUrl)}>{t('copyBanner')}</button>
        <div className="url" style={{ marginTop: 8 }}>{t('operatorLink')}</div>
        <button className="btn sm accent" onClick={() => navigator.clipboard?.writeText(controlUrl)}>{t('copyOperator')}</button>
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
