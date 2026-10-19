import { test } from 'node:test'
import assert from 'node:assert/strict'

// A fake Web Audio context that records the gain automation, so the fade can be checked without speakers.
function fakeAudio() {
  const calls = []
  const param = () => ({ value: 1, setValueAtTime: (v, t) => calls.push(['set', v, t]), exponentialRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]), linearRampToValueAtTime: (v, t) => calls.push(['lin', v, t]) })
  const node = () => ({ connect: n => n, gain: param(), frequency: { value: 0 } })
  class Ctx {
    constructor() { this.currentTime = 10; this.state = 'running'; this.destination = node() }
    createGain() { return node() }
    createBufferSource() { return { ...node(), start: t => calls.push(['start', t]), stop: t => calls.push(['stop', t]) } }
    createOscillator() { return { ...node(), start() {}, stop() {} } }
    createBiquadFilter() { return { ...node(), frequency: { value: 0 } } }
    decodeAudioData() { return Promise.resolve({ duration: 4.2 }) }
    resume() {}
  }
  globalThis.window = { AudioContext: Ctx }
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
  return calls
}

test('the goal horn fades out over its last second', async () => {
  const calls = fakeAudio()
  const H = await import('../../src/horn.js')
  H.unlockAudio()
  await new Promise(r => setTimeout(r, 20)) // samples "decoded"
  assert.equal(H.HORN_FADE_SEC, 1)
  calls.length = 0
  assert.equal(H.playSound('horn-nhl'), true)
  // 4.2 s sample started at t=10: full volume until 13.2, then down to silence at 14.2
  const round = c => c.map(x => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x))
  assert.deepEqual(calls.filter(c => c[0] !== 'start').map(round), [['set', 1, 13.2], ['ramp', 0.0001, 14.2], ['stop', 14.2]])
})
