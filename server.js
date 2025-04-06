import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcrypt';

// --- Define __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Azurely:<po2yOHjRLNJ4Gapv>@gcchat.aqgwni3.mongodb.net/chatApp?retryWrites=true&w=majority&appName=gcCHAT"; // Ensure correct password here
const DB_NAME = 'chatApp';
const MESSAGES_COLLECTION_NAME = 'messages';
const USERS_COLLECTION_NAME = 'users';
const CHANNELS_COLLECTION_NAME = 'channels'; // Collection for channels
const SALT_ROUNDS = 10;
const DEFAULT_CHANNEL = 'general'; // Default channel name

// --- State ---
let clients = new Map(); // ws -> { username, currentChannel }
let db;
let messagesCollection;
let usersCollection;
let channelsCollection; // Collection object for channels
let availableChannels = [DEFAULT_CHANNEL]; // In-memory cache of channel names

// --- MongoDB Connection ---
async function connectDB() {
    if (!MONGODB_URI || MONGODB_URI.includes("<") || MONGODB_URI.includes(">")) {
        console.error("[Server] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password.");
        process.exit(1);
    }
    try {
        const client = new MongoClient(MONGODB_URI, {
            serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
        });
        await client.connect();
        db = client.db(DB_NAME);
        messagesCollection = db.collection(MESSAGES_COLLECTION_NAME);
        usersCollection = db.collection(USERS_COLLECTION_NAME);
        channelsCollection = db.collection(CHANNELS_COLLECTION_NAME); // Get channels collection
        console.log("[Server] Successfully connected to MongoDB Atlas!");

        // Ensure indexes
        await messagesCollection.createIndex({ timestamp: 1 });
        await messagesCollection.createIndex({ channel: 1, timestamp: 1 }); // Index for channel-specific history
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await channelsCollection.createIndex({ name: 1 }, { unique: true }); // Ensure channel names are unique

        // Ensure default channel exists and load channels
        await ensureDefaultChannel();
        await loadChannels();

        console.log("[Server] Database indexes and channels checked/created.");
    } catch (error) {
        console.error("[Server] Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

// --- Channel Management ---
async function ensureDefaultChannel() {
    try {
        const defaultChannelExists = await channelsCollection.findOne({ name: DEFAULT_CHANNEL });
        if (!defaultChannelExists) {
            await channelsCollection.insertOne({ name: DEFAULT_CHANNEL, createdAt: new Date() });
            console.log(`[Server] Default channel '${DEFAULT_CHANNEL}' created.`);
        }
    } catch (error) {
        console.error("[Server] Error ensuring default channel:", error);
    }
}

async function loadChannels() {
     if (!channelsCollection) return;
     try {
        const channels = await channelsCollection.find({}, { projection: { name: 1, _id: 0 } }).toArray();
        availableChannels = channels.map(c => c.name);
        console.log("[Server] Loaded channels:", availableChannels);
     } catch (error) {
         console.error("[Server] Error loading channels:", error);
         availableChannels = [DEFAULT_CHANNEL]; // Fallback
     }
}

// --- History Handling (DB) ---
async function loadHistoryFromDB(channel = DEFAULT_CHANNEL, limit = 100) {
    if (!messagesCollection) return [];
    try {
        const history = await messagesCollection.find({ channel: channel }) // Filter by channel
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
        // console.log(`[Server] Loaded ${history.length} messages from channel '${channel}'.`);
        return history.reverse();
    } catch (error) {
        console.error(`[Server] Error loading history for channel '${channel}':`, error);
        return [];
    }
}

async function saveMessageToDB(messageData) { // messageData should include channel
    if (!messagesCollection) return;
    if (!messageData.channel) { // Ensure channel is set
        console.error("[Server] Attempted to save message without channel:", messageData);
        return;
    }
    try {
        await messagesCollection.insertOne(messageData);
    } catch (error) {
        console.error("[Server] Error saving message to database:", error);
    }
}

// --- Broadcast Logic ---
// Option 1: Broadcast all messages, client filters (Simpler server)
function broadcast(message) {
  const messageString = JSON.stringify(message);
  clients.forEach((userInfo, ws) => {
    if (userInfo && userInfo.username && ws.readyState === WebSocket.OPEN) {
      ws.send(messageString);
    }
  });
}
// Option 2: Broadcast only to clients in the same channel (More complex, less traffic)
/*
function broadcastToChannel(message, channel) {
    const messageString = JSON.stringify(message);
    clients.forEach((userInfo, ws) => {
        if (userInfo && userInfo.username && userInfo.currentChannel === channel && ws.readyState === WebSocket.OPEN) {
            ws.send(messageString);
        }
    });
}
*/


// --- Authentication Logic ---
async function handleSignup(ws, data) {
    if (clients.get(ws)?.username) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Already logged in' }));

    const { username, password } = data;
    if (!username || !password) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username and password required' }));

    try {
        const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
        if (existingUser) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username already taken' }));

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        // Add new profile fields with defaults
        await usersCollection.insertOne({
            username: username.toLowerCase(),
            password: hashedPassword,
            admin: false, // Default admin status
            profilePicture: null, // Default profile picture
            aboutMe: "", // Default about me
            createdAt: new Date()
         });
        console.log(`[Server] User created: ${username}`);
        ws.send(JSON.stringify({ type: 'signup-response', success: true }));
    } catch (error) {
        console.error("[Server] Signup error:", error);
        ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Server error during signup' }));
    }
}

async function handleLogin(ws, data) {
    if (clients.get(ws)?.username) return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Already logged in' }));

    const { username, password } = data;
    if (!username || !password) return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Username and password required' }));

    try {
        const user = await usersCollection.findOne({ username: username.toLowerCase() });
        if (!user) return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Invalid username or password' }));

        const match = await bcrypt.compare(password, user.password);
        if (!match) return ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Invalid username or password' }));

        // Login successful
        const currentChannel = DEFAULT_CHANNEL; // Start user in default channel
        clients.set(ws, { username: user.username, currentChannel: currentChannel });
        console.log(`[Server] User logged in: ${user.username}, joined channel: ${currentChannel}`);

        // Send login success, available channels, and history for the default channel
        const initialHistory = await loadHistoryFromDB(currentChannel);
        ws.send(JSON.stringify({ type: 'login-response', success: true, username: user.username }));
        ws.send(JSON.stringify({ type: 'channel-list', payload: availableChannels })); // Send channel list
        ws.send(JSON.stringify({ type: 'history', channel: currentChannel, payload: initialHistory })); // Send history for current channel

    } catch (error) {
        console.error("[Server] Login error:", error);
        ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Server error during login' }));
    }
}

// --- Message Handling ---
async function handleChatMessage(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return console.warn("[Server] Received chat message from unauthenticated client.");

    // Message should now ideally include the channel it's intended for from the client
    // For now, assume it's for the user's current channel
    const targetChannel = userInfo.currentChannel;

    if (data.text && targetChannel) {
        const messageData = {
            type: 'chat',
            channel: targetChannel, // Add channel to message data
            text: data.text,
            sender: userInfo.username,
            timestamp: Date.now()
        };
        await saveMessageToDB(messageData);
        broadcast(messageData); // Using simple broadcast for now
        // broadcastToChannel(messageData, targetChannel); // Use this if implementing channel-specific broadcast
    } else {
        console.warn('[Server] Received invalid chat message format or missing channel:', data);
    }
}

async function handleSwitchChannel(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return console.warn("[Server] Received switch channel from unauthenticated client.");

    const requestedChannel = data.channel;
    if (!requestedChannel || !availableChannels.includes(requestedChannel)) {
        console.warn(`[Server] User ${userInfo.username} requested invalid channel: ${requestedChannel}`);
        // Optionally send error back: ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel' }));
        return;
    }

    // Update user's current channel
    userInfo.currentChannel = requestedChannel;
    clients.set(ws, userInfo); // Update map
    console.log(`[Server] User ${userInfo.username} switched to channel: ${requestedChannel}`);

    // Send history for the new channel
    const channelHistory = await loadHistoryFromDB(requestedChannel);
    ws.send(JSON.stringify({ type: 'history', channel: requestedChannel, payload: channelHistory }));
}

// --- Server Setup ---
async function startServer() {
    await connectDB();

    const server = new WebSocketServer({ port: PORT });

    server.on('listening', () => console.log(`[Server] WebSocket server started and listening on port ${PORT}`));

    server.on('connection', (ws, req) => {
        const clientIdentifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[Server] Client connected: ${clientIdentifier}`);
        clients.set(ws, null); // Mark as connected but not authenticated

        ws.on('message', async (message) => {
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);

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
                    case 'switch-channel': // Handle channel switch request
                        await handleSwitchChannel(ws, parsedMessage);
                        break;
                    // Add 'get-channels' if needed, though list is sent on login
                    // case 'get-channels':
                    //     ws.send(JSON.stringify({ type: 'channel-list', payload: availableChannels }));
                    //     break;
                    default:
                        console.warn(`[Server] Received unknown message type: ${parsedMessage.type}`);
                }
            } catch (e) {
                console.error('[Server] Failed to parse message or process:', message.toString(), e);
            }
        });

        ws.on('close', () => {
            const userInfo = clients.get(ws);
            console.log(`[Server] Client disconnected: ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}`);
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            const userInfo = clients.get(ws);
            console.error(`[Server] WebSocket error for client ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}:`, error);
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
            process.exit(0);
        });
        setTimeout(() => {
            console.log('[Server] Forcing remaining connections closed.');
            clients.forEach((userInfo, ws) => ws.terminate());
            process.exit(1);
        }, 3000);
    });
}

// --- Start the Server ---
startServer();
