import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { mergeGame } from '../../desktop/merge-game.mjs'
import { controllerKey } from '../../lib/desktop-links.js'

test('desktop exposes account-scoped A/B/C links but sends only Cloudflare links to Telegram', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../../desktop/share.cjs',import.meta.url),'utf8')
  const context = {module:{exports:{}},require:name => name === 'electron' ? {BrowserWindow:{getAllWindows:()=>[]}} : require(name),process,Buffer,URL,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout}
  vm.runInNewContext(source + `
    settings = {enabled:true,controlKey:'dynamic-secret',telegram:{},fixed:{version:2,username:'owner',code:'arena-pc',key:'private-pairing-key',nonce:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}};
    status = {url:'https://current.trycloudflare.com'};
    games.set('main',{home:{name:'HOME'},away:{name:'AWAY'},opts:{smallIce:true},rinkB:{}});
    module.exports.preview = {state:publicState(),text:message(status.url),derived:fixedControlKey()};`,context)
  const {state,text,derived} = context.module.exports.preview
  assert.equal(derived,controllerKey('private-pairing-key','a'.repeat(32)))
  assert.ok(!JSON.stringify(state).includes('private-pairing-key'))
  assert.ok(!JSON.stringify(state).includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
  for (const [label,suffix] of [['A','?rink=a'],['B','?rink=b'],['C','']]) {
    assert.ok(state.fixed.links.watch.some(([name,url]) => name.startsWith('Display '+label) && url === 'https://livebyscoreboard.vercel.app/b/owner/arena-pc'+suffix))
    assert.ok(state.links.watch.some(([name,url]) => name.startsWith('Display '+label) && url === 'https://current.trycloudflare.com/b/main'+suffix))
  }
  assert.ok(!text.includes('vercel.app'))
  assert.ok(!text.includes('private-pairing-key'))
  assert.ok(!text.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
  assert.ok(state.fixed.links.run.some(([,url]) => url === 'https://livebyscoreboard.vercel.app/c/owner/arena-pc'))
  assert.ok(text.includes('https://current.trycloudflare.com/c/main?key=dynamic-secret'))
})

test('installation identity survives restarts and failed pairing leaves Cloudflare sharing usable', async () => {
  const require = createRequire(import.meta.url)
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'lbs-pairing-'))
  const source = readFileSync(new URL('../../desktop/share.cjs',import.meta.url),'utf8')
  let unavailable = false
  const requests = []
  const start = async () => {
    const handlers = new Map()
    const electron = {
      app:{getPath:()=>directory}, BrowserWindow:{getAllWindows:()=>[]},
      ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},
      net:{fetch:async (_url, options) => {
        const body = JSON.parse(options.body); requests.push(body)
        if (unavailable) return {ok:false,json:async()=>({error:'Permanent desktop links need setup on the server.'})}
        if (body.action === 'session' && body.token !== 'owner-session') return {ok:false,status:401,json:async()=>({error:'Operator login required.'})}
        if (body.action === 'login' && body.password !== 'fixture-password') return {ok:false,status:401,json:async()=>({error:'Wrong username or password.'})}
        const data = body.action === 'register' ? {version:2,machineId:body.machineId,username:'owner',code:body.code,key:'private-key',nonce:'a'.repeat(32),created:body.code !== 'arena-pc'}
          : body.action === 'login' ? {token:'owner-session',username:'owner'}
          : body.action === 'session' ? {username:'owner'} : {ok:true}
        return {ok:true,json:async()=>data}
      }},
    }
    const context = {importMerge:{mergeGame},module:{exports:{}},require:name=>name==='electron'?electron:require(name),process,Buffer,URL,AbortSignal,setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout}
    vm.runInNewContext(source.replace("await import('./merge-game.mjs')",'importMerge') + '\nstartServer = async () => {}; module.exports.inspect = () => ({...settings});',context)
    await context.module.exports.initShare({webDir:directory})
    return {handlers,inspect:context.module.exports.inspect}
  }
  try {
    const first = await start()
    const id = first.inspect().machineId
    assert.match(id,/^[0-9a-f-]{36}$/)
    const second = await start()
    assert.equal(second.inspect().machineId,id)
    let result = await second.handlers.get('share:pair')(null,{code:'arena-pc'})
    assert.equal(result.ok,false, 'a machine name needs the login first')
    assert.equal((await second.handlers.get('share:login')(null,{username:'owner',password:'wrong'})).ok,false)
    result = await second.handlers.get('share:login')(null,{username:'owner',password:'fixture-password'})
    assert.equal(result.username,'owner')
    assert.equal((await second.handlers.get('share:get')()).account.username,'owner')
    assert.ok(!JSON.stringify(await second.handlers.get('share:get')()).includes('owner-session'), 'the page never sees the session token')
    unavailable = true
    result = await second.handlers.get('share:pair')(null,{code:'arena-pc'})
    assert.equal(result.ok,false)
    assert.equal(second.inspect().fixed,undefined)
    assert.match(second.inspect().controlKey,/^[0-9a-f]{24}$/)
    unavailable = false
    result = await second.handlers.get('share:pair')(null,{code:'arena-pc'})
    assert.equal(result.ok,true)
    assert.equal(result.created,false)
    assert.equal(requests.at(-2).token,'owner-session', 'registers with the kept login, no password')
    assert.equal(second.inspect().machineId,id)
    const disk = fs.readFileSync(path.join(directory,'share.json'),'utf8')
    assert.ok(!disk.includes('fixture-password'))
    assert.ok(disk.includes('owner-session'), 'the login stays until Log out')
    const third = await start()
    assert.equal((await third.handlers.get('share:get')()).account.username,'owner', 'still logged in after a restart')
    result = await third.handlers.get('share:pair')(null,{code:'rink-two'})
    assert.equal(result.created,true, 'a new machine name is a new address')
    assert.equal((await third.handlers.get('share:get')()).fixed.code,'rink-two')
    result = await third.handlers.get('share:pair')(null,{code:'arena-pc'})
    assert.equal(third.inspect().machineId,id)
    assert.equal(third.inspect().controlKey,controllerKey('private-key','a'.repeat(32)))
    assert.ok(requests.some(body=>body.action==='publish' && body.version===2 && body.machineId===id && body.url===''))
    const paired = await third.handlers.get('share:get')()
    assert.equal(paired.fixed.username,'owner')
    assert.equal(paired.fixed.links.run[0][1],'https://livebyscoreboard.vercel.app/c/owner/arena-pc')
    await third.handlers.get('share:logout')()
    assert.equal((await third.handlers.get('share:get')()).account,null)
    assert.ok(requests.some(body=>body.action==='logout' && body.token==='owner-session'))
    assert.ok(!fs.readFileSync(path.join(directory,'share.json'),'utf8').includes('owner-session'))
    assert.equal((await third.handlers.get('share:get')()).fixed.code,'arena-pc', 'the address keeps working after Log out')
    const file = path.join(directory,'share.json')
    fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),account:{username:'owner',token:'ended-session'}}))
    const fourth = await start()
    await new Promise(resolve => setTimeout(resolve,20))
    assert.equal((await fourth.handlers.get('share:get')()).account,null, 'a session that ended on the server asks for the login again')
  } finally { fs.rmSync(directory,{recursive:true,force:true}) }
})

