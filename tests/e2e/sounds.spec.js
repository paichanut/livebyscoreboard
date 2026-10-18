import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openOptions } from './helpers.js'

const SAMPLES = ['horn-nhl', 'horn-nhl-short', 'horn', 'horn-short', 'horn-loop', 'buzzer']

test('sound samples are served and decode in the browser', async ({ page, request }) => {
  for (const n of SAMPLES) {
    const r = await request.get(`/sounds/${n}.mp3`)
    expect(r.status(), n).toBe(200)
    expect(r.headers()['content-type'], n).toContain('audio/mpeg')
  }
  await page.goto('/b/' + uniqueCode('snd'))
  const durations = await page.evaluate(async names => {
    const ctx = new AudioContext()
    const out = {}
    for (const n of names) {
      const ab = await (await fetch(`/sounds/${n}.mp3`)).arrayBuffer()
      out[n] = (await ctx.decodeAudioData(ab)).duration
    }
    return out
  }, SAMPLES)
  expect(durations['horn-nhl']).toBeGreaterThan(4)
  expect(durations['horn-nhl-short']).toBeGreaterThan(1.2)
  expect(durations.horn).toBeGreaterThan(2.5)
  expect(durations['horn-short']).toBeGreaterThan(1)
  expect(durations['horn-loop']).toBeGreaterThan(0.5)
  expect(durations.buzzer).toBeGreaterThan(1.2)
})

test('Sounds tab offers the samples; the horn defaults to the NHL horn', async ({ page }) => {
  await openControl(page, uniqueCode('sndopt'))
  await openOptions(page, 'Sounds')
  const selects = page.locator('.opts select')
  await expect(selects).toHaveCount(6)
  await expect(selects.nth(0)).toHaveValue('horn-nhl') // horn button
  await expect(selects.nth(2)).toHaveValue('buzzer') // end of period
  await expect(selects.nth(4)).toHaveValue('horn-short') // timeout warning
  await expect(selects.nth(0).locator('option')).toHaveText(['NHL goal horn (4 s)', 'NHL horn, short', 'Horn', 'Horn, long (3 s loop)', 'Horn, short', 'Buzzer', 'Beep ×3', 'Synth horn', 'Synth buzzer', 'None'])
  // preview button runs without errors
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.locator('.opts .colorrow').nth(0).getByRole('button', { name: '▶' }).click()
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
