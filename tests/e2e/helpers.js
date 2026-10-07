// Shared helpers. Tests run in LOCAL mode (no Supabase env), so the control
// and board tabs must live in the same browser context (localStorage + BroadcastChannel).
import { expect } from '@playwright/test'

let n = 0
export const uniqueCode = prefix => `${prefix}-${Date.now().toString(36)}-${n++}`

export async function openControl(page, code) {
  page.on('dialog', d => d.accept())
  await page.goto(`/c/${code}?k=testkey`)
  await expect(page.getByRole('button', { name: /^(START|STOP)$/ })).toBeVisible()
  return page
}

export async function openBoard(context, code) {
  const page = await context.newPage()
  await page.goto(`/b/${code}`)
  await expect(page.locator('.board .clock')).toBeVisible()
  return page
}

export const home = page => page.locator('.control .tc').nth(0)
export const away = page => page.locator('.control .tc').nth(1)
export const boardHome = page => page.locator('.board .team').nth(0)
export const boardAway = page => page.locator('.board .team').nth(1)

export async function addPenalty(page, team, player, minutes) {
  await (team === 'home' ? home(page) : away(page)).getByRole('button', { name: 'Penalty' }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill(String(player))
  await sheet.getByRole('button', { name: `${minutes} min`, exact: true }).click()
  await sheet.getByRole('button', { name: 'Add penalty' }).click()
  await expect(sheet).toBeHidden()
}

export async function setClock(page, minutes, seconds) {
  await page.getByRole('button', { name: 'SET', exact: true }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByLabel('Minutes').fill(String(minutes))
  await sheet.getByLabel('Seconds').fill(String(seconds))
  await sheet.getByRole('button', { name: 'Set', exact: true }).click()
  await expect(sheet).toBeHidden()
}

export async function openOptions(page, tab) {
  await page.getByRole('button', { name: '⚙ Options' }).click()
  await expect(page.locator('.opts')).toBeVisible()
  if (tab) await page.locator('.opts .tabs').getByRole('button', { name: tab, exact: true }).click()
}

export async function saveOptions(page) {
  await page.locator('.opts .foot').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.opts')).toBeHidden()
}
