import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

test('desktop routes A and B to independent rink windows and C to the center window', () => {
  const require = createRequire(import.meta.url)
  class Window {
    constructor(options) { this.options=options; this.webContents={on(){},setWindowOpenHandler:fn=>{this.open=fn}} }
    loadURL(url) { this.url=url }
    on() {} once() {} maximize() {} show() {} focus() {} isMinimized() {return false}
  }
  const electron = {app:{setPath(){},getPath:()=>'/tmp',getName:()=> 'Scoreboard',requestSingleInstanceLock:()=>true,on(){},whenReady:()=>({then(){}})},BrowserWindow:Window,protocol:{registerSchemesAsPrivileged(){}},screen:{getPrimaryDisplay:()=>({workArea:{},id:1}),getAllDisplays:()=>[{id:1}]}}
  const context = {require:name=>name==='electron'?electron:name.startsWith('./')?{}:require(name),URL,__dirname:'/desktop',module:{exports:{}}}
  const source=readFileSync(new URL('../../desktop/main.cjs',import.meta.url),'utf8')
  vm.runInNewContext(source+`;openControl();module.exports={control,openRinkDisplay};`,context)
  const {control,openRinkDisplay}=context.module.exports
  control.open({url:'app://scoreboard/b/main?rink=a'})
  const a=openRinkDisplay('a')
  control.open({url:'app://scoreboard/b/main?rink=b'})
  const b=openRinkDisplay('b')
  const c=openRinkDisplay(null)
  assert.equal(a.url,'app://scoreboard/b/main?rink=a')
  assert.equal(b.url,'app://scoreboard/b/main?rink=b')
  assert.equal(c.url,'app://scoreboard/b/main')
  assert.notEqual(a,b)
  assert.notEqual(a,c)
  assert.match(a.options.title,/Display A/)
  assert.match(b.options.title,/Display B/)
})
