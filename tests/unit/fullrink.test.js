import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose'
import { verifyAccessToken, bearer, validBoardCode, FULLRINK_ISSUER } from '../../lib/fullrink-auth.js'
import { keyFromShareLink } from '../../lib/share-link.js'
import { createHandler } from '../../api/fullrink.js'

const realm = await generateKeyPair('RS256')
const other = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(realm.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const keys = createLocalJWKSet({ keys: [jwk] })
const token = (claims = {}, key = realm.privateKey) => new SignJWT({ typ: 'Bearer', azp: 'scoreboard-web', name: 'Pai Chanut', ...claims })
  .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(claims.iss || FULLRINK_ISSUER).setSubject('sub' in claims ? claims.sub : 'user-1')
  .setIssuedAt().setExpirationTime(claims.exp || '5m').sign(key)

test('FullRink access tokens are trusted only when signed by the realm, from the right issuer, for this app', async () => {
  assert.deepEqual(await verifyAccessToken(await token(), { keys }), { sub: 'user-1', name: 'Pai Chanut' })
  await assert.rejects(verifyAccessToken(await token({}, other.privateKey), { keys }))           // wrong signature
  await assert.rejects(verifyAccessToken(await token({ iss: 'https://evil.example/realms/fullrink' }), { keys }))
  await assert.rejects(verifyAccessToken(await token({ azp: 'console-web' }), { keys }))          // another app's token
  await assert.rejects(verifyAccessToken(await token({ typ: 'ID' }), { keys }))                    // an ID token
  await assert.rejects(verifyAccessToken(await token({ exp: Math.floor(Date.now() / 1000) - 120 }), { keys }))
  await assert.rejects(verifyAccessToken('', { keys }))
  assert.equal(bearer({ headers: { authorization: 'Bearer abc.def' } }), 'abc.def')
  assert.equal(bearer({ headers: {} }), '')
  assert.equal(validBoardCode('rink-a'), true)
  assert.equal(validBoardCode('../x'), false)
})

const res = () => {
  const r = { code: 0, body: null, headers: {} }
  r.setHeader = (k, v) => { r.headers[k] = v }
  r.status = c => { r.code = c; return r }
  r.json = b => { r.body = b; return r }
  return r
}

test('/api/fullrink uses the verified sub, never one sent by the browser, and the service key only on the server', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, args: JSON.parse(init.body) })
    const name = url.split('/rpc/')[1]
    const out = name === 'fullrink_my_games' ? [{ id: 'rink-a', key: 'k1', title: '', home: 'Bears', away: 'Wolves', updated_at: '2026-11-07T00:00:00Z' }]
      : name === 'fullrink_create_game' ? (init.body.includes('"taken"') ? null : 'newkey')
      : name === 'fullrink_game_key' ? (JSON.parse(init.body).p_id === 'rink-a' ? 'k1' : null) : null
    return { ok: true, status: 200, json: async () => out }
  }
  const env = { VITE_SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' }
  const handler = createHandler({ env, fetchImpl, verify: t => verifyAccessToken(t, { keys }) })
  const auth = { authorization: `Bearer ${await token()}` }

  let r = res(); await handler({ method: 'GET', headers: {}, query: { action: 'mine' } }, r)
  assert.equal(r.code, 401)
  assert.equal(calls.length, 0)

  r = res(); await handler({ method: 'GET', headers: auth, query: { action: 'mine', sub: 'someone-else' } }, r)
  assert.equal(r.code, 200)
  assert.equal(r.body.boards[0].id, 'rink-a')
  assert.deepEqual(calls[0].args, { p_sub: 'user-1' })
  assert.equal(calls[0].headers.apikey, 'sb_secret_test')

  const state = { home: { name: 'Home' }, away: { name: 'Away' }, clock: { remainingMs: 1 } }
  r = res(); await handler({ method: 'POST', headers: auth, body: { action: 'create', id: 'rink-b', state, sub: 'someone-else' } }, r)
  assert.deepEqual([r.code, r.body], [200, { id: 'rink-b', key: 'newkey' }])
  assert.equal(calls.at(-1).args.p_sub, 'user-1')
  r = res(); await handler({ method: 'POST', headers: auth, body: { action: 'create', id: 'taken', state } }, r)
  assert.equal(r.code, 409)
  r = res(); await handler({ method: 'POST', headers: auth, body: { action: 'create', id: 'Bad Code!', state } }, r)
  assert.equal(r.code, 400)

  r = res(); await handler({ method: 'GET', headers: auth, query: { action: 'key', id: 'rink-a' } }, r)
  assert.deepEqual([r.code, r.body], [200, { key: 'k1' }])
  r = res(); await handler({ method: 'GET', headers: auth, query: { action: 'key', id: 'not-mine' } }, r)
  assert.equal(r.code, 403)

  // no service key on the server: a clear setup answer, and Supabase is never called with anything else
  const before = calls.length
  r = res(); await createHandler({ env: { VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'anon' }, fetchImpl, verify: t => verifyAccessToken(t, { keys }) })({ method: 'GET', headers: auth, query: { action: 'mine' } }, r)
  assert.equal(r.code, 503)
  assert.equal(r.body.setup, true)
  assert.equal(calls.length, before)
})

test('the locked operator screen accepts a share link or its key, for this board only', () => {
  assert.equal(keyFromShareLink('https://scoreboard.fullrink.com/c/rink-a?k=abc123def', 'rink-a'), 'abc123def')
  assert.equal(keyFromShareLink('https://livebyscoreboard.vercel.app/c/rink-b?k=abc123def', 'rink-a'), '')
  assert.equal(keyFromShareLink('  abc123def ', 'rink-a'), 'abc123def')
  assert.equal(keyFromShareLink('not a key!', 'rink-a'), '')
  assert.equal(keyFromShareLink('', 'rink-a'), '')
})
