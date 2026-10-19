// Scoreboard window: only the licence state (license.cjs), for the UNLICENSED watermark (src/License.jsx).
// Nothing else: the game reaches this window through localStorage + BroadcastChannel like any page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', { license: ipcRenderer.sendSync('license:get') })
