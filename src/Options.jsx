import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_KEYS, KEY_LABELS, KEY_GROUPS, SOUND_CHOICES, FONT_CHOICES, COLOR_FIELDS, defaultOptions, keyName } from './options.js'
import { unlockAudio, playSound, ready } from './horn.js'
import * as G from './game.js'
import { LANGS, translator } from './i18n.js'
import { listTeams, saveTeam, removeTeam } from './teamLibrary.js'
import { SHARED_TEAMS, listSharedTeams, shareTeamIfNew } from './sync.js'
import { useGameId } from './useGame.js'

const TABS = ['Game', 'Teams', 'Keys', 'Colors', 'Sounds', 'Text', 'Banner', 'Other']

export default function Options({ s, update, close }) {
  const [tab, setTab] = useState('Game')
  const [o, setO] = useState(() => JSON.parse(JSON.stringify(s.opts)))
  const [home, setHome] = useState({ name: s.home.name, color: s.home.color })
  const [away, setAway] = useState({ name: s.away.name, color: s.away.color })
  const [periodMin, setPeriodMin] = useState(s.periodLengthMs / 60000)
  const [skaters, setSkaters] = useState(s.skaters)
  const [theme, setTheme] = useState(s.theme || 'dark')

  const set = (path, value) => setO(prev => {
    const next = JSON.parse(JSON.stringify(prev))
    const keys = path.split('.')
    let cur = next
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
    cur[keys[keys.length - 1]] = value
    return next
  })
  const get = path => path.split('.').reduce((a, k) => a?.[k], o)

  const save = () => {
    update(x => {
      let n = G.setTeam(x, 'home', { name: home.name.trim() || 'HOME', color: home.color })
      n = G.setTeam(n, 'away', { name: away.name.trim() || 'AWAY', color: away.color })
      n = G.setSettings(n, { periodLengthMs: Math.max(1, Number(periodMin) || 15) * 60000, skaters: Number(skaters), theme })
      n = G.setOptions(n, o)
      if (!G.periodList(n).includes(n.period)) n = G.setPeriod(n, '1')
      return n
    })
    for (const tm of [{ ...home, logo: o.homeLogo }, { ...away, logo: o.awayLogo }]) { saveTeam(tm); shareTeamIfNew(tm) }
    close()
  }

  // the game as it would look with these options, for the live preview (nothing is saved until Save)
  const draft = useMemo(() => ({
    ...s, theme, skaters: Number(skaters) || s.skaters, opts: o,
    home: { ...s.home, name: home.name.trim() || 'HOME', color: home.color },
    away: { ...s.away, name: away.name.trim() || 'AWAY', color: away.color },
  }), [s, o, theme, home, away, skaters])
  const gameId = useGameId()
  const preview = sticky => <LivePreview state={draft} gameId={gameId} sticky={sticky} />
  const P = { o, set, get, preview }
  const t = translator(o.uiLang)
  const tabName = name => t('tabs')[name] || name
  return (
    <div className="opts">
      <div className="tabs">{TABS.map(name => <button key={name} className={tab === name ? 'on' : ''} data-tab={name} onClick={() => setTab(name)}>{tabName(name)}</button>)}</div>
      <div className="body">
        {tab === 'Game' && <GameTab {...P} periodMin={periodMin} setPeriodMin={setPeriodMin} skaters={skaters} setSkaters={setSkaters} />}
        {tab === 'Teams' && <TeamsTab {...P} home={home} setHome={setHome} away={away} setAway={setAway} />}
        {tab === 'Keys' && <KeysTab {...P} />}
        {tab === 'Colors' && <ColorsTab {...P} theme={theme} setTheme={setTheme} />}
        {tab === 'Sounds' && <SoundsTab {...P} />}
        {tab === 'Text' && <TextTab {...P} />}
        {tab === 'Banner' && <BannerTab {...P} />}
        {tab === 'Other' && <OtherTab {...P} update={update} close={close} resetAll={() => setO(defaultOptions())} />}
      </div>
      <div className="foot">
        <button className="btn primary" onClick={save}>{t('save')}</button>
        <button className="btn ghost" onClick={close}>{t('cancel')}</button>
      </div>
    </div>
  )
}

