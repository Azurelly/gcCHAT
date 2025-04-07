import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { WebSocket } from 'ws';

// --- Configuration ---
const SERVER_URL = 'wss://gcchat.onrender.com';

// --- State ---
let mainWindow = null;
let serverAddress = SERVER_URL;
let clientSocket = null;
let loggedInUsername = null;
let currentChannel = null;
let isAdmin = false;

// --- Utility Functions ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- WebSocket Client Logic ---
function connectToServer() {
  if (
    clientSocket &&
    (clientSocket.readyState === WebSocket.OPEN ||
      clientSocket.readyState === WebSocket.CONNECTING)
  )
    return;
  console.log(`[Client] Attempting to connect to server at ${serverAddress}`);
  mainWindow?.webContents.send('status-update', {
    connected: false,
    connecting: true,
    serverIp: serverAddress,
    localHostname: os.hostname(),
  });
  try {
    clientSocket = new WebSocket(serverAddress);
  } catch (error) {
    console.error(
      `[Client] Error creating WebSocket connection: ${error.message}`
    );
    mainWindow?.webContents.send('status-update', {
      connected: false,
      error: `Failed to initiate connection: ${error.message}`,
      serverIp: serverAddress,
      localHostname: os.hostname(),
    });
    setTimeout(connectToServer, 10000);
    return;
  }
  clientSocket.on('open', () => {
    console.log('[Client] Connected to server');
    mainWindow?.webContents.send('status-update', {
      wsConnected: true,
      serverIp: serverAddress,
      localHostname: os.hostname(),
    });
  });
  clientSocket.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      // console.log('[Client] Received:', parsedMessage); // Optional: Log all messages
      switch (parsedMessage.type) {
        case 'history':
          mainWindow?.webContents.send('load-history', parsedMessage);
          break;
        case 'chat':
          mainWindow?.webContents.send('message-received', parsedMessage);
          break;
        case 'login-response':
          if (parsedMessage.success) {
            loggedInUsername = parsedMessage.username;
            isAdmin = parsedMessage.isAdmin || false;
            currentChannel = 'general'; // Reset channel on login
            console.log(
              `[Client] Login successful for ${loggedInUsername} (Admin: ${isAdmin})`
            );
          } else {
            loggedInUsername = null;
            isAdmin = false;
            currentChannel = null;
          }
          mainWindow?.webContents.send('login-response', parsedMessage);
          break;
        case 'signup-response':
          mainWindow?.webContents.send('signup-response', parsedMessage);
          break;
        case 'channel-list':
          mainWindow?.webContents.send('channel-list', parsedMessage);
          break;
        case 'user-profile-response': // For viewing other users
          mainWindow?.webContents.send('user-profile-response', parsedMessage);
          break;
        case 'own-profile-response': // For settings modal (from server)
          mainWindow?.webContents.send('own-profile-response', parsedMessage.profile);
          break;
        case 'message-edited':
          mainWindow?.webContents.send('message-edited', parsedMessage.payload);
          break;
        case 'message-deleted':
          mainWindow?.webContents.send(
            'message-deleted',
            parsedMessage.payload
          );
          break;
        case 'user-list-update':
          mainWindow?.webContents.send(
            'user-list-update',
            parsedMessage.payload
          );
          break;
        case 'party-mode-update':
          mainWindow?.webContents.send(
            'party-mode-update',
            parsedMessage.payload
          );
          break;
        case 'typing-update':
          mainWindow?.webContents.send('typing-update', parsedMessage.payload);
          break;
        case 'error': // Server-side errors (e.g., permission denied)
          mainWindow?.webContents.send('error', parsedMessage);
          break;
        default:
          console.warn(
            `[Client] Received unhandled message type: ${parsedMessage.type}`
          );
      }
    } catch (e) {
      console.error(
        '[Client] Failed to parse message from server:',
        message.toString(),
        e
      );
    }
  });
  clientSocket.on('close', (code, reason) => {
    console.log(
      `[Client] Disconnected from server. Code: ${code}, Reason: ${reason.toString()}. Retrying connection...`
    );
    clientSocket = null;
    loggedInUsername = null;
    isAdmin = false;
    currentChannel = null;
    mainWindow?.webContents.send('status-update', {
      connected: false,
      wsConnected: false,
      error: 'Disconnected. Retrying...',
      serverIp: serverAddress,
      localHostname: os.hostname(),
    });
    // Use exponential backoff or similar for retries in production
    setTimeout(connectToServer, 5000);
  });
  clientSocket.on('error', (error) => {
    console.error('[Client] WebSocket Client Error:', error.message);
    mainWindow?.webContents.send('status-update', {
      connected: false,
      wsConnected: false,
      error: `Connection error: ${error.message}. Retrying...`,
      serverIp: serverAddress,
      localHostname: os.hostname(),
    });
    // Don't retry immediately on error, let 'close' handle retries
  });
}

