import { useEffect, useRef } from 'react'
import { unlockAudio, playSound, audioReady } from './horn.js'
import { timeoutRemaining, clockRemaining } from './game.js'

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

  // tick-driven checks: clock hits zero, timeout warning
  const zeroFired = useRef(false)
  useEffect(() => {
    if (!s || !enabled) return
    const id = setInterval(() => {
      const rem = clockRemaining(s)
      if (s.clock.running && rem <= 0 && !zeroFired.current) { zeroFired.current = true; playSound(s.opts.sounds.endPeriod) }
      if (rem > 0) zeroFired.current = false
      if (s.timeout) {
        const tr = timeoutRemaining(s)
        const warnMs = (s.opts.timeoutWarnSec || 0) * 1000
        if (warnMs > 0 && tr > 0 && tr <= warnMs && !warned.current) { warned.current = true; playSound(s.opts.sounds.timeoutWarn) }
      }
    }, 100)
    return () => clearInterval(id)
  }, [s, enabled])
}

export function SoundToggle({ sound, setSound, className }) {
  return (
    <button className={`${className} ${sound ? 'on' : ''}`} onClick={() => { unlockAudio(); setSound(true); if (!audioReady()) setTimeout(() => setSound(audioReady()), 200) }}>
      {sound ? '🔊 sound on' : '🔈 tap to enable sound'}
    </button>
  )
}
