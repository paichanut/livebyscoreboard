// Browser checks against a cloud-configured LOCAL build; every database call uses fixtures.
// VITE_SUPABASE_URL=https://fixture.supabase.co VITE_SUPABASE_ANON_KEY=fixture-anon vite build ...
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import * as G from '../src/game.js'
const site = process.env.LBS_SITE || 'http://127.0.0.1:4175'
if (!['localhost', '127.0.0.1'].includes(new URL(site).hostname))
  throw Error('Use a local fixture build.')
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
})
const clone = (x) => JSON.parse(JSON.stringify(x))
let db,
  ready = true
const fresh = () => {
  db = G.addScore(G.newGame(), 'home', 1)
}
async function operator() {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.setItem('rinkboard:session', 'fixture-session')
    localStorage.setItem('rinkboard:user', 'fixture-operator')
  })
  await context.route('https://fixture.supabase.co/**', async (route) => {
    const req = route.request(),
      name = new URL(req.url()).pathname.split('/').at(-1)
    const args = req.method() === 'POST' ? req.postDataJSON() : {}
    let result
    if (name === 'games') result = { state: clone(db) }
    else if (['operator_check', 'check_key'].includes(name)) result = true
    else if (name === 'stats_sync_ready') result = ready
    else if (name === 'get_game_key') result = 'fixture-helper'
    else if (name === 'server_now') result = Date.now()
    else if (name === 'save_game_checked') {
      if (JSON.stringify(args.p_base) === JSON.stringify(db)) {
        db = clone(args.p_state)
        result = { ok: true, state: clone(db) }
      } else result = { ok: false, state: clone(db) }
    } else if (name === 'save_game') {
      db = clone(args.p_state)
      result = true
    } else throw Error('Unexpected fixture RPC: ' + name)
    await route.fulfill({ json: result })
  })
  await context.route('**/api/desktop-link**', (route) =>
    route.fulfill({ json: { desktop: false } })
  )
  const page = await context.newPage()
  await page.goto(site + '/c/cloud-stats-fixture')
  await page.getByRole('button', { name: 'Stats mode', exact: true }).waitFor()
  return { page, context }
}
try {
  for (const scenario of [
    'disjoint',
    'conflict',
    'new-goal',
    'migration-missing',
    'simultaneous-goals',
  ]) {
    fresh()
    ready = scenario !== 'migration-missing'
    const a = await operator(),
      b = await operator()
    try {
      if (scenario === 'simultaneous-goals') {
        await Promise.all([
          a.page
            .getByRole('button', { name: 'score +1', exact: true })
            .first()
            .click(),
          b.page
            .getByRole('button', { name: 'score +1', exact: true })
            .first()
            .click(),
        ])
        await a.page.waitForTimeout(500)
        assert.equal(db.home.score, 3)
        assert.equal(db.events.filter((e) => e.type === 'goal').length, 3)
        console.log('PASS cloud stats:', scenario)
        continue
      }
      await a.page
        .getByRole('button', { name: 'Stats mode', exact: true })
        .click()
      if (!ready) {
        await a.page
          .getByRole('alert')
          .filter({ hasText: 'needs the Supabase' })
          .waitFor()
        assert.equal(
          await a.page
            .getByRole('button', { name: 'START', exact: true })
            .count(),
          1
        )
        console.log('PASS cloud stats:', scenario)
        continue
      }
      const editor = a.page.getByRole('form', { name: 'Edit live event' })
      await editor.getByLabel('Goal #', { exact: true }).fill('17')
      if (scenario === 'new-goal') {
        await b.page
          .getByRole('button', { name: 'score +1', exact: true })
          .first()
          .click()
        await b.page.waitForTimeout(300)
        await editor.getByRole('button', { name: 'Save changes' }).click()
        await a.page.waitForTimeout(400)
        assert.equal(db.home.score, 2)
        assert.equal(db.events.filter((e) => e.type === 'goal').length, 2)
        assert.equal(db.events[0].scorer, '17')
      } else {
        await b.page
          .getByRole('button', { name: 'Stats mode', exact: true })
          .click()
        const other = b.page.getByRole('form', { name: 'Edit live event' })
        await other
          .getByLabel(scenario === 'conflict' ? 'Goal #' : 'Assist 1 #', {
            exact: true,
          })
          .fill(scenario === 'conflict' ? '88' : '9')
        await editor.getByRole('button', { name: 'Save changes' }).click()
        await a.page.waitForTimeout(300)
        await other.getByRole('button', { name: 'Save changes' }).click()
        await b.page.waitForTimeout(400)
        assert.equal(db.events[0].scorer, '17')
        assert.equal(db.home.score, 1)
        if (scenario === 'disjoint') assert.equal(db.events[0].a1, '9')
        else
          await b.page
            .getByRole('alert')
            .filter({ hasText: 'conflicting update was not saved' })
            .waitFor()
      }
      console.log('PASS cloud stats:', scenario)
    } finally {
      await a.context.close()
      await b.context.close()
    }
  }
} finally {
  await browser.close()
}