test('desktop serializes remote corrections and rejects stale edits before publishing',async()=>{
  const require=createRequire(import.meta.url),{EventEmitter}=require('node:events')
  const source=readFileSync(new URL('../../desktop/share.cjs',import.meta.url),'utf8')
  let state={home:{score:1},events:[{id:'goal',type:'goal',scorer:''}]}
  let api
  const electron={BrowserWindow:{getAllWindows:()=>[{webContents:{send:(name,id,patch)=>{
    if(name!=='share:remote')return
    setTimeout(()=>{state={...state,...patch};api.publish(id,state)},5)
  }}}]}}
  const context={importMerge:{mergeGame},module:{exports:{}},require:name=>name==='electron'?electron:require(name),process,Buffer,URL,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout}
  vm.runInNewContext(source+"\nmergeGame=importMerge.mergeGame;module.exports={receiveState,publish};",context)
  api=context.module.exports;api.publish('main',state)
  const post=(patch,base)=>new Promise(resolve=>{
    const req=new EventEmitter();req.headers={}
    const res={status:200,writeHead(code){this.status=code;return this},end(body){resolve({status:this.status,body})}}
    api.receiveState(req,res,'main');req.emit('data',Buffer.from(JSON.stringify({patch,base})));req.emit('end')
  })
  const base={events:state.events}
  const [a,b]=await Promise.all([post({events:[{id:'goal',type:'goal',scorer:'17'}]},base),post({events:[{id:'goal',type:'goal',scorer:'88'}]},base)])
  assert.equal(a.status,200);assert.equal(b.status,409);assert.equal(state.events[0].scorer,'17')
  const add=await post({events:[...base.events,{id:'shot',type:'shot'}]},base)
  assert.equal(add.status,200)
  assert.equal(state.events.find(e=>e.id==='goal').scorer,'17')
  assert.ok(state.events.some(e=>e.id==='shot'))
})

