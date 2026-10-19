import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, home, away, boardAway, addPenalty, setClock } from './helpers.js'

test('whistle pauses penalty clocks while the game clock keeps running', async ({ page }) => {
  await openControl(page, uniqueCode('whistle'))
  await addPenalty(page, 'away', 12, 2)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(away(page).locator('.pen .pt')).not.toHaveText('2:00', { timeout: 3000 })
  await page.getByRole('button', { name: 'stop all penalties' }).click()
  await expect(page.getByRole('button', { name: 'stop all penalties' })).toHaveClass(/held/)
  const frozen = await away(page).locator('.pen .pt').textContent()
  const clockBefore = await page.locator('.clockcard .c').textContent()
  await page.waitForTimeout(2200)
  await expect(away(page).locator('.pen .pt')).toHaveText(frozen)
  await expect(page.locator('.clockcard .c')).not.toHaveText(clockBefore)
  await page.getByRole('button', { name: 'start all penalties' }).click()
  await expect(page.getByRole('button', { name: 'start all penalties' })).toHaveClass(/lit/)
  await expect(away(page).locator('.pen .pt')).not.toHaveText(frozen, { timeout: 3000 })
})

test('correcting the game clock does not move penalties', async ({ page }) => {
  await openControl(page, uniqueCode('noshift'))
  await addPenalty(page, 'home', 4, 2)
  await setClock(page, 3, 0)
  await expect(home(page).locator('.pen .pt')).toHaveText('2:00')
  await page.getByRole('button', { name: '−1:00' }).click()
  await expect(home(page).locator('.pen .pt')).toHaveText('2:00')
})

test('third penalty waits; display shows +1; nudges adjust time', async ({ page, context }) => {
  const code = uniqueCode('queue')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await addPenalty(page, 'away', 1, 2)
  await addPenalty(page, 'away', 2, 2)
  await addPenalty(page, 'away', 3, 2)
  await expect(away(page).locator('.pen')).toHaveCount(3)
  await expect(away(page).locator('.pen[data-status="waiting"]')).toHaveCount(1)
  await expect(page.locator('.clockcard .st')).toHaveText('5v3')
  // arena layout: 3 positions per team, the waiting one dimmed
  const col = board.locator('.board .penbox.pb-away')
  await expect(col.locator('.prow')).toHaveCount(3)
  await expect(col.locator('.prow.wait')).toHaveCount(1)
  await expect(col.locator('.ph')).toHaveCount(0)
  // nudge the first penalty: +5 is capped at the full 2:00, −5 takes 5 s off
  const first = away(page).locator('.pen').first()
  await first.getByRole('button', { name: 'more' }).click()
  await first.getByRole('button', { name: '−5' }).click()
  await expect(first.locator('.pt')).toHaveText('1:55')
  await first.getByRole('button', { name: '+1' }).click()
  await expect(first.locator('.pt')).toHaveText('1:56')
  await expect(col.locator('.prow').first().locator('.pt')).toHaveText('1:56')
})

test('power-play goal ends the least-time minor; a major stays', async ({ page, context }) => {
  const code = uniqueCode('release')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await addPenalty(page, 'away', 7, 5)
  await addPenalty(page, 'away', 12, 2)
  await away(page).locator('.pen').nth(1).getByRole('button', { name: 'more' }).click()
  await away(page).locator('.pen').nth(1).getByRole('button', { name: '−5' }).click() // #12 now has less time
  await expect(page.locator('.clockcard .st')).toHaveText('5v3')
  // the operator is asked first (IIHF Rule 16); "keep" scores but leaves #12 in the box
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await expect(page.locator('.sheet')).toContainText('#12')
  await page.locator('.sheet').getByRole('button', { name: 'goal and keep' }).click()
  await expect(home(page).locator('.s')).toHaveText('1')
  await expect(away(page).locator('.pen')).toHaveCount(2)
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'goal and release' }).click()
  await expect(away(page).locator('.pen')).toHaveCount(1)
  await expect(away(page).locator('.pen')).toContainText('#7')
  await expect(page.locator('.clockcard .st')).toHaveText('5v4')
  await expect(boardAway(board).locator('.score')).toHaveText('0')
  await expect(board.locator('.board .strength')).toHaveText('5v4 · PP', { timeout: 8000 })
  // another goal: the major is never released, so nothing to ask
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await expect(page.locator('.sheet')).toHaveCount(0)
  await expect(home(page).locator('.s')).toHaveText('3')
  await expect(away(page).locator('.pen')).toHaveCount(1)
  // the game log says what each power-play goal did
  await page.getByRole('button', { name: /Summary/ }).click()
  await expect(page.locator('.sheet')).toContainText('kept #12')
  await expect(page.locator('.sheet')).toContainText('ended #12')
})

