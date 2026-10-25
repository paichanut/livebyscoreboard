import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard } from './helpers.js'

test('type the time straight into the control clock', async ({ page, context }) => {
  const code = uniqueCode('typeclock')
  await openControl(page, code)
  const board = await openBoard(context, code)
  const clock = page.locator('.clockcard .c')
  await clock.click()
  const input = page.getByLabel('type the clock time')
  await expect(input).toBeFocused()
  await input.fill('1234')
  await input.press('Enter')
  await expect(clock).toHaveText('12:34')
  await expect(board.locator('.board .clock')).toHaveText('12:34')
  // a wrong entry stays red; Esc keeps the clock as it was
  await clock.click()
  await page.getByLabel('type the clock time').fill('12:75')
  await page.getByLabel('type the clock time').press('Enter')
  await expect(page.getByLabel('type the clock time')).toHaveClass(/bad/)
  await page.getByLabel('type the clock time').press('Escape')
  await expect(clock).toHaveText('12:34')
  // tenths
  await clock.click()
  await page.getByLabel('type the clock time').fill('0:45.5')
  await page.getByLabel('type the clock time').press('Enter')
  await expect(clock).toHaveText('45.5')
})

test('timeout and warm-up count down in the big clock; then the game time comes back', async ({ page, context }) => {
  const code = uniqueCode('warmup')
  await openControl(page, code)
  const board = await openBoard(context, code)
  const bclock = board.locator('.board .clock')
  await page.locator('.clockcard .c').click()
  await page.getByLabel('type the clock time').fill('12:00')
  await page.getByLabel('type the clock time').press('Enter')
  await expect(bclock).toHaveText('12:00')

  await page.getByRole('button', { name: /^Warm-up \(1:00\)$/ }).click()
  await expect(board.locator('.board .warmup')).toHaveText('WARM-UP')
  await expect(bclock).toHaveText(/^(1:00|0:5\d)$/)
  await page.getByRole('button', { name: /WARM-UP .* — end/ }).click()
  await expect(board.locator('.board .warmup')).toHaveCount(0)
  await expect(bclock).toHaveText('12:00')

  await page.getByRole('button', { name: /^Timeout \(0:30\)$/ }).click()
  await page.locator('.sheet .btn').first().click()
  await expect(board.locator('.board .timeout')).toContainText('TIMEOUT')
  await expect(bclock).toHaveText(/^(0:30|0:2\d)$/)
  await page.getByRole('button', { name: /TIMEOUT .* — end/ }).click()
  await expect(bclock).toHaveText('12:00')
})
