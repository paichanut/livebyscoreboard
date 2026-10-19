// Control window only: "update ready · restart" (updater.cjs) and the online link + Telegram (share.cjs).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
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
  openLink: url => ipcRenderer.invoke('share:open', url),
})
