// "Online link" for the desktop app: the scoreboard (/b/main) and the OBS banner (/o/main) on a public
// https://….trycloudflare.com address, so people can watch from a phone and OBS can use it, plus a
// Telegram message with the link. Off until the operator turns it on in Control → 🌐 Online link.
//
// 1. A small web server on 127.0.0.1 serves the app read-only: the display pages and their files, and the
//    live game state (pushed here by the control window, see preload.cjs) by long polling: a viewer asks
//    for anything newer than what it has and the request waits until the game changes (quick tunnels
//    don't carry Server-Sent Events). Pictures (logos, background) leave the state: each becomes
//    /api/img/<hash>, fetched once and cached, so a change only sends a few KB through the tunnel.
//    GET /api/time answers at once with this computer's clock: viewers sync their game clock to it.
//    Controllers (/c/main, ?rink=a|b) are served too. Through the tunnel the controller link carries this app's
//    secret key (?key=…, only in the links the app shows and sends to Telegram): the first visit swaps it for
//    a cookie on that phone and drops it from the address bar; after that the cookie is enough. Nothing goes
//    through the Live by Scoreboard website. "New controller key" in the sheet makes old links useless.
//    Their changes (POST /api/state/<id>, only the parts of the game they changed) go to the control window,
//    which stays the one place the game lives; the answer waits until the control window has the change.
//    On this computer (127.0.0.1, no tunnel) no key is needed. Other pages are not served.
// 2. cloudflared (Cloudflare's tunnel program, downloaded once into the app's data folder) opens a
//    "quick tunnel" to that server. No Cloudflare account; a new address each time.
// 3. When the address works from the outside (checked, see verify), it is sent to the Telegram chat set up in the sheet.
// No internet: nothing is downloaded or sent, it tries again every minute. The game itself never waits for any of this.
const { app, ipcMain, net, shell, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const SITE = 'https://livebyscoreboard.vercel.app'
const { createHmac, randomUUID } = require('node:crypto')
const fixedControlKey = () => createHmac('sha256',settings.fixed.key).update('desktop-control-v1:' + settings.fixed.nonce).digest('hex').slice(0,24)
let fixedTimer = null
let fixedBusy = false
let fixedPending = false
async function fixedApi(body) {
  const response = await net.fetch(SITE + '/api/desktop-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
  const result = await response.json()
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || 'Fixed link service unavailable.'), { status: response.status })
  return result
}
async function publishFixed() {
  if (!settings.fixed?.key) return
  if (fixedBusy) { fixedPending = true; return }
  fixedBusy = true
  try {
    const r = await fixedApi({action:'publish',...(settings.fixed.version === 2 ? {version:2,machineId:settings.machineId} : {code:settings.fixed.code}),machineKey:settings.fixed.key,nonce:settings.fixed.nonce,url:settings.enabled ? status.url : ''})
    set({fixedStatus:r.ok ? (status.url && settings.enabled ? 'online' : 'offline') : 'error'})
  } catch(e) { set({fixedStatus:e.message}) }
  finally { fixedBusy=false; if (fixedPending) { fixedPending=false; publishFixed() } }
}

