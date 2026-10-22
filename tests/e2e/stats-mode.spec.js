import { test, expect } from '@playwright/test'
import {
  openControl,
  home,
  openBoard,
  addPenalty,
  setClock,
  uniqueCode,
} from './helpers.js'

test('two operators share goals and corrections while mode and summary stay independent', async ({
  page,
  context,
}) => {
  const code = uniqueCode('stats')
  await openControl(page, code)
  await setClock(page, 12, 36)
  const stats = await context.newPage()
  await openControl(stats, code)
  await stats.getByRole('button', { name: 'Stats mode', exact: true }).click()
  await expect(
    stats.getByRole('heading', { name: 'Live events', exact: true })
  ).toBeVisible()
  const toolbar = await stats.locator('.bottom').boundingBox()
  const body = await stats.locator('.stats-workspace').boundingBox()
  expect(toolbar.y).toBeLessThan(body.y)
  await expect(
    page.getByRole('button', { name: 'Stats mode', exact: true })
  ).toBeVisible()
  await home(page).getByRole('button', { name: '+ GOAL', exact: true }).click()
  await expect(page.locator('.sheet')).toHaveCount(0)
  const editor = stats.getByRole('form', { name: 'Edit live event' })
  await expect(editor).toBeVisible()
  await editor.getByLabel('Goal #', { exact: true }).fill('17')
  await editor.getByLabel('Assist 1 #').fill('9')
  await editor.getByLabel('Game clock at event').fill('12:40')
  await editor.getByLabel('Empty net (EN)').check()
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await expect(stats.locator('.stats-event-list')).toContainText('#17')
  await expect(home(page).locator('.s')).toHaveText('1')
  await expect(page.locator('.clockline .c')).toHaveText('12:36')
  let opened = 0
  page.on('popup', () => opened++)
  await page.getByRole('button', { name: '📋 Summary', exact: true }).click()
  await expect(page.locator('.sheet pre.summary')).toContainText('#17')
  await expect(page.locator('.sheet pre.summary')).toContainText('02:20')
  await expect(page.locator('.sheet pre.summary')).toContainText('EQ EN')
  expect(opened).toBe(0)
  await expect(page.getByRole('button', { name: /edit goal/ })).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .txt', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.txt$/)
  await page
    .locator('.sheet')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await stats.reload()
  await expect(
    stats.getByRole('heading', { name: 'Live events', exact: true })
  ).toBeVisible()
  await stats
    .getByRole('button', { name: 'Scoreboard mode', exact: true })
    .click()
  await expect(
    stats.getByRole('button', { name: 'START', exact: true })
  ).toBeVisible()
})

test('goal prompts queue and dismissed events remain available for later review', async ({
  page,
  context,
}) => {
  const code = uniqueCode('statsqueue')
  await openControl(page, code)
  const stats = await context.newPage()
  await openControl(stats, code)
  await stats.getByRole('button', { name: 'Stats mode', exact: true }).click()
  await home(page).getByRole('button', { name: '+ GOAL', exact: true }).click()
  const editor = stats.getByRole('form', { name: 'Edit live event' })
  await expect(editor).toBeVisible()
  await home(page).getByRole('button', { name: '+ GOAL', exact: true }).click()
  await editor.getByRole('button', { name: 'Later / Cancel' }).click()
  await expect(editor).toBeVisible()
  await editor.getByLabel('Goal #', { exact: true }).fill('88')
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await expect(editor).toHaveCount(0)
  await expect(stats.locator('.stats-event-list')).toContainText(
    'Needs details'
  )
  await expect(stats.locator('.stats-event-list')).toContainText('#88')
  await expect(home(page).locator('.s')).toHaveText('2')
})

test('running penalty edits reach the scoreboard and summary without restarting time served', async ({
  page,
  context,
}) => {
  const code = uniqueCode('statspen')
  await openControl(page, code)
  await addPenalty(page, 'home', 33, 2)
  const board = await openBoard(context, code)
  const stats = await context.newPage()
  await openControl(stats, code)
  await stats.getByRole('button', { name: 'Stats mode', exact: true }).click()
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await stats.locator('.stats-active .stats-penalty').click()
  const editor = stats.getByRole('form', { name: 'Edit live event' })
  await editor.getByLabel('Player #', { exact: true }).fill('55')
  await editor.getByLabel('Infraction', { exact: true }).fill('Hooking')
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await expect(board.locator('.board')).toContainText('#55')
  await expect(home(page)).toContainText('Hooking')
  await expect(stats.locator('.stats-event-list')).toContainText('Hooking')
  await expect(
    page.getByRole('button', { name: 'STOP', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'STOP', exact: true }).click()
  await page.getByRole('button', { name: '📋 Summary', exact: true }).click()
  await expect(page.locator('.sheet pre.summary')).toContainText('#55')
  await expect(page.locator('.sheet pre.summary')).toContainText('Hooking')
})

test('a stale stats editor warns instead of overwriting another operator’s correction', async ({
  page,
  context,
}) => {
  const code = uniqueCode('statsconflict')
  await openControl(page, code)
  const second = await context.newPage()
  await openControl(second, code)
  await page.getByRole('button', { name: 'Stats mode', exact: true }).click()
  await second.getByRole('button', { name: 'Stats mode', exact: true }).click()
  await page
    .locator('.stats-add')
    .getByRole('button', { name: '+ Goal', exact: true })
    .first()
    .click()
  const a = page.getByRole('form', { name: 'Edit live event' }),
    b = second.getByRole('form', { name: 'Edit live event' })
  await expect(a).toBeVisible()
  await expect(b).toBeVisible()
  await a.getByLabel('Goal #', { exact: true }).fill('17')
  await b.getByLabel('Goal #', { exact: true }).fill('88')
  await a.getByRole('button', { name: 'Save changes' }).click()
  await expect(second.locator('.stats-event-list')).toContainText('#17')
  await b.getByRole('button', { name: 'Save changes' }).click()
  await expect(b.getByRole('alert')).toContainText('Another operator changed')
  await expect(second.locator('.stats-event-list')).toContainText('#17')
  await b.getByRole('button', { name: 'Later / Cancel' }).click()
  await page
    .locator('.stats-history')
    .getByRole('button', { name: 'Undo', exact: true })
    .click()
  await expect(page.getByRole('form', { name: 'Edit live event' })).toHaveCount(
    0
  )
  await expect(page.locator('.stats-event-list')).toContainText('Needs details')
  await expect(second.locator('.stats-event-list')).toContainText(
    'Needs details'
  )
})

test('phone stats workspace keeps the toolbar and status visible without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await openControl(page,uniqueCode('statsphone'))
  await page.getByRole('button',{name:'Stats mode',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Live events',exact:true})).toBeVisible()
  expect(await page.locator('.stats-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  expect(await page.locator('.stats-workspace').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  const toolbar=await page.locator('.bottom').boundingBox(),status=await page.locator('.status').boundingBox()
  expect(toolbar.y).toBeGreaterThanOrEqual(0)
  expect(status.y+status.height).toBeLessThanOrEqual(844)
})
