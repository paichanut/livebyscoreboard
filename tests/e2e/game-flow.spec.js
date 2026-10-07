import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, home, away, boardHome, boardAway, addPenalty } from './helpers.js'

test('goals, shots and penalties flow from control to the display', async ({ page, context }) => {
  const code = uniqueCode('flow')
  await openControl(page, code)
  const board = await openBoard(context, code)

  // goal via button
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await expect(home(page).locator('.s')).toHaveText('1')
  await expect(boardHome(board).locator('.score')).toHaveText('1')
  await expect(boardHome(board).locator('.goalflash')).toHaveText('GOAL!')

  // goal via keyboard shortcut (A = away +1), then −1 via button
  await page.keyboard.press('KeyA')
  await expect(away(page).locator('.s')).toHaveText('1')
  await away(page).getByRole('button', { name: '−1' }).click()
  await expect(away(page).locator('.s')).toHaveText('0')
  await expect(boardAway(board).locator('.score')).toHaveText('0')

  // shots
  await home(page).getByRole('button', { name: 'Shot +' }).click()
  await home(page).getByRole('button', { name: 'Shot +' }).click()
  await expect(home(page).locator('.sh b')).toHaveText('2')
  await expect(boardHome(board).locator('.shots b')).toHaveText('2')

  // penalty: 2 min on #12 (home) → 4v5, counts down with the game clock
  await addPenalty(page, 'home', 12, 2)
  await expect(home(page).locator('.pen')).toContainText('#12')
  await expect(home(page).locator('.pen span')).toHaveText('2:00')
  await expect(page.locator('.clockcard .st')).toHaveText('4v5')
  await expect(board.locator('.board .strength')).toHaveText('4v5 · PP')
  await expect(board.locator('.board .pens .col').nth(0).locator('.pen')).toContainText('#12')

  // penalty time only moves while the clock runs
  await page.waitForTimeout(600)
  await expect(home(page).locator('.pen span')).toHaveText('2:00')
  await page.getByRole('button', { name: 'START' }).click()
  await expect(home(page).locator('.pen span')).not.toHaveText('2:00')
  await page.getByRole('button', { name: 'STOP' }).click()

  // remove penalty → strength badge disappears on both screens
  await home(page).locator('.pen button').click()
  await expect(home(page).locator('.pen')).toHaveCount(0)
  await expect(page.locator('.clockcard .st')).toHaveCount(0)
  await expect(board.locator('.board .strength')).toHaveClass(/empty/)
})

test('expired penalty is pruned by the control page', async ({ page }) => {
  const code = uniqueCode('prune')
  await openControl(page, code)
  // 1 min penalty with 2 s left on the clock: it survives until the clock hits 0, then it is still "remaining" (clock stopped).
  await page.getByRole('button', { name: 'SET', exact: true }).click()
  await page.locator('.sheet').getByLabel('Minutes').fill('0')
  await page.locator('.sheet').getByLabel('Seconds').fill('3')
  await page.locator('.sheet').getByRole('button', { name: 'Set', exact: true }).click()
  await addPenalty(page, 'away', 7, 2)
  await expect(away(page).locator('.pen span')).toHaveText('2:00')
  await page.getByRole('button', { name: 'START' }).click()
  await expect(page.locator('.clockcard .c')).toHaveText('0.0', { timeout: 6000 })
  // only 3 s of the penalty elapsed; it is still active
  await expect(away(page).locator('.pen span')).toHaveText('1:57')
})
