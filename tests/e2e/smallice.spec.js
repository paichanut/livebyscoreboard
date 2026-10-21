import { test, expect } from '@playwright/test'
import { uniqueCode } from './helpers.js'

test('small ice: two games share the clock; center / A / B controllers and boards', async ({ page, context }) => {
  const code = uniqueCode('small')
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey&mode=small`)
  const tabs = page.locator('.rinktabs')
  await expect(tabs).toBeVisible()
  await expect(page.getByLabel('shift', { exact: true })).toHaveText('90')

  await expect(page.getByRole('link', { name: 'Display A', exact: true })).toHaveAttribute('href', `${new URL(page.url()).origin}/b/${code}?rink=a`)
  await expect(page.getByRole('link', { name: 'Display B', exact: true })).toHaveAttribute('href', `${new URL(page.url()).origin}/b/${code}?rink=b`)
  await expect(page.getByRole('link', { name: 'Display C', exact: true })).toHaveAttribute('href', `${new URL(page.url()).origin}/b/${code}`)
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

test('New shift asks first', async ({ page }) => {
  const code = uniqueCode('newshift')
  await page.goto(`/c/${code}?k=testkey&mode=small`)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(page.getByLabel('shift', { exact: true })).not.toHaveText('90', { timeout: 4000 })
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: 'reset shift' }).click()
  await expect(page.getByLabel('shift', { exact: true })).not.toHaveText('90')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'reset shift' }).click()
  await expect(page.getByLabel('shift', { exact: true })).toHaveText(/^(90|89)$/)
})

test('four scores align with unequal team names and missing logos; penalty covers only its own score', async ({ page, context }) => {
  const code = uniqueCode('aligned')
  await page.goto(`/c/${code}?k=testkey&mode=small`)
  await expect(page.locator('.rinktabs')).toBeVisible()
  await page.evaluate(code => {
    const key = 'rinkboard:' + code
    const s = JSON.parse(localStorage.getItem(key))
    const logo = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="30" fill="gold"/><text x="120" y="150" font-size="90" text-anchor="middle">3x3</text></svg>')
    s.home.name = 'PHOENIX'; s.away.name = 'NAKARAJ JR.'
    s.rinkB.home.name = 'BANGKOK BEARS'; s.rinkB.away.name = 'JETS'
    s.opts.homeLogo = logo; s.opts.logoImg = logo; s.opts.shiftMs = 0
    s.skaters = 3
    localStorage.setItem(key,JSON.stringify(s))
  },code)
  await page.reload()
  const board = await context.newPage()
  await board.goto(`/b/${code}`)
  const scores = board.locator('.board.dual .dscore')
  await expect(scores).toHaveCount(4)
  for (const size of [{width:1920,height:1080},{width:1280,height:720},{width:844,height:390}]) {
    await board.setViewportSize(size)
    const positions = await scores.evaluateAll(els => els.map(el => el.getBoundingClientRect().y))
    expect(Math.max(...positions)-Math.min(...positions)).toBeLessThan(1)
  }
  await board.setViewportSize({width:1920,height:1080})
  const logo = await board.locator('.dmid .dlogo').boundingBox()
  expect(logo.height).toBeGreaterThan(200)
  await page.locator('.rinktabs').getByRole('button',{name:'rink b'}).click()
  await page.locator('.tc').last().getByRole('button',{name:'add penalty'}).click()
  await page.locator('.sheet').getByPlaceholder('#').fill('98')
  await page.locator('.sheet .templates').getByRole('button',{name:/^Charging/}).click()
  await page.locator('.sheet').getByRole('button',{name:/^Add penalty/}).click()
  const announcement = board.locator('.penalty-signal')
  await expect(announcement).toHaveCount(1)
  await expect(board.locator('.dgame').first().locator('.penalty-signal')).toHaveCount(0)
  await expect(announcement).toHaveAttribute('data-team','away')
  const region = await announcement.boundingBox(), score = await scores.last().boundingBox()
  expect(region.y).toBeLessThan(score.y + score.height)
  expect(region.y + region.height).toBeGreaterThan(score.y)
  if (process.env.LBS_PREVIEW_DIR) await board.screenshot({path:`${process.env.LBS_PREVIEW_DIR}/center-four-team-penalty.png`})
})