// `as="div"` for rows whose control is a group of buttons: a <label> would make its text click the first button.
const Row = ({ label, children, as: Tag = 'label' }) => <Tag className="row"><span>{label}</span>{children}</Tag>
const Check = ({ label, path, get, set }) => <Row label={label}><input type="checkbox" checked={Boolean(get(path))} onChange={e => set(path, e.target.checked)} /></Row>
const Num = ({ label, path, get, set, min = 0, max = 999, suffix }) => (
  <Row label={label}><span className="inline"><input type="number" min={min} max={max} value={get(path)} onChange={e => set(path, Number(e.target.value))} />{suffix}</span></Row>
)

// Line-change buzzer: every mm:ss of game time (0:00 = off). The display counts the shift down in seconds.
function ShiftRow({ o, set }) {
  const total = Math.round((Number(o.shiftMs) || 0) / 1000)
  const put = (m, sec) => set('shiftMs', Math.max(0, (Math.max(0, Number(m) || 0) * 60 + Math.max(0, Math.min(59, Number(sec) || 0))) * 1000))
  return (
    <Row label="Line change buzzer every (mm:ss, 0:00 = off)" as="div">
      <span className="inline mmss">
        <input type="number" min={0} max={20} aria-label="shift minutes" value={Math.floor(total / 60)} onChange={e => put(e.target.value, total % 60)} />
        :
        <input type="number" min={0} max={59} aria-label="shift seconds" value={String(total % 60).padStart(2, '0')} onChange={e => put(Math.floor(total / 60), e.target.value)} />
      </span>
    </Row>
  )
}

function GameTab({ get, set, o, periodMin, setPeriodMin, skaters, setSkaters, preview }) {
  const [newLen, setNewLen] = useState('')
  return (
    <>
      <h4>Rink</h4>
      <div className="chips">
        <button className={`btn ${!o.smallIce ? 'on' : ''}`} onClick={() => set('smallIce', false)}>Full rink — one game</button>
        <button className={`btn ${o.smallIce ? 'on' : ''}`} onClick={() => { set('smallIce', true); if (!o.shiftMs) set('shiftMs', 90_000) }}>Small ice — 2 games, one clock</button>
      </div>
      {o.smallIce && <p className="hint">Rink A and Rink B share the clock, period and shift; each has its own teams, score and penalties.
        Boards: center = /b/CODE, sides = /b/CODE?rink=a and ?rink=b. Controllers: center = this page, sides = /c/CODE?rink=a and ?rink=b (QR → links).</p>}
      {o.smallIce && <>
        <Row label="Rink A name"><input type="text" value={o.labels.rinkA} onChange={e => set('labels.rinkA', e.target.value.slice(0, 16))} style={{ width: 160 }} /></Row>
        <Row label="Rink B name"><input type="text" value={o.labels.rinkB} onChange={e => set('labels.rinkB', e.target.value.slice(0, 16))} style={{ width: 160 }} /></Row>
      </>}
      <ShiftRow o={o} set={set} />
      <h4>Scoreboard layout</h4>
      <div className="chips">
        <button className={`btn ${o.layout === 'arena' ? 'on' : ''}`} onClick={() => set('layout', 'arena')}>Arena — logos on top, penalty boxes, photo</button>
        <button className={`btn ${o.layout === 'compact' ? 'on' : ''}`} onClick={() => set('layout', 'compact')}>Compact — one panel (stream overlay)</button>
        <button className={`btn ${o.layout === 'full' ? 'on' : ''}`} onClick={() => set('layout', 'full')}>Full — shots, logos, title</button>
        <button className={`btn ${o.layout === 'minimal' ? 'on' : ''}`} onClick={() => set('layout', 'minimal')}>Minimal — bigger numbers</button>
      </div>
      {preview(false)}
      <h4>Clock</h4>
      <Row label="Period length (min)"><input type="number" min={1} max={60} value={periodMin} onChange={e => setPeriodMin(e.target.value)} style={{ width: 80 }} /></Row>
      <Num label="Number of regular periods" path="periods" get={get} set={set} min={1} max={9} />
      <Num label="Overtime length (min) — IIHF: 5 round robin, 10 playoffs" path="otMinutes" get={get} set={set} min={1} max={20} />
      <Row label="Overtime indicator"><input type="text" value={o.otLabel} onChange={e => set('otLabel', e.target.value.slice(0, 3))} style={{ width: 80 }} /></Row>
      <Row label="Period time direction">
        <select value={o.clockDir} onChange={e => set('clockDir', e.target.value)} style={{ width: 120 }}><option value="down">Down</option><option value="up">Up</option></select>
      </Row>
      <Row label="Skaters per side" as="div">
        <span className="chips">{[3, 4, 5].map(n => <button key={n} className={`btn ${skaters === n ? 'on' : ''}`} onClick={() => setSkaters(n)}>{n}v{n}</button>)}</span>
      </Row>
      {Number(skaters) === 3 && <p className="hint">IIHF 3x3: playing penalties award a penalty shot; both teams stay at three skaters. Standard overtime uses its separate manpower rules.</p>}
      {Number(skaters) === 3 && <Row label="3v3 penalty rules"><select value={o.threeOnThreeRules || 'penalty-shot'} onChange={e => set('threeOnThreeRules', e.target.value)}><option value="penalty-shot">IIHF 3x3 · penalty shots</option><option value="overtime">Standard overtime · manpower advantage</option></select></Row>}
      <h4>Timeouts</h4>
      <Num label="Timeout 1 duration (sec)" path="timeout1Sec" get={get} set={set} min={5} max={600} />
      <Num label="Timeout 2 duration (sec)" path="timeout2Sec" get={get} set={set} min={5} max={600} />
      <Num label="Warning sound at (sec remaining, 0 = off)" path="timeoutWarnSec" get={get} set={set} min={0} max={120} />
      <h4>Goal indicator</h4>
      <Check label="When a score increases, show goal indicator" path="goalIndicator" get={get} set={set} />
      <Num label="Turn off after (sec)" path="goalOffSec" get={get} set={set} min={1} max={120} />
      <h4>Penalty announcement</h4>
      <Check label="Show referee animation on scoreboard" path="penaltyAnimation" get={get} set={set} />
      <h4>Common penalty lengths (min)</h4>
      <div className="penlens">
        {o.penaltyLengths.map((m, i) => <span className="chip" key={i}>{m} min <button onClick={() => set('penaltyLengths', o.penaltyLengths.filter((_, j) => j !== i))}>✕</button></span>)}
        <input type="number" min={1} max={60} placeholder="+" value={newLen} onChange={e => setNewLen(e.target.value)} style={{ width: 70 }}
          onKeyDown={e => { if (e.key === 'Enter' && Number(newLen) > 0) { set('penaltyLengths', [...o.penaltyLengths, Number(newLen)].sort((a, b) => a - b)); setNewLen('') } }} />
        <button className="btn sm" onClick={() => { if (Number(newLen) > 0) { set('penaltyLengths', [...o.penaltyLengths, Number(newLen)].sort((a, b) => a - b)); setNewLen('') } }}>Add</button>
      </div>
    </>
  )
}

