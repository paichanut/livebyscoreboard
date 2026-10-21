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

test('account-scoped API protects controllers, publishes with installation identity, and fails safely before migration', async () => {
  const previous = {fetch:globalThis.fetch,url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_ANON_KEY}
  process.env.VITE_SUPABASE_URL = 'https://db.example'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  const machineId = '12345678-1234-1234-1234-123456789012'
  const relay = {machineId,username:'owner',machine:'arena-pc',nonce:'a'.repeat(32),url:'https://current.trycloudflare.com',seenAt:Date.now()}
  const calls = []
  let missingSchema = false
  globalThis.fetch = async (url, options) => {
    const name = url.split('/').at(-1), args = JSON.parse(options.body)
    calls.push([name,args])
    if (missingSchema) return {ok:false,status:404}
    let value
    if (name === 'desktop_machine_lookup') value = args.p_machine === 'missing' ? null : relay
    else if (name === 'desktop_machine_control') value = args.p_token === 'owner-token' ? {...relay,key:'private'} : {error:'forbidden'}
    else if (name === 'desktop_machine_publish') value = args.p_key === 'private'
    else if (name === 'operator_login') value = args.p_password === 'correct' ? 'owner-token' : null
    else if (name === 'operator_logout') value = null
    else if (name === 'desktop_machine_register') value = {version:2,machineId,username:'owner',code:'arena-pc',key:'private',nonce:relay.nonce}
    else throw new Error('Unexpected RPC: '+name)
    return {ok:true,json:async()=>value}
  }
  const call = async (method,input) => {
    const res = {statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
    await handler({method,query:method==='GET'?input:{},body:method==='POST'?input:{}},res)
    return res
  }
  const address = {username:'owner',code:'arena-pc'}
  try {
    let r = await call('GET',{...address,kind:'b',rink:'b'})
    assert.equal(r.body.url,'https://current.trycloudflare.com/b/main?rink=b')
    assert.ok(!JSON.stringify(r.body).includes('private'))
    r = await call('POST',{version:2,...address,action:'resolve',kind:'c',token:'other-token'})
    assert.equal(r.statusCode,403)
    assert.equal(r.body.url,undefined)
    r = await call('POST',{version:2,...address,action:'resolve',kind:'c',token:'owner-token',rink:'a'})
    assert.equal(r.statusCode,200)
    assert.equal(new URL(r.body.url).searchParams.get('key'),controllerKey('private',relay.nonce))
    assert.equal(new URL(r.body.url).pathname,'/c/main')
    assert.equal((await call('GET',{...address,kind:'c'})).statusCode,401)
    assert.equal((await call('GET',{...address,action:'publish',machineId})).statusCode,400)
    assert.equal((await call('GET',{...address,code:'missing',kind:'b'})).statusCode,404)
    relay.seenAt = Date.now()-180001
    r = await call('GET',{...address,kind:'b'})
    assert.equal(r.body.online,false)
    assert.equal(r.body.url,undefined)
    const publish = {version:2,action:'publish',machineId,machineKey:'private',nonce:relay.nonce,url:relay.url}
    assert.equal((await call('POST',{...publish,machineKey:'wrong'})).statusCode,403)
    assert.equal((await call('POST',publish)).statusCode,200)
    assert.equal((await call('POST',{...publish,url:'https://evil.example'})).statusCode,400)
    r = await call('POST',{version:2,action:'register',...address,machineId,password:'correct'})
    assert.equal(r.body.machineId,machineId)
    assert.equal(calls.at(-1)[0],'operator_logout')
    assert.equal((await call('POST',{version:2,action:'register',...address,machineId,password:'wrong'})).statusCode,401)
    missingSchema = true
    assert.equal((await call('GET',{...address,kind:'b'})).statusCode,503)
  } finally {
    globalThis.fetch=previous.fetch
    for (const [name,value] of [['VITE_SUPABASE_URL',previous.url],['VITE_SUPABASE_ANON_KEY',previous.key]]) {
      if (value===undefined) delete process.env[name]; else process.env[name]=value
    }
  }
})
