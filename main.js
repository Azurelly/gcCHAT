import { app, BrowserWindow, ipcMain, Menu, MenuItem } from 'electron';
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
function connectToServer() { /* ... no change ... */ if (clientSocket && (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING)) return; console.log(`[Client] Attempting to connect to server at ${serverAddress}`); mainWindow?.webContents.send('status-update', { connected: false, connecting: true, serverIp: serverAddress, localHostname: os.hostname() }); try { clientSocket = new WebSocket(serverAddress); } catch (error) { console.error(`[Client] Error creating WebSocket connection: ${error.message}`); mainWindow?.webContents.send('status-update', { connected: false, error: `Failed to initiate connection: ${error.message}`, serverIp: serverAddress, localHostname: os.hostname() }); setTimeout(connectToServer, 10000); return; } clientSocket.on('open', () => { console.log('[Client] Connected to server'); mainWindow?.webContents.send('status-update', { wsConnected: true, serverIp: serverAddress, localHostname: os.hostname() }); }); clientSocket.on('message', (message) => { try { const parsedMessage = JSON.parse(message); switch(parsedMessage.type) { case 'history': mainWindow?.webContents.send('load-history', parsedMessage); break; case 'chat': mainWindow?.webContents.send('message-received', parsedMessage); break; case 'login-response': if (parsedMessage.success) { loggedInUsername = parsedMessage.username; isAdmin = parsedMessage.isAdmin || false; currentChannel = 'general'; console.log(`[Client] Login successful for ${loggedInUsername} (Admin: ${isAdmin})`); } else { loggedInUsername = null; isAdmin = false; currentChannel = null; } mainWindow?.webContents.send('login-response', parsedMessage); break; case 'signup-response': mainWindow?.webContents.send('signup-response', parsedMessage); break; case 'channel-list': mainWindow?.webContents.send('channel-list', parsedMessage); break; case 'user-profile-response': mainWindow?.webContents.send('user-profile-response', parsedMessage); break; case 'message-edited': mainWindow?.webContents.send('message-edited', parsedMessage.payload); break; case 'message-deleted': mainWindow?.webContents.send('message-deleted', parsedMessage.payload); break; case 'user-list-update': mainWindow?.webContents.send('user-list-update', parsedMessage.payload); break; case 'party-mode-update': mainWindow?.webContents.send('party-mode-update', parsedMessage.payload); break; /* Relay party mode update */ case 'typing-update': mainWindow?.webContents.send('typing-update', parsedMessage.payload); break; case 'error': mainWindow?.webContents.send('error', parsedMessage); break; default: console.warn(`[Client] Received unhandled message type: ${parsedMessage.type}`); } } catch (e) { console.error('[Client] Failed to parse message from server:', message.toString(), e); } }); clientSocket.on('close', (code, reason) => { console.log(`[Client] Disconnected from server. Code: ${code}, Reason: ${reason.toString()}. Retrying connection...`); clientSocket = null; loggedInUsername = null; isAdmin = false; currentChannel = null; mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: 'Disconnected. Retrying...', serverIp: serverAddress, localHostname: os.hostname() }); setTimeout(connectToServer, 5000); }); clientSocket.on('error', (error) => { console.error('[Client] WebSocket Client Error:', error.message); mainWindow?.webContents.send('status-update', { connected: false, wsConnected: false, error: `Connection error: ${error.message}. Retrying...`, serverIp: serverAddress, localHostname: os.hostname() }); }); }

// --- Electron App Lifecycle ---
function createWindow() { /* ... no change ... */ mainWindow = new BrowserWindow({ width: 1200, height: 700, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, }, }); mainWindow.loadFile(path.join(__dirname, 'index.html')); mainWindow.setMenuBarVisibility(false); mainWindow.webContents.openDevTools(); mainWindow.on('closed', () => { mainWindow = null; }); mainWindow.webContents.once('did-finish-load', () => { connectToServer(); }); }
app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => { /* ... no change ... */ console.log('[Client] App quitting...'); if (clientSocket) { console.log("[Client] Closing WebSocket client connection..."); const closeHandler = () => setTimeout(connectToServer, 5000); clientSocket.removeEventListener('close', closeHandler); clientSocket.close(); } });

