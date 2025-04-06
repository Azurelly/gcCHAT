const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onLoadHistory: (callback) => ipcRenderer.on('load-history', (_event, value) => callback(value)),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
  onSendError: (callback) => ipcRenderer.on('send-error', (_event, value) => callback(value)),
  requestStatus: () => ipcRenderer.send('request-status'),
  manualConnect: (ipAddress) => ipcRenderer.send('manual-connect', ipAddress),
  // Clean up listeners when the window is unloaded
  cleanupListeners: () => {
    ipcRenderer.removeAllListeners('message-received');
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
  }
});

console.log('preload.js loaded');
