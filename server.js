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
const CHANNELS_COLLECTION_NAME = 'channels';
const SALT_ROUNDS = 10;
const DEFAULT_CHANNEL = 'general';

// --- State ---
let clients = new Map(); // ws -> { username, currentChannel, isAdmin }
let db;
let messagesCollection;
let usersCollection;
let channelsCollection;
let availableChannels = [DEFAULT_CHANNEL];

// --- MongoDB Connection ---
async function connectDB() {
    // ... (connection logic remains the same)
    if (!MONGODB_URI || MONGODB_URI.includes("<") || MONGODB_URI.includes(">")) {
        console.error("[Server] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password."); process.exit(1);
    }
    try {
        const client = new MongoClient(MONGODB_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });
        await client.connect();
        db = client.db(DB_NAME);
        messagesCollection = db.collection(MESSAGES_COLLECTION_NAME);
        usersCollection = db.collection(USERS_COLLECTION_NAME);
        channelsCollection = db.collection(CHANNELS_COLLECTION_NAME);
        console.log("[Server] Successfully connected to MongoDB Atlas!");
        await messagesCollection.createIndex({ timestamp: 1 });
        await messagesCollection.createIndex({ channel: 1, timestamp: 1 });
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await channelsCollection.createIndex({ name: 1 }, { unique: true });
        await ensureDefaultChannel();
        await loadChannels();
        console.log("[Server] Database indexes and channels checked/created.");
    } catch (error) {
        console.error("[Server] Failed to connect to MongoDB:", error); process.exit(1);
    }
}

// --- Channel Management ---
async function ensureDefaultChannel() { /* ... no change ... */
    try { const defaultChannelExists = await channelsCollection.findOne({ name: DEFAULT_CHANNEL }); if (!defaultChannelExists) { await channelsCollection.insertOne({ name: DEFAULT_CHANNEL, createdAt: new Date() }); console.log(`[Server] Default channel '${DEFAULT_CHANNEL}' created.`); } } catch (error) { console.error("[Server] Error ensuring default channel:", error); }
}
async function loadChannels() { /* ... no change ... */
     if (!channelsCollection) return; try { const channels = await channelsCollection.find({}, { projection: { name: 1, _id: 0 } }).toArray(); availableChannels = channels.map(c => c.name); console.log("[Server] Loaded channels:", availableChannels); } catch (error) { console.error("[Server] Error loading channels:", error); availableChannels = [DEFAULT_CHANNEL]; }
}

// --- History Handling (DB) ---
async function loadHistoryFromDB(channel = DEFAULT_CHANNEL, limit = 100) { /* ... no change ... */
    if (!messagesCollection) return []; try { const history = await messagesCollection.find({ channel: channel }).sort({ timestamp: -1 }).limit(limit).toArray(); return history.reverse(); } catch (error) { console.error(`[Server] Error loading history for channel '${channel}':`, error); return []; }
}
async function saveMessageToDB(messageData) { /* ... no change ... */
    if (!messagesCollection || !messageData.channel) return; try { await messagesCollection.insertOne(messageData); } catch (error) { console.error("[Server] Error saving message to database:", error); }
}

// --- Broadcast Logic ---
// Broadcast message to relevant clients (all for now, client filters)
function broadcast(message) {
  const messageString = JSON.stringify(message);
  clients.forEach((userInfo, ws) => {
    if (userInfo && userInfo.username && ws.readyState === WebSocket.OPEN) {
      ws.send(messageString);
    }
  });
}
// Broadcast updated channel list to ALL clients
function broadcastChannelList() {
    const message = { type: 'channel-list', payload: availableChannels };
    console.log("[Server] Broadcasting updated channel list:", availableChannels);
    broadcast(message); // Use the general broadcast
}


