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
        const data = body.action === 'register' ? {version:2,machineId:body.machineId,username:'owner',code:'arena-pc',key:'private-key',nonce:'a'.repeat(32)} : {ok:true}
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
    unavailable = true
    let result = await second.handlers.get('share:pair')(null,{code:'arena-pc',username:'owner',password:'fixture-password'})
    assert.equal(result.ok,false)
    assert.equal(second.inspect().fixed,undefined)
    assert.match(second.inspect().controlKey,/^[0-9a-f]{24}$/)
    unavailable = false
    result = await second.handlers.get('share:pair')(null,{code:'arena-pc',username:'owner',password:'fixture-password'})
    assert.equal(result.ok,true)
    assert.equal(second.inspect().machineId,id)
    const disk = fs.readFileSync(path.join(directory,'share.json'),'utf8')
    assert.ok(!disk.includes('fixture-password'))
    assert.ok(!disk.includes('token'))
    const third = await start()
    assert.equal(third.inspect().machineId,id)
    assert.equal(third.inspect().controlKey,controllerKey('private-key','a'.repeat(32)))
    assert.ok(requests.some(body=>body.action==='publish' && body.version===2 && body.machineId===id && body.url===''))
    const paired = await third.handlers.get('share:get')()
    assert.equal(paired.fixed.username,'owner')
    assert.equal(paired.fixed.links.run[0][1],'https://livebyscoreboard.vercel.app/c/owner/arena-pc')
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
