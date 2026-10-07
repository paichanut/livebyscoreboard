// Arena-style horn using Web Audio. Call unlock() once from a user gesture.
let ctx = null

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function audioReady() {
  return Boolean(ctx && ctx.state === 'running')
}

export function playHorn(durationSec = 2.2) {
  if (!ctx) return false
  const t = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.exponentialRampToValueAtTime(0.9, t + 0.05)
  master.gain.setValueAtTime(0.9, t + durationSec - 0.15)
  master.gain.exponentialRampToValueAtTime(0.0001, t + durationSec)
  master.connect(ctx.destination)

  // Two detuned saws + a sub give it that real arena growl
  const parts = [
    ['sawtooth', 220, 0.5],
    ['sawtooth', 221.5, 0.5],
    ['square', 110, 0.35],
  ]
  for (const [type, freq, gain] of parts) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    o.connect(g).connect(lp).connect(master)
    o.start(t)
    o.stop(t + durationSec)
  }
  return true
}