// ---------- online game (Pai 2026-10-23) ----------
// Logged in + a machine name: every change of game "main" is also saved to the website as the online game
// settings.fixed.gameId (save_game / create_game with the kept operator session), so /live lists it and
// livebyscoreboard.vercel.app/b/<gameId> (and /b/<user>/<machine>) shows it, Cloudflare link or not.
// The desktop stays the only place the game is run. The copy carries desktop: { username, machine, skew }:
// skew = this computer's clock − the server's, so web viewers derive the same clock as the HDMI screen.
// One save at a time, always the newest state; offline → retried every 10 s.
let cloud = null
let cloudSending = false
let cloudNext = null
let cloudRetry = null
let skew = 0
let skewAt = 0
async function cloudRpc(name, args) {
  if (!cloud) cloud = await fixedApi({ action: 'config' })
  const r = await net.fetch(cloud.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: cloud.anonKey, Authorization: 'Bearer ' + cloud.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw Object.assign(new Error('Online game: server error ' + r.status), { status: r.status })
  return r.json()
}
async function measureSkew() {
  let best = null
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    const server = Number(await cloudRpc('server_now', {}))
    const t1 = Date.now()
    if (Number.isFinite(server) && (!best || t1 - t0 < best.rtt)) best = { rtt: t1 - t0, skew: Math.round((t0 + t1) / 2 - server) }
  }
  if (best) { skew = best.skew; skewAt = Date.now() }
}
const cloudReady = () => Boolean(settings.fixed?.gameId && settings.account?.token)
function syncCloud() {
  const state = games.get('main')
  if (!cloudReady() || !state) return
  cloudNext = state
  if (!cloudSending && !cloudRetry) sendCloud()
}
async function sendCloud() {
  cloudSending = true
  try {
    while (cloudNext && cloudReady()) {
      const state = cloudNext
      cloudNext = null
      if (Date.now() - skewAt > 5 * 60_000) await measureSkew()
      const { gameId, username, code } = settings.fixed
      const copy = { ...state, desktop: { username, machine: code, skew } }
      const args = { p_id: gameId, p_key: settings.account.token, p_state: copy }
      const ok = await cloudRpc('save_game', args) || await cloudRpc('create_game', args)
      if (!ok) {
        // neither saved nor created: the login ended (or the code belongs to a game this account may not change)
        const session = await fixedApi({ version: 2, action: 'session', token: settings.account.token }).catch(e => e)
        if (session?.status === 401) { delete settings.account; saveSettings() }
        set({ cloudStatus: session?.status === 401 ? 'login' : 'error' })
        return
      }
      if (status.cloudStatus !== 'synced') set({ cloudStatus: 'synced' })
    }
  } catch (e) {
    if (!cloudNext) cloudNext = games.get('main')
    if (status.cloudStatus !== 'offline') set({ cloudStatus: 'offline' })
    clearTimeout(cloudRetry)
    cloudRetry = setTimeout(() => { cloudRetry = null; if (!cloudSending) sendCloud() }, 10_000)
  } finally { cloudSending = false }
}

const RETRY_MS = 60_000
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
}
// cloudflared release file per platform (https://github.com/cloudflare/cloudflared/releases)
const CLOUDFLARED = {
  'win32-x64': 'cloudflared-windows-amd64.exe', 'win32-ia32': 'cloudflared-windows-386.exe',
  'linux-x64': 'cloudflared-linux-amd64', 'linux-arm64': 'cloudflared-linux-arm64',
}

let mergeGame = null
let WEB = ''
let settingsFile = ''
let settings = { enabled: false, controlKey: '', telegram: { botToken: '', chatId: '' } }
const newKey = () => require('node:crypto').randomBytes(12).toString('hex')
let status = { state: 'off', url: '', telegram: '' }
const games = new Map() // game id → latest state, from the control window
const slim = new Map() // game id → { seq, json }: that state with pictures as /api/img/<hash>, ready to send
const waiters = new Map() // game id → Set of long-poll requests waiting for a newer state
const acks = new Map() // game id → Set of controller changes waiting for the control window's next state
const imgs = new Map() // hash → { type, data, url } for /api/img/<hash>
const imgHash = new Map() // data: URL → hash
let seq = 0
const BOOT = require('node:crypto').randomBytes(4).toString('hex') // this start of the app: viewers reset when it changes
let license = { unlicensed: false } // main.cjs / license.cjs: pages opened through the link show UNLICENSED too
const POLL_MS = 25_000
const SESSION_MS = 12 * 60 * 60_000
const sessions = new Map() // cookie value → { expires } for controllers opened through the tunnel
const MAX_BODY = 20 * 1024 * 1024
let port = 0
let tunnel = null
let retryTimer = null
let sentUrl = ''

