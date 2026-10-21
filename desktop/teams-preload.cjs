// The separate team-library window only needs access to downloaded teams.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  listTeams: () => ipcRenderer.invoke('teams:list'),
  refreshTeams: () => ipcRenderer.invoke('teams:refresh'),
  onTeams: cb => {
    const h = (_e, list) => cb(list)
    ipcRenderer.on('teams:changed', h)
    return () => ipcRenderer.removeListener('teams:changed', h)
  },
})
