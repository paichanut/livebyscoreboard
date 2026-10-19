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
// 3. When the address is known, it is sent to the Telegram chat set up in the sheet.
// No internet: nothing is downloaded or sent, it tries again every minute. The game itself never waits for any of this.
const { app, ipcMain, net, shell, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

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
  if (!/^[0-9a-f]{24}$/.test(settings.controlKey || '')) { settings.controlKey = newKey(); saveSettings() }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)) } catch {}
}

// what the control page may see: never the token itself
const publicState = () => ({
  enabled: settings.enabled, ...status, local: port ? `http://127.0.0.1:${port}` : '',
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
const stateMessage = id => `{"now":${Date.now()},"seq":${slim.get(id).seq},"state":${slim.get(id).json}}`
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
  req.on('end', () => {
    let patch
    try { patch = JSON.parse(Buffer.concat(chunks).toString('utf8')).patch } catch {}
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { res.writeHead(400).end(); return }
    delete patch.updatedAt
    if (!acks.has(id)) acks.set(id, new Set())
    const done = () => { clearTimeout(a.timer); acks.get(id)?.delete(a); if (slim.has(id)) sendState(res, id); else sendJson(res, { now: Date.now() }) }
    const a = { done, timer: setTimeout(() => done(), 3000) }
    acks.get(id).add(a)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('share:remote', id, fatValue(patch))
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
    if (slim.has(id) && slim.get(id).seq !== v) return sendState(res, id)
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

async function startTunnel() {
  clearTimeout(retryTimer)
  if (!settings.enabled || tunnel) return
  let bin
  try { bin = await ensureCloudflared() } catch { set({ state: 'offline', url: '' }); return retryLater() }
  if (!settings.enabled || tunnel) return
  set({ state: 'starting', url: '' })
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { windowsHide: true })
  tunnel = child
  // cloudflared prints the address before it has reached Cloudflare: the link only works (and is only
  // shown and sent) once it reports "Registered tunnel connection". No connection within a minute → retry.
  let addr = ''
  const giveUp = setTimeout(() => { if (status.state !== 'online') try { child.kill() } catch {} }, RETRY_MS)
  const onData = buf => {
    const text = String(buf)
    const m = /https:\/\/[-a-z0-9]+\.trycloudflare\.com/.exec(text)
    if (m) addr = m[0]
    if (addr && /Registered tunnel connection/i.test(text) && status.url !== addr) {
      clearTimeout(giveUp)
      set({ state: 'online', url: addr })
      announce(addr)
    }
  }
  child.on('exit', () => clearTimeout(giveUp))
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('error', () => {})
  child.on('exit', () => {
    if (tunnel !== child) return
    tunnel = null
    if (settings.enabled) { set({ state: 'offline', url: '' }); retryLater() } else set({ state: 'off', url: '' })
  })
}

function stopTunnel() {
  clearTimeout(retryTimer)
  const t = tunnel
  tunnel = null
  if (t) try { t.kill() } catch {}
  set({ state: 'off', url: '' })
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
function links(url) {
  const s = games.get('main')
  const small = Boolean(s?.opts?.smallIce && s.rinkB)
  const rA = s?.opts?.labels?.rinkA || 'Rink A', rB = s?.opts?.labels?.rinkB || 'Rink B'
  const watch = small
    ? [['Center scoreboard', `${url}/b/main`], [`Scoreboard ${rA}`, `${url}/b/main?rink=a`], [`Scoreboard ${rB}`, `${url}/b/main?rink=b`]]
    : [['Scoreboard', `${url}/b/main`]]
  if (Number(s?.opts?.shiftMs) > 0) watch.push(['Shift clock', `${url}/b/main?view=shift`])
  watch.push(...(small ? [[`OBS banner ${rA}`, `${url}/o/main?rink=a`], [`OBS banner ${rB}`, `${url}/o/main?rink=b`]] : [['OBS banner', `${url}/o/main`]]))
  const k = settings.controlKey
  const run = small
    ? [['Center controller (clock + both rinks)', `${url}/c/main?key=${k}`], [`Controller ${rA}`, `${url}/c/main?rink=a&key=${k}`], [`Controller ${rB}`, `${url}/c/main?rink=b&key=${k}`]]
    : [['Controller', `${url}/c/main?key=${k}`]]
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
async function initShare({ webDir }) {
  WEB = webDir
  settingsFile = path.join(app.getPath('userData'), 'share.json')
  loadSettings()
  await startServer()

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
    settings.controlKey = newKey()
    saveSettings()
    sessions.clear()
    sentUrl = ''
    set({})
    if (status.url) announce(status.url)
    return publicState()
  })
  ipcMain.handle('share:open', (_e, url) => { if (/^https:\/\/[-a-z0-9]+\.trycloudflare\.com\//.test(url)) shell.openExternal(url) })

  if (settings.enabled) startTunnel()
}

function stopShare() {
  stopTunnel()
}

module.exports = { initShare, stopShare }
