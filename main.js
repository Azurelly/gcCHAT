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
let messageHistory = [];
let loggedInUsername = null; // Store logged-in user

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
    // Don't send status update immediately, wait for potential login
    // mainWindow?.webContents.send('status-update', { connected: true, serverIp: serverAddress, localHostname: os.hostname() });
    // Instead, maybe just indicate connection is open, UI waits for login response
     mainWindow?.webContents.send('status-update', { wsConnected: true, serverIp: serverAddress, localHostname: os.hostname() });
  });

  clientSocket.on('message', (message) => {
    try {
        const parsedMessage = JSON.parse(message);
        // Route message to renderer based on type
        switch(parsedMessage.type) {
            case 'history':
                messageHistory = parsedMessage.payload || [];
                mainWindow?.webContents.send('load-history', messageHistory);
                break;
            case 'chat':
                // Add to local history only if needed (server sends history on login)
                // if (!messageHistory.some(m => m.id === parsedMessage.id && m.timestamp === parsedMessage.timestamp)) {
                //      messageHistory.push(parsedMessage);
                // }
                mainWindow?.webContents.send('message-received', parsedMessage);
                break;
            case 'login-response':
                if (parsedMessage.success) {
                    loggedInUsername = parsedMessage.username; // Store username on successful login
                    console.log(`[Client] Login successful for ${loggedInUsername}`);
                } else {
                    loggedInUsername = null;
                }
                // Forward the whole response to renderer
                mainWindow?.webContents.send('login-response', parsedMessage);
                break;
            case 'signup-response':
                // Forward response to renderer
                mainWindow?.webContents.send('signup-response', parsedMessage);
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
    loggedInUsername = null; // Reset login status
    mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: 'Disconnected. Retrying...', serverIp: serverAddress, localHostname: os.hostname() });
    setTimeout(connectToServer, 5000);
  });

  clientSocket.on('error', (error) => {
    console.error('[Client] WebSocket Client Error:', error.message);
    mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: `Connection error: ${error.message}. Retrying...`, serverIp: serverAddress, localHostname: os.hostname() });
    // Close event will handle reconnect
  });
}

// --- Electron App Lifecycle ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
    connectToServer(); // Connect WebSocket on load
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

// Helper to send messages via WebSocket if connected
function sendToServer(messageObject) {
    if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify(messageObject));
        return true;
    } else {
        console.log('[Client] Cannot send message: Not connected to server.');
        // Optionally inform renderer? Depends on context.
        // mainWindow?.webContents.send('send-error', 'Not connected to chat server.');
        return false;
    }
}

// Signup Request
ipcMain.on('signup-request', (event, credentials) => {
    console.log('[IPC] Received signup request');
    sendToServer({ type: 'signup', ...credentials });
    // Response is handled by the 'message' listener forwarding 'signup-response'
});

// Login Request
ipcMain.on('login-request', (event, credentials) => {
    console.log('[IPC] Received login request');
    sendToServer({ type: 'login', ...credentials });
    // Response is handled by the 'message' listener forwarding 'login-response'
});

// Chat Message Request
ipcMain.on('send-message', (event, messageText) => {
    // No change needed here, server uses associated username from login
    if (loggedInUsername) { // Only send if logged in
         console.log('[IPC] Received chat message request');
         sendToServer({ type: 'chat', text: messageText });
    } else {
         console.warn('[IPC] Attempted to send chat message while not logged in.');
         mainWindow?.webContents.send('send-error', 'You must be logged in to send messages.');
    }
});

// Status Request
ipcMain.on('request-status', (event) => {
    event.reply('status-update', {
        connected: !!loggedInUsername, // Consider 'connected' as 'logged in' now
        wsConnected: clientSocket && clientSocket.readyState === WebSocket.OPEN, // Actual socket state
        connecting: clientSocket && clientSocket.readyState === WebSocket.CONNECTING,
        searching: false,
        serverIp: serverAddress,
        localHostname: os.hostname(),
        username: loggedInUsername // Send username if logged in
    });
});