function ImagePick({ label, path, get, set, max = 512 }) {
  const v = get(path)
  const onFile = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = await resizeImage(f, max)
    set(path, url)
  }
  return (
    <div className="imgpick">
      {v ? <img className="preview" src={v} alt="" /> : <div className="preview empty">none</div>}
      <div className="ctl">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
        <input type="file" accept="image/*" onChange={onFile} />
        <input type="url" placeholder="…or paste image URL" value={v?.startsWith('data:') ? '' : v || ''} onChange={e => set(path, e.target.value)} />
      </div>
      {v && <button className="btn sm" onClick={() => set(path, '')}>Clear</button>}
    </div>
  )
}

// Pictures are stored resized. Logos (≤ 512 px, PNG) lose their empty transparent border first, so a logo
// whose background was removed fills its box on the scoreboard instead of floating small in the middle.
export function resizeImage(file, max) {
  return fitImage(URL.createObjectURL(file), max)
}

export function fitImage(src, max = 320, { onlyTrimmed = false } = {}) {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      let box = { x: 0, y: 0, w: img.width, h: img.height }
      const cut = max <= 512 && opaqueBox(img)
      if (cut) box = cut
      else if (onlyTrimmed) return res(null)
      const r = Math.min(1, max / Math.max(box.w, box.h))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(box.w * r)); c.height = Math.max(1, Math.round(box.h * r))
      c.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height)
      res(max > 512 ? c.toDataURL('image/jpeg', 0.7) : c.toDataURL('image/png'))
    }
    img.onerror = () => res(onlyTrimmed ? null : src)
    img.src = src
  })
}

// A logo already saved (team library, a picked team): the same logo without its empty transparent border, or
// null when it has none (solid background, already trimmed, or a picture from another site).
export const trimLogo = src => fitImage(src, 512, { onlyTrimmed: true })