test('PC Scoreboards controls: period time only, goal light, time of day, edit penalty, keyboard', async ({ page, context }) => {
  const code = uniqueCode('pcsb')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await addPenalty(page, 'away', 12, 2)
  // Period time Start runs the clock but leaves penalty clocks stopped when they were stopped
  await page.getByRole('button', { name: 'stop all penalties' }).click()
  await page.getByRole('button', { name: 'start period time' }).click()
  await page.waitForTimeout(1300)
  await expect(away(page).locator('.pen .pt')).toHaveText('2:00')
  await page.getByRole('button', { name: 'stop period time' }).click()
  // Goal light by hand
  await page.getByRole('button', { name: 'goal light away' }).click()
  await expect(board.locator('.board .team').nth(1)).toHaveClass(/flash/)
  await page.getByRole('button', { name: 'goal light off' }).click()
  await expect(board.locator('.board .team').nth(1)).not.toHaveClass(/flash/)
  // Show time of day on the display
  await page.getByRole('button', { name: /time of day/i }).click()
  await expect(board.locator('.board .tod')).toHaveText(/^\d{1,2}:\d{2}$/)
  await expect(board.locator('.board .clock')).toHaveText(/^\d{1,2}:\d{2}$/) // game clock stays
  await page.getByRole('button', { name: 'Hide time of day', exact: true }).click()
  await expect(board.locator('.board .tod')).toHaveCount(0)
  // Edit a penalty: pick a template
  await away(page).getByRole('button', { name: 'edit penalty' }).click()
  await page.locator('.sheet .templates').getByRole('button', { name: /^Boarding/ }).click()
  await page.locator('.sheet').getByRole('button', { name: /Save penalty/ }).click()
  await expect(away(page).locator('.pen .who')).toContainText('Boarding')
  await expect(away(page).locator('.pen .pt')).toHaveText('2:00') // IIHF: boarding is a minor by default
  // Keyboard, PC Scoreboards layout: Y start all, H stop all, Q home goal
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('KeyQ')
  await page.locator('.sheet').getByRole('button', { name: 'goal and keep' }).click()
  await expect(page.locator('.control .tc').nth(0).locator('.s')).toHaveText('1')
  await page.keyboard.press('KeyY')
  await expect(page.getByRole('button', { name: 'STOP', exact: true })).toBeVisible()
  await page.keyboard.press('KeyH')
  await expect(page.getByRole('button', { name: 'START', exact: true })).toBeVisible()
  // F7 removes the last penalty
  await page.keyboard.press('F7')
  await expect(away(page).locator('.pen')).toHaveCount(0)
})

test('misconduct, coincidental and game misconduct stay off the display; penalty-shot goal releases no one', async ({ page, context }) => {
  const code = uniqueCode('kinds')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await addPenalty(page, 'away', 9, 2)
  await addPenalty(page, 'away', 9, 10)
  // coincidental minor for home
  await home(page).getByRole('button', { name: 'add penalty' }).click()
  let sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('5')
  await sheet.getByRole('button', { name: '2 min', exact: true }).click()
  await sheet.getByRole('button', { name: /Coincidental/ }).click()
  await sheet.getByRole('button', { name: 'Add penalty' }).click()
  // game misconduct for home
  await home(page).getByRole('button', { name: 'add penalty' }).click()
  sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('4')
  await sheet.getByRole('button', { name: 'game misconduct', exact: true }).click()
  await sheet.getByRole('button', { name: 'Add penalty' }).click()
  await expect(sheet).toBeHidden()

  await expect(home(page).locator('.pen')).toHaveCount(2)
  await expect(home(page).locator('.pen[data-status="game"] .pt')).toHaveText(/GM/)
  await expect(away(page).locator('.pen')).toHaveCount(2)
  await expect(away(page).locator('.pen[data-status="waiting"]')).toHaveCount(1)
  await expect(page.locator('.clockcard .st')).toHaveText('5v4')
  await expect(board.locator('.board .penbox.pb-away .prow')).toHaveCount(1)
  await expect(board.locator('.board .penbox.pb-home .prow')).toHaveCount(0)

  await page.getByRole('button', { name: 'penalty shot goal home' }).click()
  await expect(home(page).locator('.s')).toHaveText('1')
  await expect(away(page).locator('.pen')).toHaveCount(2)
})

test('IIHF quick picks: Fighting is 5 + GM; a major for checking from behind adds the GM', async ({ page }) => {
  await openControl(page, uniqueCode('iihfpen'))
  await home(page).getByRole('button', { name: 'add penalty' }).click()
  let sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('7')
  await sheet.locator('.templates').getByRole('button', { name: /^Fighting/ }).click()
  await expect(sheet.getByRole('button', { name: '+ game misconduct', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: /Add penalty/ }).click()
  await expect(home(page).locator('.pen')).toHaveCount(2) // 5:00 major + GM
  await expect(home(page).locator('.pen[data-status="game"]')).toHaveCount(1)

  await away(page).getByRole('button', { name: 'add penalty' }).click()
  sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('9')
  await sheet.locator('.templates').getByRole('button', { name: /^Checking from behind/ }).click()
  await expect(sheet.getByRole('button', { name: '+ game misconduct', exact: true })).toHaveAttribute('aria-pressed', 'false') // 2 min
  await sheet.getByRole('button', { name: '5 min', exact: true }).click()
  await expect(sheet.getByRole('button', { name: '+ game misconduct', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('the board announces a new penalty for 15 s: PENALTY · team, #number infraction minutes', async ({ page, context }) => {
  const code = uniqueCode('pcall')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await home(page).getByRole('button', { name: 'add penalty' }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('24')
  await sheet.getByRole('button', { name: /^Checking from behind/ }).click()
  await sheet.getByRole('button', { name: /^Add penalty/ }).click()
  const call = board.locator('.pencall')
  await expect(call.locator('.pclabel')).toHaveText('\u25C0\uFE0EPENALTY') // home = left: the arrow points left
  await expect(call.locator('.pctext')).toHaveText('#24 CHECKING FROM BEHIND 2:00')
  // the whole line fits in the middle column
  expect(await call.locator('.pctext').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await board.screenshot({ path: test.info().outputPath('pencall.png') })
  await page.waitForTimeout(12000)
  await expect(call).toBeVisible() // still there after 12 s
  await expect(call).toBeHidden({ timeout: 5000 })
})
