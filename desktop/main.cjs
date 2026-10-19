// Live by Scoreboard — offline desktop app (Windows .exe via electron-builder).
// One computer, no internet: the control page on the laptop screen, the scoreboard full screen on the
// second screen (HDMI). Both windows share one origin (app://scoreboard), so the web app's same-computer
// store (localStorage + BroadcastChannel) keeps them in sync, and the game survives a restart.
const { app, BrowserWindow, protocol, net, screen, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const WEB = path.join(__dirname, 'web')
const ORIGIN = 'app://scoreboard'
const GAME = 'main'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// Serve the built web app; unknown paths (/c/main, /b/main …) get index.html, like the Vercel rewrite.
function serve(req) {
  const { pathname } = new URL(req.url)
  let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)))
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html')
  return net.fetch(pathToFileURL(file).toString())
}

const webPreferences = { autoplayPolicy: 'no-user-gesture-required', plugins: true, contextIsolation: true, sandbox: true }
let control = null
let display = null
let quitting = false

const external = () => screen.getAllDisplays().find(d => d.id !== screen.getPrimaryDisplay().id)

// Scoreboard: full screen on the HDMI screen if there is one, otherwise a normal window on the laptop
function placeDisplay() {
  if (!display) return
  const ext = external()
  if (ext) {
    display.setFullScreen(false)
    display.setBounds(ext.bounds)
    display.setFullScreen(true)
  } else if (display.isFullScreen()) {
    display.setFullScreen(false)
    const wa = screen.getPrimaryDisplay().workArea
    display.setBounds({ x: wa.x + 60, y: wa.y + 60, width: Math.min(1280, wa.width - 120), height: Math.min(720, wa.height - 120) })
  }
}

function openDisplay() {
  if (display) { display.show(); display.focus(); return display }
  display = new BrowserWindow({
    title: 'Live by Scoreboard — Display', width: 1280, height: 720, backgroundColor: '#0b0f14',
    autoHideMenuBar: true, show: false, webPreferences,
  })
  display.loadURL(`${ORIGIN}/b/${GAME}`)
  // the control window keeps the focus (and the keyboard): on one screen the scoreboard waits behind it
  display.once('ready-to-show', () => {
    placeDisplay()
    display.showInactive()
    if (!external() && control) control.focus()
  })
  // F11 / Esc: full screen on and off (double-click on the board does it too); F2: back to the control
  display.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') { display.setFullScreen(!display.isFullScreen()); e.preventDefault() }
    if (input.key === 'Escape' && display.isFullScreen() && !external()) display.setFullScreen(false)
    if (input.key === 'F2') { showControl(); e.preventDefault() }
  })
  // closing the scoreboard only hides it; the Display button brings it back
  display.on('close', e => { if (!quitting) { e.preventDefault(); display.hide() } })
  display.on('closed', () => { display = null })
  return display
}

function showControl() {
  if (!control) return
  if (display && display.isFullScreen() && !external()) display.setFullScreen(false)
  if (control.isMinimized()) control.restore()
  control.show(); control.focus()
}

function openControl() {
  const wa = screen.getPrimaryDisplay().workArea
  control = new BrowserWindow({
    title: 'Live by Scoreboard — Control', ...wa, backgroundColor: '#0b0f14', autoHideMenuBar: true, webPreferences,
  })
  control.maximize()
  control.loadURL(`${ORIGIN}/c/${GAME}`)
  // F2: show the scoreboard window
  control.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F2') { openDisplay(); e.preventDefault() }
  })
  control.webContents.setWindowOpenHandler(({ url }) => {
    // the Display button (and the OBS banner link) → the scoreboard window
    if (url.startsWith(`${ORIGIN}/b/`) || url.startsWith(`${ORIGIN}/board`)) { openDisplay(); return { action: 'deny' } }
    // our own pages (team logos, referee signals PDF) and print windows open inside the app
    if (url.startsWith(ORIGIN) || url === 'about:blank' || url === '') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 800, webPreferences } }
    }
    // tel:, mailto:, WhatsApp, LINE, IIHF links → the system
    shell.openExternal(url)
    return { action: 'deny' }
  })
  control.on('closed', () => { control = null; quitting = true; app.quit() })
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showControl)
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    protocol.handle('app', serve)
    openControl()
    openDisplay()
    screen.on('display-added', placeDisplay)
    screen.on('display-removed', placeDisplay)
    screen.on('display-metrics-changed', placeDisplay)
  })
  app.on('before-quit', () => { quitting = true })
  app.on('window-all-closed', () => app.quit())
}
