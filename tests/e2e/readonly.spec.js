import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, home, boardHome, boardAway } from './helpers.js'

test('public /b/ display is read-only: no controls, keys do nothing, key not in link', async ({ page, context }) => {
  const code = uniqueCode('ro')
  await openControl(page, code)
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await home(page).getByRole('button', { name: '+ GOAL' }).click()

  const board = await openBoard(context, code)
  await expect(boardHome(board).locator('.score')).toHaveText('2')

  // the only buttons on the display are the sound toggle and full screen
  const buttons = board.locator('.board button')
  await expect(buttons).toHaveCount(2)
  await expect(buttons.first()).toContainText('sound')
  await expect(board.getByRole('button', { name: 'full screen' })).toBeVisible()
  await expect(board.locator('.board .sound')).not.toContainText('sound off')

  // operator shortcuts have no effect on the display page
  await board.locator('body').click()
  for (const key of ['KeyQ', 'KeyA', 'Space', 'BracketRight', 'ArrowUp']) await board.keyboard.press(key)
  await board.waitForTimeout(300)
  await expect(boardHome(board).locator('.score')).toHaveText('2')
  await expect(boardAway(board).locator('.score')).toHaveText('0')
  await expect(board.locator('.board .clock')).toHaveText('15:00')
  await expect(board.locator('.board .period b')).toHaveText('1')
  // the control page saw nothing either
  await expect(home(page).locator('.s')).toHaveText('2')
  await expect(page.getByRole('button', { name: 'START', exact: true })).toBeVisible()

  // public links never carry the operator key
  expect(board.url()).not.toContain('k=')
  await page.getByRole('button', { name: 'QR' }).click()
  // the "watch" links (scoreboard, shift clock, OBS banner) come before the controller link
  const links = await page.locator('.qr .lk code').allTextContents()
  expect(links[0]).toContain(`/b/${code}`)
  for (const url of links.slice(0, -1)) expect(url).not.toContain('k=')
  expect(links.at(-1)).toContain(`/c/${code}?k=`)
})

test('a display opened before the operator has no controls either', async ({ page }) => {
  await page.goto('/b/fresh-' + Date.now())
  await expect(page.locator('.board')).toBeVisible()
  // local mode renders a blank game; still only sound + full screen
  await expect(page.locator('.board button')).toHaveCount(2)
  await expect(page.locator('.board .clock')).toHaveText('15:00')
})

test('double-clicking the board selects nothing', async ({ page, context }) => {
  const code = uniqueCode('dbl')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await boardHome(board).locator('.name').dblclick()
  await board.locator('.board .clock').dblclick()
  expect(await board.evaluate(() => String(window.getSelection()))).toBe('')
  expect(await boardHome(board).locator('.name').evaluate(el => getComputedStyle(el).userSelect)).toBe('none')
})

test('the board says "Double-click for full screen" for 4 s, then the hint goes away', async ({ page, context }) => {
  const code = uniqueCode('hint')
  await openControl(page, code)
  // headless Chromium's screen is the viewport, which the board treats as "already full screen"
  await context.addInitScript(() => Object.defineProperty(screen, 'height', { get: () => 4000 }))
  const board = await openBoard(context, code)
  await expect(board.getByText('Double-click for full screen')).toBeVisible()
  await expect(board.getByText('Double-click for full screen')).toBeHidden({ timeout: 6000 })
})
