import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcrypt'; // Import bcrypt

// --- Define __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Azurely:<po2yOHjRLNJ4Gapv>@gcchat.aqgwni3.mongodb.net/chatApp?retryWrites=true&w=majority&appName=gcCHAT"; // Ensure correct password here
const DB_NAME = 'chatApp';
const MESSAGES_COLLECTION_NAME = 'messages';
const USERS_COLLECTION_NAME = 'users'; // Collection for user accounts
const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// --- State ---
let clients = new Map(); // Use Map to store ws -> username mapping for authenticated users
let db;
let messagesCollection;
let usersCollection; // Collection object for users

// --- MongoDB Connection ---
async function connectDB() {
    // Basic check for placeholder password - replace <...> with your actual password in the env var!
    if (!MONGODB_URI || MONGODB_URI.includes("<") || MONGODB_URI.includes(">")) {
        console.error("[Server] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password.");
        console.error("[Server] Please set the MONGODB_URI environment variable with your actual connection string.");
        process.exit(1);
    }
    try {
        const client = new MongoClient(MONGODB_URI, {
            serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
        });
        await client.connect();
        db = client.db(DB_NAME);
        messagesCollection = db.collection(MESSAGES_COLLECTION_NAME);
        usersCollection = db.collection(USERS_COLLECTION_NAME); // Get users collection
        console.log("[Server] Successfully connected to MongoDB Atlas!");
        await messagesCollection.createIndex({ timestamp: 1 });
        await usersCollection.createIndex({ username: 1 }, { unique: true }); // Ensure usernames are unique
        console.log("[Server] Database indexes checked/created.");
    } catch (error) {
        console.error("[Server] Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

// --- History Handling (DB) ---
async function loadHistoryFromDB() {
    if (!messagesCollection) return [];
    try {
        const history = await messagesCollection.find()
            .sort({ timestamp: -1 })
            .limit(100)
            .toArray();
        console.log(`[Server] Loaded ${history.length} messages from database.`);
        return history.reverse();
    } catch (error) {
        console.error("[Server] Error loading history from database:", error);
        return [];
    }
}

async function saveMessageToDB(messageData) {
    if (!messagesCollection) return;
    try {
        await messagesCollection.insertOne(messageData);
    } catch (error) {
        console.error("[Server] Error saving message to database:", error);
    }
}

// --- Broadcast Logic ---
function broadcast(message) {
  const messageString = JSON.stringify(message);
  // Send only to authenticated clients
  clients.forEach((username, ws) => {
    if (username && ws.readyState === WebSocket.OPEN) { // Check if username is associated (logged in)
      ws.send(messageString);
    }
  });
}

// --- Authentication Logic ---
async function handleSignup(ws, data) {
    const { username, password } = data;
    if (!username || !password) {
        return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username and password required' }));
    }
    try {
        const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username already taken' }));
        }
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await usersCollection.insertOne({ username: username.toLowerCase(), password: hashedPassword });
        console.log(`[Server] User created: ${username}`);
        ws.send(JSON.stringify({ type: 'signup-response', success: true }));
    } catch (error) {
        console.error("[Server] Signup error:", error);
        ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Server error during signup' }));
    }
}

async function handleLogin(ws, data) {
    const { username, password } = data;
    if (!username || !password) {
        return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Username and password required' }));
    }
    try {
        const user = await usersCollection.findOne({ username: username.toLowerCase() });
        if (!user) {
            return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Invalid username or password' }));
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Invalid username or password' }));
        }

        // Login successful - associate username with this WebSocket connection
        clients.set(ws, user.username); // Store username (use original case if desired, but comparison was lowercase)
        console.log(`[Server] User logged in: ${user.username}`);

        // Send login success and initial history
        const initialHistory = await loadHistoryFromDB();
        ws.send(JSON.stringify({ type: 'login-response', success: true, username: user.username }));
        ws.send(JSON.stringify({ type: 'history', payload: initialHistory }));

    } catch (error) {
        console.error("[Server] Login error:", error);
        ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Server error during login' }));
    }
}

async function handleChatMessage(ws, data) {
    const username = clients.get(ws); // Get username associated with this connection
    if (!username) {
        console.warn("[Server] Received chat message from unauthenticated client.");
        // Optionally send an error back to the specific client
        // ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return; // Ignore message if not logged in
    }

    if (data.text) {
        const messageData = {
            type: 'chat',
            text: data.text, // Sanitize this in a real app!
            sender: username, // Use the authenticated username
            timestamp: Date.now()
        };
        await saveMessageToDB(messageData);
        broadcast(messageData); // Broadcast includes sender field now
    } else {
        console.warn('[Server] Received invalid chat message format:', data);
    }
}

// --- Server Setup ---
async function startServer() {
    await connectDB();

    const server = new WebSocketServer({ port: PORT });

    server.on('listening', () => {
        console.log(`[Server] WebSocket server started and listening on port ${PORT}`);
    });

    server.on('connection', (ws, req) => {
        const clientIdentifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[Server] Client connected: ${clientIdentifier}`);
        // Don't associate user yet, wait for login
        clients.set(ws, null); // Mark as connected but not authenticated

        // Don't send history immediately, wait for login

        ws.on('message', async (message) => {
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
                console.log('[Server] Received:', parsedMessage);

                switch (parsedMessage.type) {
                    case 'signup':
                        await handleSignup(ws, parsedMessage);
                        break;
                    case 'login':
                        await handleLogin(ws, parsedMessage);
                        break;
                    case 'chat':
                        await handleChatMessage(ws, parsedMessage);
                        break;
                    default:
                        console.warn(`[Server] Received unknown message type: ${parsedMessage.type}`);
                }
            } catch (e) {
                console.error('[Server] Failed to parse message or process:', message.toString(), e);
                // Optionally send error back to client if format is wrong
                // ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
            }
        });

        ws.on('close', () => {
            const username = clients.get(ws);
            console.log(`[Server] Client disconnected: ${clientIdentifier}${username ? ` (${username})` : ''}`);
            clients.delete(ws); // Remove client from map on disconnect
        });

        ws.on('error', (error) => {
            const username = clients.get(ws);
            console.error(`[Server] WebSocket error for client ${clientIdentifier}${username ? ` (${username})` : ''}:`, error);
            clients.delete(ws);
        });
    });

    server.on('error', (error) => {
        console.error('[Server] WebSocket Server Error:', error);
        if (error.code === 'EADDRINUSE') {
            console.error(`[Server] Port ${PORT} is already in use.`);
            process.exit(1);
        }
    });

    process.on('SIGINT', async () => {
        console.log('[Server] Shutting down...');
        server.close(() => {
            console.log('[Server] WebSocket server closed.');
            // Consider closing MongoDB client here if necessary
            process.exit(0);
        });
        setTimeout(() => {
            console.log('[Server] Forcing remaining connections closed.');
            clients.forEach((username, ws) => ws.terminate());
            process.exit(1);
        }, 3000);
    });
}

// --- Start the Server ---
startServer();
