import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controllerKey, destination, registryState, tunnelOrigin, validMachineCode } from '../../lib/desktop-links.js'
import handler from '../../api/desktop-link.js'

test('fixed desktop destinations allow only Cloudflare HTTPS and never expose controller keys publicly', () => {
  for (const url of ['http://test.trycloudflare.com', 'https://test.trycloudflare.com.evil.com', 'https://evil.com', 'https://test.trycloudflare.com/x', 'https://user@test.trycloudflare.com']) assert.equal(tunnelOrigin(url), '')
  assert.equal(validMachineCode('arena-pc'), true)
  assert.equal(validMachineCode('../arena'), false)
  const relay = registryState('arena-pc', 'operator', 'a'.repeat(32), 'https://test.trycloudflare.com').desktopRelay
  assert.equal(destination(relay, 'b', { rink: 'a' }), 'https://test.trycloudflare.com/b/main?rink=a')
  assert.equal(destination(relay, 'c'), '')
  const url = new URL(destination(relay, 'c', { rink: 'b' }, 'private'))
  assert.equal(url.searchParams.get('key'), controllerKey('private', relay.nonce))
  assert.notEqual(controllerKey('private', relay.nonce), controllerKey('private', 'b'.repeat(32)))
  assert.ok(!JSON.stringify(relay).includes('private'))
})

test('fixed-link API requires login for controllers, expires offline leases, and checks updates', async () => {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL, oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://db.example'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  let state = registryState('arena-pc', 'operator', 'a'.repeat(32), 'https://test.trycloudflare.com')
  globalThis.fetch = async (url, options = {}) => {
    const args = options.body ? JSON.parse(options.body) : {}
    let value
    if (url.includes('/games?')) value = [{ state }]
    else if (url.endsWith('/operator_check')) value = args.p_token === 'session'
    else if (url.endsWith('/get_game_key')) value = 'private'
    else if (url.endsWith('/save_game')) { value = args.p_key === 'private'; if (value) state = args.p_state }
    else throw Error('Unexpected call: ' + url)
    return { ok: true, json: async () => value }
  }
  const call = async (method, input) => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
    await handler({method,query:method === 'GET' ? input : {},body:method === 'POST' ? input : {}},res)
    return res
  }
  try {
    let r = await call('GET',{code:'arena-pc',kind:'b'})
    assert.equal(r.body.url, 'https://test.trycloudflare.com/b/main')
    assert.ok(!JSON.stringify(r.body).includes('private'))
    r = await call('GET',{code:'arena-pc',kind:'c'})
    assert.equal(r.statusCode,401)
    r = await call('POST',{code:'arena-pc',kind:'c',token:'session'})
    assert.equal(r.statusCode,200)
    assert.ok(new URL(r.body.url).searchParams.has('key'))
    r = await call('POST',{code:'arena-pc',action:'publish',machineKey:'wrong',nonce:'a'.repeat(32),url:'https://other.trycloudflare.com'})
    assert.equal(r.statusCode,403)
    state.desktopRelay.seenAt = Date.now()-180001
    r = await call('GET',{code:'arena-pc',kind:'b'})
    assert.equal(r.body.online,false)
    assert.equal(r.body.url,undefined)
  } finally {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL=oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY=oldKey
  }
})
