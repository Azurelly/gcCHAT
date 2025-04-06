const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  sendSignup: (credentials) => ipcRenderer.send('signup-request', credentials),
  sendLogin: (credentials) => ipcRenderer.send('login-request', credentials),
  onSignupResponse: (callback) =>
    ipcRenderer.on('signup-response', (_event, value) => callback(value)),
  onLoginResponse: (callback) =>
    ipcRenderer.on('login-response', (_event, value) => callback(value)),

  // Chat & Channels
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  editMessage: (messageId, newText) =>
    ipcRenderer.send('edit-message', { messageId, newText }),
  deleteMessage: (messageId) =>
    ipcRenderer.send('delete-message', { messageId }),
  switchChannel: (channelName) =>
    ipcRenderer.send('switch-channel', channelName),
  createChannel: (channelName) =>
    ipcRenderer.send('create-channel', channelName),
  deleteChannel: (channelName) =>
    ipcRenderer.send('delete-channel', channelName),
  onMessageReceived: (callback) =>
    ipcRenderer.on('message-received', (_event, value) => callback(value)),
  onMessageEdited: (callback) =>
    ipcRenderer.on('message-edited', (_event, value) => callback(value)),
  onMessageDeleted: (callback) =>
    ipcRenderer.on('message-deleted', (_event, value) => callback(value)),
  onLoadHistory: (callback) =>
    ipcRenderer.on('load-history', (_event, value) => callback(value)),
  onChannelList: (callback) =>
    ipcRenderer.on('channel-list', (_event, value) => callback(value)),

  // User Profile & List
  getUserProfile: (username) => ipcRenderer.send('get-user-profile', username),
  onUserProfileResponse: (callback) =>
    ipcRenderer.on('user-profile-response', (_event, value) => callback(value)),
  onUserListUpdate: (callback) =>
    ipcRenderer.on('user-list-update', (_event, value) => callback(value)),

  // Party Mode & Typing
  toggleUserPartyMode: (username) =>
    ipcRenderer.send('toggle-user-party-mode', { username }), // Send toggle request for specific user
  startTyping: () => ipcRenderer.send('start-typing'),
  stopTyping: () => ipcRenderer.send('stop-typing'),
  onPartyModeUpdate: (callback) =>
    ipcRenderer.on('party-mode-update', (_event, value) => callback(value)), // Listen for own party mode state
  onTypingUpdate: (callback) =>
    ipcRenderer.on('typing-update', (_event, value) => callback(value)),

  // Context Menus
  showChannelContextMenu: (channelName) =>
    ipcRenderer.send('show-channel-context-menu', channelName),
  showSidebarContextMenu: () => ipcRenderer.send('show-sidebar-context-menu'),
  showMessageContextMenu: (messageId, isOwnMessage) =>
    ipcRenderer.send('show-message-context-menu', { messageId, isOwnMessage }),
  showUserContextMenu: (username) =>
    ipcRenderer.send('show-user-context-menu', { username }), // Context menu for user list items
  onPromptCreateChannel: (callback) =>
    ipcRenderer.on('prompt-create-channel', (_event) => callback()),
  onConfirmDeleteChannel: (callback) =>
    ipcRenderer.on('confirm-delete-channel', (_event, channelName) =>
      callback(channelName)
    ),
  onEditMessagePrompt: (callback) =>
    ipcRenderer.on('edit-message-prompt', (_event, messageId) =>
      callback(messageId)
    ),

  // Status/Error
  onStatusUpdate: (callback) =>
    ipcRenderer.on('status-update', (_event, value) => callback(value)),
  onSendError: (callback) =>
    ipcRenderer.on('send-error', (_event, value) => callback(value)),
  onError: (callback) =>
    ipcRenderer.on('error', (_event, value) => callback(value)),
  requestStatus: () => ipcRenderer.send('request-status'),

  // Cleanup
  cleanupListeners: () => {
    ipcRenderer.removeAllListeners('signup-response');
    ipcRenderer.removeAllListeners('login-response');
    ipcRenderer.removeAllListeners('message-received');
    ipcRenderer.removeAllListeners('message-edited');
    ipcRenderer.removeAllListeners('message-deleted');
    ipcRenderer.removeAllListeners('load-history');
    ipcRenderer.removeAllListeners('channel-list');
    ipcRenderer.removeAllListeners('user-profile-response');
    ipcRenderer.removeAllListeners('user-list-update');
    ipcRenderer.removeAllListeners('party-mode-update'); // Add cleanup
    ipcRenderer.removeAllListeners('typing-update');
    ipcRenderer.removeAllListeners('prompt-create-channel');
    ipcRenderer.removeAllListeners('confirm-delete-channel');
    ipcRenderer.removeAllListeners('edit-message-prompt');
    ipcRenderer.removeAllListeners('status-update');
    ipcRenderer.removeAllListeners('send-error');
    ipcRenderer.removeAllListeners('error');
  },
});

console.log('preload.js updated for per-user party mode');
