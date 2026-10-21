import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { unlockAudio, playSound, audioReady } from './horn.js'
import { timeoutRemaining, clockRemaining, shiftInfo } from './game.js'
import { now as wallNow } from './clock.js'

// fonts that come with the app (index.html / fonts-offline.js / styles.css); any other name is fetched from Google Fonts
const BUILT_IN_FONTS = ['Barlow Condensed', 'Share Tech Mono', 'Arial', 'Oswald', 'Anton', 'LCD Digital', 'LCD Digital Italic']

// Apply theme + custom colors + font to <html>
export function useAppearance(s) {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', s?.theme || 'dark')
    const o = s?.opts
    const vars = {
      '--bg': o?.colors?.bg, '--card': o?.colors?.card, '--text': o?.colors?.text,
      '--c-teamname': o?.colors?.teamName, '--c-clock': o?.colors?.clock, '--c-score': o?.colors?.score,
      '--c-period': o?.colors?.period, '--c-shots': o?.colors?.shots, '--c-penplayer': o?.colors?.penPlayer,
      '--c-pentime': o?.colors?.penTime, '--c-goal': o?.colors?.goal,
      // only the colors picked by hand (the compact panel keeps its own design unless one of these is set)
      '--u-bg': o?.colors?.bg, '--u-card': o?.colors?.card, '--u-text': o?.colors?.text,
    }
    for (const [k, v] of Object.entries(vars)) v ? root.style.setProperty(k, v) : root.style.removeProperty(k)
    const font = o?.digits === 'segments' ? 'Share Tech Mono' : o?.font
    font ? root.style.setProperty('--font-display', `'${font}', 'Barlow Condensed', sans-serif`) : root.style.removeProperty('--font-display')
    // the LCD font has capitals only: names and labels are shown in capitals with it
    root.dataset.font = /^LCD Digital/.test(font || '') ? 'lcd' : ''
    if (o?.font && !BUILT_IN_FONTS.includes(o.font)) {
      const id = 'gf-' + o.font.replace(/\s/g, '')
      if (!document.getElementById(id)) {
        const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'
        l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(o.font)}:wght@400;700&display=swap`
        document.head.appendChild(l)
      }
    }
  }, [s?.theme, s?.opts])
}

// Check sounds in the same commit that draws the clock. A separate polling timer can lose
// the expiry when the operator stops the clock, or sound after the display has shown zero.
export function useGameSounds(s, enabled, now = wallNow()) {
  const prev = useRef(null)
  const warned = useRef(false)
  const zeroFired = useRef(false)
  const shiftFired = useRef(null)
  useLayoutEffect(() => {
    const p = prev.current
    prev.current = s
    if (!s) return
    const rem = clockRemaining(s, now)
    const sh = shiftInfo(s, now)
    const shiftKey = sh ? `${s.period}:${s.shift?.period === s.period ? s.shift.atMs : 0}:${sh.count}` : null
    if (rem > 0) zeroFired.current = false
    if (!enabled) {
      shiftFired.current = sh?.seconds === 0 ? shiftKey : null
      return
    }
    const snd = s.opts.sounds
    if (p) {
      if (s.horn !== p.horn) playSound(snd.horn)
      if (s.buzzer !== p.buzzer) playSound(snd.buzzer)
      if (s.timeout && (!p.timeout || s.timeout.since !== p.timeout.since)) {
        playSound(snd.timeoutStart)
        warned.current = false
      }
      if (p.timeout && !s.timeout && timeoutRemaining(p, now) <= 1200) playSound(snd.timeoutEnd)
    }
    // The final state may already be stopped when it reaches this screen. Check the
    // authority's expiry marker or the previous deadline; manual corrections stay silent.
    const expired = s.clock.running || (p?.clock.running && p.period === s.period && (s.clock.expiredAt != null || clockRemaining(p, now) <= 0))
    if (rem <= 0 && expired && !zeroFired.current) {
      zeroFired.current = true
      playSound(snd.endPeriod)
    }
    // A shift shows 0 for its last second. Buzz once on that same render, without
    // sounding when a page is first opened on an existing 0.
    if (sh && s.clock.running && sh.seconds === 0 && shiftFired.current !== shiftKey) {
      if (p) playSound(snd.buzzer)
      shiftFired.current = shiftKey
    } else if (!p || !sh) shiftFired.current = sh?.seconds === 0 ? shiftKey : null
    if (s.timeout) {
      const tr = timeoutRemaining(s, now)
      const warnMs = (s.opts.timeoutWarnSec || 0) * 1000
      if (warnMs > 0 && tr > 0 && tr <= warnMs && !warned.current) {
        warned.current = true
        playSound(snd.timeoutWarn)
      }
    }
  })
}

// Always enabled. Browser autoplay restrictions are lifted by the first tap/key;
// old saved mute preferences are deliberately ignored. Desktop/OBS can start immediately.
export function useSound(active = true) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!active) return
    const audio = unlockAudio()
    const syncReady = () => setReady(audioReady())
    const unlock = () => { unlockAudio(); syncReady() }
    const visible = () => { if (document.visibilityState === 'visible') unlock() }
    const evs = ['pointerdown', 'keydown', 'touchstart', 'click']
    evs.forEach(e => document.addEventListener(e, unlock, { passive: true, capture: true }))
    audio?.addEventListener('statechange', syncReady)
    document.addEventListener('visibilitychange', visible)
    syncReady()
    return () => {
      evs.forEach(e => document.removeEventListener(e, unlock, true))
      audio?.removeEventListener('statechange', syncReady)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [active])
  return { playing: active && ready, blocked: active && !ready }
}

// Only shown while the browser requires a gesture; this cannot mute audio.
export function AudioNotice({ sound, className }) {
  if (!sound.blocked) return null
  return <button className={className} onClick={unlockAudio}>Tap to allow arena audio</button>
}
