import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openOptions, home, addPenalty } from './helpers.js'

test('Classic layout: LCD board with score, clock, period, penalty lights and penalty rows', async ({ page, context }) => {
  const code = uniqueCode('classic')
  await openControl(page, code)
  await openOptions(page, 'Game')
  await page.getByRole('button', { name: /^Classic/ }).click()
  await page.locator('.opts .btn.primary').first().click()
  await home(page).getByRole('button', { name: '+ GOAL', exact: true }).click()
  await addPenalty(page, 'home', 12, 2)
  const board = await context.newPage()
  await board.goto(`/b/${code}`)
  await expect(board.locator('.board.classicb .kclock')).toHaveText('15:00')
  await expect(board.locator('.kteam.khome .kscore')).toHaveText('1')
  await expect(board.locator('.kperiod')).toHaveText('1')
  await expect(board.locator('.kteam.khome .klights i.on')).toHaveCount(1)
  await expect(board.locator('.kteam.khome .kpen').first().locator('.kpp')).toHaveText('12')
  await expect(board.locator('.kteam.khome .kpen').first().locator('.kpt')).toHaveText('2:00')
  // the two columns' rows line up (same grid on both sides)
  const y = async team => (await board.locator(`.kteam.k${team} .kpen`).nth(1).boundingBox()).y
  expect(Math.abs(await y('home') - await y('away'))).toBeLessThan(2)
})
