import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, setClock, openOptions, saveOptions } from './helpers.js'

const recordAudio = () => {
  window.__audio = { contexts: [], decoded: 0, played: [], zero: null, watching: false }
  window.AudioContext = new Proxy(window.AudioContext, {
    construct(Target, args) {
      const ctx = new Target(...args)
      window.__audio.contexts.push(ctx)
      return ctx
    },
  })
  const decode = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = function (...args) {
    return decode.apply(this, args).then(buffer => { window.__audio.decoded++; return buffer })
  }
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...args) {
    const el = document.querySelector('.clockcard .c, .board .clock, .board .cclock, .board .dclock')
    window.__audio.played.push({ at: performance.now(), state: this.context.state, clock: el?.textContent })
    return start.apply(this, args)
  }
  new MutationObserver(() => {
    const a = window.__audio
    const el = document.querySelector('.clockcard .c, .board .clock, .board .cclock, .board .dclock')
    if (a.watching && /^0(?:\.0|:00)$/.test(el?.textContent) && a.zero == null) a.zero = performance.now()
  }).observe(document, { subtree: true, childList: true, characterData: true })
}

const waitForAudio = page => page.waitForFunction(() => window.__audio.decoded >= 6 && window.__audio.contexts.some(c => c.state === 'running'))
const watch = page => page.evaluate(() => { window.__audio.played = []; window.__audio.zero = null; window.__audio.watching = true })

for (const policy of ['document-user-activation-required', 'no-user-gesture-required']) {
  test.describe(policy === 'document-user-activation-required' ? 'browser audio' : 'desktop autoplay policy', () => {

    test('period buzzer plays once on both pages when their clocks first display zero', async ({ playwright, baseURL }) => {
      const browser = await playwright.chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: [`--autoplay-policy=${policy}`, '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'] })
      try {
        const context = await browser.newContext({ baseURL })
        const page = await context.newPage()
        await context.addInitScript(recordAudio)
        const code = uniqueCode('periodbuzz')
        await openControl(page, code)
        const board = await openBoard(context, code)
        if (policy === 'document-user-activation-required') {
          await expect(board.getByRole('button', { name: 'Tap to allow arena audio' })).toBeVisible()
          await page.locator('.clockcard .c').click()
          await board.locator('.board').click({ position: { x: 5, y: 5 } })
        }
        await Promise.all([waitForAudio(page), waitForAudio(board)])
        await expect(page.locator('.csound')).toHaveCount(0)
        await expect(board.locator('.sound')).toHaveCount(0)
        await setClock(page, 0, 2)
        await expect(board.locator('.board .clock')).toHaveText('2.0')
        await Promise.all([watch(page), watch(board)])
        await page.getByRole('button', { name: 'START', exact: true }).click()
        for (const target of [page, board]) {
          await target.waitForFunction(() => window.__audio.zero != null, null, { timeout: 6000 })
          await expect.poll(() => target.evaluate(() => window.__audio.played.length)).toBe(1)
          const result = await target.evaluate(() => ({ ...window.__audio, contexts: undefined }))
          expect(result.played[0].state).toBe('running')
          expect(result.played[0].clock).toBe('0.0')
          console.log(policy, target === page ? 'control' : 'display', 'buzzer vs zero (ms):', result.played[0].at - result.zero)
          expect(Math.abs(result.played[0].at - result.zero)).toBeLessThan(40)
        }
        await page.waitForTimeout(400)
        for (const target of [page, board]) expect(await target.evaluate(() => window.__audio.played.length)).toBe(1)
        await setClock(page, 0, 1)
        await page.getByRole('button', { name: 'START', exact: true }).click()
        for (const target of [page, board]) await expect.poll(() => target.evaluate(() => window.__audio.played.length)).toBe(2)
      } finally { await browser.close() }
    })
  })
}

