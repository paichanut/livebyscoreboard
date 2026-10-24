// Picking this device's offset to the time server from round trips, NTP style. Pure: no network, no React.
// A round trip that took rtt ms puts the true offset within ±rtt/2 of its estimate, so the fastest round trip
// of the last few minutes is the most exact one. Two estimates whose ranges don't overlap cannot both be
// right: the clock really moved (a computer waking from sleep, a system clock step), and once two fresh round
// trips agree with each other on the new value, the older ones are dropped.
const MARGIN_MS = 20 // server time resolution + clock drift between the samples

const fastest = list => list.reduce((a, b) => (!a || b.rtt < a.rtt ? b : a), null)
const agree = (a, b) => Math.abs(a.offset - b.offset) <= (a.rtt + b.rtt) / 2 + MARGIN_MS

export function createTimeFilter({ windowMs = 5 * 60_000 } = {}) {
  let samples = []
  let suspect = null
  return {
    // sample = { at, rtt, offset } (offset = server − this clock); returns the best estimate so far
    add(sample) {
      const best = fastest(samples)
      if (best && !agree(sample, best)) {
        if (suspect && agree(sample, suspect)) { samples = [suspect]; suspect = null }
        else { suspect = sample; return best }
      } else suspect = null
      samples.push(sample)
      samples = samples.filter(x => x.at > sample.at - windowMs)
      return fastest(samples)
    },
    best: () => fastest(samples),
    reset() { samples = []; suspect = null },
  }
}

// Steering the clock to a new offset (Pai 2026-10-24): while the game clock is stopped, or the change is over
// 0.1 s, it jumps at once; a smaller change while the clock runs is spread over one second (the clock runs
// at 0.9–1.1× meanwhile, so tenths never repeat or skip).
export const JUMP_MS = 100
export const SLEW_MS = 1000

// shift = { from, to, start }: the correction slides from `from` to `to` over SLEW_MS of local time from `start`
export function shiftAt(shift, t) {
  const k = Math.min(1, Math.max(0, (t - shift.start) / SLEW_MS))
  return shift.from + (shift.to - shift.from) * k
}

export function steerShift(shift, to, t, { jump = false } = {}) {
  const cur = shiftAt(shift, t)
  if (jump || Math.abs(to - cur) > JUMP_MS) return { from: to, to, start: t }
  return { from: cur, to, start: t }
}
