import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, setClock } from './helpers.js'

test('clock stops automatically at 0 and the display shows final', async ({ page, context }) => {
  const code = uniqueCode('clock')
  await openControl(page, code)
  const board = await openBoard(context, code)

  await setClock(page, 0, 2)
  await expect(page.locator('.clockcard .c')).toHaveText('2.0')
  await page.getByRole('button', { name: 'START' }).click()
  await expect(page.getByRole('button', { name: 'STOP' })).toBeVisible()

  await expect(page.locator('.clockcard .c')).toHaveText('0.0', { timeout: 6000 })
  // button flips back to START and is disabled at 0
  const start = page.getByRole('button', { name: 'START' })
  await expect(start).toBeVisible()
  await expect(start).toBeDisabled()
  await expect(page.locator('.clockcard .c')).toHaveClass(/final/)
  // it stays at 0 (no negative time)
  await page.waitForTimeout(500)
  await expect(page.locator('.clockcard .c')).toHaveText('0.0')

  await expect(board.locator('.board .clock')).toHaveText('0.0')
  await expect(board.locator('.board .clock')).toHaveClass(/final/)

  // +0:01 makes it startable again
  await page.getByRole('button', { name: '+0:01' }).click()
  await expect(page.locator('.clockcard .c')).toHaveText('1.0')
  await expect(start).toBeEnabled()
})

test('period change resets the clock, OT is 5:00', async ({ page }) => {
  const code = uniqueCode('period')
  await openControl(page, code)
  await setClock(page, 3, 30)
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await expect(page.locator('.clockcard .p b')).toHaveText('2')
  await expect(page.locator('.clockcard .c')).toHaveText('15:00')
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await expect(page.locator('.clockcard .p b')).toHaveText('OT')
  await expect(page.locator('.clockcard .c')).toHaveText('5:00')
  await page.getByRole('button', { name: '−1:00' }).click()
  await expect(page.locator('.clockcard .c')).toHaveText('4:00')
})