// --- Authentication Logic ---
async function handleSignup(ws, data) { /* ... no change to core logic, new fields already added ... */
    if (clients.get(ws)?.username) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Already logged in' }));
    const { username, password } = data;
    if (!username || !password) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username and password required' }));
    try {
        const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
        if (existingUser) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username already taken' }));
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await usersCollection.insertOne({ username: username.toLowerCase(), password: hashedPassword, admin: false, profilePicture: null, aboutMe: "", createdAt: new Date() });
        console.log(`[Server] User created: ${username}`);
        ws.send(JSON.stringify({ type: 'signup-response', success: true }));
    } catch (error) { console.error("[Server] Signup error:", error); ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Server error during signup' })); }
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
        const currentChannel = DEFAULT_CHANNEL;
        // Store admin status along with username and channel
        clients.set(ws, { username: user.username, currentChannel: currentChannel, isAdmin: user.admin || false });
        console.log(`[Server] User logged in: ${user.username} (Admin: ${user.admin || false}), joined channel: ${currentChannel}`);

        const initialHistory = await loadHistoryFromDB(currentChannel);
        // Include admin status in login response
        ws.send(JSON.stringify({ type: 'login-response', success: true, username: user.username, isAdmin: user.admin || false }));
        ws.send(JSON.stringify({ type: 'channel-list', payload: availableChannels }));
        ws.send(JSON.stringify({ type: 'history', channel: currentChannel, payload: initialHistory }));

    } catch (error) { console.error("[Server] Login error:", error); ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Server error during login' })); }
}

// --- Message & Channel Action Handling ---
async function handleChatMessage(ws, data) { /* ... no change ... */
    const userInfo = clients.get(ws); if (!userInfo || !userInfo.username) return; const targetChannel = userInfo.currentChannel; if (data.text && targetChannel) { const messageData = { type: 'chat', channel: targetChannel, text: data.text, sender: userInfo.username, timestamp: Date.now() }; await saveMessageToDB(messageData); broadcast(messageData); } else { console.warn('[Server] Received invalid chat message format or missing channel:', data); }
}

async function handleSwitchChannel(ws, data) { /* ... no change ... */
    const userInfo = clients.get(ws); if (!userInfo || !userInfo.username) return; const requestedChannel = data.channel; if (!requestedChannel || !availableChannels.includes(requestedChannel)) { console.warn(`[Server] User ${userInfo.username} requested invalid channel: ${requestedChannel}`); return; } userInfo.currentChannel = requestedChannel; clients.set(ws, userInfo); console.log(`[Server] User ${userInfo.username} switched to channel: ${requestedChannel}`); const channelHistory = await loadHistoryFromDB(requestedChannel); ws.send(JSON.stringify({ type: 'history', channel: requestedChannel, payload: channelHistory }));
}

async function handleCreateChannel(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.isAdmin) { // Check if admin
        console.warn(`[Server] Non-admin user ${userInfo?.username} attempted to create channel.`);
        return ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: Admin required' }));
    }
    const channelName = data.name?.trim().toLowerCase().replace(/\s+/g, '-'); // Basic sanitization
    if (!channelName) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel name' }));
    }
    if (availableChannels.includes(channelName)) {
        return ws.send(JSON.stringify({ type: 'error', message: `Channel '#${channelName}' already exists` }));
    }

    try {
        await channelsCollection.insertOne({ name: channelName, createdAt: new Date() });
        console.log(`[Server] Admin ${userInfo.username} created channel: ${channelName}`);
        await loadChannels(); // Reload channel list from DB
        broadcastChannelList(); // Notify all clients of the new list
    } catch (error) {
        console.error(`[Server] Error creating channel ${channelName}:`, error);
        ws.send(JSON.stringify({ type: 'error', message: 'Server error creating channel' }));
    }
}

