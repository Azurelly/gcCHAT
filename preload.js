const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  sendSignup: (credentials) => ipcRenderer.send('signup-request', credentials),
  sendLogin: (credentials) => ipcRenderer.send('login-request', credentials),
  onSignupResponse: (callback) => ipcRenderer.on('signup-response', (_event, value) => callback(value)),
  onLoginResponse: (callback) => ipcRenderer.on('login-response', (_event, value) => callback(value)), // Includes isAdmin

  // Chat & Channels
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  switchChannel: (channelName) => ipcRenderer.send('switch-channel', channelName),
  createChannel: (channelName) => ipcRenderer.send('create-channel', channelName), // Send create channel request
  deleteChannel: (channelName) => ipcRenderer.send('delete-channel', channelName), // Send delete channel request
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onLoadHistory: (callback) => ipcRenderer.on('load-history', (_event, value) => callback(value)),
  onChannelList: (callback) => ipcRenderer.on('channel-list', (_event, value) => callback(value)),

  // User Profile
  getUserProfile: (username) => ipcRenderer.send('get-user-profile', username), // Request user profile
  onUserProfileResponse: (callback) => ipcRenderer.on('user-profile-response', (_event, value) => callback(value)), // Receive profile data

  // Context Menus (Main process will handle showing native menus)
  showChannelContextMenu: (channelName) => ipcRenderer.send('show-channel-context-menu', channelName),
  showSidebarContextMenu: () => ipcRenderer.send('show-sidebar-context-menu'),

  // Status/Error
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
  onSendError: (callback) => ipcRenderer.on('send-error', (_event, value) => callback(value)), // General errors from server
  onError: (callback) => ipcRenderer.on('error', (_event, value) => callback(value)), // Specific error messages (e.g., permission denied)
  requestStatus: () => ipcRenderer.send('request-status'),

  // Cleanup
  cleanupListeners: () => {
    ipcRenderer.removeAllListeners('signup-response');
    ipcRenderer.removeAllListeners('login-response');
    ipcRenderer.removeAllListeners('message-received');
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('channel-list');
    ipcRenderer.removeAllListeners('user-profile-response'); // Add profile listener cleanup
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
    ipcRenderer.removeAllListeners('error'); // Add error listener cleanup
  }
});

console.log('preload.js loaded with auth, channel, profile, context menu functions');