// The part of the picture that isn't (nearly) transparent, plus a 2 % margin; null when there is nothing to cut.
function opaqueBox(img) {
  try {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0) return null // fully transparent
    const m = Math.round(0.02 * Math.max(x1 - x0, y1 - y0))
    const box = { x: Math.max(0, x0 - m), y: Math.max(0, y0 - m) }
    box.w = Math.min(c.width, x1 + m + 1) - box.x
    box.h = Math.min(c.height, y1 + m + 1) - box.y
    return box.w === c.width && box.h === c.height ? null : box
  } catch {
    return null // a picture from another site can't be read: keep it as it is
  }
}

function TeamsTab({ get, set, home, setHome, away, setAway }) {
  return (
    <>
      <h4>Tournament</h4>
      <ImagePick label="Tournament logo (display: above the clock · OBS banner)" path="logoImg" get={get} set={set} />
      <ImagePick label="Background photo (Arena layout; kept dark so numbers stay readable)" path="bgImg" get={get} set={set} max={1280} />
      {[['Team 1 (home)', home, setHome, 'homeLogo'], ['Team 2 (away)', away, setAway, 'awayLogo']].map(([title, t, setT, logoPath]) => (
        <React.Fragment key={logoPath}>
          <h4>{title}</h4>
          <SavedTeams onPick={tm => { setT({ ...t, name: tm.name, color: tm.color }); set(logoPath, tm.logo || '') }} />
          <div className="grid2">
            <label>Team name<input type="text" value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></label>
            <label>Color<input type="color" value={t.color} onChange={e => setT({ ...t, color: e.target.value })} /></label>
          </div>
          <ImagePick label="Logo (Arena: above the name · Full: faded behind the score)" path={logoPath} get={get} set={set} />
        </React.Fragment>
      ))}
    </>
  )
}

// One-tap list of teams: the shared online library (see sync.js, table `teams`) plus the ones saved in
// this browser / on this computer (teamLibrary.js). Shared teams win when both have the same name.
export function SavedTeams({ onPick, label = 'Saved teams' }) {
  const [list, setList] = useState(listTeams)
  const [shared, setShared] = useState([])
  const picked = useRef(null)
  useEffect(() => { if (SHARED_TEAMS) listSharedTeams().then(setShared, () => {}) }, [])
  // at once, then the logo again without its empty transparent border (unless another team was picked meanwhile)
  const pick = tm => {
    picked.current = tm
    onPick(tm)
    if (tm.logo) trimLogo(tm.logo).then(logo => { if (logo && picked.current === tm) onPick({ ...tm, logo }) })
  }
  const sharedIds = new Set(shared.map(t => t.name.toLowerCase()))
  const all = [...shared.map(t => ({ ...t, shared: true })), ...list.filter(t => !sharedIds.has(t.id))]
  if (!all.length) return <div className="savedteams"><span className="hint"><a href="/teams" target="_blank" rel="noreferrer">+ Add team logos (one-tap teams) ▸</a></span></div>
  return (
    <div className="savedteams">
      <span className="hint">{label} · <a href="/teams" target="_blank" rel="noreferrer">manage logos ▸</a></span>
      <div className="chips">
        {all.map(tm => (
          <span className="savedteam" key={tm.shared ? `s-${tm.id}` : tm.id} style={{ '--c': tm.color }} title={tm.shared ? `by ${tm.uploader || '—'}` : undefined}>
            <button className="btn sm" aria-label={`use team ${tm.name}`} onClick={() => pick(tm)}>
              {tm.logo ? <img src={tm.logo} alt="" /> : <i />}{tm.name}
            </button>
            {!tm.shared && <button className="x" aria-label={`forget team ${tm.name}`} onClick={() => { removeTeam(tm.id); setList(listTeams()) }}>✕</button>}
          </span>
        ))}
      </div>
    </div>
  )
}

