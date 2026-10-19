import { useEffect, useRef, useState } from 'react'
import { unlockAudio, playSound, audioReady } from './horn.js'
import { timeoutRemaining, clockRemaining, shiftInfo } from './game.js'

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
    }
    for (const [k, v] of Object.entries(vars)) v ? root.style.setProperty(k, v) : root.style.removeProperty(k)
    const font = o?.digits === 'segments' ? 'Share Tech Mono' : o?.font
    font ? root.style.setProperty('--font-display', `'${font}', 'Barlow Condensed', sans-serif`) : root.style.removeProperty('--font-display')
    if (o?.font && o.font !== 'Barlow Condensed' && o.font !== 'Share Tech Mono' && o.font !== 'Arial') {
      const id = 'gf-' + o.font.replace(/\s/g, '')
      if (!document.getElementById(id)) {
        const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'
        l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(o.font)}:wght@400;700&display=swap`
        document.head.appendChild(l)
      }
    }
  }, [s?.theme, s?.opts])
}

// Play configured sounds on game events (display side)
export function useGameSounds(s, enabled) {
  const prev = useRef(null)
  const warned = useRef(false)
  useEffect(() => {
    if (!s) return
    const p = prev.current
    prev.current = s
    if (!p || !enabled) return
    const snd = s.opts.sounds
    if (s.horn !== p.horn) playSound(snd.horn)
    if (s.buzzer !== p.buzzer) playSound(snd.buzzer)
    if (s.timeout && (!p.timeout || s.timeout.since !== p.timeout.since)) { playSound(snd.timeoutStart); warned.current = false }
    if (p.timeout && !s.timeout && timeoutRemaining(p) <= 1200) playSound(snd.timeoutEnd)
  }, [s, enabled])

  // tick-driven checks: clock hits zero, shift clock hits zero, timeout warning
  const zeroFired = useRef(false)
  // shift: every screen works it out from the game clock and buzzes by itself the moment it shows 0
  // (no waiting for a message over the network); once per shift, never when the page opens on a 0
  const shiftFired = useRef(undefined)
  const shiftTimer = useRef(null)
  const first = useRef(true)
  useEffect(() => {
    if (!s || !enabled) return
    const id = setInterval(() => {
      const rem = clockRemaining(s)
      if (s.clock.running && rem <= 0 && !zeroFired.current) { zeroFired.current = true; playSound(s.opts.sounds.endPeriod) }
      if (rem > 0) zeroFired.current = false
      const sh = shiftInfo(s)
      if (shiftFired.current === undefined) shiftFired.current = null // a page opened on a 0 doesn't buzz
      if (sh && s.clock.running) {
        // this shift's 0 shows when less than a second is left; the key stays the same until the shift starts over
        const key = `${s.period}:${s.shift?.period === s.period ? s.shift.atMs : 0}:${sh.count}`
        const toZero = sh.remainingMs - 1000
        const fire = () => { if (shiftFired.current !== key) { shiftFired.current = key; playSound(s.opts.sounds.buzzer) } }
        if (toZero < 0) { if (first.current) shiftFired.current = key; else fire() }
        else if (toZero <= SOUND_TICK_MS && shiftTimer.current?.key !== key) {
          // due before the next check: schedule it for the exact moment the 0 appears
          clearTimeout(shiftTimer.current?.id)
          shiftTimer.current = { key, id: setTimeout(fire, toZero) }
        }
      }
      first.current = false
      if (s.timeout) {
        const tr = timeoutRemaining(s)
        const warnMs = (s.opts.timeoutWarnSec || 0) * 1000
        if (warnMs > 0 && tr > 0 && tr <= warnMs && !warned.current) { warned.current = true; playSound(s.opts.sounds.timeoutWarn) }
      }
    }, SOUND_TICK_MS)
    return () => { clearInterval(id); clearTimeout(shiftTimer.current?.id); shiftTimer.current = null }
  }, [s, enabled])
}
const SOUND_TICK_MS = 50

// Sound setting for one page. On by default where `defaultOn` (the display): the page unlocks audio
// by itself where the browser allows it (OBS browser sources do), otherwise on the first tap or key
// anywhere on the page. The choice to mute is remembered on this device.
export function useSound(storageKey, defaultOn) {
  const [on, setOnState] = useState(() => {
    try { const v = localStorage.getItem(storageKey); return v == null ? defaultOn : v === '1' } catch { return defaultOn }
  })
  const [ready, setReady] = useState(false)
  const setOn = v => { setOnState(v); try { localStorage.setItem(storageKey, v ? '1' : '0') } catch {} }
  useEffect(() => {
    if (!on) return
    unlockAudio()
    const unlock = () => unlockAudio()
    const evs = ['pointerdown', 'keydown', 'touchstart']
    evs.forEach(e => document.addEventListener(e, unlock, { passive: true }))
    const id = setInterval(() => setReady(audioReady()), 300)
    setReady(audioReady())
    return () => { evs.forEach(e => document.removeEventListener(e, unlock)); clearInterval(id) }
  }, [on])
  return { on, ready, playing: on && ready, setOn }
}

export function SoundToggle({ sound, className }) {
  const { on, ready, setOn } = sound
  const label = !on ? '🔇 sound off' : ready ? '🔊 sound on' : '🔈 tap anywhere to enable sound'
  return (
    <button className={`${className} ${on && ready ? 'on' : ''}`} onClick={() => {
      if (!on) { setOn(true); unlockAudio() } else if (!ready) { unlockAudio() } else { setOn(false) }
    }}>{label}</button>
  )
}
