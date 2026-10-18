import React, { useEffect, useState } from 'react'
import { DEFAULT_KEYS, KEY_LABELS, KEY_GROUPS, SOUND_CHOICES, FONT_CHOICES, COLOR_FIELDS, defaultOptions, keyName } from './options.js'
import { unlockAudio, playSound, ready } from './horn.js'
import * as G from './game.js'
import { LANGS, translator } from './i18n.js'
import { listTeams, saveTeam, removeTeam } from './teamLibrary.js'

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
    saveTeam({ ...home, logo: o.homeLogo })
    saveTeam({ ...away, logo: o.awayLogo })
    close()
  }

  const P = { o, set, get }
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

function GameTab({ get, set, o, periodMin, setPeriodMin, skaters, setSkaters }) {
  const [newLen, setNewLen] = useState('')
  return (
    <>
      <h4>Scoreboard layout</h4>
      <div className="chips">
        <button className={`btn ${o.layout === 'arena' ? 'on' : ''}`} onClick={() => set('layout', 'arena')}>Arena — logos on top, penalty boxes, photo</button>
        <button className={`btn ${o.layout === 'compact' ? 'on' : ''}`} onClick={() => set('layout', 'compact')}>Compact — one panel (stream overlay)</button>
        <button className={`btn ${o.layout === 'full' ? 'on' : ''}`} onClick={() => set('layout', 'full')}>Full — shots, logos, title</button>
        <button className={`btn ${o.layout === 'minimal' ? 'on' : ''}`} onClick={() => set('layout', 'minimal')}>Minimal — bigger numbers</button>
      </div>
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
      <h4>Timeouts</h4>
      <Num label="Timeout 1 duration (sec)" path="timeout1Sec" get={get} set={set} min={5} max={600} />
      <Num label="Timeout 2 duration (sec)" path="timeout2Sec" get={get} set={set} min={5} max={600} />
      <Num label="Warning sound at (sec remaining, 0 = off)" path="timeoutWarnSec" get={get} set={set} min={0} max={120} />
      <h4>Goal indicator</h4>
      <Check label="When a score increases, show goal indicator" path="goalIndicator" get={get} set={set} />
      <Num label="Turn off after (sec)" path="goalOffSec" get={get} set={set} min={1} max={120} />
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

export function resizeImage(file, max) {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      res(max > 512 ? c.toDataURL('image/jpeg', 0.7) : c.toDataURL('image/png'))
    }
    img.src = URL.createObjectURL(file)
  })
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

// One-tap list of teams saved in this browser (see teamLibrary.js)
export function SavedTeams({ onPick, label = 'Saved teams' }) {
  const [list, setList] = useState(listTeams)
  if (!list.length) return <div className="savedteams"><span className="hint"><a href="/teams" target="_blank" rel="noreferrer">+ Add team logos (one-tap teams) ▸</a></span></div>
  return (
    <div className="savedteams">
      <span className="hint">{label} · <a href="/teams" target="_blank" rel="noreferrer">manage logos ▸</a></span>
      <div className="chips">
        {list.map(tm => (
          <span className="savedteam" key={tm.id} style={{ '--c': tm.color }}>
            <button className="btn sm" aria-label={`use team ${tm.name}`} onClick={() => onPick(tm)}>
              {tm.logo ? <img src={tm.logo} alt="" /> : <i />}{tm.name}
            </button>
            <button className="x" aria-label={`forget team ${tm.name}`} onClick={() => { removeTeam(tm.id); setList(listTeams()) }}>✕</button>
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

function ColorsTab({ o, set, theme, setTheme }) {
  const THEMES = [['dark', 'Dark arena'], ['light', 'Light'], ['led', 'LED classic'], ['ice', 'Ice']]
  return (
    <>
      <h4>Display background</h4>
      <div className="colorrow">
        <span>Background opacity: <b>{o.bgOpacity ?? 50}%</b> (100 = solid for a TV · lower = video shows through in OBS)</span>
        <span className="r"><input type="range" min={0} max={100} step={5} value={o.bgOpacity ?? 50} onChange={e => set('bgOpacity', Number(e.target.value))} aria-label="background opacity" /></span>
      </div>
      <h4>Theme preset</h4>
      <div className="chips">{THEMES.map(([id, l]) => <button key={id} className={`btn ${theme === id ? 'on' : ''}`} onClick={() => setTheme(id)}>{l}</button>)}</div>
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
      <div className="hint">Sounds play on the display (TV) page. Tap "enable sound" there once.</div>
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

function TextTab({ o, set }) {
  const FIELDS = [['period', 'Period'], ['shots', 'Shots on goal'], ['player', 'Penalty player'], ['penalty', 'Penalty'], ['goal', 'Goal indicator'], ['timeout', 'Timeout'], ['pp', 'Power play']]
  const t = translator(o.uiLang)
  return (
    <>
      <h4>{t('language')}</h4>
      <Row label={t('language')}>
        <select value={o.uiLang || 'en'} onChange={e => set('uiLang', e.target.value)} style={{ width: 160 }}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Row>
      <h4>Text</h4>
      <div className="hint">Rename any label — e.g. Thai: ช่วงที่ / ยิง / โทษ / ประตู!</div>
      {FIELDS.map(([k, l]) => <Row key={k} label={l}><input type="text" value={o.labels[k]} onChange={e => set(`labels.${k}`, e.target.value)} style={{ width: 160 }} /></Row>)}
      <button className="btn ghost" onClick={() => set('labels', defaultOptions().labels)}>Reset all text</button>
      <h4>Fonts</h4>
      <Row label="Scoreboard font"><select value={o.font} onChange={e => set('font', e.target.value)} style={{ width: 220 }}>{FONT_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
      <Row label="Digit type"><select value={o.digits} onChange={e => set('digits', e.target.value)} style={{ width: 160 }}><option value="normal">Normal</option><option value="segments">7-segment style</option></select></Row>
    </>
  )
}

function BannerTab({ o, set, get }) {
  const SHOW = [['logo', 'Scoreboard logo'], ['title', 'Scoreboard title'], ['teamLogo', 'Team logos'], ['teamName', 'Team names'], ['score', 'Scores'], ['period', 'Period'], ['clock', 'Main clock'], ['shots', 'Shots on goal'], ['penalties', 'Penalties']]
  return (
    <>
      <div className="hint">The score banner is a compact strip at <b>/banner?g=…</b> for OBS Browser Source (1920×1080). Use the chroma key color with a Chroma Key filter, or turn it off for a transparent background.</div>
      <h4>Show fields</h4>
      {SHOW.map(([k, l]) => <Check key={k} label={l} path={`banner.show.${k}`} get={get} set={set} />)}
      <Check label="Mirror team order" path="banner.mirror" get={get} set={set} />
      <h4>Colors</h4>
      <Check label="Chroma key background" path="banner.useChroma" get={get} set={set} />
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
      <h4>Danger zone</h4>
      <button className="btn danger" onClick={() => { if (confirm('Reset scores, clock and penalties for a new game?')) { update(G.resetGame); close() } }}>New game (reset scores & clock)</button>
      <button className="btn ghost" onClick={() => { if (confirm('Reset ALL options to defaults?')) resetAll() }}>Reset all options</button>
    </>
  )
}
