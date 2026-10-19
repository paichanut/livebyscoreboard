// "Online link" for the desktop app: the scoreboard (/b/main) and the OBS banner (/o/main) on a public
// https://….trycloudflare.com address, so people can watch from a phone and OBS can use it, plus a
// Telegram message with the link. Off until the operator turns it on in Control → 🌐 Online link.
//
// 1. A small web server on 127.0.0.1 serves the app read-only: the display pages and their files, and the
//    live game state (pushed here by the control window, see preload.cjs) by long polling: a viewer asks
//    for anything newer than what it has and the request waits until the game changes (quick tunnels
//    don't carry Server-Sent Events).
//    Controllers (/c/main, ?rink=a|b) are served too: through the tunnel only after logging in with a Live by
//    Scoreboard operator account (a browser already logged in to the web app goes straight through:
//    livebyscoreboard.vercel.app/handoff gives a one-time code, /auth redeems it via /api/handoff). Their
//    changes (POST /api/state/<id>) go to the control window, which stays the one place the game lives.
//    On this computer (127.0.0.1, no tunnel) no login is needed. Other pages are not served.
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
let settings = { enabled: false, telegram: { botToken: '', chatId: '' } }
let status = { state: 'off', url: '', telegram: '' }
const games = new Map() // game id → latest state, from the control window
const waiters = new Map() // game id → Set of long-poll requests waiting for a newer state
const POLL_MS = 25_000
const WEB_APP = 'https://livebyscoreboard.vercel.app'
const SESSION_MS = 12 * 60 * 60_000
const sessions = new Map() // cookie value → { username, expires } for controllers opened through the tunnel
const MAX_BODY = 20 * 1024 * 1024
let port = 0
let tunnel = null
let retryTimer = null
let sentUrl = ''

// ---------- settings (data folder, never in the game state: the bot token is a secret) ----------
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) } } catch {}
  settings.telegram = { botToken: '', chatId: '', ...settings.telegram }
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
const tunnelOrigin = req => {
  const host = String(req.headers.host || '')
  return /^[a-z0-9-]+\.trycloudflare\.com$/.test(host) ? `https://${host}` : ''
}
const safeNext = n => (/^\/c\/[\w-]+(\?[\w=&-]*)?$/.test(n || '') ? n : '/c/main')
function page(res, status, title, text) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font:16px system-ui;background:#0b0f14;color:#e8edf2;padding:40px;text-align:center"><h2>${title}</h2><p>${text}</p></body>`)
}

// /auth?code=…&next=/c/main: the one-time code from the web app's /handoff → a session cookie for this link
async function auth(req, res, url) {
  const next = safeNext(url.searchParams.get('next'))
  try {
    const r = await net.fetch(`${WEB_APP}/api/handoff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: url.searchParams.get('code') || '' }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.username) return page(res, 403, 'Login failed', 'Open the controller link again (codes last 60 seconds).')
    const sid = require('node:crypto').randomBytes(24).toString('hex')
    sessions.set(sid, { username: j.username, expires: Date.now() + SESSION_MS })
    res.writeHead(302, { 'Set-Cookie': `lbs_sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`, Location: next })
    res.end()
  } catch {
    page(res, 502, 'No internet', 'Logging in needs the internet. Try again in a moment.')
  }
}

// POST /api/state/<id> { state }: a controller's change → the control window (it saves, shows and publishes it)
function receiveState(req, res, id) {
  if (!controllerAllowed(req)) { res.writeHead(401).end(); return }
  let size = 0
  const chunks = []
  req.on('data', c => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c) })
  req.on('end', () => {
    let state
    try { state = JSON.parse(Buffer.concat(chunks).toString('utf8')).state } catch {}
    if (!state || typeof state !== 'object' || !state.clock) { res.writeHead(400).end(); return }
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('share:remote', id, state)
    sendJson(res, { ok: true })
  })
}

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = decodeURIComponent(url.pathname)
  const post = /^\/api\/state\/([\w-]+)$/.exec(p)
  if (req.method === 'POST' && post) return receiveState(req, res, post[1])
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
  if (p === '/auth') return auth(req, res, url)

  // GET /api/state/main?v=<updatedAt the viewer has>: answers at once with a newer state, else waits for
  // one (up to POLL_MS) and then answers { now } only. `now` is this computer's clock (viewers sync to it).
  const poll = /^\/api\/state\/([\w-]+)$/.exec(p)
  if (poll) {
    const id = poll[1]
    const v = Number(url.searchParams.get('v')) || 0
    const cur = games.get(id)
    if (cur && cur.updatedAt !== v) return sendJson(res, { now: Date.now(), state: cur })
    if (!waiters.has(id)) waiters.set(id, new Set())
    const w = { res, timer: setTimeout(() => { waiters.get(id)?.delete(w); sendJson(res, { now: Date.now() }) }, POLL_MS) }
    waiters.get(id).add(w)
    req.on('close', () => { clearTimeout(w.timer); waiters.get(id)?.delete(w) })
    return
  }

  // controllers: log in through the web app first when this comes through the tunnel
  const control = /^\/c\/[\w-]+$/.test(p)
  if (control && !controllerAllowed(req)) {
    const origin = tunnelOrigin(req)
    if (!origin) return page(res, 403, 'Not available', 'Open the controller from the link the app sent.')
    const next = p + url.search
    res.writeHead(302, { Location: `${WEB_APP}/handoff?to=${encodeURIComponent(origin)}&next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' })
    res.end()
    return
  }
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
  const ws = waiters.get(id)
  if (!ws) return
  waiters.delete(id)
  for (const w of ws) { clearTimeout(w.timer); sendJson(w.res, { now: Date.now(), state }) }
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
  const run = small
    ? [['Center controller (clock + both rinks)', `${url}/c/main`], [`Controller ${rA}`, `${url}/c/main?rink=a`], [`Controller ${rB}`, `${url}/c/main?rink=b`]]
    : [['Controller', `${url}/c/main`]]
  return { watch, run, s }
}

const message = url => {
  const { watch, run, s } = links(url)
  const match = s ? `${s.home?.name || 'HOME'} vs ${s.away?.name || 'AWAY'}${s.rinkB && s.opts?.smallIce ? ` · ${s.rinkB.home?.name} vs ${s.rinkB.away?.name}` : ''}\n` : ''
  const list = rows => rows.map(([label, link]) => `${label}: ${link}`).join('\n')
  return `🏒 Live by Scoreboard is online\n${match}\nWatch:\n${list(watch)}\n\nRun the game (log in with your Live by Scoreboard account):\n${list(run)}`
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
  ipcMain.handle('share:open', (_e, url) => { if (/^https:\/\/[-a-z0-9]+\.trycloudflare\.com\//.test(url)) shell.openExternal(url) })

  if (settings.enabled) startTunnel()
}

function stopShare() {
  stopTunnel()
}

module.exports = { initShare, stopShare }