// ---------- settings (data folder, never in the game state: the bot token is a secret) ----------
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) } } catch {}
  settings.telegram = { botToken: '', chatId: '', ...settings.telegram }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(settings.machineId || '')) settings.machineId = randomUUID()
  if (!/^[0-9a-f]{24}$/.test(settings.controlKey || '')) settings.controlKey = newKey()
  saveSettings()
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)) } catch {}
}

// what the control page may see: never the token itself
const publicState = () => ({
  enabled: settings.enabled, ...status, local: port ? `http://127.0.0.1:${port}` : '',
  // the operator login kept by this app (share.json) until Log out; the session token itself never leaves this file
  account: settings.account?.token ? { username: settings.account.username } : null,
  fixed: settings.fixed?.key ? {version:settings.fixed.version || 1,username:settings.fixed.username || '',code:settings.fixed.code,gameId:settings.fixed.gameId || '',links:(({watch,run})=>({watch,run}))(links(SITE,settings.fixed.version === 2 ? encodeURIComponent(settings.fixed.username)+'/'+encodeURIComponent(settings.fixed.code) : settings.fixed.code,false))} : null,
  links: status.url ? (({ watch, run }) => ({ watch, run }))(links(status.url)) : null,
  telegram: { tokenSet: Boolean(settings.telegram.botToken), chatId: settings.telegram.chatId, last: status.telegram },
})
function set(patch) {
  status = { ...status, ...patch }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('share', publicState())
}

// ---------- local web server ----------
function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

// Through the tunnel? cloudflared adds Cloudflare's headers; requests from this computer have none.
const viaTunnel = req => Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray'])
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === name)?.[1]
function controllerAllowed(req) {
  if (!viaTunnel(req)) return true
  const sess = sessions.get(cookie(req, 'lbs_sid') || '')
  return Boolean(sess && sess.expires > Date.now())
}
function page(res, status, title, text) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font:16px system-ui;background:#0b0f14;color:#e8edf2;padding:40px;text-align:center"><h2>${title}</h2><p>${text}</p></body>`)
}
// equal-time compare, so the key can't be guessed letter by letter
const sameKey = k => {
  const a = Buffer.from(String(k || '')), b = Buffer.from(settings.controlKey)
  return a.length === b.length && require('node:crypto').timingSafeEqual(a, b)
}

// ---------- pictures out of the state ----------
const IMG_MIN = 2000 // shorter data: URLs stay inline
const DATA_URL = /^data:([\w/+.-]+);base64,/
function slimValue(v) {
  if (typeof v === 'string') {
    if (v.length < IMG_MIN || !DATA_URL.test(v)) return v
    let h = imgHash.get(v)
    if (!h) {
      h = require('node:crypto').createHash('sha1').update(v).digest('hex')
      imgHash.set(v, h)
      imgs.set(h, { type: DATA_URL.exec(v)[1], data: Buffer.from(v.slice(v.indexOf(',') + 1), 'base64'), url: v })
    }
    return `/api/img/${h}`
  }
  if (Array.isArray(v)) return v.map(slimValue)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slimValue(x)]))
  return v
}
// a controller's change back to the real pictures (the control window keeps data: URLs)
const IMG_PATH = /^\/api\/img\/([0-9a-f]{40})$/
function fatValue(v) {
  if (typeof v === 'string') { const m = IMG_PATH.exec(v); return m && imgs.has(m[1]) ? imgs.get(m[1]).url : v }
  if (Array.isArray(v)) return v.map(fatValue)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fatValue(x)]))
  return v
}
const stateMessage = id => `{"now":${Date.now()},"boot":"${BOOT}","seq":${slim.get(id).seq},"state":${slim.get(id).json}}`
function sendState(res, id) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(stateMessage(id))
}

