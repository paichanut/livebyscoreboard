import { test, expect } from '@playwright/test'
import { uniqueCode } from './helpers.js'

test('small ice: two games share the clock; center / A / B controllers and boards', async ({ page, context }) => {
  const code = uniqueCode('small')
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey&mode=small`)
  const tabs = page.locator('.rinktabs')
  await expect(tabs).toBeVisible()
  await expect(page.getByLabel('shift', { exact: true })).toHaveText('90')

  // Rink A: one goal; Rink B: two goals and a penalty
  await page.locator('.tc').first().getByRole('button', { name: '+ GOAL', exact: true }).click()
  await tabs.getByRole('button', { name: 'rink b' }).click()
  await expect(page.locator('.tc .rinkbadge').first()).toHaveText('RINK B')
  await page.locator('.tc').first().getByRole('button', { name: '+ GOAL', exact: true }).click()
  await page.locator('.tc').first().getByRole('button', { name: '+ GOAL', exact: true }).click()
  await page.locator('.tc').nth(1).getByRole('button', { name: 'add penalty' }).click()
  await page.locator('.sheet').getByPlaceholder('#').fill('76')
  await page.locator('.sheet').getByRole('button', { name: '2 min', exact: true }).click()
  await page.locator('.sheet').getByRole('button', { name: /^Add penalty/ }).click()
  await expect(tabs).toContainText('1–0')
  await expect(tabs).toContainText('2–0')

  // center board: both games, one clock, the shift countdown
  const center = await context.newPage()
  await center.goto(`/b/${code}`)
  const games = center.locator('.board.dual .dgame')
  await expect(games).toHaveCount(2)
  await expect(games.nth(0).locator('.dscore').first()).toHaveText('1')
  await expect(games.nth(1).locator('.dscore').first()).toHaveText('2')
  await expect(games.nth(1).locator('.dpen')).toContainText('#76')
  await expect(center.getByLabel('shift', { exact: true })).toHaveText('90')

  // side board B: only Rink B's game
  const sideB = await context.newPage()
  await sideB.goto(`/b/${code}?rink=b`)
  await expect(sideB.locator('.board .team .score').first()).toHaveText('2')
  await expect(sideB.locator('.board.dual')).toHaveCount(0)
  // every screen says which half it is
  await expect(sideB.locator('.rinkpill')).toHaveText('RINK B')
  await expect(center.locator('.dgame .rinkpill')).toHaveText(['RINK A', 'RINK B'])
  await sideB.screenshot({ path: test.info().outputPath('sideB.png') })

  // the clock runs from the center controller only; every board follows
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await page.waitForTimeout(1500)
  await expect(center.getByLabel('shift', { exact: true })).not.toHaveText('90')
  await expect(sideB.locator('.board .clock')).not.toHaveText('15:00')

  // controller A: Rink A only, no clock buttons
  const ctlA = await context.newPage()
  await ctlA.goto(`/c/${code}?k=testkey&rink=a`)
  await expect(ctlA.locator('.rinkctl')).toContainText('RINK A')
  await expect(ctlA.locator('.rinktabs')).toHaveCount(0)
  await expect(ctlA.getByRole('button', { name: /^(START|STOP)$/ })).toHaveCount(0)
  await ctlA.locator('.tc').first().getByRole('button', { name: '+ GOAL', exact: true }).click()
  await expect(games.nth(0).locator('.dscore').first()).toHaveText('2')
  await expect(games.nth(1).locator('.dscore').first()).toHaveText('2')
  await center.screenshot({ path: test.info().outputPath('center.png') })
})

test('shift buzzer length is set as mm:ss in Options; 0:00 turns it off', async ({ page }) => {
  const code = uniqueCode('shift')
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey`)
  await page.getByRole('button', { name: /Options/ }).click()
  await page.locator('.opts').getByLabel('shift minutes').fill('1')
  await page.locator('.opts').getByLabel('shift seconds').fill('15')
  await page.locator('.opts').getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByLabel('shift', { exact: true })).toHaveText('75')
  await page.getByRole('button', { name: /Options/ }).click()
  await page.locator('.opts').getByLabel('shift minutes').fill('0')
  await page.locator('.opts').getByLabel('shift seconds').fill('0')
  await page.locator('.opts').getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByLabel('shift', { exact: true })).toHaveCount(0)
})

test('shift clock page and the full list of links', async ({ page, context }) => {
  const code = uniqueCode('links')
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey&mode=small`)
  await expect(page.getByLabel('shift', { exact: true })).toHaveText('90')
  const shiftPage = await context.newPage()
  await shiftPage.goto(`/b/${code}?view=shift`)
  await expect(shiftPage.locator('.board.shiftb .sbig')).toHaveText('90')
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(shiftPage.locator('.board.shiftb .sbig')).not.toHaveText('90', { timeout: 4000 })
  await page.getByRole('button', { name: 'QR', exact: true }).click()
  const links = await page.locator('.qr .lk code').allTextContents()
  const base = new URL(page.url()).origin
  for (const want of [`/b/${code}`, `/b/${code}?rink=a`, `/b/${code}?rink=b`, `/b/${code}?view=shift`, `/o/${code}?rink=a`, `/o/${code}?rink=b`, `/c/${code}?k=testkey`, `/c/${code}?k=testkey&rink=a`, `/c/${code}?k=testkey&rink=b`]) {
    expect(links).toContain(base + want)
  }
})

test('compact layout shows the shift countdown too', async ({ page, context }) => {
  const code = uniqueCode('cshift')
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey`)
  await page.getByRole('button', { name: /Options/ }).click()
  await page.locator('.opts').getByRole('button', { name: /^Compact —/ }).click()
  await page.locator('.opts').getByLabel('shift minutes').fill('1')
  await page.locator('.opts').getByLabel('shift seconds').fill('30')
  await page.locator('.opts').getByRole('button', { name: /^Save/ }).click()
  const board = await context.newPage()
  await board.goto(`/b/${code}`)
  await expect(board.locator('.compactb .cshift b')).toHaveText('90')
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(board.locator('.compactb .cshift b')).not.toHaveText('90', { timeout: 4000 })
  await board.screenshot({ path: test.info().outputPath('compact-shift.png') })
})
