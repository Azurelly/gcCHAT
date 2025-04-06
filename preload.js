const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  sendSignup: (credentials) => ipcRenderer.send('signup-request', credentials), // { username, password }
  sendLogin: (credentials) => ipcRenderer.send('login-request', credentials), // { username, password }
  onSignupResponse: (callback) => ipcRenderer.on('signup-response', (_event, value) => callback(value)), // { success, error? }
  onLoginResponse: (callback) => ipcRenderer.on('login-response', (_event, value) => callback(value)), // { success, username?, error? }

  // Chat
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onLoadHistory: (callback) => ipcRenderer.on('load-history', (_event, value) => callback(value)),

  // Status/Error
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
  onSendError: (callback) => ipcRenderer.on('send-error', (_event, value) => callback(value)),
  requestStatus: () => ipcRenderer.send('request-status'),

  // Cleanup
  cleanupListeners: () => {
    ipcRenderer.removeAllListeners('signup-response');
    ipcRenderer.removeAllListeners('login-response');
    ipcRenderer.removeAllListeners('message-received');
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
  }
});

console.log('preload.js loaded with auth functions');
