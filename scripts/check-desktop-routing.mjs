// Read-only smoke test against a cloud-configured deployment. The desktop registry responses
// and tunnel pages are mocked in this browser only; no games or registrations are written.
// LBS_SITE=https://livebyscoreboard.vercel.app PW_CHROMIUM_PATH=... node scripts/check-desktop-routing.mjs
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const site = process.env.LBS_SITE || 'https://livebyscoreboard.vercel.app'
const browser = await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || undefined})
try {
  for (const scenario of ['watch','logged-out','logged-in','offline','unsafe-url','wrong-owner','missing','legacy-watch']) {
    const context = await browser.newContext()
    if (['logged-in','offline','wrong-owner'].includes(scenario)) await context.addInitScript(() => localStorage.setItem('rinkboard:session','test-session'))
    const page = await context.newPage()
    let controlRequest = null
    await page.route('**/api/desktop-link**', async route => {
      const request = route.request()
      if (request.method() === 'POST') controlRequest = request.postDataJSON()
      const kind = request.method() === 'POST' ? 'c' : 'b'
      const requested = new URL(request.url())
      if (scenario !== 'legacy-watch' && request.method() === 'GET') assert.equal(requested.searchParams.get('username'),'owner')
      if (scenario === 'wrong-owner' && kind === 'c') return route.fulfill({status:403,json:{desktop:true,error:'Sign in with the account that owns this desktop.'}})
      if (scenario === 'missing') return route.fulfill({status:404,json:{desktop:false,error:'Desktop not found.'}})
      await route.fulfill({json:{desktop:true,online:scenario !== 'offline',url:scenario === 'unsafe-url' ? 'https://invalid.example/' : `https://fixture.trycloudflare.com/${kind}/main?rink=a${kind === 'c' ? '&key=test-key' : ''}`}})
    })
    await page.route('https://fixture.trycloudflare.com/**',route => route.fulfill({contentType:'text/html',body:'<h1>Connected desktop fixture</h1>'}))
    await page.goto(`${site}/${['logged-in','logged-out','offline','wrong-owner'].includes(scenario) ? 'c' : 'b'}/${scenario === 'legacy-watch' ? '' : 'owner/'}routing-fixture?rink=a`)
    if (['watch','logged-in','legacy-watch'].includes(scenario)) {
      await page.waitForURL('https://fixture.trycloudflare.com/**')
      assert.match(await page.locator('h1').textContent(),/Connected desktop/)
      if (scenario === 'logged-in') assert.deepEqual({kind:controlRequest.kind,token:controlRequest.token,rink:controlRequest.rink,username:controlRequest.username,version:controlRequest.version},{kind:'c',token:'test-session',rink:'a',username:'owner',version:2})
    } else if (scenario === 'logged-out') {
      await page.waitForURL('**/login?next=*')
      assert.equal(new URL(page.url()).searchParams.get('next'),'/c/owner/routing-fixture?rink=a')
      assert.equal(new URL(page.url()).searchParams.get('account'),'owner')
    } else {
      await page.getByRole('heading',{name:scenario === 'offline' ? 'Desktop is offline' : 'Connection unavailable'}).waitFor()
      assert.equal(new URL(page.url()).origin,new URL(site).origin)
      if (scenario === 'wrong-owner') assert.match(await page.getByRole('link',{name:'Sign in with the owning account'}).getAttribute('href'), /account=owner/)
      if (scenario === 'missing') await page.getByText('Desktop not found.').waitFor()
    }
    console.log('PASS desktop route:',scenario)
    await context.close()
  }
  for (const signedIn of [false,true]) {
    const context = await browser.newContext()
    if (signedIn) await context.addInitScript(() => {
      localStorage.setItem('rinkboard:session','other-token')
      localStorage.setItem('rinkboard:user','other')
    })
    const page = await context.newPage()
    await page.route('https://fixture.supabase.co/rest/v1/rpc/operator_check', route=>route.fulfill({json:true}))
    await page.route('https://fixture.supabase.co/rest/v1/rpc/operator_logout', route=>route.fulfill({json:null}))
    await page.goto(site+'/login?account=owner&next=%2Fc%2Fowner%2Farena-pc')
    if (signedIn) {
      await page.getByRole('button',{name:'Switch account'}).click()
      assert.equal(await page.getByRole('link',{name:'Continue',exact:true}).count(),0)
    }
    await page.locator('#login-user').waitFor()
    assert.equal(await page.locator('#login-user').inputValue(),'owner')
    assert.equal(await page.locator('#login-user').getAttribute('readonly'),'')
    console.log('PASS owner login:',signedIn ? 'switch account' : 'prefill')
    await context.close()
  }
} finally { await browser.close() }
