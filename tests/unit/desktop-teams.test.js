import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const { createTeamCache } = createRequire(import.meta.url)('../../desktop/teams.cjs')
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="red"/></svg>'
const embedded = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
const team = (id, patch = {}) => ({ id, name: `Team ${id}`, color: '#123456', logo: embedded, updated_at: 'v1', ...patch })
async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'scoreboard-teams-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('downloaded names and logo bytes survive a new cache instance without waiting for internet', async t => {
  const dir = await directory(t)
  const rows = Array.from({ length: 85 }, (_, i) => team(i))
  rows[0].logo = 'https://logos.example/zero.svg'
  const calls = []
  const cache = createTeamCache({ directory: dir, fetch: async url => {
    calls.push(url)
    return url.endsWith('/api/teams') ? Response.json(rows) : new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
  } })
  const list = await cache.list()
  assert.equal(list.length, 85) // The personal-team library's 60-team limit does not apply.
  assert.ok(list.every(t => t.logo === embedded && t.can_edit === false))
  assert.equal(calls.filter(url => !url.endsWith('/api/teams')).length, 1)
  const saved = JSON.parse(await readFile(path.join(dir, 'downloaded-teams.json'), 'utf8'))
  assert.equal(saved.records.length, 85)
  let failNetwork
  const restarted = createTeamCache({ directory: dir, fetch: () => new Promise((_, reject) => { failNetwork = reject }) })
  assert.deepEqual(await restarted.list(), list)
  // Finish the failed background refresh; cached reads still succeed.
  const refresh = restarted.refresh()
  while (!failNetwork) await new Promise(resolve => setImmediate(resolve))
  failNetwork(new Error('offline'))
  await assert.rejects(refresh, /offline/)
  assert.deepEqual(await restarted.list(), list)
})

test('refresh merges renamed and new teams, reuses unchanged images and retains downloaded teams', async t => {
  const dir = await directory(t)
  let rows = [team(1, { logo: 'https://logos.example/one.svg' }), team(2)]
  let downloads = 0
  const updates = []
  const cache = createTeamCache({ directory: dir, onUpdate: teams => updates.push(teams), fetch: async url => {
    if (url.endsWith('/api/teams')) return Response.json(rows)
    downloads++
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
  } })
  await cache.refresh()
  await cache.refresh()
  assert.equal(downloads, 1)
  assert.equal(updates.length, 1)
  rows = [team(1, { name: 'Renamed team', logo: 'https://logos.example/one.svg', updated_at: 'v2' }), team(3)]
  const refreshed = await cache.refresh()
  assert.equal(downloads, 2)
  assert.deepEqual(refreshed.map(t => t.id).sort(), [1, 2, 3])
  assert.equal(refreshed.find(t => t.id === 1).name, 'Renamed team')
  assert.equal(refreshed.filter(t => t.id === 1).length, 1)
})

test('failed refresh and failed logo downloads preserve usable local copies and retry changes', async t => {
  const dir = await directory(t)
  let rows = [team(1)]
  let offline = false
  let badImage = true
  let downloads = 0
  const cache = createTeamCache({ directory: dir, fetch: async url => {
    if (offline) throw new Error('offline')
    if (url.endsWith('/api/teams')) return Response.json(rows)
    downloads++
    if (badImage) return new Response('unavailable', { status: 503 })
    return new Response(svg.replace('red', 'blue'), { headers: { 'Content-Type': 'image/svg+xml' } })
  } })
  await cache.refresh()
  offline = true
  await assert.rejects(cache.refresh(), /offline/)
  assert.equal((await cache.list())[0].logo, embedded)
  offline = false
  rows = [team(1, { name: 'Updated name', logo: 'https://logos.example/new.svg', updated_at: 'v2' })]
  assert.equal((await cache.refresh())[0].logo, embedded)
  badImage = false
  const refreshed = (await cache.refresh())[0]
  assert.equal(refreshed.name, 'Updated name')
  assert.notEqual(refreshed.logo, embedded)
  assert.ok(refreshed.logo.startsWith('data:image/'))
  assert.equal(downloads, 2)
})

test('simultaneous windows share a single download and malformed responses cannot clear the library', async t => {
  const dir = await directory(t)
  let calls = 0
  let rows = [team(1)]
  const cache = createTeamCache({ directory: dir, fetch: async () => { calls++; return Response.json(rows) } })
  const lists = await Promise.all([cache.list(), cache.list(), cache.list()])
  assert.equal(calls, 1)
  assert.deepEqual(lists[0], lists[2])
  rows = { error: 'not a library' }
  await assert.rejects(cache.refresh(), /Invalid team library/)
  assert.deepEqual(await cache.list(), lists[0])
  const pkg = JSON.parse(await readFile(new URL('../../desktop/package.json', import.meta.url), 'utf8'))
  assert.ok(pkg.build.files.includes('teams.cjs'))
})
