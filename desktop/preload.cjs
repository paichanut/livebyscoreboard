// Control window only: lets the control page show "update ready · restart" (see updater.cjs).
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
})
