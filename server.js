import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Bonjour } from 'bonjour-service'; // Keep Bonjour for potential local testing/fallback? Or remove? Let's remove for cloud deployment focus.

// --- Define __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use port from environment variable (for Render) or default to 3000 for local testing
const PORT = process.env.PORT || 3000;
// Store history in the same directory as the server script.
// Note: On Render's free tier, filesystem is ephemeral, history will reset on deploy/restart.
// For persistent history, a database or Render's persistent disks (paid) would be needed.
const HISTORY_FILE = path.join(__dirname, 'chat-history.json');
// SERVICE_TYPE is no longer needed as we won't use Bonjour for public server
// const SERVICE_TYPE = 'electron-chat';

let clients = new Set();
let messageHistory = [];
// let bonjour = new Bonjour(); // No Bonjour needed for public server
// let publishedService = null; // No Bonjour needed

// --- Utility: Get Local IP (Only useful for logging, not connection) ---
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// --- History Handling ---
async function loadHistory() {
  // Check if running on Render where filesystem might not be writable/persistent on free tier
  if (process.env.RENDER) {
      console.log("[Server] Running on Render, skipping file-based history loading (ephemeral filesystem).");
      messageHistory = [];
      return;
  }
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    messageHistory = JSON.parse(data);
    console.log(`[Server] Loaded ${messageHistory.length} messages from history.`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Server] No chat history file found, starting fresh.');
      messageHistory = [];
    } else {
      console.error('[Server] Error loading chat history:', error);
      messageHistory = [];
    }
  }
}

async function saveHistory() {
   // Check if running on Render where filesystem might not be writable/persistent on free tier
   if (process.env.RENDER) {
      // console.log("[Server] Running on Render, skipping file-based history saving.");
      return;
   }
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(messageHistory, null, 2));
  } catch (error) {
    console.error('[Server] Error saving chat history:', error);
  }
}

// --- Broadcast Logic ---
function broadcast(message, sender) {
  const messageString = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

// --- Bonjour Publishing (REMOVED for public server) ---
// function publishService() { ... }
// function unpublishService(callback) { ... }


// --- Server Setup ---
async function startServer() {
    await loadHistory();

    const server = new WebSocketServer({ port: PORT });

    server.on('listening', () => {
        console.log(`[Server] WebSocket server started and listening on port ${PORT}`);
        // No longer log local network IP as it's irrelevant for public server
    });

    server.on('connection', (ws, req) => {
        // Log client connection (IP might be proxy IP on Render)
        const clientIdentifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[Server] Client connected: ${clientIdentifier}`);
        clients.add(ws);
        ws.send(JSON.stringify({ type: 'history', payload: messageHistory }));

        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                console.log('[Server] Received:', parsedMessage);
                if (parsedMessage.type === 'chat' && parsedMessage.text && parsedMessage.sender) {
                    const messageData = {
                        type: 'chat',
                        id: parsedMessage.id || `${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        text: parsedMessage.text,
                        sender: parsedMessage.sender, // Consider adding sanitization/validation
                        timestamp: parsedMessage.timestamp || Date.now()
                    };
                    messageHistory.push(messageData);
                    saveHistory(); // Attempt to save (might not persist on Render free tier)
                    broadcast(messageData, ws);
                } else {
                    console.warn('[Server] Received invalid chat message format:', parsedMessage);
                }
            } catch (e) {
                console.error('[Server] Failed to parse message or invalid message format:', message.toString(), e);
            }
        });

        ws.on('close', () => {
            console.log(`[Server] Client disconnected: ${clientIdentifier}`);
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error(`[Server] WebSocket error for client ${clientIdentifier}:`, error);
            clients.delete(ws); // Ensure client is removed on error
        });
    });

    server.on('error', (error) => {
        console.error('[Server] WebSocket Server Error:', error);
        if (error.code === 'EADDRINUSE') {
            console.error(`[Server] Port ${PORT} is already in use.`);
            process.exit(1);
        }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('[Server] Shutting down...');
        // No need to unpublish Bonjour
        await saveHistory();
        server.close(() => {
            console.log('[Server] WebSocket server closed.');
            process.exit(0);
        });
        setTimeout(() => {
            console.log('[Server] Forcing remaining connections closed.');
            clients.forEach(client => client.terminate());
            process.exit(1);
        }, 2000);
    });
}

// --- Start the Server ---
startServer();
