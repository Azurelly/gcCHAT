import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { WebSocket } from 'ws';
// Bonjour is no longer needed by the client connecting to a public server
// import { Bonjour } from 'bonjour-service';

// --- Configuration ---
// This URL will be replaced with the actual public URL from Render later
const SERVER_URL = 'wss://your-chat-server-url.onrender.com'; // Placeholder - USE wss:// for secure websockets

// --- State ---
let mainWindow = null;
let serverAddress = SERVER_URL; // Store the target server URL
let clientSocket = null;
// let bonjour = new Bonjour(); // No Bonjour
// let serviceBrowser = null; // No Bonjour
let messageHistory = [];

// --- Utility Functions ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- WebSocket Client Logic ---
function connectToServer() {
  // Prevent multiple connection attempts
  if (clientSocket && (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING)) {
      console.log('[Client] Already connected or connecting.');
      return;
  }

  console.log(`[Client] Attempting to connect to server at ${serverAddress}`);
  mainWindow?.webContents.send('status-update', { connected: false, connecting: true, serverIp: serverAddress, localHostname: os.hostname() });

  try {
      clientSocket = new WebSocket(serverAddress);
  } catch (error) {
      console.error(`[Client] Error creating WebSocket connection: ${error.message}`);
      mainWindow?.webContents.send('status-update', { connected: false, error: `Failed to initiate connection: ${error.message}`, serverIp: serverAddress, localHostname: os.hostname() });
      // Optional: Retry connection after a delay?
      setTimeout(connectToServer, 10000); // Retry after 10 seconds
      return;
  }


  clientSocket.on('open', () => {
    console.log('[Client] Connected to server');
    mainWindow?.webContents.send('status-update', { connected: true, serverIp: serverAddress, localHostname: os.hostname() });
  });

  clientSocket.on('message', (message) => {
    try {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === 'history') {
            messageHistory = parsedMessage.payload || [];
            mainWindow?.webContents.send('load-history', messageHistory);
        } else if (parsedMessage.type === 'chat') {
            if (!messageHistory.some(m => m.id === parsedMessage.id && m.timestamp === parsedMessage.timestamp)) {
                 messageHistory.push(parsedMessage);
            }
            mainWindow?.webContents.send('message-received', parsedMessage);
        }
    } catch (e) {
        console.error('[Client] Failed to parse message from server:', message.toString(), e);
    }
  });

  clientSocket.on('close', (code, reason) => {
    console.log(`[Client] Disconnected from server. Code: ${code}, Reason: ${reason.toString()}. Retrying connection...`);
    clientSocket = null;
    // serverAddress remains the same public URL
    mainWindow?.webContents.send('status-update', { connected: false, error: 'Disconnected. Retrying...', serverIp: serverAddress, localHostname: os.hostname() });
    // Retry connection after a delay
    setTimeout(connectToServer, 5000); // Retry after 5 seconds
  });

  clientSocket.on('error', (error) => {
    console.error('[Client] WebSocket Client Error:', error.message);
    // Don't nullify clientSocket here, 'close' event will handle it
    mainWindow?.webContents.send('status-update', { connected: false, error: `Connection error: ${error.message}. Retrying...`, serverIp: serverAddress, localHostname: os.hostname() });
    // The 'close' event should trigger the reconnect logic
  });
}

// --- Network Discovery (REMOVED) ---
// function findServer() { ... }


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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Attempt to connect directly after window loads
  mainWindow.webContents.once('did-finish-load', () => {
    connectToServer(); // Connect directly to the defined SERVER_URL
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  console.log('[Client] App quitting...');
  // No Bonjour cleanup needed
  if (clientSocket) {
      console.log("[Client] Closing WebSocket client connection...");
      // Prevent automatic reconnection attempts on quit
      clientSocket.removeEventListener('close', connectToServer); // Remove listener if added
      clientSocket.close();
  }
});

// --- IPC Handlers ---
ipcMain.on('send-message', (event, messageText) => {
  const senderHostname = os.hostname();
  const messageData = {
    type: 'chat',
    id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
    text: messageText,
    sender: senderHostname,
    timestamp: Date.now()
  };

  if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
    console.log('[Client] Sending message:', messageData);
    clientSocket.send(JSON.stringify(messageData));
  } else {
    console.log('[Client] Cannot send message: Not connected to server.');
    mainWindow?.webContents.send('send-error', 'Not connected to chat server.');
  }
});

ipcMain.on('request-status', (event) => {
    event.reply('status-update', {
        connected: clientSocket && clientSocket.readyState === WebSocket.OPEN,
        connecting: clientSocket && clientSocket.readyState === WebSocket.CONNECTING,
        searching: false, // No longer searching
        serverIp: serverAddress, // Show the target server URL
        localHostname: os.hostname()
    });
});

// Manual connect is removed as we connect to a fixed public URL
// ipcMain.on('manual-connect', (event, ipAddress) => { ... });
