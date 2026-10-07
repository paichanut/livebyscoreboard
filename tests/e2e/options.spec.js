import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, openOptions, saveOptions, home, away, boardHome, boardAway } from './helpers.js'

test('options save: team names, period length, Thai labels reach control and display and persist', async ({ page, context }) => {
  const code = uniqueCode('opts')
  await openControl(page, code)
  const board = await openBoard(context, code)

  await openOptions(page, 'Teams')
  const names = page.locator('.opts').getByLabel('Team name')
  await names.nth(0).fill('ช้างศึก')
  await names.nth(1).fill('Sharks')

  await page.locator('.opts .tabs').getByRole('button', { name: 'Game', exact: true }).click()
  await page.locator('.opts').getByLabel('Period length (min)').fill('12')

  await page.locator('.opts .tabs').getByRole('button', { name: 'Text', exact: true }).click()
  await page.locator('.opts').getByLabel('Period', { exact: true }).fill('ช่วงที่')
  await page.locator('.opts').getByLabel('Shots on goal').fill('ยิง')
  await saveOptions(page)

  await expect(home(page).locator('.n')).toHaveText('ช้างศึก')
  await expect(away(page).locator('.n')).toHaveText('Sharks')
  await expect(page.locator('.clockcard .c')).toHaveText('12:00')
  await expect(page.locator('.clockcard .p')).toContainText('ช่วงที่')

  await expect(boardHome(board).locator('.name')).toHaveText('ช้างศึก')
  await expect(boardAway(board).locator('.name')).toHaveText('Sharks')
  await expect(board.locator('.board .clock')).toHaveText('12:00')
  await expect(board.locator('.board .period')).toContainText('ช่วงที่')
  await expect(boardHome(board).locator('.shots')).toContainText('ยิง')

  // persists across reload
  await page.reload()
  await expect(home(page).locator('.n')).toHaveText('ช้างศึก')
  await expect(page.locator('.clockcard .c')).toHaveText('12:00')
})

test('options cancel discards the draft', async ({ page }) => {
  const code = uniqueCode('cancel')
  await openControl(page, code)
  await openOptions(page, 'Teams')
  await page.locator('.opts').getByLabel('Team name').nth(0).fill('NOPE')
  await page.locator('.opts .foot').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.opts')).toBeHidden()
  await expect(home(page).locator('.n')).toHaveText('HOME')
})
