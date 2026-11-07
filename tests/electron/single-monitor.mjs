// Single-monitor mode in the real desktop app (Electron): the control window switches to the scoreboard view, every
// number typed there reaches the HDMI scoreboard window, the bar never covers a number, START/STOP and the keys work.
// Needs: npm run build:desktop, (cd desktop && npm install), a display (CI / cloud: xvfb-run). Run: npm run test:electron
import { _electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const HOME = mkdtempSync(join(tmpdir(), 'lbs-electron-')) // a fresh user data folder: no saved game, no settings
const log = (...a) => console.log(...a)
const app = await _electron.launch({
  executablePath: 'desktop/node_modules/electron/dist/electron',
  args: ['--no-sandbox', 'desktop/main.cjs'],
  env: { ...process.env, HOME, XDG_CONFIG_HOME: join(HOME, '.config') },
  timeout: 60000,
})
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const r = await fn(); if (r) return r; await new Promise(r => setTimeout(r, 200)) } throw new Error('timeout') }
const win = url => until(() => app.windows().find(w => w.url().includes(url)))
const ctl = await win('/c/main')
const tv = await win('/b/main')
log('windows:', app.windows().map(w => w.url()).join('  '))
await ctl.getByRole('button', { name: /^(START|STOP)$/ }).waitFor()
await ctl.getByRole('button', { name: /Single monitor/ }).click()
await ctl.locator('.singleview .board').waitFor()
log('single view:', ctl.url(), '| control panel hidden:', await ctl.locator('.clockcard').isHidden())
// penalties first, so their rows are on the board
for (const team of ['home', 'away']) {
  await ctl.getByRole('button', { name: 'add penalty ' + team + ' (single monitor)' }).click()
  const sheet = ctl.locator('.sheet')
  await sheet.getByPlaceholder('#').fill(team === 'home' ? '12' : '7')
  await sheet.getByRole('button', { name: '2 min', exact: true }).click()
  await sheet.getByRole('button', { name: 'Add penalty' }).click()
  await sheet.waitFor({ state: 'hidden' })
}
await ctl.waitForTimeout(16500) // the penalty calls fade
const overlap = await ctl.evaluate(() => {
  const bar = document.querySelector('.singlebar').getBoundingClientRect()
  return [...document.querySelectorAll('.singleview [data-edit]')].filter(el => { const r = el.getBoundingClientRect(); return r.bottom > bar.top && r.top < bar.bottom && r.right > bar.left && r.left < bar.right }).map(el => el.dataset.edit)
})
log('numbers under the bar:', overlap.length ? overlap.join(', ') : 'none')
assert.deepEqual(overlap, [], 'the bar covers no number')
const clock = ctl.locator('.singleview [data-edit="clock"]')
const tvClock = tv.locator('.board [data-edit="clock"]')
const type = async (sel, label, val) => { await ctl.locator(sel).first().click(); await ctl.getByLabel(label).fill(val); await ctl.getByLabel(label).press('Enter') }
const tvText = sel => tv.locator(sel).first().textContent()
await type('.singleview [data-edit="clock"]', 'type clock', '1000'); await until(async () => (await tvClock.textContent()) === '10:00')
log('clock typed 1000 → HDMI', await tvClock.textContent())
await type('.singleview [data-edit="score:home"]', 'type score', '3'); await until(async () => (await tvText('.board [data-edit="score:home"]')) === '3')
log('home score typed 3 → HDMI', await tvText('.board [data-edit="score:home"]'))
await type('.singleview [data-edit="shots:away"]', 'type shots', '12'); await until(async () => (await tvText('.board [data-edit="shots:away"]')) === '12')
log('away shots typed 12 → HDMI', await tvText('.board [data-edit="shots:away"]'))
await type('.singleview [data-edit="period"]', 'type period', '2'); await until(async () => (await tvText('.board [data-edit="period"]')) === '2')
log('period typed 2 → HDMI', await tvText('.board [data-edit="period"]'))
await type('.singleview [data-edit$=":time"]', 'type pen', '1:30'); await until(async () => (await tvText('.board [data-edit$=":time"]')) === '1:30')
log('penalty time typed 1:30 → HDMI', await tvText('.board [data-edit$=":time"]'))
await type('.singleview [data-edit$=":player"]', 'type pen', '21'); await until(async () => /21/.test(await tvText('.board [data-edit$=":player"]')))
log('penalty player typed 21 → HDMI', await tvText('.board [data-edit$=":player"]'))
const bar = ctl.locator('.singlebar')
await bar.getByRole('button', { name: 'START', exact: true }).click()
await ctl.waitForTimeout(1500)
const ran = await tvClock.textContent()
await ctl.keyboard.press('Space')
await bar.getByRole('button', { name: 'START', exact: true }).waitFor()
await ctl.waitForTimeout(300)
const stoppedCtl = await clock.textContent(), stoppedTv = await tvClock.textContent()
log('START from the bar, Space to stop: ran to', ran, '| stopped at control', stoppedCtl, '/ HDMI', stoppedTv)
assert.equal(stoppedCtl, stoppedTv, 'both screens stop on the same time')
assert.notEqual(ran, '10:00', 'the clock ran')
await bar.getByRole('button', { name: '+ GOAL' }).nth(1).click()
await until(async () => (await tvText('.board [data-edit="score:away"]')) === '1')
log('+ GOAL away from the bar → HDMI', await tvText('.board [data-edit="score:away"]'))
await bar.getByRole('button', { name: /Control panel/ }).click()
await ctl.locator('.clockcard').waitFor()
log('back to the control panel:', await ctl.locator('.clockcard').isVisible())
await app.close()
rmSync(HOME, { recursive: true, force: true })
log('single monitor in the desktop app: OK')
