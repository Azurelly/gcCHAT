console.log('[Main Init] main.js script started execution.'); // ADDED VERY TOP LEVEL LOG
import { app, BrowserWindow, ipcMain, Menu, MenuItem, Notification } from 'electron'; // Added MenuItem, Notification
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module'; // Import createRequire
import os from 'os';
import { WebSocket } from 'ws';
import Store from 'electron-store';
import axios from 'axios'; // Import axios
// Correct import for CommonJS module 'electron-updater' in an ES Module context
import pkg_updater from 'electron-updater'; // Rename to avoid conflict
const { autoUpdater } = pkg_updater;
// Use createRequire to import package.json
const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const appVersion = pkg.version;
// Use console.log here as mainWindow doesn't exist yet
console.log(`[Main Init] App Version: ${appVersion}`);
console.log('[Main Init] Imported autoUpdater:', typeof autoUpdater, autoUpdater ? Object.keys(autoUpdater) : 'N/A');

// --- Configuration ---
const SERVER_URL = 'wss://gcchat.onrender.com';
const WEATHER_API_KEY = '0bb4b73ce31aaabca8d373d45d924a83'; // User-provided key

// --- State ---
let mainWindow = null;
let serverAddress = SERVER_URL;
let clientSocket = null;
let loggedInUsername = null;
let currentChannel = null;
let isAdmin = false;

// Initialize electron-store
const store = new Store({
  // Schema definition helps with validation and defaults
  schema: {
    channelStates: {
      type: 'object',
      patternProperties: {
        // Key is the channel name (string)
        '^.+$': {
          type: 'object',
          properties: {
            unreadMessageCount: { type: 'number', default: 0 }, // Total unread
            unreadMentionCount: { type: 'number', default: 0 }, // Unread mentions specifically
            // lastSeenTimestamp: { type: 'number', default: 0 } // Optional: Could add later
          },
          required: ['unreadMessageCount', 'unreadMentionCount']
        }
      },
      default: {}
    }
  }
});


// --- Utility Functions ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to send logs to renderer console
function logToRenderer(level, ...args) {
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('log-message', { level, args });
  }
  // Also log to main process console for development
  console[level]('[Relayed Log]', ...args);
}


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
    version: appVersion // Add version here
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
    // Log version on successful connection or startup
    console.log(`[Client] gcCHAT Version: ${appVersion}`);
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
          // Check for mention and show notification if window not focused
          const mentionPattern = new RegExp(`@${loggedInUsername}\\b`, 'i');
          if (
            loggedInUsername && // Only check if logged in
            parsedMessage.text &&
            parsedMessage.sender !== loggedInUsername && // Don't notify for self-mentions
            mentionPattern.test(parsedMessage.text) &&
            (!mainWindow || !mainWindow.isFocused()) // Only notify if window not focused or minimized
          ) {
             showMentionNotification(parsedMessage.sender, parsedMessage.text);
          }
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
        case 'profile-updated': // Received from server when someone updates PFP
          mainWindow?.webContents.send('profile-updated', parsedMessage.payload);
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
        case 'link-riot-account-response': // New: Handle response from server
           mainWindow?.webContents.send('link-riot-account-response', parsedMessage);
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
    // Check for updates after the window is ready and loaded
    logToRenderer('log', '[Main] did-finish-load: Triggering update check.');
    if (autoUpdater && typeof autoUpdater.checkForUpdatesAndNotify === 'function') {
      try {
        autoUpdater.checkForUpdatesAndNotify();
        logToRenderer('log', '[Main] did-finish-load: checkForUpdatesAndNotify() called successfully.');
      } catch (error) {
        logToRenderer('error', '[Main] did-finish-load: Error calling checkForUpdatesAndNotify():', error);
      }
    } else {
      logToRenderer('error', '[Main] did-finish-load: autoUpdater object is not valid!');
    }
  });
}

