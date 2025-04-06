const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  sendSignup: (credentials) => ipcRenderer.send('signup-request', credentials),
  sendLogin: (credentials) => ipcRenderer.send('login-request', credentials),
  onSignupResponse: (callback) => ipcRenderer.on('signup-response', (_event, value) => callback(value)),
  onLoginResponse: (callback) => ipcRenderer.on('login-response', (_event, value) => callback(value)),

  // Chat & Channels
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  editMessage: (messageId, newText) => ipcRenderer.send('edit-message', { messageId, newText }), // Send edit request
  deleteMessage: (messageId) => ipcRenderer.send('delete-message', { messageId }), // Send delete request
  switchChannel: (channelName) => ipcRenderer.send('switch-channel', channelName),
  createChannel: (channelName) => ipcRenderer.send('create-channel', channelName),
  deleteChannel: (channelName) => ipcRenderer.send('delete-channel', channelName),
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onMessageEdited: (callback) => ipcRenderer.on('message-edited', (_event, value) => callback(value)), // Listen for edits
  onMessageDeleted: (callback) => ipcRenderer.on('message-deleted', (_event, value) => callback(value)), // Listen for deletes
  onLoadHistory: (callback) => ipcRenderer.on('load-history', (_event, value) => callback(value)),
  onChannelList: (callback) => ipcRenderer.on('channel-list', (_event, value) => callback(value)),

  // User Profile & List
  getUserProfile: (username) => ipcRenderer.send('get-user-profile', username),
  getAllUsers: () => ipcRenderer.send('get-all-users'), // Request user list
  onUserProfileResponse: (callback) => ipcRenderer.on('user-profile-response', (_event, value) => callback(value)),
  onAllUsersList: (callback) => ipcRenderer.on('all-users-list', (_event, value) => callback(value)), // Receive user list { all, online }
  onUserStatusUpdate: (callback) => ipcRenderer.on('user-status-update', (_event, value) => callback(value)), // Receive presence updates { online }

  // Context Menus
  showChannelContextMenu: (channelName) => ipcRenderer.send('show-channel-context-menu', channelName),
  showSidebarContextMenu: () => ipcRenderer.send('show-sidebar-context-menu'),
  showMessageContextMenu: (messageId, isOwnMessage) => ipcRenderer.send('show-message-context-menu', { messageId, isOwnMessage }), // Show message menu
  onPromptCreateChannel: (callback) => ipcRenderer.on('prompt-create-channel', (_event) => callback()),
  onConfirmDeleteChannel: (callback) => ipcRenderer.on('confirm-delete-channel', (_event, channelName) => callback(channelName)),
  onEditMessagePrompt: (callback) => ipcRenderer.on('edit-message-prompt', (_event, messageId) => callback(messageId)), // Prompt from main to edit

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
    ipcRenderer.removeAllListeners('message-edited'); // Add cleanup
    ipcRenderer.removeAllListeners('message-deleted'); // Add cleanup
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('channel-list');
    ipcRenderer.removeAllListeners('user-profile-response');
    ipcRenderer.removeAllListeners('all-users-list'); // Add cleanup
    ipcRenderer.removeAllListeners('user-status-update'); // Add cleanup
    ipcRenderer.removeAllListeners('prompt-create-channel');
    ipcRenderer.removeAllListeners('confirm-delete-channel');
    ipcRenderer.removeAllListeners('edit-message-prompt'); // Add cleanup
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
    ipcRenderer.removeAllListeners('error');
  }
});

console.log('preload.js loaded with final functions including edit/delete/presence');
