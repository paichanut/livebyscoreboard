// Control window only: "update ready · restart" (updater.cjs) and the online link + Telegram (share.cjs).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  listTeams: () => ipcRenderer.invoke('teams:list'),
  refreshTeams: () => ipcRenderer.invoke('teams:refresh'),
  onTeams: cb => {
    const h = (_e, list) => cb(list)
    ipcRenderer.on('teams:changed', h)
    return () => ipcRenderer.removeListener('teams:changed', h)
  },
  // { unlicensed, expires } (license.cjs): past the date the app still works, with UNLICENSED and "Contact for license"
  license: ipcRenderer.sendSync('license:get'),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  onUpdate: cb => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('update', h)
    return () => ipcRenderer.removeListener('update', h)
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDownload: () => ipcRenderer.invoke('update:download'),
  // the game state, for the online link's viewers (sent on every change by the local store, sync.js)
  publishState: (id, state) => ipcRenderer.send('share:publish', id, state),
  // a change made on a controller opened through the online link (share.cjs → here → the local store)
  onRemoteState: cb => {
    const h = (_e, id, state) => cb(id, state)
    ipcRenderer.on('share:remote', h)
    return () => ipcRenderer.removeListener('share:remote', h)
  },
  pairFixedLink: credentials => ipcRenderer.invoke('share:pair', credentials),
  getShare: () => ipcRenderer.invoke('share:get'),
  onShare: cb => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('share', h)
    return () => ipcRenderer.removeListener('share', h)
  },
  enableShare: on => ipcRenderer.invoke('share:enable', on),
  setTelegram: t => ipcRenderer.invoke('share:telegram', t),
  findTelegramChat: token => ipcRenderer.invoke('share:findChat', token),
  testTelegram: () => ipcRenderer.invoke('share:test'),
  newControlKey: () => ipcRenderer.invoke('share:newKey'),
  openLink: url => ipcRenderer.invoke('share:open', url),
})