// --- IPC Handlers ---
function sendToServer(messageObject) { /* ... no change ... */ if (clientSocket && clientSocket.readyState === WebSocket.OPEN) { clientSocket.send(JSON.stringify(messageObject)); return true; } else { console.log('[Client] Cannot send message: Not connected to server.'); return false; } }
ipcMain.on('signup-request', (event, credentials) => sendToServer({ type: 'signup', ...credentials }));
ipcMain.on('login-request', (event, credentials) => sendToServer({ type: 'login', ...credentials }));
ipcMain.on('send-message', (event, messageText) => { if (loggedInUsername && currentChannel) { sendToServer({ type: 'chat', text: messageText }); } else { mainWindow?.webContents.send('send-error', 'You must be logged in to send messages.'); } });
ipcMain.on('switch-channel', (event, channelName) => { if (loggedInUsername) { if (sendToServer({ type: 'switch-channel', channel: channelName })) { currentChannel = channelName; } } });
ipcMain.on('create-channel', (event, channelName) => { if (isAdmin) { sendToServer({ type: 'create-channel', name: channelName }); } else { mainWindow?.webContents.send('error', { message: 'Permission denied: Admin required' }); } });
ipcMain.on('delete-channel', (event, channelName) => { if (isAdmin) { sendToServer({ type: 'delete-channel', channel: channelName }); } else { mainWindow?.webContents.send('error', { message: 'Permission denied: Admin required' }); } });
ipcMain.on('get-user-profile', (event, username) => { if (loggedInUsername) { sendToServer({ type: 'get-user-profile', username: username }); } });
ipcMain.on('edit-message', (event, { messageId, newText }) => { if (loggedInUsername) { sendToServer({ type: 'edit-message', messageId: messageId, newText: newText }); } });
ipcMain.on('delete-message', (event, { messageId }) => { if (loggedInUsername) { sendToServer({ type: 'delete-message', messageId: messageId }); } });
ipcMain.on('start-typing', (event) => { if (loggedInUsername) { sendToServer({ type: 'start-typing' }); } });
ipcMain.on('stop-typing', (event) => { if (loggedInUsername) { sendToServer({ type: 'stop-typing' }); } });

// Per-User Party Mode IPC
ipcMain.on('toggle-user-party-mode', (event, { username }) => {
    if (isAdmin) { // Only admins can toggle
        sendToServer({ type: 'toggle-user-party-mode', username: username });
    } else {
         mainWindow?.webContents.send('error', { message: 'Permission denied: Admin required' });
    }
});


// Context Menu IPC
ipcMain.on('show-sidebar-context-menu', (event) => { /* ... no change ... */ if (!isAdmin) return; const template = [ { label: 'Create Channel', click: () => { mainWindow?.webContents.send('prompt-create-channel'); } } ]; const menu = Menu.buildFromTemplate(template); menu.popup({ window: mainWindow }); });
ipcMain.on('show-channel-context-menu', (event, channelName) => { /* ... no change ... */ if (!isAdmin || channelName === 'general') return; const template = [ { label: `Delete #${channelName}`, click: () => { mainWindow?.webContents.send('confirm-delete-channel', channelName); } } ]; const menu = Menu.buildFromTemplate(template); menu.popup({ window: mainWindow }); });
ipcMain.on('show-message-context-menu', (event, { messageId, isOwnMessage }) => { /* ... no change ... */ const template = []; if (isOwnMessage) { template.push( { label: 'Edit Message', click: () => { mainWindow?.webContents.send('edit-message-prompt', messageId); } }, { type: 'separator' }, { label: 'Delete Message', click: () => { sendToServer({ type: 'delete-message', messageId: messageId }); } } ); } else { template.push({ label: 'Copy Message ID (soon)', enabled: false }); } if (template.length > 0) { const menu = Menu.buildFromTemplate(template); menu.popup({ window: mainWindow }); } });

// New: User Context Menu
ipcMain.on('show-user-context-menu', (event, { username }) => {
    const template = [
        {
            label: `View Profile`,
            click: () => { sendToServer({ type: 'get-user-profile', username: username }); }
        }
    ];
    // Add admin-only options
    if (isAdmin && username !== loggedInUsername) { // Can't party mode self
        template.push({ type: 'separator' });
        template.push({
            label: 'Toggle Party Mode', // Label could be dynamic based on current state if needed
            click: () => { sendToServer({ type: 'toggle-user-party-mode', username: username }); }
        });
        // Add Kick/Ban later?
        // template.push({ type: 'separator' });
        // template.push({ label: 'Kick (soon)', enabled: false });
        // template.push({ label: 'Ban (soon)', enabled: false });
    }

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
});


// Status Request IPC
ipcMain.on('request-status', (event) => { /* ... no change ... */ event.reply('status-update', { connected: !!loggedInUsername, wsConnected: clientSocket && clientSocket.readyState === WebSocket.OPEN, connecting: clientSocket && clientSocket.readyState === WebSocket.CONNECTING, searching: false, serverIp: serverAddress, localHostname: os.hostname(), username: loggedInUsername, currentChannel: currentChannel, isAdmin: isAdmin }); });
