import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard } from './helpers.js'

// Headless Chromium has no speakers, so we record what Web Audio is asked to play.
const RECORD = () => {
  window.__played = []
  const B = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a) { window.__played.push({ kind: 'sample', dur: this.buffer?.duration, loop: this.loop }); return B.apply(this, a) }
  const O = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) { window.__played.push({ kind: 'synth' }); return O.apply(this, a) }
}

test('horn button on control plays the horn sample on the display after sound is enabled', async ({ page, context }) => {
  await context.addInitScript(RECORD)
  const code = uniqueCode('horn')
  await openControl(page, code)
  const board = await openBoard(context, code)

  // before enabling sound nothing plays
  await page.getByRole('button', { name: '📯 Horn' }).click()
  await board.waitForTimeout(300)
  expect(await board.evaluate(() => window.__played.length)).toBe(0)

  await board.getByRole('button', { name: /enable sound/ }).click()
  await expect(board.locator('.board .sound')).toHaveClass(/on/)
  // samples are decoded after the tap
  await board.waitForFunction(() => window.__played !== undefined)
  await board.waitForTimeout(800)

  await page.getByRole('button', { name: '📯 Horn' }).click()
  await board.waitForFunction(() => window.__played.length > 0)
  const played = await board.evaluate(() => window.__played)
  expect(played[0].kind).toBe('sample')
  expect(played[0].loop).toBe(true) // default horn button = long looping horn
  expect(played[0].dur).toBeGreaterThan(0.5)

  await page.getByRole('button', { name: '🔔 Buzzer' }).click()
  await board.waitForFunction(() => window.__played.length > 1)
  const buzzer = (await board.evaluate(() => window.__played))[1]
  expect(buzzer.kind).toBe('sample')
  expect(buzzer.dur).toBeGreaterThan(1.2)
})

test('control page can play sounds itself when its sound toggle is on', async ({ page, context }) => {
  await context.addInitScript(RECORD)
  await openControl(page, uniqueCode('hornc'))
  await page.getByRole('button', { name: /enable sound/ }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '📯 Horn' }).click()
  await page.waitForFunction(() => window.__played.length > 0)
  expect((await page.evaluate(() => window.__played))[0].kind).toBe('sample')
})
