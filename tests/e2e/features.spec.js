import zlib from 'node:zlib'
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

test('game summary (IIHF style): scorer and assists after a goal, penalties, shots, CSV and print', async ({ page }) => {
  const code = uniqueCode('sum')
  await openControl(page, code)
  await page.getByRole('button', { name: 'SET', exact: true }).click()
  await page.locator('.sheet').getByLabel('Minutes').fill('10')
  await page.locator('.sheet').getByLabel('Seconds').fill('30')
  await page.locator('.sheet').getByRole('button', { name: 'Set', exact: true }).click()
  await home(page).getByRole('button', { name: 'Shot +', exact: true }).click()
  await home(page).getByRole('button', { name: '+ GOAL' }).click()
  // the team card offers the scorer right after the goal
  await page.getByRole('button', { name: 'goal details home' }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByLabel('Goal #').fill('17')
  await sheet.getByLabel('Assist 1 #').fill('9')
  await sheet.getByLabel('Assist 2 #').fill('4')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'goal details home' })).toHaveCount(0)
  await addPenalty(page, 'away', 12, 2)
  await page.getByRole('button', { name: 'Period ▶' }).click()
  await away(page).getByRole('button', { name: '+ GOAL' }).click()

  await page.getByRole('button', { name: '📋 Summary' }).click()
  const text = await page.locator('.sheet pre.summary').textContent()
  expect(text).toContain('HOME 1 – 1 AWAY')
  expect(text).toMatch(/04:30 +HOME +#17 +#9, #4 +EQ +1:0/)
  expect(text).toMatch(/15:00 +AWAY +\? +SH1 +1:1/) // period 2 starts at 15:00 game time; AWAY is a man down
  expect(text).toMatch(/04:30 +AWAY +#12 +2 +Minor/)
  expect(text).toMatch(/TIMELINE\nPERIOD 1\n  04:30  SHOT     HOME +Shot on goal/)
  // edit the away goal from the list
  await page.getByRole('button', { name: 'edit goal 2' }).click()
  await page.locator('.sheet').getByLabel('Goal #').fill('8')
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: '📋 Summary' }).click()
  await expect(page.locator('.sheet pre.summary')).toContainText('#8')

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .csv' }).click()])
  expect(dl.suggestedFilename()).toMatch(new RegExp(`^${code}-\\d{4}-\\d{2}-\\d{2}\\.csv$`))
  const csv = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString())
  expect(csv.split('\n')[0]).toBe('section,period,time,team,number,assist1,assist2,situation,pim,offence,end,score')
  expect(csv).toContain('goal,1,04:30,HOME,17,9,4,EQ,,,,1:0')

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print / PDF' }).click()])
  await expect(popup.locator('h1')).toContainText('Game summary')
  await expect(popup.locator('table').nth(1)).toContainText('#17') // goals
  await expect(popup.locator('table.tl')).toContainText('Shot on goal') // timeline
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
  await expect(page.locator('.control .status')).toContainText('เกม ·')
  // display labels are untouched (they are separate options)
  await expect(page.locator('.clockcard .p')).toContainText('PERIOD')
  // shortcuts still work, confirm text is Thai (auto-accepted)
  await page.keyboard.press('KeyQ')
  await expect(home(page).locator('.s')).toHaveText('1')
  // sheets are translated too
  await home(page).getByRole('button', { name: 'add penalty' }).click()
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
  await page.getByRole('button', { name: 'START', exact: true }).click()
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

test('/live skips rows that are not scoreboard games', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('rinkboard:broken-row', JSON.stringify({ a: 1 })))
  await page.goto('/live')
  await expect(page.locator('.live h1')).toHaveText('Live games')
})

test('rename a team from the control page; ±5 s clock buttons', async ({ page, context }) => {
  const code = uniqueCode('rename')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.getByRole('button', { name: 'rename home' }).click()
  await page.locator('.sheet input').first().fill('Wolves')
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click()
  await expect(board.locator('.board .team').first().locator('.name')).toHaveText('Wolves')
  await page.getByRole('button', { name: 'clock -5 s' }).click()
  await expect(page.locator('.clockcard .c')).toHaveText('14:55')
  await page.getByRole('button', { name: 'clock +1 s' }).click()
  await expect(page.locator('.clockcard .c')).toHaveText('14:56')
})

