// Updates from GitHub Releases (published by .github/workflows/desktop.yml).
// Setup .exe (NSIS) installs: download in the background, install when the app closes or on "Restart to update";
// never on its own in the middle of a game. .msi / portable copies can't replace themselves: they only check
// latest.yml and offer the download page. No internet → nothing happens, the app works as before.
// Only builds of this app's licence year: a build with "expires": "2026-…" reads 2026.yml (the workflow publishes
// <year>.yml next to latest.yml), so a 2026 copy never updates itself into a later licence; that one is
// installed by hand. Once the licence has ended there are no updates at all (main.cjs doesn't start this).
const { app, ipcMain, net, shell, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const PAGE = 'https://github.com/paichanut/livebyscoreboard/releases/latest'
const CHANNEL = String(require('./package.json').expires || '').slice(0, 4) || 'latest'
let state = { version: app.getVersion(), status: 'idle' }
let updater = null

function set(patch) {
  state = { ...state, ...patch }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update', state)
}

const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

// installed with the Setup .exe: the NSIS uninstaller sits next to the app
const isNsisInstall = () => app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE
  && fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`))

function autoUpdater() {
  const { autoUpdater: u } = require('electron-updater')
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.channel = CHANNEL
  u.allowDowngrade = false // setting the channel turns it on
  u.on('checking-for-update', () => set({ status: 'checking' }))
  u.on('update-not-available', () => set({ status: 'none' }))
  u.on('update-available', i => set({ status: 'downloading', newVersion: i.version, percent: 0 }))
  u.on('download-progress', p => set({ status: 'downloading', percent: Math.round(p.percent) }))
  u.on('update-downloaded', i => set({ status: 'ready', newVersion: i.version }))
  // the newest release has no <year>.yml: it's a later licence year, nothing for this copy
  u.on('error', e => { if (state.status !== 'ready') set({ status: e?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' ? 'none' : 'error' }) })
  return u
}

async function checkManual() {
  set({ status: 'checking' })
  try {
    const res = await net.fetch(`${PAGE}/download/${CHANNEL}.yml`)
    if (res.status === 404) return set({ status: 'none' })
    if (!res.ok) throw new Error(String(res.status))
    const v = /^version:\s*['"]?([\d.]+)/m.exec(await res.text())?.[1]
    set(v && newer(v, state.version) ? { status: 'available', newVersion: v } : { status: 'none' })
  } catch {
    set({ status: 'error' })
  }
}

async function check() {
  if (!app.isPackaged) return set({ status: 'dev' })
  if (['checking', 'downloading', 'ready'].includes(state.status)) return
  if (!updater) return checkManual()
  try { await updater.checkForUpdates() } catch (e) { set({ status: e?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' ? 'none' : 'error' }) }
}

// beforeInstall: let main.cjs close its windows for real (the scoreboard window normally only hides)
function initUpdates({ beforeInstall }) {
  if (isNsisInstall()) updater = autoUpdater()
  state.mode = updater ? 'auto' : 'manual'
  ipcMain.handle('update:get', () => state)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:download', () => shell.openExternal(PAGE))
  ipcMain.handle('update:install', () => {
    if (!updater || state.status !== 'ready') return
    beforeInstall()
    updater.quitAndInstall(true, true)
  })
  setTimeout(check, 5000)
}

module.exports = { initUpdates }
