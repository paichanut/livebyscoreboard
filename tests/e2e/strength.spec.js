import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, addPenalty, openOptions, saveOptions, away, home } from './helpers.js'

test('3v3 mode: one penalty gives 4v3, a penalty each cancels out', async ({ page, context }) => {
  const code = uniqueCode('3v3')
  await openControl(page, code)
  const board = await openBoard(context, code)

  await openOptions(page, 'Game')
  await page.locator('.opts').getByRole('button', { name: '3v3', exact: true }).click()
  await saveOptions(page)

  await expect(page.locator('.clockcard .st')).toHaveCount(0)
  await addPenalty(page, 'away', 9, 2)
  await expect(page.locator('.clockcard .st')).toHaveText('4v3')
  await expect(board.locator('.board .strength')).toHaveText('4v3 · PP')

  // coincidental minors: back to 3v3, no badge
  await addPenalty(page, 'home', 4, 2)
  await expect(page.locator('.clockcard .st')).toHaveCount(0)
  await expect(board.locator('.board .strength')).toHaveClass(/empty/)
  await expect(home(page).locator('.pen')).toHaveCount(1)
  await expect(away(page).locator('.pen')).toHaveCount(1)
})

test('5v5 mode: two penalties on one team is 5v3', async ({ page }) => {
  const code = uniqueCode('5v3')
  await openControl(page, code)
  await addPenalty(page, 'away', 9, 2)
  await addPenalty(page, 'away', 10, 2)
  await expect(page.locator('.clockcard .st')).toHaveText('5v3')
})
