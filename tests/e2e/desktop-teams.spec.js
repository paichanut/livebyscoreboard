import { test, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { openControl, openOptions, saveOptions, uniqueCode } from './helpers.js'
import { newGame } from '../../src/game.js'

const { createTeamCache } = createRequire(import.meta.url)('../../desktop/teams.cjs')
const logo = color => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${color}"/></svg>`

// Exercise the built desktop UI against the real disk cache. Only Electron's IPC transport and
// the remote library are replaced, so tests can restart the cache and go offline without Electron.
async function setup(context) {
  const directory = await mkdtemp(path.join(tmpdir(), 'scoreboard-teams-ui-'))
  let rows = [{ id: 1, name: 'Phoenix', color: '#ff8800', logo: 'https://logos.example/phoenix.svg', updated_at: 'v1' }]
  let offline = false
  let imageRequests = 0
  let closed = false
  const games = new Map()
  // HTTP preview uses the desktop viewer transport; provide its game/time endpoints separately.
  await context.route('**/api/time', route => route.fulfill({ json: { now: Date.now() } }))
  await context.route('**/api/state/**', async route => {
    if (closed) return route.abort()
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').pop()
    if (!games.has(id)) games.set(id, { state: newGame(), seq: 1, waiters: new Set() })
    const game = games.get(id)
    if (route.request().method() === 'POST') {
      game.state = { ...game.state, ...route.request().postDataJSON().patch }
      game.seq++
      for (const done of game.waiters) done()
      game.waiters.clear()
    } else if (Number(url.searchParams.get('v')) >= game.seq) {
      await new Promise(resolve => game.waiters.add(resolve))
    }
    await route.fulfill({ json: { state: game.state, seq: game.seq, boot: 'test' } }).catch(() => {})
  })
  const makeCache = () => createTeamCache({
    directory,
    fetch: async url => {
      if (offline) throw new Error('offline')
      if (url.endsWith('/api/teams')) return Response.json(rows)
      imageRequests++
      return new Response(logo(rows[0].updated_at === 'v1' ? 'red' : 'blue'), { headers: { 'Content-Type': 'image/svg+xml' } })
    },
    onUpdate: teams => {
      for (const page of context.pages()) page.evaluate(teams => {
        window.teamListeners?.forEach(listener => listener(teams))
      }, teams).catch(() => {})
    },
  })
  let cache = makeCache()
  await context.exposeFunction('nativeListTeams', () => cache.list())
  await context.exposeFunction('nativeRefreshTeams', () => cache.refresh())
  await context.addInitScript(() => {
    window.teamListeners = new Set()
    window.desktop = {
      listTeams: () => window.nativeListTeams(),
      refreshTeams: () => window.nativeRefreshTeams(),
      onTeams: listener => { window.teamListeners.add(listener); return () => window.teamListeners.delete(listener) },
    }
  })
  return {
    setOffline: value => { offline = value },
    setRows: value => { rows = value },
    restart: () => { cache = makeCache() },
    refresh: () => cache.refresh(),
    imageRequests: () => imageRequests,
    dispose: () => {
      closed = true
      for (const game of games.values()) for (const done of game.waiters) done()
      return rm(directory, { recursive: true, force: true })
    },
  }
}

test('downloaded team names and actual logos remain usable after an offline restart', async ({ page, context }) => {
  const native = await setup(context)
  try {
    await page.goto('/teams')
    await expect(page.getByRole('heading', { name: 'Downloaded team library' })).toBeVisible()
    await expect(page.locator('.tcard.ro .tname')).toHaveText('Phoenix')
    await expect.poll(() => page.locator('.tcard.ro img').evaluate(img => img.naturalWidth)).toBe(32)
    expect(native.imageRequests()).toBe(1)
    native.setOffline(true)
    native.restart()
    await page.reload()
    await expect(page.locator('.tcard.ro .tname')).toHaveText('Phoenix')
    await expect.poll(() => page.locator('.tcard.ro img').evaluate(img => img.naturalWidth)).toBe(32)
    await page.getByRole('button', { name: 'Check for team updates' }).click()
    await expect(page.getByText('Downloaded teams are still available offline.', { exact: false })).toBeVisible()
    await expect(page.locator('.tcard.ro .tname')).toHaveText('Phoenix')
    const code = uniqueCode('cached-teams')
    await openControl(page, code)
    await openOptions(page, 'Teams')
    await page.getByRole('button', { name: 'use team Phoenix', exact: true }).first().click()
    await saveOptions(page)
    const board = await context.newPage()
    await board.goto(`/b/${code}`)
    await expect(board.locator('.cname').first()).toHaveText('Phoenix')
    await expect.poll(() => board.locator('.clogo img').first().evaluate(img => img.naturalWidth)).toBe(32)
    await expect(board.locator('.clogo img').first()).toHaveAttribute('src', /^data:image\//)
    expect(native.imageRequests()).toBe(1)
  } finally { await native.dispose() }
})

test('background library updates reach open pickers without altering the current game', async ({ page, context }) => {
  const native = await setup(context)
  try {
    const code = uniqueCode('library-updates')
    await openControl(page, code)
    await openOptions(page, 'Teams')
    await page.getByRole('button', { name: 'use team Phoenix', exact: true }).first().click()
    await saveOptions(page)
    const board = await context.newPage()
    await board.goto(`/b/${code}`)
    await expect(board.locator('.cname').first()).toHaveText('Phoenix')
    const selectedLogo = await board.locator('.clogo img').first().getAttribute('src')
    await openOptions(page, 'Teams')
    native.setRows([
      { id: 1, name: 'Phoenix Updated', color: '#0088ff', logo: 'https://logos.example/phoenix.svg', updated_at: 'v2' },
      { id: 2, name: 'Zeus', color: '#0000ff', logo: '', updated_at: 'v1' },
    ])
    await native.refresh()
    await expect(page.getByRole('button', { name: 'use team Phoenix Updated', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'use team Zeus', exact: true }).first()).toBeVisible()
    const updatedLogo = await page.getByRole('button', { name: 'use team Phoenix Updated', exact: true }).first().locator('img').getAttribute('src')
    expect(updatedLogo).not.toBe(selectedLogo)
    await saveOptions(page)
    await expect(board.locator('.cname').first()).toHaveText('Phoenix')
    await expect(board.locator('.clogo img').first()).toHaveAttribute('src', selectedLogo)
    expect(native.imageRequests()).toBe(2)
  } finally { await native.dispose() }
})

test('Online link shows permanent owner URLs alongside unchanged Cloudflare links and an on/off switch', async ({page,context}) => {
  const native = await setup(context)
  try {
    await openControl(page, uniqueCode('online-links'))
    await page.evaluate(() => {
      const state = {
        enabled:true,state:'online',fixedStatus:'online',telegram:{chatId:'',tokenSet:false,last:''},
        fixed:{version:2,username:'owner',code:'arena-pc',links:{watch:[['Scoreboard','https://livebyscoreboard.vercel.app/b/owner/arena-pc']],run:[['Controller','https://livebyscoreboard.vercel.app/c/owner/arena-pc']]}},
        links:{watch:[['Scoreboard','https://fixture.trycloudflare.com/b/main']],run:[['Controller','https://fixture.trycloudflare.com/c/main?key=fixture-key']]},
      }
      window.desktop.getShare = async () => state
      const listeners=new Set()
      window.desktop.onShare = listener => { listeners.add(listener); return ()=>listeners.delete(listener) }
      window.desktop.enableShare = async enabled => { state.enabled=enabled; listeners.forEach(listener=>listener({...state})) }
    })
    // A normal game update rerenders the toolbar after installing the mock native transport.
    await page.getByRole('button',{name:'START',exact:true}).click()
    const footer=page.getByRole('region',{name:'Desktop online links'})
    await expect(footer).toContainText('Cloudflare · Online')
    await expect(footer.getByRole('link',{name:'https://livebyscoreboard.vercel.app/c/owner/arena-pc',exact:true})).toBeVisible()
    await expect(footer.getByRole('link',{name:'https://livebyscoreboard.vercel.app/b/owner/arena-pc',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'🌐 Online link',exact:true}).click()
    const sheet = page.locator('.sheet')
    await expect(sheet.getByText('https://livebyscoreboard.vercel.app/b/owner/arena-pc',{exact:true})).toBeVisible()
    await expect(sheet.getByText('https://livebyscoreboard.vercel.app/c/owner/arena-pc',{exact:true})).toBeVisible()
    await expect(sheet.getByText('https://fixture.trycloudflare.com/c/main?key=fixture-key',{exact:true})).toBeVisible()
    await expect(sheet.getByText('Only Cloudflare links are sent to Telegram.',{exact:false})).toBeVisible()
    await sheet.getByRole('button',{name:'● Online link is ON (tap to turn off)',exact:true}).click()
    await expect(sheet.getByRole('button',{name:'Turn on the online link',exact:true})).toBeVisible()
    await expect(footer).toContainText('Cloudflare · Off')
    await expect(sheet.getByText('https://livebyscoreboard.vercel.app/b/owner/arena-pc',{exact:true})).toBeVisible()
    await sheet.getByRole('button',{name:'Close',exact:true}).click()
    await page.getByRole('button',{name:'Stats mode',exact:true}).click()
    await expect(footer).toBeVisible()
    await expect(footer).toContainText('Cloudflare · Off')
    await expect(footer.getByRole('link',{name:'https://livebyscoreboard.vercel.app/c/owner/arena-pc',exact:true})).toBeVisible()
  } finally { await native.dispose() }
})

test('Online link: log in once, then a new machine name creates a new address and starts a new game', async ({page,context}) => {
  const native = await setup(context)
  try {
    await openControl(page, uniqueCode('machine-name'))
    await page.evaluate(() => {
      const state = {enabled:false,state:'off',telegram:{chatId:'',tokenSet:false,last:''},account:null,fixed:null,links:null}
      const listeners = new Set()
      const emit = () => listeners.forEach(listener => listener({...state}))
      const fixed = code => ({version:2,username:'owner',code,links:{watch:[['Scoreboard','https://livebyscoreboard.vercel.app/b/owner/'+code]],run:[['Controller','https://livebyscoreboard.vercel.app/c/owner/'+code]]}})
      window.desktop.getShare = async () => ({...state})
      window.desktop.onShare = listener => { listeners.add(listener); return () => listeners.delete(listener) }
      window.desktop.enableShare = async () => {}
      window.desktop.loginOnline = async ({username,password}) => {
        if (password !== 'secret') return {ok:false,error:'Wrong username or password.'}
        state.account = {username}; emit(); return {ok:true,username}
      }
      window.desktop.logoutOnline = async () => { state.account = null; emit(); return {ok:true} }
      window.desktop.pairFixedLink = async ({code}) => {
        const created = code !== 'arena-pc'
        state.fixed = fixed(code); emit(); return {ok:true,code,created}
      }
    })
    await page.getByRole('button',{name:'score +1',exact:true}).first().click()
    await expect(page.locator('.control .tc .s').first()).toHaveText('1')
    await page.getByRole('button',{name:'🌐 Online link',exact:true}).click()
    const sheet = page.locator('.sheet')
    await sheet.getByLabel('Operator username').fill('owner')
    await sheet.getByLabel('Operator password').fill('wrong')
    await sheet.getByRole('button',{name:'Log in',exact:true}).click()
    await expect(sheet).toContainText('Wrong username or password.')
    await sheet.getByLabel('Operator password').fill('secret')
    await sheet.getByRole('button',{name:'Log in',exact:true}).click()
    await expect(sheet).toContainText('Logged in as owner')
    await expect(sheet.getByLabel('Operator password')).toHaveCount(0)
    // a name this account already has: connects, the game stays
    await sheet.getByLabel('Machine name').fill('arena-pc')
    await sheet.getByRole('button',{name:'Use this name',exact:true}).click()
    await expect(sheet).toContainText('This computer now uses arena-pc.')
    await expect(page.locator('.control .tc .s').first()).toHaveText('1')
    // a new name: a new address and, after the usual New game question (accepted by openControl), a new game
    await sheet.getByLabel('Machine name').fill('Rink 2!')
    await expect(sheet.getByLabel('Machine name')).toHaveValue('rink2')
    await sheet.getByRole('button',{name:'Use this name',exact:true}).click()
    await expect(sheet).toContainText('New address rink2 created.')
    await expect(page.locator('.control .tc .s').first()).toHaveText('0')
    await expect(sheet).toContainText('owner/rink2')
    await sheet.getByRole('button',{name:'Log out',exact:true}).click()
    await expect(sheet.getByLabel('Operator password')).toBeVisible()
  } finally { await native.dispose() }
})

test('desktop Stats mode edits the original goal through the shared-state transport', async ({page,context}) => {
  const native=await setup(context)
  try {
    await openControl(page,uniqueCode('desktop-stats'))
    await page.getByRole('button',{name:'score +1',exact:true}).first().click()
    await page.getByRole('button',{name:'Stats mode',exact:true}).click()
    const editor=page.getByRole('form',{name:'Edit live event'})
    await editor.getByLabel('Goal #',{exact:true}).fill('17')
    await editor.getByRole('button',{name:'Save changes',exact:true}).click()
    await expect(page.locator('.stats-event-list')).toContainText('#17')
    await page.getByRole('button',{name:'📋 Summary',exact:true}).click()
    await expect(page.locator('.sheet pre.summary')).toContainText('#17')
    await expect(page.locator('.sheet pre.summary')).toContainText('HOME 1 – 0 AWAY')
    await page.locator('.sheet').getByRole('button',{name:'Close',exact:true}).click()
    await page.getByRole('button',{name:'Scoreboard mode',exact:true}).click()
    await expect(page.locator('.control .tc .s').first()).toHaveText('1')
  } finally {await native.dispose()}
})
