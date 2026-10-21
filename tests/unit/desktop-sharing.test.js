import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { controllerKey } from '../../lib/desktop-links.js'

test('desktop exposes and sends fixed plus dynamic A/B/C links without publishing pairing secrets', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../../desktop/share.cjs',import.meta.url),'utf8')
  const context = {module:{exports:{}},require:name => name === 'electron' ? {BrowserWindow:{getAllWindows:()=>[]}} : require(name),process,Buffer,URL,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout}
  vm.runInNewContext(source + `
    settings = {enabled:true,controlKey:'dynamic-secret',telegram:{},fixed:{code:'arena-pc',key:'private-pairing-key',nonce:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}};
    status = {url:'https://current.trycloudflare.com'};
    games.set('main',{home:{name:'HOME'},away:{name:'AWAY'},opts:{smallIce:true},rinkB:{}});
    module.exports.preview = {state:publicState(),text:message(status.url),derived:fixedControlKey()};`,context)
  const {state,text,derived} = context.module.exports.preview
  assert.equal(derived,controllerKey('private-pairing-key','a'.repeat(32)))
  assert.ok(!JSON.stringify(state).includes('private-pairing-key'))
  assert.ok(!JSON.stringify(state).includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
  for (const [label,suffix] of [['A','?rink=a'],['B','?rink=b'],['C','']]) {
    assert.ok(state.fixed.links.watch.some(([name,url]) => name.startsWith('Display '+label) && url === 'https://livebyscoreboard.vercel.app/b/arena-pc'+suffix))
    assert.ok(state.links.watch.some(([name,url]) => name.startsWith('Display '+label) && url === 'https://current.trycloudflare.com/b/main'+suffix))
  }
  assert.ok(text.includes('FIXED VERCEL LINKS:'))
  assert.ok(text.includes('DYNAMIC CLOUDFLARE LINKS:'))
  assert.ok(text.includes('https://livebyscoreboard.vercel.app/c/arena-pc'))
  assert.ok(text.includes('https://current.trycloudflare.com/c/main?key=dynamic-secret'))
  assert.ok(!text.split('DYNAMIC CLOUDFLARE LINKS:')[0].includes('dynamic-secret'))
})
