import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, home, boardHome, boardAway } from './helpers.js'

test('public /b/ display is read-only: no controls, keys do nothing, key not in link', async ({ page, context }) => {
  const code = uniqueCode('ro')
  await openControl(page, code)
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await home(page).getByRole('button', { name: '+ GOAL' }).click()

  const board = await openBoard(context, code)
  await expect(boardHome(board).locator('.score')).toHaveText('2')

  // the only button on the display is the sound toggle
  const buttons = board.locator('.board button')
  await expect(buttons).toHaveCount(1)
  await expect(buttons.first()).toContainText('sound')

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
  await expect(page.getByRole('button', { name: 'START' })).toBeVisible()

  // public links never carry the operator key
  expect(board.url()).not.toContain('k=')
  await page.getByRole('button', { name: 'QR' }).click()
  const url = await page.locator('.sheet .url').first().textContent()
  expect(url).toContain(`/b/${code}`)
  expect(url).not.toContain('k=')
})

test('a display opened before the operator has no controls either', async ({ page }) => {
  await page.goto('/b/fresh-' + Date.now())
  await expect(page.locator('.board')).toBeVisible()
  // local mode renders a blank game; the only button is still the sound toggle
  await expect(page.locator('.board button')).toHaveCount(1)
  await expect(page.locator('.board .clock')).toHaveText('15:00')
})