test('logged in with a machine name, every change of the game is copied online with the desktop clock skew', async () => {
  const require = createRequire(import.meta.url)
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'lbs-cloud-'))
  const source = readFileSync(new URL('../../desktop/share.cjs',import.meta.url),'utf8')
  const rpcs = []
  let online = true, exists = false, sessionEnded = false
  const SKEW = 4000 // this computer's clock is 4 s ahead of the server
  const handlers = new Map()
  const electron = {
    app:{getPath:()=>directory}, BrowserWindow:{getAllWindows:()=>[]},
    ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},
    net:{fetch:async (url, options) => {
      if (!online) throw new Error('offline')
      const body = JSON.parse(options.body)
      const json = data => ({ok:true,status:200,json:async()=>data})
      if (url.endsWith('/api/desktop-link')) {
        if (body.action === 'config') return json({url:'https://db.example',anonKey:'anon'})
        if (body.action === 'login') return json({token:'owner-session',username:'owner'})
        if (body.action === 'register') return json({version:2,machineId:body.machineId,username:'owner',code:body.code,gameId:body.code,key:'private-key',nonce:'a'.repeat(32),created:true})
        if (body.action === 'session') return sessionEnded ? {ok:false,status:401,json:async()=>({error:'Operator login required.'})} : json({username:'owner'})
        return json({ok:true})
      }
      const name = url.split('/').at(-1)
      rpcs.push([name, body])
      if (name === 'server_now') return json(Date.now() - SKEW)
      if (name === 'save_game') return json(exists && !sessionEnded)
      if (name === 'create_game') { const ok = !exists && !sessionEnded; exists = true; return json(ok) }
      throw new Error('unexpected ' + url)
    }},
  }
  const context = {importMerge:{mergeGame},module:{exports:{}},require:name=>name==='electron'?electron:require(name),process,Buffer,URL,AbortSignal,setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout}
  vm.runInNewContext(source.replace("await import('./merge-game.mjs')",'importMerge') + '\nstartServer = async () => {}; module.exports.publish = publish;',context)
  const share = context.module.exports
  await share.initShare({webDir:directory})
  const wait = async test => { for (let i = 0; i < 100 && !(await test()); i++) await new Promise(r => setTimeout(r, 10)) }
  try {
    share.publish('main',{home:{score:0},away:{score:0},updatedAt:1})
    await new Promise(r => setTimeout(r, 30))
    assert.equal(rpcs.length,0,'nothing goes online before the login and a machine name')
    await handlers.get('share:login')(null,{username:'owner',password:'x'})
    await handlers.get('share:pair')(null,{code:'arena-pc'})
    await wait(() => rpcs.some(([name]) => name === 'create_game'))
    const created = rpcs.find(([name]) => name === 'create_game')[1]
    assert.equal(created.p_id,'arena-pc')
    assert.equal(created.p_key,'owner-session')
    assert.equal(created.p_state.desktop.machine,'arena-pc')
    assert.ok(Math.abs(created.p_state.desktop.skew - SKEW) < 200, 'web viewers get this computer\'s clock skew')
    assert.equal((await handlers.get('share:get')()).cloudStatus,'synced')
    // a burst of taps: one save at a time, the newest state last
    for (let score = 1; score <= 5; score++) share.publish('main',{home:{score},away:{score:0},updatedAt:1 + score})
    await wait(() => rpcs.filter(([name]) => name === 'save_game').at(-1)?.[1].p_state.home.score === 5)
    const saves = rpcs.filter(([name]) => name === 'save_game')
    assert.ok(saves.length < 6, 'taps made during a save go together in the next one')
    assert.equal(saves.at(-1)[1].p_state.home.score,5)
    // offline: waits, then sends the newest state again
    online = false
    share.publish('main',{home:{score:6},away:{score:0},updatedAt:9})
    await wait(async () => (await handlers.get('share:get')()).cloudStatus === 'offline')
    assert.equal((await handlers.get('share:get')()).cloudStatus,'offline')
    online = true
    await new Promise(r => setTimeout(r, 10_200))
    assert.equal(rpcs.filter(([name]) => name === 'save_game').at(-1)[1].p_state.home.score,6)
    // the login ended on the server: stops and asks for it again
    sessionEnded = true
    share.publish('main',{home:{score:7},away:{score:0},updatedAt:10})
    await wait(() => false)
    const after = await handlers.get('share:get')()
    assert.equal(after.cloudStatus,'login')
    assert.equal(after.account,null)
  } finally { fs.rmSync(directory,{recursive:true,force:true}) }
})
