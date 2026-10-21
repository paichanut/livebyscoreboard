// Read-only smoke test against a cloud-configured deployment. The desktop registry responses
// and tunnel pages are mocked in this browser only; no games or registrations are written.
// LBS_SITE=https://livebyscoreboard.vercel.app PW_CHROMIUM_PATH=... node scripts/check-desktop-routing.mjs
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const site = process.env.LBS_SITE || 'https://livebyscoreboard.vercel.app'
const browser = await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || undefined})
try {
  for (const scenario of ['watch','logged-out','logged-in','offline','unsafe-url']) {
    const context = await browser.newContext()
    if (['logged-in','offline'].includes(scenario)) await context.addInitScript(() => localStorage.setItem('rinkboard:session','test-session'))
    const page = await context.newPage()
    let controlRequest = null
    await page.route('**/api/desktop-link**', async route => {
      const request = route.request()
      if (request.method() === 'POST') controlRequest = request.postDataJSON()
      const kind = request.method() === 'POST' ? 'c' : 'b'
      await route.fulfill({json:{desktop:true,online:scenario !== 'offline',url:scenario === 'unsafe-url' ? 'https://invalid.example/' : `https://fixture.trycloudflare.com/${kind}/main?rink=a${kind === 'c' ? '&key=test-key' : ''}`}})
    })
    await page.route('https://fixture.trycloudflare.com/**',route => route.fulfill({contentType:'text/html',body:'<h1>Connected desktop fixture</h1>'}))
    await page.goto(`${site}/${['logged-in','logged-out','offline'].includes(scenario) ? 'c' : 'b'}/routing-fixture?rink=a`)
    if (scenario === 'watch' || scenario === 'logged-in') {
      await page.waitForURL('https://fixture.trycloudflare.com/**')
      assert.match(await page.locator('h1').textContent(),/Connected desktop/)
      if (scenario === 'logged-in') assert.deepEqual({kind:controlRequest.kind,token:controlRequest.token,rink:controlRequest.rink},{kind:'c',token:'test-session',rink:'a'})
    } else if (scenario === 'logged-out') {
      await page.waitForURL('**/login?next=*')
      assert.equal(new URL(page.url()).searchParams.get('next'),'/c/routing-fixture?rink=a')
    } else {
      await page.getByRole('heading',{name:scenario === 'offline' ? 'Desktop is offline' : 'Connection unavailable'}).waitFor()
      assert.equal(new URL(page.url()).origin,new URL(site).origin)
    }
    console.log('PASS desktop route:',scenario)
    await context.close()
  }
} finally { await browser.close() }