function KeysTab({ o, set }) {
  const [listening, setListening] = useState(null)
  useEffect(() => {
    if (!listening) return
    const on = e => { e.preventDefault(); if (e.code !== 'Escape') set(`keys.${listening}`, e.code); setListening(null) }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [listening])
  return (
    <>
      <div className="hint">Click a key to change it, then press the new key. Esc cancels.</div>
      {KEY_GROUPS.map(([group, names]) => (<React.Fragment key={group}><h4>{group}</h4>{names.map(k => (
        <div className="keyrow" key={k}>
          <span>{KEY_LABELS[k]}</span>
          <span className="inline">
            <kbd className={listening === k ? 'listening' : ''} onClick={() => setListening(k)}>{listening === k ? '…' : keyName(o.keys[k])}</kbd>
            <button className="btn sm" onClick={() => set(`keys.${k}`, '')}>✕</button>
          </span>
        </div>
      ))}</React.Fragment>))}
      <button className="btn ghost" onClick={() => set('keys', { ...DEFAULT_KEYS })}>Reset all keys</button>
    </>
  )
}

function ColorsTab({ o, set, theme, setTheme, preview }) {
  const THEMES = [['dark', 'Dark arena'], ['light', 'Light'], ['led', 'LED classic'], ['ice', 'Ice']]
  return (
    <>
      {preview(true)}
      <h4>Display background</h4>
      <div className="colorrow">
        <span>Background opacity: <b>{o.bgOpacity ?? 50}%</b> (100 = solid for a TV · lower = video shows through in OBS)</span>
        <span className="r"><input type="range" min={0} max={100} step={5} value={o.bgOpacity ?? 50} onChange={e => set('bgOpacity', Number(e.target.value))} aria-label="background opacity" /></span>
      </div>
      <h4>Theme preset</h4>
      {/* each preset shows a small sample in its own colors and font */}
      <div className="chips">{THEMES.map(([id, l]) => (
        <button key={id} className={`btn themechip ${theme === id ? 'on' : ''}`} onClick={() => setTheme(id)} aria-label={`theme ${l}`}>
          <span className="tsample" data-theme={id}><b>3</b><b className="acc">12:34</b><b>1</b></span>{l}
        </button>
      ))}</div>
      <h4>Element colors (override theme)</h4>
      {COLOR_FIELDS.map(([k, label]) => (
        <div className="colorrow" key={k}>
          <span>{label}</span>
          <span className="r">
            <input type="color" value={o.colors[k] || '#ffffff'} onChange={e => set(`colors.${k}`, e.target.value)} />
            {o.colors[k] ? <button className="btn sm" onClick={() => set(`colors.${k}`, null)}>Theme</button> : <span className="hint">theme</span>}
          </span>
        </div>
      ))}
      <button className="btn ghost" onClick={() => set('colors', {})}>Reset all colors</button>
    </>
  )
}

function SoundsTab({ o, set }) {
  const EVENTS = [['horn', 'Horn button'], ['buzzer', 'Buzzer button'], ['endPeriod', 'End of period'], ['timeoutStart', 'Start of timeout'], ['timeoutWarn', 'Timeout warning'], ['timeoutEnd', 'End of timeout']]
  return (
    <>
      <div className="hint">Arena audio is always enabled on the control and display pages. A browser may require one tap on each page to allow playback.</div>
      {EVENTS.map(([k, label]) => (
        <div className="colorrow" key={k}>
          <span>{label}</span>
          <span className="r">
            <select value={o.sounds[k]} onChange={e => set(`sounds.${k}`, e.target.value)} style={{ width: 170 }}>{SOUND_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button className="btn sm" onClick={() => { unlockAudio(); ready(o.sounds[k]).then(() => playSound(o.sounds[k])) }}>▶</button>
          </span>
        </div>
      ))}
    </>
  )
}

function TextTab({ o, set, preview }) {
  const FIELDS = [['period', 'Period'], ['shots', 'Shots on goal'], ['player', 'Penalty player'], ['penalty', 'Penalty'], ['goal', 'Goal indicator'], ['timeout', 'Timeout'], ['pp', 'Power play'], ['offside', 'Offside']]
  const t = translator(o.uiLang)
  return (
    <>
      {preview(true)}
      <h4>{t('language')}</h4>
      <Row label={t('language')}>
        <select value={o.uiLang || 'en'} onChange={e => set('uiLang', e.target.value)} style={{ width: 160 }}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Row>
      <h4>Text</h4>
      <div className="hint">Rename any label — e.g. Thai: ช่วงที่ / ยิง / โทษ / ประตู!</div>
      {FIELDS.map(([k, l]) => <Row key={k} label={l}><input type="text" value={o.labels[k]} onChange={e => set(`labels.${k}`, e.target.value)} style={{ width: 160 }} /></Row>)}
      <button className="btn ghost" onClick={() => set('labels', defaultOptions().labels)}>Reset all text</button>
      <h4>Fonts</h4>
      {/* every font written in itself: pick by how it looks */}
      <div className="fontchips">{FONT_CHOICES.map(([v, l]) => (
        <button key={v} className={`btn fontchip ${o.font === v ? 'on' : ''}`} onClick={() => set('font', v)} aria-label={`font ${l}`}>
          <span className="fsample" style={{ fontFamily: `'${v}', 'Barlow Condensed', sans-serif` }}>12:34<em>HOME</em></span><small>{l}</small>
        </button>
      ))}</div>
      {o.digits === 'segments' && <div className="hint">“7-segment style” below replaces the font for the numbers.</div>}
      <Row label="Digit type"><select value={o.digits} onChange={e => set('digits', e.target.value)} style={{ width: 160 }}><option value="normal">Normal</option><option value="segments">7-segment style</option></select></Row>
    </>
  )
}

function BannerTab({ o, set, get }) {
  const SHOW = [['logo', 'Scoreboard logo'], ['title', 'Scoreboard title'], ['teamLogo', 'Team logos'], ['teamName', 'Team names'], ['score', 'Scores'], ['period', 'Period'], ['clock', 'Main clock'], ['shots', 'Shots on goal'], ['penalties', 'Penalties']]
  return (
    <>
      <div className="hint">The score banner is a compact strip at <b>/banner?g=…</b> for OBS Browser Source (1920×1080). The background is transparent: OBS shows the banner over the video as it is. Only if your software can’t do that, turn on the green screen and use a Chroma Key filter.</div>
      <h4>Show fields</h4>
      {SHOW.map(([k, l]) => <Check key={k} label={l} path={`banner.show.${k}`} get={get} set={set} />)}
      <Check label="Mirror team order" path="banner.mirror" get={get} set={set} />
      <h4>Colors</h4>
      <Check label="Green screen background (chroma key) instead of transparent" path="banner.useChroma" get={get} set={set} />
      {[['chroma', 'Chroma key color'], ['bg', 'Banner background'], ['fg', 'Banner text'], ['clockBg', 'Clock background'], ['clockFg', 'Clock text']].map(([k, l]) => (
        <div className="colorrow" key={k}><span>{l}</span><input type="color" value={o.banner[k]} onChange={e => set(`banner.${k}`, e.target.value)} /></div>
      ))}
    </>
  )
}

function OtherTab({ o, set, get, update, close, resetAll }) {
  return (
    <>
      <h4>Top of scoreboard</h4>
      <Row label="Scoreboard title"><input type="text" value={o.title} onChange={e => set('title', e.target.value)} style={{ width: 200 }} placeholder="e.g. 3on3 Paradise 2026" /></Row>
      <ImagePick label="Scoreboard banner image (replaces title)" path="bannerImg" get={get} set={set} />
      <ImagePick label="Top left picture" path="topLeftImg" get={get} set={set} />
      <ImagePick label="Top right picture" path="topRightImg" get={get} set={set} />
      <h4>Ask me to confirm</h4>
      <Check label="New game" path="confirm.newGame" get={get} set={set} />
      <Check label="Change period (resets clock)" path="confirm.period" get={get} set={set} />
      <Check label="Remove penalty" path="confirm.removePenalty" get={get} set={set} />
      <Check label="New shift (restart the shift clock)" path="confirm.newShift" get={get} set={set} />
      <Check label="Power-play goal: ask before ending the penalty (IIHF Rule 16)" path="confirm.releaseOnGoal" get={get} set={set} />
      <h4>Danger zone</h4>
      <button className="btn danger" onClick={() => { if (confirm('Reset scores, clock and penalties for a new game?')) { update(G.resetGame); close() } }}>New game (reset scores & clock)</button>
      <button className="btn ghost" onClick={() => { if (confirm('Reset ALL options to defaults?')) resetAll() }}>Reset all options</button>
    </>
  )
}

// The real scoreboard (/b/CODE?preview=1, Board.jsx PreviewBoard) in a frame, showing the unsaved options as they
// change: layout, theme, colors, font, labels. It plays no sound and changes nothing.
function LivePreview({ state, gameId, sticky }) {
  const ref = useRef(null)
  const send = () => { try { ref.current?.contentWindow?.postMessage({ type: 'lbs-preview', state }, '*') } catch {} }
  useEffect(send, [state])
  useEffect(() => {
    const on = e => { if (e.source === ref.current?.contentWindow && e.data?.type === 'lbs-preview-ready') send() }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  })
  return <iframe ref={ref} className="optpreview" style={sticky ? undefined : { position: 'static' }} title="scoreboard preview" src={`/b/${encodeURIComponent(gameId)}?preview=1`} />
}
