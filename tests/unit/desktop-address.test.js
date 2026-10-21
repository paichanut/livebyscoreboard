import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desktopAddress } from '../../lib/desktop-address.js'

test('account-scoped desktop addresses stay separate from ordinary cloud game ids', () => {
  assert.deepEqual(desktopAddress('/c/owner/arena-pc'), {kind:'c',username:'owner',code:'arena-pc',namespaced:true})
  assert.deepEqual(desktopAddress('/b/cloud-game'), {kind:'b',username:'',code:'cloud-game',namespaced:false})
  assert.equal(desktopAddress('/login'), null)
  for (const path of ['/b/owner/pc/extra','/c/owner%2Fother/arena-pc','/b/%/arena-pc','/b/owner/!!']) assert.deepEqual(desktopAddress(path), {invalid:true})
})
