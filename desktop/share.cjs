// "Online link" for the desktop app: the scoreboard (/b/main) and the OBS banner (/o/main) on a public
// https://….trycloudflare.com address, so people can watch from a phone and OBS can use it, plus a
// Telegram message with the link. Off until the operator turns it on in Control → 🌐 Online link.
//
// 1. A small web server on 127.0.0.1 serves the app read-only: the display pages and their files, and the
//    live game state (pushed here by the control window, see preload.cjs) by long polling: a viewer asks
//    for anything newer than what it has and the request waits until the game changes (quick tunnels
//    don't carry Server-Sent Events).
//    The control page, the logo page and everything else are not served: the link can only watch.
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

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = decodeURIComponent(url.pathname)
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }

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

  // only the watching pages: everything else goes to the scoreboard
  const page = /^\/(b|o)\/[\w-]+$/.test(p) || p === '/board' || p === '/banner'
  let file = path.normalize(path.join(WEB, p))
  const isFile = !page && file.startsWith(WEB + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
  if (!page && !isFile) { res.writeHead(302, { Location: '/b/main' }).end(); return }
  if (page) file = path.join(WEB, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': page ? 'no-cache' : 'public, max-age=3600' })
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

const message = url => {
  const s = games.get('main')
  const match = s ? `${s.home?.name || 'HOME'} vs ${s.away?.name || 'AWAY'}\n` : ''
  return `🏒 Live by Scoreboard is online\n${match}Scoreboard: ${url}/b/main\nOBS banner: ${url}/o/main`
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
