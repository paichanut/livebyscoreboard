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

test('horn button on control plays the horn sample on the display (sound on by default)', async ({ page, context }) => {
  await context.addInitScript(RECORD)
  const code = uniqueCode('horn')
  await openControl(page, code)
  const board = await openBoard(context, code)

  // sound is on by default; if the browser holds audio back, a tap anywhere unlocks it
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await expect(board.locator('.board .sound')).toHaveClass(/on/)
  await expect(board.locator('.board .sound')).toHaveText(/sound on/)
  // samples are decoded after the tap
  await board.waitForFunction(() => window.__played !== undefined)
  await board.waitForTimeout(800)

  await page.getByRole('button', { name: '📯 Horn' }).click()
  await board.waitForFunction(() => window.__played.length > 0)
  const played = await board.evaluate(() => window.__played)
  expect(played[0].kind).toBe('sample')
  expect(played[0].dur).toBeGreaterThan(4) // default horn button = NHL goal horn

  await page.getByRole('button', { name: '🔔 Buzzer' }).click()
  await board.waitForFunction(() => window.__played.length > 1)
  const buzzer = (await board.evaluate(() => window.__played))[1]
  expect(buzzer.kind).toBe('sample')
  expect(buzzer.dur).toBeGreaterThan(1.2)
})

test('horn plays on the control page and the display at the same time (sound on by default on both)', async ({ page, context }) => {
  await context.addInitScript(RECORD)
  const code = uniqueCode('hornc')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await page.locator('.clockcard .c').click()
  await expect(page.locator('.csound')).toHaveText(/sound on/)
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '📯 Horn' }).click()
  await page.waitForFunction(() => window.__played.length > 0)
  await board.waitForFunction(() => window.__played.length > 0)
  expect((await page.evaluate(() => window.__played))[0].kind).toBe('sample')
  expect((await board.evaluate(() => window.__played))[0].kind).toBe('sample')
  // the operator can still mute their own page
  await page.locator('.csound').click()
  await expect(page.locator('.csound')).toHaveText(/sound off/)
})

test('+ GOAL 📯 adds the goal and sounds the horn on the display', async ({ page, context }) => {
  await context.addInitScript(RECORD)
  const code = uniqueCode('goalhorn')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await board.waitForTimeout(800)
  await page.getByRole('button', { name: 'goal and horn home' }).click()
  await expect(board.locator('.board .team').first().locator('.score')).toHaveText('1')
  await board.waitForFunction(() => window.__played.length > 0)
  expect((await board.evaluate(() => window.__played))[0].dur).toBeGreaterThan(4)
})

test('shift buzzer sounds on the display the instant its shift clock shows 0', async ({ page, context }) => {
  // record when a sound starts and when the shift digit turns 0, on the board's own clock
  await context.addInitScript(() => {
    window.__buzz = []
    const B = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...a) { window.__buzz.push(performance.now()); return B.apply(this, a) }
    const O = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (...a) { window.__buzz.push(performance.now()); return O.apply(this, a) }
    window.__zero = null
    new MutationObserver(() => {
      const el = document.querySelector('[aria-label="shift"]')
      if (el && el.textContent === '0' && window.__zero == null) window.__zero = performance.now()
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  const code = uniqueCode('shiftbuzz')
  await openControl(page, code)
  await page.getByRole('button', { name: /Options/ }).click()
  await page.locator('.opts').getByLabel('shift minutes').fill('0')
  await page.locator('.opts').getByLabel('shift seconds').fill('3')
  await page.locator('.opts').getByRole('button', { name: /^Save/ }).click()
  const board = await openBoard(context, code)
  await board.locator('.board').click({ position: { x: 5, y: 5 } }) // unlock audio
  await board.waitForTimeout(800)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await board.waitForFunction(() => window.__zero != null && window.__buzz.length > 0, null, { timeout: 6000 })
  const [zero, buzz] = await board.evaluate(() => [window.__zero, window.__buzz[0]])
  console.log('shift 0 shown vs buzzer (ms):', Math.round(buzz - zero))
  expect(Math.abs(buzz - zero)).toBeLessThan(60)
})
