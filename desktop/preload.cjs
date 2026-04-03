const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clawDesktop', {
  getBootstrap: () => ipcRenderer.invoke('claw:desktop:get-bootstrap'),
  setSecret: (key, value) => ipcRenderer.invoke('claw:desktop:set-secret', { key, value }),
  pickDirectory: () => ipcRenderer.invoke('claw:desktop:pick-directory'),
  pickFile: filters => ipcRenderer.invoke('claw:desktop:pick-file', { filters }),
  saveTextFile: payload => ipcRenderer.invoke('claw:desktop:save-text-file', payload),
  restartLauncher: () => ipcRenderer.invoke('claw:desktop:restart-launcher'),
  onCommand: callback => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('claw:desktop:command', handler)
    return () => ipcRenderer.removeListener('claw:desktop:command', handler)
  },
  onHostStatus: callback => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('claw:desktop:host-status', handler)
    return () => ipcRenderer.removeListener('claw:desktop:host-status', handler)
  },
})
