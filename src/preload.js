const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stealthAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  toggleListen: () => ipcRenderer.invoke('toggle-listen'),

  onStatus: (cb) => ipcRenderer.on('status', (_, d) => cb(d)),
  onQuestion: (cb) => ipcRenderer.on('question', (_, q) => cb(q)),
  onAnswerStart: (cb) => ipcRenderer.on('answer-start', () => cb()),
  onAnswerToken: (cb) => ipcRenderer.on('answer-token', (_, t) => cb(t)),
  onAnswerDone: (cb) => ipcRenderer.on('answer-done', () => cb()),
  onClear: (cb) => ipcRenderer.on('clear', () => cb()),
  onError: (cb) => ipcRenderer.on('error', (_, msg) => cb(msg)),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (_, cfg) => cb(cfg)),
  onScroll: (cb) => ipcRenderer.on('scroll', (_, dir) => cb(dir))
})