async function handleDeleteChannel(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.isAdmin) {
        console.warn(`[Server] Non-admin user ${userInfo?.username} attempted to delete channel.`);
        return ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: Admin required' }));
    }
    const channelName = data.channel;
    if (!channelName || channelName === DEFAULT_CHANNEL) { // Prevent deleting default channel
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel or cannot delete default channel' }));
    }
    if (!availableChannels.includes(channelName)) {
        return ws.send(JSON.stringify({ type: 'error', message: `Channel '#${channelName}' does not exist` }));
    }

    try {
        // Delete channel document
        const deleteChannelResult = await channelsCollection.deleteOne({ name: channelName });
        // Delete associated messages
        const deleteMessagesResult = await messagesCollection.deleteMany({ channel: channelName });

        console.log(`[Server] Admin ${userInfo.username} deleted channel: ${channelName}. Channel deleted: ${deleteChannelResult.deletedCount}, Messages deleted: ${deleteMessagesResult.deletedCount}`);

        await loadChannels(); // Reload channel list
        broadcastChannelList(); // Notify all clients

        // Maybe notify clients who were in the deleted channel? For now, they'll just see the list update.

    } catch (error) {
        console.error(`[Server] Error deleting channel ${channelName}:`, error);
        ws.send(JSON.stringify({ type: 'error', message: 'Server error deleting channel' }));
    }
}

async function handleGetUserProfile(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return; // Must be logged in to request profiles

    const targetUsername = data.username;
    if (!targetUsername) return;

    try {
        // Find user, projecting only necessary fields
        const profile = await usersCollection.findOne(
            { username: targetUsername.toLowerCase() },
            { projection: { username: 1, aboutMe: 1, profilePicture: 1, _id: 0 } } // Exclude password, admin status etc.
        );

        if (profile) {
            ws.send(JSON.stringify({ type: 'user-profile-response', success: true, profile: profile }));
        } else {
            ws.send(JSON.stringify({ type: 'user-profile-response', success: false, error: 'User not found' }));
        }
    } catch (error) {
        console.error(`[Server] Error fetching profile for ${targetUsername}:`, error);
        ws.send(JSON.stringify({ type: 'user-profile-response', success: false, error: 'Server error fetching profile' }));
    }
}


// --- Server Setup ---
async function startServer() {
    await connectDB();
    const server = new WebSocketServer({ port: PORT });
    server.on('listening', () => console.log(`[Server] WebSocket server started and listening on port ${PORT}`));

    server.on('connection', (ws, req) => {
        const clientIdentifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[Server] Client connected: ${clientIdentifier}`);
        clients.set(ws, null);

        ws.on('message', async (message) => {
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
                switch (parsedMessage.type) {
                    case 'signup': await handleSignup(ws, parsedMessage); break;
                    case 'login': await handleLogin(ws, parsedMessage); break;
                    case 'chat': await handleChatMessage(ws, parsedMessage); break;
                    case 'switch-channel': await handleSwitchChannel(ws, parsedMessage); break;
                    case 'create-channel': await handleCreateChannel(ws, parsedMessage); break; // New
                    case 'delete-channel': await handleDeleteChannel(ws, parsedMessage); break; // New
                    case 'get-user-profile': await handleGetUserProfile(ws, parsedMessage); break; // New
                    default: console.warn(`[Server] Received unknown message type: ${parsedMessage.type}`);
                }
            } catch (e) { console.error('[Server] Failed to parse message or process:', message.toString(), e); }
        });

        ws.on('close', () => { const userInfo = clients.get(ws); console.log(`[Server] Client disconnected: ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}`); clients.delete(ws); });
        ws.on('error', (error) => { const userInfo = clients.get(ws); console.error(`[Server] WebSocket error for client ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}:`, error); clients.delete(ws); });
    });

    server.on('error', (error) => { console.error('[Server] WebSocket Server Error:', error); if (error.code === 'EADDRINUSE') { console.error(`[Server] Port ${PORT} is already in use.`); process.exit(1); } });
    process.on('SIGINT', async () => { console.log('[Server] Shutting down...'); server.close(() => { console.log('[Server] WebSocket server closed.'); process.exit(0); }); setTimeout(() => { console.log('[Server] Forcing remaining connections closed.'); clients.forEach((userInfo, ws) => ws.terminate()); process.exit(1); }, 3000); });
}

// --- Start the Server ---
startServer();