// POST /api/state/<id> { patch }: the parts of the game a controller changed → the control window (it
// merges, saves, shows and publishes them). Answers with the control window's new state.
function receiveState(req, res, id) {
  if (!controllerAllowed(req)) { res.writeHead(401).end(); return }
  let size = 0
  const chunks = []
  req.on('data', c => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c) })
  req.on('end', async () => {
    let patch, base
    try { const body=JSON.parse(Buffer.concat(chunks).toString('utf8')); patch=body.patch; base=body.base } catch {}
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { res.writeHead(400).end(); return }
    // Serialize remote writes through the authoritative renderer's acknowledgement.
    while (acks.get(id)?.size) await Promise.all([...acks.get(id)].map(a=>a.finished))
    let applyBase
    delete patch.updatedAt
    if (base && typeof base==='object' && mergeGame) {
      const current=games.get(id)
      if (!current) {res.writeHead(409).end();return}
      const currentParts=Object.fromEntries(Object.keys(patch).map(k=>[k,current[k]]))
      applyBase=currentParts
      const merged=mergeGame(fatValue(base),fatValue(patch),currentParts)
      if(merged.conflicts.length){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Another operator changed these details. Review the latest event.'}));return}
      patch=merged.state
    }
    if (!acks.has(id)) acks.set(id, new Set())
    let finish
    const finished = new Promise(resolve=>{finish=resolve})
    const done = (rejected=false) => { finish(); clearTimeout(a.timer); acks.get(id)?.delete(a); if(rejected){res.writeHead(409).end();return} if (slim.has(id)) sendState(res, id); else sendJson(res, { now: Date.now() }) }
    const requestId=require('node:crypto').randomUUID()
    const a = { done, finished, requestId, timer: setTimeout(() => done(true), 3000) }
    acks.get(id).add(a)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('share:remote', id, fatValue(patch), {base:applyBase,requestId})
  })
}

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = decodeURIComponent(url.pathname)
  const post = /^\/api\/state\/([\w-]+)$/.exec(p)
  if (req.method === 'POST' && post) return receiveState(req, res, post[1])
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }

  // this computer's clock, answered at once (viewers measure their offset to it)
  if (p === '/api/time') return sendJson(res, { now: Date.now() })
  if (p === '/api/license') return sendJson(res, license)
  const img = /^\/api\/img\/([0-9a-f]{40})$/.exec(p)
  if (img) {
    const i = imgs.get(img[1])
    if (!i) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'Content-Type': i.type, 'Cache-Control': 'public, max-age=31536000, immutable' })
    res.end(req.method === 'HEAD' ? undefined : i.data)
    return
  }
  // GET /api/state/main?v=<seq the viewer has>: answers at once with a newer state, else waits for
  // one (up to POLL_MS) and then answers { now } only.
  const poll = /^\/api\/state\/([\w-]+)$/.exec(p)
  if (poll) {
    const id = poll[1]
    const v = Number(url.searchParams.get('v')) || 0
    if (slim.has(id) && (slim.get(id).seq !== v || url.searchParams.get('b') !== BOOT)) return sendState(res, id)
    if (!waiters.has(id)) waiters.set(id, new Set())
    const w = { res, timer: setTimeout(() => { waiters.get(id)?.delete(w); sendJson(res, { now: Date.now() }) }, POLL_MS) }
    waiters.get(id).add(w)
    req.on('close', () => { clearTimeout(w.timer); waiters.get(id)?.delete(w) })
    return
  }

  // controllers through the tunnel: the key in the link → a cookie (and the key leaves the address bar)
  const control = /^\/c\/[\w-]+$/.test(p)
  if (control && viaTunnel(req) && url.searchParams.has('key')) {
    if (!sameKey(url.searchParams.get('key'))) return page(res, 403, 'Old link', 'This controller link is no longer valid. Ask for the new one.')
    const sid = require('node:crypto').randomBytes(24).toString('hex')
    sessions.set(sid, { expires: Date.now() + SESSION_MS })
    url.searchParams.delete('key')
    res.writeHead(302, { 'Set-Cookie': `lbs_sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`, Location: p + url.search, 'Cache-Control': 'no-store' })
    res.end()
    return
  }
  if (control && !controllerAllowed(req)) return page(res, 403, 'Controller', 'Open the controller from the link the app sent (Telegram).')
  // the watching pages and the controllers; everything else goes to the scoreboard
  const isPage = control || /^\/(b|o)\/[\w-]+$/.test(p) || p === '/board' || p === '/banner'
  let file = path.normalize(path.join(WEB, p))
  const isFile = !isPage && file.startsWith(WEB + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
  if (!isPage && !isFile) { res.writeHead(302, { Location: '/b/main' }).end(); return }
  if (isPage) file = path.join(WEB, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': isPage ? 'no-cache' : 'public, max-age=3600' })
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(file).pipe(res)
}

function publish(id, state) {
  if (!/^[\w-]+$/.test(id) || !state) return
  games.set(id, state)
  if (id === 'main') syncCloud()
  slim.set(id, { seq: ++seq, json: JSON.stringify(slimValue(state)) })
  for (const a of [...(acks.get(id) || [])]) a.done()
  const ws = waiters.get(id)
  if (!ws) return
  waiters.delete(id)
  for (const w of ws) { clearTimeout(w.timer); sendState(w.res, id) }
}

// A fixed port when free, so OBS on this computer can keep http://127.0.0.1:47615/o/main (works offline too)
const PORT = 47615
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer(serve)
    srv.once('error', () => srv.listen(0, '127.0.0.1'))
    srv.on('listening', () => { port = srv.address().port; resolve() })
    srv.listen(PORT, '127.0.0.1')
  })
}