test('delete a game from the live games page', async ({ page }) => {
  const code = uniqueCode('del')
  await openControl(page, code)
  await page.goto('/live')
  await expect(page.locator(`[data-game="${code}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'Manage games' }).click()
  await page.getByRole('button', { name: `delete game ${code}` }).click()
  await expect(page.locator(`[data-game="${code}"]`)).toHaveCount(0)
})

test('Home button on the control page asks first', async ({ page }) => {
  await openControl(page, uniqueCode('home'))
  page.removeAllListeners('dialog')
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: 'home', exact: true }).click()
  await expect(page).toHaveURL(/\/c\//)
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'home', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('teams are remembered in this browser and picked with one tap', async ({ page, context }) => {
  const code = uniqueCode('lib')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.getByRole('button', { name: 'rename home' }).click()
  await page.locator('.sheet input').first().fill('Zeus')
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click()
  // next game: Zeus is one tap away
  await page.getByRole('button', { name: 'rename away' }).click()
  await page.getByRole('button', { name: 'use team Zeus' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click()
  await expect(board.locator('.board .team').nth(1).locator('.name')).toHaveText('Zeus')
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('team logos page: upload named by file, rename, then pick on the control page', async ({ page, context }) => {
  await page.goto('/teams')
  await page.locator('.teamsPage input[type=file][multiple]').setInputFiles([
    { name: 'zeus_hockey.png', mimeType: 'image/png', buffer: PNG },
    { name: 'bangkok-bears.png', mimeType: 'image/png', buffer: PNG },
  ])
  await expect(page.locator('.tcard')).toHaveCount(2)
  const zeus = page.getByLabel('name of Zeus Hockey')
  await zeus.fill('Zeus')
  await zeus.press('Enter')
  await expect(page.locator('[data-team="zeus"]')).toBeVisible()

  const code = uniqueCode('logos')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.getByRole('button', { name: 'rename home' }).click()
  await page.getByRole('button', { name: 'use team Bangkok Bears' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click()
  await expect(board.locator('.board .team').first().locator('.name')).toHaveText('Bangkok Bears')
  await expect(board.locator('.board .team').first().locator('.toplogo')).toBeVisible()
})

// w×h RGBA PNG, transparent except where solid(x, y) says so
function rgbaPng(w, h, solid) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) raw.set([255, 0, 0, 255], y * (1 + w * 4) + 1 + x * 4)
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
// 100×100, transparent except a 20×40 block in the middle (a logo with its background removed)
const PADDED = rgbaPng(100, 100, (x, y) => x >= 40 && x < 60 && y >= 30 && y < 70)

test('a logo without background loses its empty border, so it fills its box', async ({ page }) => {
  await page.goto('/teams')
  await page.locator('.teamsPage input[type=file][multiple]').setInputFiles([{ name: 'padded_logo.png', mimeType: 'image/png', buffer: PADDED }])
  const img = page.locator('.tcard img').first()
  await expect(img).toBeVisible()
  const size = await img.evaluate(i => [i.naturalWidth, i.naturalHeight])
  expect(size).toEqual([22, 42]) // the 20×40 block plus a 2 % margin, not 100×100
})

test('✂ Trim empty borders: logos saved before the trim get it too', async ({ page }) => {
  await page.goto('/teams')
  const padded = `data:image/png;base64,${PADDED.toString('base64')}`
  await page.evaluate(logo => localStorage.setItem('rinkboard:teams', JSON.stringify([{ id: 'old logo', name: 'Old Logo', color: '#ff0000', logo }])), padded)
  await page.reload()
  const img = page.locator('[data-team="old logo"] img')
  await expect(img).toBeVisible()
  expect(await img.evaluate(i => [i.naturalWidth, i.naturalHeight])).toEqual([100, 100])
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: /Trim empty borders/ }).click()
  await expect(page.locator('.teamsPage .warn')).toContainText('Trimmed 1 logo')
  await expect.poll(() => img.evaluate(i => [i.naturalWidth, i.naturalHeight])).toEqual([22, 42])
})

test('developer contact on Home and the control page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home .contact')).toContainText('Pai Chanut')
  await expect(page.locator('.home .contact a[href="tel:+66816351945"]')).toBeVisible()
  await expect(page.locator('.home .contact a[href="https://wa.me/66816351945"]')).toBeVisible()
  await expect(page.locator('.home .contact a[href="https://line.me/ti/p/~paichanut"]')).toBeVisible()
  await expect(page.locator('.home .contact a[href="mailto:paichanut@gmail.com"]')).toBeVisible()
  await openControl(page, uniqueCode('contact'))
  await page.getByRole('button', { name: /Contact for license/ }).click()
  await expect(page.locator('.sheet')).toContainText('Pai Chanut')
  await expect(page.locator('.sheet a[href="https://wa.me/66816351945"]')).toBeVisible()
})

test('offside: shows on the scoreboard and goes into the game log', async ({ page, context }) => {
  const code = uniqueCode('offside')
  await openControl(page, code)
  const board = await openBoard(context, code)
  await page.getByRole('button', { name: 'offside +1 away' }).click()
  await expect(away(page).locator('.mini', { hasText: 'Offside' })).toContainText('1')
  // the arrow points at the side that was offside (away = right)
  await expect(board.locator('.board .evslot .goalflash')).toHaveText('OFFSIDE\u25B6\uFE0E')
  await page.waitForTimeout(12000)
  await expect(board.locator('.board .evslot .goalflash')).toBeVisible() // still there after 12 s
  await expect(board.locator('.board .evslot .goalflash')).toHaveCount(0, { timeout: 5000 }) // gone after 15 s
  await page.getByRole('button', { name: '📋 Summary' }).click()
  await expect(page.locator('.sheet pre.summary')).toContainText(/OFFSIDE +AWAY +Offside/)
})

test('referee signals PDF is served and linked from Help', async ({ page, request }) => {
  const r = await request.get('/referee-signals.pdf')
  expect(r.status()).toBe(200)
  expect(r.headers()['content-type']).toContain('application/pdf')
  await openControl(page, uniqueCode('refsig'))
  await page.getByRole('button', { name: 'keyboard shortcuts' }).click()
  await expect(page.locator('.sheet a[href="/referee-signals.pdf"]')).toBeVisible()
})