// --- Electron App Lifecycle ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
    title: 'gcCHAT', // Set window title
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false); // Remove default menu bar

  // Open DevTools automatically on start
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Connect after the window content has finished loading
  mainWindow.webContents.once('did-finish-load', () => {
    connectToServer();
  });
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  console.log('[Client] App quitting...');
  if (clientSocket) {
    console.log('[Client] Closing WebSocket client connection...');
    // Remove listeners before closing to prevent immediate reconnect attempts
    clientSocket.removeAllListeners('close');
    clientSocket.removeAllListeners('error');
    clientSocket.close();
  }
});

// --- IPC Handlers ---
function sendToServer(messageObject) {
  if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
    clientSocket.send(JSON.stringify(messageObject));
    // console.log('[Client] Sent:', messageObject); // Optional: Log sent messages
    return true;
  } else {
    console.log('[Client] Cannot send message: Not connected to server.');
    // Optionally notify the renderer process
    mainWindow?.webContents.send('send-error', 'Not connected to server.');
    return false;
  }
}

// Auth
ipcMain.on('signup-request', (_event, credentials) =>
  sendToServer({ type: 'signup', ...credentials })
);
ipcMain.on('login-request', (_event, credentials) =>
  sendToServer({ type: 'login', ...credentials })
);

// Chat & Channels
ipcMain.on('send-message', (_event, messageText) => {
  if (loggedInUsername && currentChannel) {
    sendToServer({ type: 'chat', text: messageText });
  } else {
    mainWindow?.webContents.send(
      'send-error',
      'You must be logged in to send messages.'
    );
  }
});
ipcMain.on('switch-channel', (_event, channelName) => {
  if (loggedInUsername) {
    if (sendToServer({ type: 'switch-channel', channel: channelName })) {
      currentChannel = channelName; // Update local state optimistically
    }
  }
});
ipcMain.on('create-channel', (_event, channelName) => {
  if (isAdmin) {
    sendToServer({ type: 'create-channel', name: channelName });
  } else {
    mainWindow?.webContents.send('error', {
      message: 'Permission denied: Admin required',
    });
  }
});
ipcMain.on('delete-channel', (_event, channelName) => {
  if (isAdmin) {
    sendToServer({ type: 'delete-channel', channel: channelName });
  } else {
    mainWindow?.webContents.send('error', {
      message: 'Permission denied: Admin required',
    });
  }
});

// User Profile & List
ipcMain.on('get-user-profile', (_event, username) => {
  if (loggedInUsername) {
    sendToServer({ type: 'get-user-profile', username: username });
  }
});
ipcMain.on('edit-message', (_event, { messageId, newText }) => {
  if (loggedInUsername) {
    sendToServer({
      type: 'edit-message',
      messageId: messageId,
      newText: newText,
    });
  }
});
ipcMain.on('delete-message', (_event, { messageId }) => {
  if (loggedInUsername) {
    sendToServer({ type: 'delete-message', messageId: messageId });
  }
});