// ---------- cloudflared ----------
const binPath = () => path.join(app.getPath('userData'), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')

async function ensureCloudflared() {
  const bin = binPath()
  if (fs.existsSync(bin)) return bin
  const file = CLOUDFLARED[`${process.platform}-${process.arch}`]
  if (!file) throw new Error(`no cloudflared for ${process.platform}-${process.arch}`)
  set({ state: 'downloading' })
  const r = await net.fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`)
  if (!r.ok) throw new Error(`download failed (${r.status})`)
  const tmp = `${bin}.part`
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()))
  fs.chmodSync(tmp, 0o755)
  fs.renameSync(tmp, bin)
  return bin
}

function retryLater() {
  clearTimeout(retryTimer)
  if (settings.enabled) retryTimer = setTimeout(startTunnel, RETRY_MS)
}

// ---------- is the link really reachable? ----------
// cloudflared can report "Registered tunnel connection" for an address Cloudflare never activates (no DNS
// record, error 1016 at the edge): the app said "Online" and sent a dead link. So the link counts only
// once it works from the outside: Cloudflare's DNS knows it (asked over DoH first, so this computer's DNS
// doesn't cache a "no such name") and https://<link>/api/time answers. Not within VERIFY_MS → a new tunnel.
const VERIFY_MS = 60_000
const HEALTH_MS = 60_000
const sleep = ms => new Promise(r => setTimeout(r, ms))
let badTunnels = 0 // in a row, for the back-off
async function knownToCloudflare(host) {
  try {
    const r = await net.fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    return j.Status === 0 && (j.Answer || []).length > 0 ? 'yes' : 'no'
  } catch { return 'offline' }
}
async function answers(url) {
  try {
    const r = await net.fetch(`${url}/api/time`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    return r.ok && typeof (await r.json()).now === 'number'
  } catch { return false }
}
async function verify(child, url) {
  const until = Date.now() + VERIFY_MS
  let dns = false
  while (Date.now() < until && tunnel === child) {
    if (!dns) dns = (await knownToCloudflare(new URL(url).hostname)) === 'yes'
    if (dns && await answers(url)) return true
    await sleep(3000)
  }
  return false
}
// while online: the link is checked every minute; 3 failures in a row while the internet works → a new tunnel
// (and the new link goes to Telegram). No internet → just wait, cloudflared reconnects the same link.
function watchHealth(child, url) {
  let fails = 0
  const tick = async () => {
    if (tunnel !== child) return
    if (await answers(url)) fails = 0
    else if ((await knownToCloudflare(new URL(url).hostname)) !== 'offline' && ++fails >= 3) return restartTunnel(child)
    child.health = setTimeout(tick, HEALTH_MS)
  }
  child.health = setTimeout(tick, HEALTH_MS)
}
function restartTunnel(child) {
  child.restart = true
  try { child.kill() } catch {}
}

async function startTunnel() {
  clearTimeout(retryTimer)
  if (!settings.enabled || tunnel) return
  let bin
  try { bin = await ensureCloudflared() } catch { set({ state: 'offline', url: '' }); return retryLater() }
  if (!settings.enabled || tunnel) return
  set({ state: 'starting', url: '' })
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { windowsHide: true })
  tunnel = child
  // cloudflared prints the address before it has reached Cloudflare: the link is checked (verify) once it
  // reports "Registered tunnel connection", and only shown and sent when it works. No connection within a
  // minute → retry.
  let addr = ''
  let checking = false
  const giveUp = setTimeout(() => { if (!checking) try { child.kill() } catch {} }, RETRY_MS)
  const onData = buf => {
    const text = String(buf)
    const m = /https:\/\/[-a-z0-9]+\.trycloudflare\.com/.exec(text)
    if (m) addr = m[0]
    if (addr && /Registered tunnel connection/i.test(text) && !checking) {
      checking = true
      clearTimeout(giveUp)
      set({ state: 'verifying', url: '' })
      const url = addr
      verify(child, url).then(ok => {
        if (tunnel !== child) return
        if (!ok) return restartTunnel(child)
        badTunnels = 0
        set({ state: 'online', url })
        publishFixed().then(() => announce(url))
        watchHealth(child, url)
      })
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('error', () => {})
  child.on('exit', () => {
    clearTimeout(giveUp)
    clearTimeout(child.health)
    if (tunnel !== child) return
    tunnel = null
    if (!settings.enabled) return set({ state: 'off', url: '' })
    if (child.restart) {
      // a link that never worked or stopped working: a new one soon (3 s, 6 s, 12 s … up to a minute)
      set({ state: 'starting', url: '' })
      clearTimeout(retryTimer)
      retryTimer = setTimeout(startTunnel, Math.min(RETRY_MS, 3000 * 2 ** badTunnels++))
    } else { set({ state: 'offline', url: '' }); retryLater() }
  })
}

function stopTunnel() {
  clearTimeout(retryTimer)
  const t = tunnel
  tunnel = null
  if (t) try { t.kill() } catch {}
  set({ state: 'off', url: '' })
  publishFixed()
}

// ---------- Telegram ----------
async function telegram(method, body) {
  const token = settings.telegram.botToken
  const r = await net.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.description || `HTTP ${r.status}`)
  return j.result
}

// every link of the game: what people watch, and the controllers (they log in with a Live by Scoreboard account)
function links(url, code = 'main', secret = true) {
  const s = games.get('main')
  const small = Boolean(s?.opts?.smallIce && s.rinkB)
  const rA = s?.opts?.labels?.rinkA || 'Rink A', rB = s?.opts?.labels?.rinkB || 'Rink B'
  const watch = small
    ? [[`Display A · ${rA}`, `${url}/b/${code}?rink=a`], [`Display B · ${rB}`, `${url}/b/${code}?rink=b`], ['Display C · CENTER (both rinks)', `${url}/b/${code}`]]
    : [['Scoreboard', `${url}/b/${code}`]]
  if (Number(s?.opts?.shiftMs) > 0) watch.push(['Shift clock', `${url}/b/${code}?view=shift`])
  watch.push(...(small ? [[`OBS banner ${rA}`, `${url}/o/${code}?rink=a`], [`OBS banner ${rB}`, `${url}/o/${code}?rink=b`]] : [['OBS banner', `${url}/o/${code}`]]))
  const k = secret ? '?key=' + settings.controlKey : ''
  const run = small
    ? [['Center controller (clock + both rinks)', `${url}/c/${code}${k}`], [`Controller ${rA}`, `${url}/c/${code}?rink=a${secret ? '&key=' + settings.controlKey : ''}`], [`Controller ${rB}`, `${url}/c/${code}?rink=b${secret ? '&key=' + settings.controlKey : ''}`]]
    : [['Controller', `${url}/c/${code}${k}`]]
  return { watch, run, s }
}

const message = url => {
  const { watch, run, s } = links(url)
  const match = s ? `${s.home?.name || 'HOME'} vs ${s.away?.name || 'AWAY'}${s.rinkB && s.opts?.smallIce ? ` · ${s.rinkB.home?.name} vs ${s.rinkB.away?.name}` : ''}\n` : ''
  const list = rows => rows.map(([label, link]) => `${label}: ${link}`).join('\n')
  return `🏒 Live by Scoreboard is online\n${match}\nWatch:\n${list(watch)}\n\nRun the game (keep these links private):\n${list(run)}`
}

async function sendTelegram(url) {
  const { botToken, chatId } = settings.telegram
  if (!botToken || !chatId) return 'not set up'
  try {
    await telegram('sendMessage', { chat_id: chatId, text: message(url), disable_web_page_preview: true })
    return 'sent'
  } catch (e) {
    return `not sent: ${e.message}`
  }
}

async function announce(url) {
  if (sentUrl === url) return
  const r = await sendTelegram(url)
  if (r === 'sent') sentUrl = url
  set({ telegram: r === 'sent' ? `sent ${new Date().toLocaleTimeString()}` : r })
}

// The newest chat that wrote to the bot: send any message to the bot first, then press "Find".
async function findChatId(token) {
  if (token) settings.telegram.botToken = token.trim()
  const updates = await telegram('getUpdates', { limit: 20 })
  const chat = [...updates].reverse().map(u => (u.message || u.channel_post || u.my_chat_member)?.chat).find(Boolean)
  if (!chat) throw new Error('No messages yet: send any message to your bot, then press Find again.')
  settings.telegram.chatId = String(chat.id)
  saveSettings()
  return { chatId: settings.telegram.chatId, name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '' }
}

// ---------- setup ----------
async function initShare({ webDir, license: lic }) {
  ;({mergeGame}=await import('./merge-game.mjs'))
  WEB = webDir
  license = lic || license
  settingsFile = path.join(app.getPath('userData'), 'share.json')
  loadSettings()
  if (settings.fixed?.key) settings.controlKey = fixedControlKey()
  await startServer()
  fixedTimer = setInterval(publishFixed, 60000)
  // Operator login (Pai 2026-10-23): once, then this app stays logged in (30-day server session) until Log out.
  const loggedOut = () => { delete settings.account; saveSettings(); set({ cloudStatus: settings.fixed?.gameId ? 'login' : '' }) }
  ipcMain.handle('share:login', async (_e, credentials) => {
    try {
      const r = await fixedApi({version:2,action:'login',username:String(credentials?.username || ''),password:String(credentials?.password || '')})
      settings.account = { username: r.username, token: r.token }
      saveSettings(); set({ cloudStatus: '' })
      syncCloud()
      return {ok:true,username:r.username}
    } catch(e) { return {ok:false,error:e.message} }
  })
  ipcMain.handle('share:logout', async () => {
    const token = settings.account?.token
    loggedOut()
    if (token) await fixedApi({version:2,action:'logout',token}).catch(() => {})
    return {ok:true}
  })
  // a session ended on the server (expired, or a new password): ask for the login again
  if (settings.account?.token) fixedApi({version:2,action:'session',token:settings.account.token})
    .then(r => { if (r.username !== settings.account?.username && settings.account) { settings.account.username = r.username; saveSettings(); set({}) } })
    .catch(e => { if (e.status === 401) loggedOut() })
  // The machine name works like a game code: a name this account doesn't have yet is created online
  // (created: true → the sheet offers a new game), one it has moves to this computer.
  ipcMain.handle('share:pair', async (_e, request) => {
    if (!settings.account?.token) return {ok:false,error:'Log in first.'}
    try {
      const fixed = await fixedApi({version:2,action:'register',machineId:settings.machineId,code:request?.code,username:settings.account.username,token:settings.account.token})
      if (fixed.version !== 2 || fixed.machineId !== settings.machineId || !fixed.key || !fixed.nonce || !fixed.username || !fixed.code) throw new Error('Could not pair this desktop. Please update the online service.')
      const { created, moved, ...saved } = fixed
      settings.fixed = saved
      settings.controlKey = fixedControlKey()
      saveSettings(); sessions.clear(); sentUrl=''; set({ cloudStatus: '' })
      syncCloud()
      await publishFixed()
      if (status.url) await announce(status.url)
      return {ok:true,code:fixed.code,created:Boolean(created),moved:Boolean(moved)}
    } catch(e) {
      if (e.status === 401) loggedOut()
      return {ok:false,error:e.status === 401 ? 'Log in again: the operator login has ended.' : e.message}
    }
  })

  ipcMain.on('share:reject',(_e,id,requestId)=>{for(const ack of acks.get(id)||[])if(ack.requestId===requestId)ack.done(true)})
  ipcMain.on('share:publish', (_e, id, state) => publish(String(id), state))
  ipcMain.handle('share:get', () => publicState())
  ipcMain.handle('share:enable', (_e, on) => {
    settings.enabled = Boolean(on)
    saveSettings()
    if (settings.enabled) { set({}); startTunnel() } else stopTunnel()
    return publicState()
  })
  ipcMain.handle('share:telegram', (_e, { botToken, chatId }) => {
    if (typeof botToken === 'string' && botToken.trim()) settings.telegram.botToken = botToken.trim()
    if (botToken === null) settings.telegram.botToken = ''
    if (typeof chatId === 'string') settings.telegram.chatId = chatId.trim()
    saveSettings()
    set({})
    return publicState()
  })
  ipcMain.handle('share:findChat', async (_e, token) => {
    try { const r = await findChatId(token); set({}); return { ok: true, ...r } } catch (e) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('share:test', async () => {
    const r = await sendTelegram(status.url || '(no link yet: turn on the online link)')
    set({ telegram: r === 'sent' ? `test sent ${new Date().toLocaleTimeString()}` : r })
    return r
  })
  // new controller key: links sent before stop working, and phones that already opened one are logged out
  ipcMain.handle('share:newKey', () => {
    if (settings.fixed?.key) { settings.fixed.nonce = require('node:crypto').randomBytes(16).toString('hex'); settings.controlKey = fixedControlKey(); publishFixed() }
    else settings.controlKey = newKey()
    saveSettings()
    sessions.clear()
    sentUrl = ''
    set({})
    if (status.url) announce(status.url)
    return publicState()
  })
  ipcMain.handle('share:open', (_e, url) => { if (/^https:\/\/(?:[-a-z0-9]+\.trycloudflare\.com|livebyscoreboard\.vercel\.app)\//.test(url)) shell.openExternal(url) })

  if (settings.enabled) startTunnel()
}

function stopShare() {
  clearInterval(fixedTimer)
  stopTunnel()
}

module.exports = { initShare, stopShare }
