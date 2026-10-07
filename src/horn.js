// Arena sounds via Web Audio. Call unlockAudio() once from a user gesture.
// Real samples live in public/sounds/*.mp3 (from PC Scoreboards); the synth versions are the
// fallback when a sample has not loaded (offline, decode error) and the source of the "beep".
let ctx = null
const buffers = new Map() // name → AudioBuffer | null (null = failed)
const loading = new Map()

export const SAMPLES = {
  horn: '/sounds/horn.mp3',            // 2.7 s arena horn
  'horn-short': '/sounds/horn-short.mp3', // 1.1 s blast
  'horn-loop': '/sounds/horn-loop.mp3',  // 0.6 s loop segment, repeated for a long horn
  buzzer: '/sounds/buzzer.mp3',        // 1.3 s end-of-period buzzer
}
export const LONG_HORN_SEC = 3

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  preload()
  return ctx
}

export function audioReady() {
  return Boolean(ctx && ctx.state === 'running')
}

// Fetch + decode every sample once, so the first horn is not late.
export function preload() {
  if (!ctx) return
  for (const name of Object.keys(SAMPLES)) load(name)
}

function load(name) {
  if (buffers.has(name) || loading.has(name)) return loading.get(name)
  const p = fetch(SAMPLES[name])
    .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer() })
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => { buffers.set(name, buf); return buf })
    .catch(e => { console.warn('sound sample failed, using synth', name, e); buffers.set(name, null); return null })
    .finally(() => loading.delete(name))
  loading.set(name, p)
  return p
}

export function sampleLoaded(name) {
  return Boolean(buffers.get(name))
}

const SAMPLE_FOR = { horn: 'horn', 'horn-loop': 'horn-loop', 'horn-short': 'horn-short', buzzer: 'buzzer' }

// Resolves once the sample behind `kind` is decoded (or failed), so a preview can play the real thing.
export function ready(kind) {
  const name = SAMPLE_FOR[kind]
  if (!name || !ctx) return Promise.resolve()
  return buffers.has(name) ? Promise.resolve() : load(name)
}

// Play a decoded sample. loopSec > 0 repeats it for that long (long horn).
function playSample(name, { loopSec = 0, gain = 1 } = {}) {
  const buf = buffers.get(name)
  if (!buf) return false
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(ctx.destination)
  if (loopSec > 0) {
    src.loop = true
    // short fade so the loop does not click when it is cut
    g.gain.setValueAtTime(gain, t + loopSec - 0.08)
    g.gain.linearRampToValueAtTime(0.0001, t + loopSec)
    src.start(t)
    src.stop(t + loopSec)
  } else {
    src.start(t)
  }
  return true
}

function env(dur, peak = 0.9) {
  const t = ctx.currentTime
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.03)
  g.gain.setValueAtTime(peak, t + dur - 0.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(ctx.destination)
  return g
}

export function playHorn(dur = 2.2) {
  if (!ctx) return false
  const t = ctx.currentTime
  const master = env(dur)
  for (const [type, freq, gain] of [['sawtooth', 220, 0.5], ['sawtooth', 221.5, 0.5], ['square', 110, 0.35]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = gain
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800
    o.connect(g).connect(lp).connect(master); o.start(t); o.stop(t + dur)
  }
  return true
}

export function playBuzzer(dur = 1.2) {
  if (!ctx) return false
  const t = ctx.currentTime
  const master = env(dur, 0.7)
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 180
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 183
  const g = ctx.createGain(); g.gain.value = 0.5
  o.connect(g); o2.connect(g); g.connect(master)
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur)
  return true
}

export function playBeep(n = 3) {
  if (!ctx) return false
  const t0 = ctx.currentTime
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.25
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1200
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.01)
    g.gain.setValueAtTime(0.6, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2)
  }
  return true
}

// kind: one of SOUND_CHOICES in options.js. Samples first, synth fallback.
export function playSound(kind) {
  if (!ctx || kind === 'none' || !kind) return false
  if (kind === 'beep') return playBeep()
  if (kind === 'horn-loop') return playSample('horn-loop', { loopSec: LONG_HORN_SEC }) || playHorn(LONG_HORN_SEC)
  if (kind === 'horn-short') return playSample('horn-short') || playHorn(1)
  if (kind === 'horn') return playSample('horn') || playHorn()
  if (kind === 'buzzer') return playSample('buzzer') || playBuzzer()
  if (kind === 'synth-horn') return playHorn()
  if (kind === 'synth-buzzer') return playBuzzer()
  return false
}