app.whenReady().then(() => {
  logToRenderer('log', '[Main] App is ready. Setting up AutoUpdater listeners...');
  try {
    // Set up auto-updater event listeners *before* creating the window
    autoUpdater.on('checking-for-update', () => {
      logToRenderer('log', '[AutoUpdater] Checking for update...');
    });
  autoUpdater.on('update-available', (info) => {
    logToRenderer('log', '[AutoUpdater] Update available:', info);
  });
  autoUpdater.on('update-not-available', (info) => {
    logToRenderer('log', '[AutoUpdater] Update not available:', info);
  });
  autoUpdater.on('error', (err) => {
    logToRenderer('error', '[AutoUpdater] Error:', err);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    logToRenderer('log', '[AutoUpdater] Download progress:', log_message);
  });
  autoUpdater.on('update-downloaded', (info) => {
    logToRenderer('log', '[AutoUpdater] Update downloaded:', info);
    // The 'checkForUpdatesAndNotify' automatically prompts the user to restart.
    // If we wanted manual control, we'd call autoUpdater.quitAndInstall() here after user confirmation.
  });
    logToRenderer('log', '[Main] AutoUpdater listeners attached successfully.');
  } catch (error) {
    logToRenderer('error', '[Main] Error attaching AutoUpdater listeners:', error);
  }

  // Now create the main window
  createWindow();
});

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

