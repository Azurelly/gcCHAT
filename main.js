import { app, BrowserWindow, ipcMain } from 'electron';
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
// let messageHistory = []; // History is now per-channel, managed by server/renderer
let loggedInUsername = null;
let currentChannel = null; // Track current channel locally

// --- Utility Functions ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- WebSocket Client Logic ---
function connectToServer() {
  if (clientSocket && (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING)) return;

  console.log(`[Client] Attempting to connect to server at ${serverAddress}`);
  mainWindow?.webContents.send('status-update', { connected: false, connecting: true, serverIp: serverAddress, localHostname: os.hostname() });

  try {
      clientSocket = new WebSocket(serverAddress);
  } catch (error) {
      console.error(`[Client] Error creating WebSocket connection: ${error.message}`);
      mainWindow?.webContents.send('status-update', { connected: false, error: `Failed to initiate connection: ${error.message}`, serverIp: serverAddress, localHostname: os.hostname() });
      setTimeout(connectToServer, 10000);
      return;
  }

  clientSocket.on('open', () => {
    console.log('[Client] Connected to server');
     mainWindow?.webContents.send('status-update', { wsConnected: true, serverIp: serverAddress, localHostname: os.hostname() });
  });

  clientSocket.on('message', (message) => {
    try {
        const parsedMessage = JSON.parse(message);
        // Route message to renderer based on type
        switch(parsedMessage.type) {
            case 'history': // Now includes channel info
                // messageHistory = parsedMessage.payload || []; // Don't store globally
                mainWindow?.webContents.send('load-history', parsedMessage); // Forward { channel, payload }
                break;
            case 'chat': // Now includes channel info
                mainWindow?.webContents.send('message-received', parsedMessage); // Forward { type, channel, text, sender, timestamp }
                break;
            case 'login-response':
                if (parsedMessage.success) {
                    loggedInUsername = parsedMessage.username;
                    currentChannel = 'general'; // Assume default channel on login
                    console.log(`[Client] Login successful for ${loggedInUsername}`);
                } else {
                    loggedInUsername = null;
                    currentChannel = null;
                }
                mainWindow?.webContents.send('login-response', parsedMessage);
                break;
            case 'signup-response':
                mainWindow?.webContents.send('signup-response', parsedMessage);
                break;
            case 'channel-list': // Handle channel list from server
                 mainWindow?.webContents.send('channel-list', parsedMessage); // Forward { payload: [channelName] }
                 break;
            default:
                console.warn(`[Client] Received unhandled message type: ${parsedMessage.type}`);
        }
    } catch (e) {
        console.error('[Client] Failed to parse message from server:', message.toString(), e);
    }
  });

  clientSocket.on('close', (code, reason) => {
    console.log(`[Client] Disconnected from server. Code: ${code}, Reason: ${reason.toString()}. Retrying connection...`);
    clientSocket = null;
    loggedInUsername = null;
    currentChannel = null;
    mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: 'Disconnected. Retrying...', serverIp: serverAddress, localHostname: os.hostname() });
    setTimeout(connectToServer, 5000);
  });

  clientSocket.on('error', (error) => {
    console.error('[Client] WebSocket Client Error:', error.message);
    mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: `Connection error: ${error.message}. Retrying...`, serverIp: serverAddress, localHostname: os.hostname() });
  });
}

// --- Electron App Lifecycle ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, // Wider for channels panel
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.once('did-finish-load', () => {
    connectToServer();
  });
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('quit', () => {
  console.log('[Client] App quitting...');
  if (clientSocket) {
      console.log("[Client] Closing WebSocket client connection...");
      const closeHandler = () => setTimeout(connectToServer, 5000);
      clientSocket.removeEventListener('close', closeHandler);
      clientSocket.close();
  }
});

// --- IPC Handlers ---
function sendToServer(messageObject) {
    if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify(messageObject));
        return true;
    } else {
        console.log('[Client] Cannot send message: Not connected to server.');
        return false;
    }
}

ipcMain.on('signup-request', (event, credentials) => {
    console.log('[IPC] Received signup request');
    sendToServer({ type: 'signup', ...credentials });
});

ipcMain.on('login-request', (event, credentials) => {
    console.log('[IPC] Received login request');
    sendToServer({ type: 'login', ...credentials });
});

ipcMain.on('send-message', (event, messageText) => {
    if (loggedInUsername && currentChannel) { // Check channel too
         console.log(`[IPC] Received chat message request for channel ${currentChannel}`);
         // Server determines channel based on connection map, no need to send it from client?
         // Let's keep it simple: server uses the channel associated with the connection.
         sendToServer({ type: 'chat', text: messageText });
    } else {
         console.warn('[IPC] Attempted to send chat message while not logged in or no channel selected.');
         mainWindow?.webContents.send('send-error', 'You must be logged in to send messages.');
    }
});

// Handle channel switch request from renderer
ipcMain.on('switch-channel', (event, channelName) => {
    if (loggedInUsername) {
        console.log(`[IPC] Received switch channel request to ${channelName}`);
        if (sendToServer({ type: 'switch-channel', channel: channelName })) {
            currentChannel = channelName; // Update local state optimistically
        }
    } else {
        console.warn('[IPC] Attempted to switch channel while not logged in.');
    }
});


ipcMain.on('request-status', (event) => {
    event.reply('status-update', {
        connected: !!loggedInUsername,
        wsConnected: clientSocket && clientSocket.readyState === WebSocket.OPEN,
        connecting: clientSocket && clientSocket.readyState === WebSocket.CONNECTING,
        searching: false,
        serverIp: serverAddress,
        localHostname: os.hostname(),
        username: loggedInUsername,
        currentChannel: currentChannel // Include current channel in status
    });
});