// Typing Indicators
ipcMain.on('start-typing', (_event) => {
  if (loggedInUsername) {
    sendToServer({ type: 'start-typing' });
  }
});
ipcMain.on('stop-typing', (_event) => {
  if (loggedInUsername) {
    sendToServer({ type: 'stop-typing' });
  }
});

// Per-User Party Mode IPC
ipcMain.on('toggle-user-party-mode', (_event, { username }) => {
  if (isAdmin) {
    sendToServer({ type: 'toggle-user-party-mode', username: username });
  } else {
    mainWindow?.webContents.send('error', {
      message: 'Permission denied: Admin required',
    });
  }
});

// Context Menu IPC
ipcMain.on('show-sidebar-context-menu', (_event) => {
  if (!isAdmin) return;
  const template = [
    {
      label: 'Create Channel',
      click: () => {
        mainWindow?.webContents.send('prompt-create-channel');
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});
ipcMain.on('show-channel-context-menu', (_event, channelName) => {
  if (!isAdmin || channelName === 'general') return; // Cannot delete general
  const template = [
    {
      label: `Delete #${channelName}`,
      click: () => {
        mainWindow?.webContents.send('confirm-delete-channel', channelName);
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});
ipcMain.on(
  'show-message-context-menu',
  (_event, { messageId, isOwnMessage }) => {
    const template = [];
    if (isOwnMessage) {
      template.push(
        {
          label: 'Edit Message',
          click: () => {
            mainWindow?.webContents.send('edit-message-prompt', messageId);
          },
        },
        { type: 'separator' },
        {
          label: 'Delete Message',
          click: () => {
            // Send delete request directly
            sendToServer({ type: 'delete-message', messageId: messageId });
          },
        }
      );
    } else {
      // Add options for other users' messages later if needed
      // template.push({ label: 'Copy Message ID (soon)', enabled: false });
    }
    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow });
    }
  }
);
ipcMain.on('show-user-context-menu', (_event, { username }) => {
  const template = [
    {
      label: `View Profile`,
      click: () => {
        sendToServer({ type: 'get-user-profile', username: username });
      },
    },
  ];
  // Add admin-only options
  if (isAdmin && username !== loggedInUsername) {
    template.push({ type: 'separator' });
    template.push({
      label: 'Toggle Party Mode',
      click: () => {
        sendToServer({ type: 'toggle-user-party-mode', username: username });
      },
    });
    // Add Kick/Ban later?
  }
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

// New: Profile Settings IPC Handlers
ipcMain.on('request-own-profile', (_event) => {
  if (loggedInUsername) {
    sendToServer({ type: 'get-own-profile' }); // Request own profile data
  }
});
ipcMain.on('save-about-me', (_event, aboutMeText) => {
  if (loggedInUsername) {
    sendToServer({ type: 'update-about-me', aboutMe: aboutMeText });
  }
});
ipcMain.on('save-profile-picture', (_event, imageDataUrl) => {
  if (loggedInUsername) {
    sendToServer({ type: 'update-profile-picture', profilePicture: imageDataUrl });
  }
});

// Status Request IPC
ipcMain.on('request-status', (_event) => {
  // Reply immediately with current known state
  // Fetch profile picture from currentProfileData if available (might need to store it in main process state)
  // For now, let's assume it's part of the loggedInUsername state or fetched separately if needed.
  // We'll rely on the server sending updates for now.
  _event.reply('status-update', {
    connected: !!loggedInUsername, // True only if logged in
    wsConnected: clientSocket && clientSocket.readyState === WebSocket.OPEN,
    connecting:
      clientSocket && clientSocket.readyState === WebSocket.CONNECTING,
    searching: false, // Bonjour removed
    serverIp: serverAddress,
    localHostname: os.hostname(),
    username: loggedInUsername,
    currentChannel: currentChannel,
    isAdmin: isAdmin,
    // profilePicture: currentProfileData?.profilePicture // Include if storing locally
  });
});