// Handle file attachment upload from renderer
ipcMain.on('send-file-attachment', (_event, fileData) => {
  if (loggedInUsername && currentChannel && fileData && fileData.data) {
    // Convert ArrayBuffer received from renderer to Node.js Buffer
    const buffer = Buffer.from(fileData.data);
    console.log(`[Main] Received file "${fileData.name}" (${buffer.length} bytes), sending to server...`);
    sendToServer({
      type: 'upload-file',
      name: fileData.name,
      fileType: fileData.type, // Use fileType to avoid conflict with message 'type'
      buffer: buffer, // Send the Buffer
    });
  } else {
     mainWindow?.webContents.send(
      'send-error',
      'Cannot send file: Not logged in or file data missing.'
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

// Attachment Menu IPC Handler
ipcMain.on('show-attachment-menu', (_event) => {
  const template = [
    {
      label: 'Upload File...',
      click: () => {
        // Tell the renderer to trigger the hidden file input
        mainWindow?.webContents.send('trigger-file-upload');
      },
    },
    { type: 'separator' },
    {
      label: 'Send Weather...',
      click: () => {
        // Tell the renderer to prompt the user for a city name
        mainWindow?.webContents.send('prompt-send-weather');
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  // Popup the menu. Position can be adjusted if needed, but default works.
  menu.popup({ window: mainWindow });
});

// --- Weather Functionality ---
async function getWeatherByCity(cityName) {
  if (!WEATHER_API_KEY) {
    console.error('[Weather] API Key not configured.');
    return { error: 'Weather API key not configured on the client.' };
  }
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${WEATHER_API_KEY}&units=metric`; // Use metric units
  try {
    const response = await axios.get(url);
    const data = response.data;
    if (data && data.main && data.weather && data.weather.length > 0) {
      return {
        city: data.name,
        temp: data.main.temp,
        feels_like: data.main.feels_like,
        description: data.weather[0].description,
        icon: data.weather[0].icon, // Icon code
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
      };
    } else {
      console.error('[Weather] Invalid API response structure:', data);
      return { error: 'Invalid weather data received.' };
    }
  } catch (error) {
    console.error('[Weather] Error fetching weather:', error.response?.data?.message || error.message);
    if (error.response && error.response.status === 404) {
      return { error: `City "${cityName}" not found.` };
    } else if (error.response && error.response.status === 401) {
      return { error: 'Invalid Weather API Key.' };
    }
    return { error: 'Could not fetch weather data.' };
  }
}

// IPC handler to fetch weather and send message
ipcMain.on('send-weather-message', async (_event, cityName) => {
  if (!loggedInUsername || !currentChannel) {
    mainWindow?.webContents.send('send-error', 'Must be logged in to send weather.');
    return;
  }
  if (!cityName || typeof cityName !== 'string' || cityName.trim().length === 0) {
     mainWindow?.webContents.send('send-error', 'City name cannot be empty.');
     return;
  }

  const trimmedCityName = cityName.trim();
  console.log(`[Weather] Fetching weather for city: ${trimmedCityName}`);
  const weatherData = await getWeatherByCity(trimmedCityName);

  if (weatherData.error) {
    console.error(`[Weather] Failed to get weather for ${trimmedCityName}:`, weatherData.error);
    // Optionally send an error message back to the renderer or just log it
    mainWindow?.webContents.send('send-error', `Weather Error: ${weatherData.error}`);
    return;
  }

  // Format the weather data into a nice message string
  // Example: "Weather in London: 15°C (feels like 14°C), clear sky. Humidity: 70%, Wind: 3 m/s."
  // We can add the icon later if desired.
  const weatherMessage = `Weather in ${weatherData.city}: ${weatherData.temp.toFixed(1)}°C (feels like ${weatherData.feels_like.toFixed(1)}°C), ${weatherData.description}. Humidity: ${weatherData.humidity}%, Wind: ${weatherData.wind_speed.toFixed(1)} m/s.`;

  console.log(`[Weather] Sending weather message: ${weatherMessage}`);
  sendToServer({ type: 'chat', text: weatherMessage }); // Send as a regular chat message
});

// Riot Linking IPC Handler (New)
ipcMain.on('link-riot-account', (_event, linkData) => {
  console.log('[Main] Received link-riot-account IPC:', linkData);
  if (loggedInUsername) {
    // Forward the request to the server
    sendToServer({ type: 'link-riot-account', ...linkData });
  } else {
    // Handle case where user somehow triggers this while not logged in
    console.warn('[Main] link-riot-account received but user not logged in.');
    // Optionally send an error back to renderer? The server will handle it too.
  }
});


// Profile Settings IPC Handlers
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
    // We'll rely on the server sending updates for most things, but include version here too
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
    version: appVersion // Include version in status reply
    // profilePicture: currentProfileData?.profilePicture // Include if storing locally
  });
});

// Handle request from renderer to show a notification (e.g., for testing or other purposes)
ipcMain.on('show-notification', (_event, options) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: options.title || 'gcCHAT',
      body: options.body || '',
      silent: options.silent || false, // Add sound by default unless specified
      // icon: path.join(__dirname, 'assets/icon.png') // Optional: Add an icon
    });
    notification.show();
    // Optional: Handle click event
    notification.on('click', () => {
       if (mainWindow) {
         if (mainWindow.isMinimized()) mainWindow.restore();
         mainWindow.focus();
       }
    });
  } else {
    console.warn('[Main] Notifications not supported on this system.');
  }
}); // Added semicolon

// --- Persistent State IPC Handlers ---
ipcMain.handle('get-channel-states', async () => {
  return store.get('channelStates', {}); // Return stored states or empty object
});

ipcMain.on('update-channel-state', (_event, { channelName, state }) => {
  if (!channelName || typeof state !== 'object') {
    console.error('[Main] Invalid update-channel-state payload:', { channelName, state });
    return;
  }
  // console.log(`[Main] Updating state for ${channelName}:`, state); // Debug log
  store.set(`channelStates.${channelName}`, state);
});


// Helper function to show mention notification
function showMentionNotification(sender, messageText) {
   if (Notification.isSupported()) {
    const notification = new Notification({
      title: `Mention from ${sender}`,
      body: messageText.length > 50 ? messageText.substring(0, 47) + '...' : messageText, // Truncate long messages
      silent: false // Play sound for mentions
      // icon: path.join(__dirname, 'assets/mention-icon.png') // Optional: Specific mention icon
    });
    notification.show();
    notification.on('click', () => {
       if (mainWindow) {
         if (mainWindow.isMinimized()) mainWindow.restore();
         mainWindow.focus();
       }
    });
  }
}