test('saved mute settings cannot silence the control or scoreboard', async ({ page, context }) => {
  await context.addInitScript(recordAudio)
  await context.addInitScript(() => {
    localStorage.setItem('rinkboard:sound:ctl', '0')
    localStorage.setItem('rinkboard:sound:board', '0')
  })
  const code = uniqueCode('alwayssound')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.locator('.clockcard .c').click()
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await Promise.all([waitForAudio(page), waitForAudio(board)])
  await expect(page.getByRole('button', { name: /sound on|sound off/i })).toHaveCount(0)
  await expect(board.getByRole('button', { name: /sound on|sound off/i })).toHaveCount(0)
  await page.getByRole('button', { name: '🔔 Buzzer' }).click()
  for (const target of [page, board]) await expect.poll(() => target.evaluate(() => window.__audio.played.length)).toBe(1)
})


test('paused or manually zeroed clocks stay silent; a resumed expiry buzzes once and reopening stays silent', async ({ page, context }) => {
  await context.addInitScript(recordAudio)
  const code = uniqueCode('pausebuzz')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.locator('.clockcard .c').click()
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await Promise.all([waitForAudio(page), waitForAudio(board)])
  await setClock(page, 0, 2)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'STOP', exact: true }).click()
  await page.waitForTimeout(2000)
  for (const target of [page, board]) expect(await target.evaluate(() => window.__audio.played.length)).toBe(0)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  for (const target of [page, board]) await expect.poll(() => target.evaluate(() => window.__audio.played.length)).toBe(1)
  await board.reload()
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await waitForAudio(board)
  await setClock(page, 0, 2)
  await setClock(page, 0, 0)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__audio.played.length)).toBe(1)
  expect(await board.evaluate(() => window.__audio.played.length)).toBe(0)
})

for (const layout of ['compact', 'dual']) {
  test(`period buzzer follows the zero display in the ${layout} layout`, async ({ page, context }) => {
    await context.addInitScript(recordAudio)
    const code = uniqueCode('layoutbuzz')
    await openControl(page, code)
    await openOptions(page, 'Game')
    await page.locator('.opts').getByRole('button', { name: layout === 'compact' ? /Compact —/ : /Small ice —/ }).click()
    if (layout === 'dual') {
      await page.locator('.opts').getByLabel('shift minutes').fill('0')
      await page.locator('.opts').getByLabel('shift seconds').fill('0')
    }
    await saveOptions(page)
    const board = await context.newPage()
    await board.goto(`/b/${code}`)
    const clock = board.locator(layout === 'compact' ? '.cclock' : '.dclock')
    await expect(clock).toBeVisible()
    await board.locator('.board').click({ position: { x: 5, y: 5 } })
    await waitForAudio(board)
    await setClock(page, 0, 1)
    await expect(clock).toHaveText('1.0')
    await watch(board)
    await page.getByRole('button', { name: 'START', exact: true }).click()
    await board.waitForFunction(() => window.__audio.zero != null && window.__audio.played.length > 0)
    const result = await board.evaluate(() => ({ zero: window.__audio.zero, played: window.__audio.played }))
    expect(result.played).toHaveLength(1)
    expect(result.played[0].clock).toBe('0.0')
    expect(Math.abs(result.played[0].at - result.zero)).toBeLessThan(40)
  })
}


test('an authority expiry arriving before the local deadline buzzes with the stopped zero display', async ({ page, context }) => {
  await context.addInitScript(recordAudio)
  const code = uniqueCode('remoteexpiry')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await board.locator('.board').click({ position: { x: 5, y: 5 } })
  await waitForAudio(board)
  await setClock(page, 0, 5)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(board.locator('.board .clock')).toHaveText(/^[34]\./)
  await watch(board)
  // Simulate the authority already reaching zero while this screen's wall clock is behind.
  await board.evaluate(code => {
    const key = 'rinkboard:' + code
    const state = JSON.parse(localStorage.getItem(key))
    const expiredAt = state.clock.since + state.clock.remainingMs
    state.clock = { remainingMs: 0, running: false, since: null, expiredAt }
    state.updatedAt = Math.max(Date.now(), state.updatedAt + 1)
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(state) }))
  }, code)
  await expect(board.locator('.board .clock')).toHaveText('0.0')
  await expect.poll(() => board.evaluate(() => window.__audio.played.length)).toBe(1)
  const result = await board.evaluate(() => ({ zero: window.__audio.zero, played: window.__audio.played }))
  expect(result.played[0].clock).toBe('0.0')
  expect(Math.abs(result.played[0].at - result.zero)).toBeLessThan(40)
})
