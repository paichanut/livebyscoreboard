// Arena sounds via Web Audio. Call unlockAudio() once from a user gesture.
let ctx = null

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function audioReady() {
  return Boolean(ctx && ctx.state === 'running')
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

export function playSound(kind) {
  if (kind === 'horn') return playHorn()
  if (kind === 'buzzer') return playBuzzer()
  if (kind === 'beep') return playBeep()
  return false
}
