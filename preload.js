const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  sendSignup: (credentials) => ipcRenderer.send('signup-request', credentials),
  sendLogin: (credentials) => ipcRenderer.send('login-request', credentials),
  onSignupResponse: (callback) => ipcRenderer.on('signup-response', (_event, value) => callback(value)),
  onLoginResponse: (callback) => ipcRenderer.on('login-response', (_event, value) => callback(value)),

  // Chat & Channels
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  switchChannel: (channelName) => ipcRenderer.send('switch-channel', channelName),
  createChannel: (channelName) => ipcRenderer.send('create-channel', channelName),
  deleteChannel: (channelName) => ipcRenderer.send('delete-channel', channelName),
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onLoadHistory: (callback) => ipcRenderer.on('load-history', (_event, value) => callback(value)),
  onChannelList: (callback) => ipcRenderer.on('channel-list', (_event, value) => callback(value)),

  // User Profile
  getUserProfile: (username) => ipcRenderer.send('get-user-profile', username),
  onUserProfileResponse: (callback) => ipcRenderer.on('user-profile-response', (_event, value) => callback(value)),

  // Context Menus & Prompts
  showChannelContextMenu: (channelName) => ipcRenderer.send('show-channel-context-menu', channelName),
  showSidebarContextMenu: () => ipcRenderer.send('show-sidebar-context-menu'),
  onPromptCreateChannel: (callback) => ipcRenderer.on('prompt-create-channel', (_event) => callback()), // Listen for prompt from main
  onConfirmDeleteChannel: (callback) => ipcRenderer.on('confirm-delete-channel', (_event, channelName) => callback(channelName)), // Listen for confirm from main

  // Status/Error
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
  onSendError: (callback) => ipcRenderer.on('send-error', (_event, value) => callback(value)),
  onError: (callback) => ipcRenderer.on('error', (_event, value) => callback(value)),
  requestStatus: () => ipcRenderer.send('request-status'),

  // Cleanup
  cleanupListeners: () => {
    ipcRenderer.removeAllListeners('signup-response');
    ipcRenderer.removeAllListeners('login-response');
    ipcRenderer.removeAllListeners('message-received');
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('channel-list');
    ipcRenderer.removeAllListeners('user-profile-response');
    ipcRenderer.removeAllListeners('prompt-create-channel'); // Add cleanup
    ipcRenderer.removeAllListeners('confirm-delete-channel'); // Add cleanup
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
    ipcRenderer.removeAllListeners('error');
  }
});

console.log('preload.js loaded with final functions');
