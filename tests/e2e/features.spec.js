import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, openOptions, saveOptions, home, away, boardHome, boardAway, addPenalty } from './helpers.js'

test('shootout: attempts show on control, display and banner; score stays manual', async ({ page, context }) => {
  const code = uniqueCode('so')
  await openControl(page, code)
  const board = await openBoard(context, code)

  // jump to SO: 1 → 2 → 3 → OT → SO
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Period ▶' }).click()
  await expect(page.locator('.clockcard .p b')).toHaveText('SO')
  await expect(page.locator('.clockcard .c')).toHaveText('0.0')
  await expect(home(page).locator('.so')).toBeVisible()

  await home(page).locator('.so').getByRole('button', { name: 'Goal' }).click()
  await home(page).locator('.so').getByRole('button', { name: 'Miss' }).click()
  await away(page).locator('.so').getByRole('button', { name: 'Miss' }).click()
  await expect(home(page).locator('.so .marks')).toHaveText('●○')
  await expect(away(page).locator('.so .marks')).toHaveText('○')
  await expect(boardHome(board).locator('.so')).toHaveText('●○·')
  await expect(boardAway(board).locator('.so')).toHaveText('○··')
  await expect(boardHome(board).locator('.score')).toHaveText('0')

  // undo
  await home(page).locator('.so').getByRole('button', { name: '↶' }).click()
  await expect(home(page).locator('.so .marks')).toHaveText('●')
  await expect(boardHome(board).locator('.so')).toHaveText('●··')

  // banner shows the same markers
  const banner = await context.newPage()
  await banner.goto(`/o/${code}`)
  await expect(banner.locator('.banner .bteam').nth(0).locator('.btso')).toHaveText('●··')

  // winner's goal is added by the operator
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await expect(boardHome(board).locator('.score')).toHaveText('1')
  // leaving SO hides the markers again
  await page.getByRole('button', { name: '◀ Period' }).click()
  await expect(home(page).locator('.so')).toHaveCount(0)
  await expect(boardHome(board).locator('.so')).toHaveCount(0)
})

test('game summary sheet lists goals and penalties with the running score', async ({ page }) => {
  const code = uniqueCode('sum')
  await openControl(page, code)
  await page.getByRole('button', { name: 'SET', exact: true }).click()
  await page.locator('.sheet').getByLabel('Minutes').fill('10')
  await page.locator('.sheet').getByLabel('Seconds').fill('30')
  await page.locator('.sheet').getByRole('button', { name: 'Set', exact: true }).click()
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await addPenalty(page, 'away', 12, 2)
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await away(page).getByRole('button', { name: '+ GOAL' }).click()
  await away(page).getByRole('button', { name: 'Shot +' }).click()

  await page.getByRole('button', { name: '📋 Summary' }).click()
  const text = await page.locator('.sheet pre.summary').textContent()
  expect(text).toContain('HOME 1 - 1 AWAY')
  expect(text).toContain('SHOTS: HOME 0 - 1 AWAY')
  expect(text).toContain('PERIOD 1\n  10:30  GOAL  HOME (1-0)\n  10:30  PENALTY  AWAY #12 2 min')
  expect(text).toContain('PERIOD 2\n  15:00  GOAL  AWAY (1-1)')

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .csv' }).click()])
  expect(dl.suggestedFilename()).toMatch(new RegExp(`^${code}-\\d{4}-\\d{2}-\\d{2}\\.csv$`))
  const csv = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString())
  expect(csv.split('\n')[0]).toBe('period,time,event,team,player,minutes,detail,home,away')
  expect(csv).toContain('1,10:30,penalty,AWAY,12,2,#12 2 min,1,0')
})

test('Thai control UI: switch language in Options → Text', async ({ page }) => {
  const code = uniqueCode('th')
  await openControl(page, code)
  await openOptions(page, 'Text')
  await page.locator('.opts').getByLabel('Control page language').selectOption('th')
  // the options chrome switches immediately (draft), the control page after Save
  await expect(page.locator('.opts .tabs button[data-tab=Teams]')).toHaveText('ทีม')
  await page.locator('.opts .foot').getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.locator('.opts')).toBeHidden()

  await expect(page.getByRole('button', { name: 'เริ่ม' })).toBeVisible()
  await expect(home(page).getByRole('button', { name: '+ ประตู' })).toBeVisible()
  await expect(page.getByRole('button', { name: '⚙ ตั้งค่า' })).toBeVisible()
  await expect(page.locator('.control .top')).toContainText('เกม ·')
  // display labels are untouched (they are separate options)
  await expect(page.locator('.clockcard .p')).toContainText('PERIOD')
  // shortcuts still work, confirm text is Thai (auto-accepted)
  await page.keyboard.press('KeyQ')
  await expect(home(page).locator('.s')).toHaveText('1')
  // sheets are translated too
  await home(page).getByRole('button', { name: 'ลงโทษ' }).click()
  await expect(page.locator('.sheet').getByRole('button', { name: 'เพิ่มโทษ' })).toBeVisible()
  await page.locator('.sheet').getByRole('button', { name: 'ยกเลิก' }).click()
  // persists after reload
  await page.reload()
  await expect(page.getByRole('button', { name: 'เริ่ม' })).toBeVisible()
})

test('/live lists games in this browser with score, period and clock', async ({ page, context }) => {
  const a = uniqueCode('live-a'), b = uniqueCode('live-b')
  await openControl(page, a)
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await page.getByRole('button', { name: 'START' }).click()
  const p2 = await context.newPage()
  await openControl(p2, b)
  await openOptions(p2, 'Other')
  await p2.locator('.opts').getByLabel('Scoreboard title').fill('Rink B final')
  await saveOptions(p2)

  const live = await context.newPage()
  await live.goto('/live')
  await expect(live.locator('.live h1')).toHaveText('Live games')
  const cardA = live.locator(`.live .game[data-game="${a}"]`)
  const cardB = live.locator(`.live .game[data-game="${b}"]`)
  await expect(cardA).toBeVisible()
  await expect(cardB).toBeVisible()
  // running game sorts first and says LIVE
  await expect(live.locator('.live .game').first()).toHaveAttribute('data-game', a)
  await expect(cardA.locator('.st')).toHaveText('LIVE')
  await expect(cardA.locator('.t').nth(0).locator('b')).toHaveText('1')
  await expect(cardA.locator('.clock')).toContainText('PERIOD 2')
  await expect(cardA.locator('.clock b')).not.toHaveText('15:00')
  await expect(cardB.locator('.code')).toHaveText('Rink B final')
  await expect(cardB.locator('.st')).not.toHaveText('LIVE')
  await expect(cardA).toHaveAttribute('href', `/b/${a}`)
  // this browser holds the operator key → operate link
  await expect(cardA.locator('.op')).toBeVisible()

  // live update: a goal on the control page reaches the list
  await away(page).getByRole('button', { name: '+ GOAL' }).click()
  await expect(cardA.locator('.t').nth(1).locator('b')).toHaveText('1')
})
