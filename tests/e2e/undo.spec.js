import { test, expect } from '@playwright/test'
import { openControl, home, openBoard, uniqueCode } from './helpers.js'

test('toolbar Undo reverses score and shot inputs without undoing another operator’s goal', async ({
  page,
  context,
}) => {
  const code = uniqueCode('undo')
  await openControl(page, code)
  const button = page.getByRole('button', {
    name: 'Undo last action',
    exact: true,
  })
  await expect(button).toBeDisabled()
  await home(page)
    .getByRole('button', { name: 'score +1', exact: true })
    .click()
  const other = await context.newPage()
  await openControl(other, code)
  await other
    .locator('.control .tc')
    .nth(1)
    .getByRole('button', { name: 'score +1', exact: true })
    .click()
  await expect(page.locator('.control .tc .s').nth(1)).toHaveText('1')
  await button.click()
  await expect(home(page).locator('.s')).toHaveText('0')
  await expect(page.locator('.control .tc .s').nth(1)).toHaveText('1')
  await expect(button).toBeDisabled()
  await expect(page.getByRole('button', {name:'Redo last action',exact:true})).toBeVisible()
  await home(page)
    .getByRole('button', { name: 'score +1', exact: true })
    .click()
  await expect(page.getByRole('button', {name:'Redo last action',exact:true})).toHaveCount(0)
  await home(page)
    .getByRole('button', { name: '−1', exact: true })
    .first()
    .click()
  await button.click()
  await expect(home(page).locator('.s')).toHaveText('1')
})

test('Stats mode has the same toolbar Undo and correction history stays consistent', async ({
  page,
}) => {
  await openControl(page, uniqueCode('undostats'))
  await home(page)
    .getByRole('button', { name: 'score +1', exact: true })
    .click()
  await page.getByRole('button', { name: 'Stats mode', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Edit live event' })
  await editor.getByLabel('Goal #', { exact: true }).fill('17')
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Undo last action', exact: true })
    .click()
  await expect(page.locator('.stats-event-list')).toContainText('Needs details')
  await expect(page.locator('.stats-history')).toContainText('Undid correction')
  await page
    .getByRole('button', { name: 'Undo last action', exact: true })
    .click()
  await expect(page.locator('.stats-event-list')).toContainText(
    'Waiting for game events'
  )
  await expect(
    page.getByRole('button', { name: 'Undo last action', exact: true })
  ).toBeDisabled()
})

test('New game disables Undo for the previous game', async ({ page }) => {
  await openControl(page, uniqueCode('undonew'))
  await home(page)
    .getByRole('button', { name: 'score +1', exact: true })
    .click()
  await home(page)
    .getByRole('button', { name: '−1', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'New game', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Undo last action', exact: true })
  ).toBeDisabled()
  await expect(home(page).locator('.s')).toHaveText('0')
})

test('keyboard undo and redo work across modes and new inputs clear redo', async ({page}) => {
  await openControl(page,uniqueCode('redokeys'))
  await home(page).getByRole('button',{name:'score +1',exact:true}).click()
  await page.keyboard.press('Control+z')
  await expect(home(page).locator('.s')).toHaveText('0')
  await expect(page.getByRole('button',{name:'Redo last action',exact:true})).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(home(page).locator('.s')).toHaveText('1')
  await page.getByRole('button',{name:'Stats mode',exact:true}).click()
  const editor=page.getByRole('form',{name:'Edit live event'})
  await editor.getByLabel('Goal #',{exact:true}).fill('17')
  await editor.getByRole('button',{name:'Save changes',exact:true}).click()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.stats-event-list')).toContainText('Needs details')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.stats-event-list')).toContainText('#17')
})
