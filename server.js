import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb'; // Import ObjectId
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
let onlineUsers = new Map(); // username -> { ws, currentChannel, isAdmin } - For presence tracking
let db;
let messagesCollection;
let usersCollection;
let channelsCollection;
let availableChannels = [DEFAULT_CHANNEL];

// --- MongoDB Connection ---
async function connectDB() { /* ... no change ... */ if (!MONGODB_URI || MONGODB_URI.includes("<") || MONGODB_URI.includes(">")) { console.error("[Server] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password."); process.exit(1); } try { const client = new MongoClient(MONGODB_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } }); await client.connect(); db = client.db(DB_NAME); messagesCollection = db.collection(MESSAGES_COLLECTION_NAME); usersCollection = db.collection(USERS_COLLECTION_NAME); channelsCollection = db.collection(CHANNELS_COLLECTION_NAME); console.log("[Server] Successfully connected to MongoDB Atlas!"); await messagesCollection.createIndex({ timestamp: 1 }); await messagesCollection.createIndex({ channel: 1, timestamp: 1 }); await usersCollection.createIndex({ username: 1 }, { unique: true }); await channelsCollection.createIndex({ name: 1 }, { unique: true }); await ensureDefaultChannel(); await loadChannels(); console.log("[Server] Database indexes and channels checked/created."); } catch (error) { console.error("[Server] Failed to connect to MongoDB:", error); process.exit(1); } }

// --- Channel Management ---
async function ensureDefaultChannel() { /* ... no change ... */ try { const defaultChannelExists = await channelsCollection.findOne({ name: DEFAULT_CHANNEL }); if (!defaultChannelExists) { await channelsCollection.insertOne({ name: DEFAULT_CHANNEL, createdAt: new Date() }); console.log(`[Server] Default channel '${DEFAULT_CHANNEL}' created.`); } } catch (error) { console.error("[Server] Error ensuring default channel:", error); } }
async function loadChannels() { /* ... no change ... */ if (!channelsCollection) return; try { const channels = await channelsCollection.find({}, { projection: { name: 1, _id: 0 } }).toArray(); availableChannels = channels.map(c => c.name); console.log("[Server] Loaded channels:", availableChannels); } catch (error) { console.error("[Server] Error loading channels:", error); availableChannels = [DEFAULT_CHANNEL]; } }

// --- History Handling (DB) ---
async function loadHistoryFromDB(channel = DEFAULT_CHANNEL, limit = 100) { /* ... no change ... */ if (!messagesCollection) return []; try { const history = await messagesCollection.find({ channel: channel }).sort({ timestamp: -1 }).limit(limit).toArray(); return history.reverse(); } catch (error) { console.error(`[Server] Error loading history for channel '${channel}':`, error); return []; } }
async function saveMessageToDB(messageData) { /* ... no change ... */ if (!messagesCollection || !messageData.channel) return; try { await messagesCollection.insertOne(messageData); } catch (error) { console.error("[Server] Error saving message to database:", error); } }

// --- Broadcast Logic ---
function broadcast(message) { /* ... no change ... */ const messageString = JSON.stringify(message); clients.forEach((userInfo, ws) => { if (userInfo && userInfo.username && ws.readyState === WebSocket.OPEN) { ws.send(messageString); } }); }
function broadcastChannelList() { /* ... no change ... */ const message = { type: 'channel-list', payload: availableChannels }; console.log("[Server] Broadcasting updated channel list:", availableChannels); broadcast(message); }
// Broadcast user presence updates
function broadcastUserStatusUpdate() {
    const userList = Array.from(onlineUsers.keys()); // Get list of online usernames
    console.log("[Server] Broadcasting user status update:", userList);
    broadcast({ type: 'user-status-update', payload: { online: userList } });
}

// --- Authentication Logic ---
async function handleSignup(ws, data) { /* ... no change ... */ if (clients.get(ws)?.username) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Already logged in' })); const { username, password } = data; if (!username || !password) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username and password required' })); try { const existingUser = await usersCollection.findOne({ username: username.toLowerCase() }); if (existingUser) return ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Username already taken' })); const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS); await usersCollection.insertOne({ username: username.toLowerCase(), password: hashedPassword, admin: false, profilePicture: null, aboutMe: "", createdAt: new Date() }); console.log(`[Server] User created: ${username}`); ws.send(JSON.stringify({ type: 'signup-response', success: true })); } catch (error) { console.error("[Server] Signup error:", error); ws.send(JSON.stringify({ type: 'signup-response', success: false, error: 'Server error during signup' })); } }

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
        const userInfo = { username: user.username, currentChannel: currentChannel, isAdmin: user.admin || false };
        clients.set(ws, userInfo);
        onlineUsers.set(user.username, { ws: ws, currentChannel: currentChannel, isAdmin: userInfo.isAdmin }); // Add to presence map
        console.log(`[Server] User logged in: ${user.username} (Admin: ${userInfo.isAdmin}), joined channel: ${currentChannel}`);

        const initialHistory = await loadHistoryFromDB(currentChannel);
        ws.send(JSON.stringify({ type: 'login-response', success: true, username: user.username, isAdmin: userInfo.isAdmin }));
        ws.send(JSON.stringify({ type: 'channel-list', payload: availableChannels }));
        ws.send(JSON.stringify({ type: 'history', channel: currentChannel, payload: initialHistory }));
        broadcastUserStatusUpdate(); // Notify everyone about the new online user

    } catch (error) { console.error("[Server] Login error:", error); ws.send(JSON.stringify({ type: 'login-response', success: false, error: 'Server error during login' })); }
}

// --- Message & Action Handling ---
async function handleChatMessage(ws, data) { /* ... no change ... */ const userInfo = clients.get(ws); if (!userInfo || !userInfo.username) return; const targetChannel = userInfo.currentChannel; if (data.text && targetChannel) { const messageData = { type: 'chat', channel: targetChannel, text: data.text, sender: userInfo.username, timestamp: Date.now(), edited: false }; await saveMessageToDB(messageData); broadcast(messageData); } else { console.warn('[Server] Received invalid chat message format or missing channel:', data); } }
async function handleSwitchChannel(ws, data) { /* ... no change ... */ const userInfo = clients.get(ws); if (!userInfo || !userInfo.username) return; const requestedChannel = data.channel; if (!requestedChannel || !availableChannels.includes(requestedChannel)) { console.warn(`[Server] User ${userInfo.username} requested invalid channel: ${requestedChannel}`); return; } userInfo.currentChannel = requestedChannel; clients.set(ws, userInfo); onlineUsers.set(userInfo.username, { ...onlineUsers.get(userInfo.username), currentChannel: requestedChannel }); console.log(`[Server] User ${userInfo.username} switched to channel: ${requestedChannel}`); const channelHistory = await loadHistoryFromDB(requestedChannel); ws.send(JSON.stringify({ type: 'history', channel: requestedChannel, payload: channelHistory })); }
async function handleCreateChannel(ws, data) { /* ... no change ... */ const userInfo = clients.get(ws); if (!userInfo || !userInfo.isAdmin) { return ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: Admin required' })); } const channelName = data.name?.trim().toLowerCase().replace(/\s+/g, '-'); if (!channelName) { return ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel name' })); } if (availableChannels.includes(channelName)) { return ws.send(JSON.stringify({ type: 'error', message: `Channel '#${channelName}' already exists` })); } try { await channelsCollection.insertOne({ name: channelName, createdAt: new Date() }); console.log(`[Server] Admin ${userInfo.username} created channel: ${channelName}`); await loadChannels(); broadcastChannelList(); } catch (error) { console.error(`[Server] Error creating channel ${channelName}:`, error); ws.send(JSON.stringify({ type: 'error', message: 'Server error creating channel' })); } }
async function handleDeleteChannel(ws, data) { /* ... no change ... */ const userInfo = clients.get(ws); if (!userInfo || !userInfo.isAdmin) { return ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: Admin required' })); } const channelName = data.channel; if (!channelName || channelName === DEFAULT_CHANNEL) { return ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel or cannot delete default channel' })); } if (!availableChannels.includes(channelName)) { return ws.send(JSON.stringify({ type: 'error', message: `Channel '#${channelName}' does not exist` })); } try { const deleteChannelResult = await channelsCollection.deleteOne({ name: channelName }); const deleteMessagesResult = await messagesCollection.deleteMany({ channel: channelName }); console.log(`[Server] Admin ${userInfo.username} deleted channel: ${channelName}. Channel deleted: ${deleteChannelResult.deletedCount}, Messages deleted: ${deleteMessagesResult.deletedCount}`); await loadChannels(); broadcastChannelList(); } catch (error) { console.error(`[Server] Error deleting channel ${channelName}:`, error); ws.send(JSON.stringify({ type: 'error', message: 'Server error deleting channel' })); } }
async function handleGetUserProfile(ws, data) { /* ... no change ... */ const userInfo = clients.get(ws); if (!userInfo || !userInfo.username) return; const targetUsername = data.username; if (!targetUsername) return; try { const profile = await usersCollection.findOne( { username: targetUsername.toLowerCase() }, { projection: { username: 1, aboutMe: 1, profilePicture: 1, _id: 0 } } ); if (profile) { ws.send(JSON.stringify({ type: 'user-profile-response', success: true, profile: profile })); } else { ws.send(JSON.stringify({ type: 'user-profile-response', success: false, error: 'User not found' })); } } catch (error) { console.error(`[Server] Error fetching profile for ${targetUsername}:`, error); ws.send(JSON.stringify({ type: 'user-profile-response', success: false, error: 'Server error fetching profile' })); } }

// --- New Handlers for Edit/Delete ---
async function handleEditMessage(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return; // Must be logged in

    const { messageId, newText } = data;
    if (!messageId || !newText?.trim()) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid edit request' }));
    }

    try {
        const messageObjectId = new ObjectId(messageId); // Convert string ID to ObjectId
        const message = await messagesCollection.findOne({ _id: messageObjectId });

        if (!message) {
            return ws.send(JSON.stringify({ type: 'error', message: 'Message not found' }));
        }
        // Check ownership
        if (message.sender !== userInfo.username) {
            return ws.send(JSON.stringify({ type: 'error', message: 'You can only edit your own messages' }));
        }

        // Perform update
        const updateResult = await messagesCollection.updateOne(
            { _id: messageObjectId },
            { $set: { text: newText.trim(), edited: true, editedTimestamp: Date.now() } }
        );

        if (updateResult.modifiedCount === 1) {
            console.log(`[Server] User ${userInfo.username} edited message ${messageId}`);
            // Broadcast the update
            broadcast({ type: 'message-edited', payload: { _id: messageId, channel: message.channel, text: newText.trim(), edited: true } });
        } else {
             ws.send(JSON.stringify({ type: 'error', message: 'Failed to edit message' }));
        }
    } catch (error) {
        console.error(`[Server] Error editing message ${messageId}:`, error);
        ws.send(JSON.stringify({ type: 'error', message: 'Server error editing message' }));
    }
}

async function handleDeleteMessage(ws, data) {
     const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return; // Must be logged in

    const { messageId } = data;
    if (!messageId) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid delete request' }));
    }

    try {
        const messageObjectId = new ObjectId(messageId); // Convert string ID to ObjectId
        const message = await messagesCollection.findOne({ _id: messageObjectId });

        if (!message) {
            // Message already deleted, ignore
            return;
        }
        // Check ownership (or admin status for deletion?) - For now, only self-delete
        if (message.sender !== userInfo.username /* && !userInfo.isAdmin */) {
            return ws.send(JSON.stringify({ type: 'error', message: 'You can only delete your own messages' }));
        }

        // Perform delete
        const deleteResult = await messagesCollection.deleteOne({ _id: messageObjectId });

        if (deleteResult.deletedCount === 1) {
            console.log(`[Server] User ${userInfo.username} deleted message ${messageId}`);
            // Broadcast the deletion
            broadcast({ type: 'message-deleted', payload: { _id: messageId, channel: message.channel } });
        } else {
             ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete message' }));
        }
    } catch (error) {
        console.error(`[Server] Error deleting message ${messageId}:`, error);
        ws.send(JSON.stringify({ type: 'error', message: 'Server error deleting message' }));
    }
}

// --- Get All Users for User List ---
async function handleGetAllUsers(ws, data) {
    const userInfo = clients.get(ws);
    if (!userInfo || !userInfo.username) return; // Must be logged in

    try {
        const allUsers = await usersCollection.find({}, { projection: { username: 1, _id: 0 } }).toArray();
        const usernames = allUsers.map(u => u.username);
        const onlineUsernames = Array.from(onlineUsers.keys());

        ws.send(JSON.stringify({ type: 'all-users-list', payload: { all: usernames, online: onlineUsernames } }));
    } catch (error) {
        console.error("[Server] Error fetching all users:", error);
        ws.send(JSON.stringify({ type: 'error', message: 'Server error fetching user list' }));
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
                    case 'create-channel': await handleCreateChannel(ws, parsedMessage); break;
                    case 'delete-channel': await handleDeleteChannel(ws, parsedMessage); break;
                    case 'get-user-profile': await handleGetUserProfile(ws, parsedMessage); break;
                    case 'edit-message': await handleEditMessage(ws, parsedMessage); break; // New
                    case 'delete-message': await handleDeleteMessage(ws, parsedMessage); break; // New
                    case 'get-all-users': await handleGetAllUsers(ws, parsedMessage); break; // New
                    default: console.warn(`[Server] Received unknown message type: ${parsedMessage.type}`);
                }
            } catch (e) { console.error('[Server] Failed to parse message or process:', message.toString(), e); }
        });

        ws.on('close', () => {
            const userInfo = clients.get(ws);
            if (userInfo && userInfo.username) {
                onlineUsers.delete(userInfo.username); // Remove from presence map
                broadcastUserStatusUpdate(); // Notify others
            }
            console.log(`[Server] Client disconnected: ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}`);
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            const userInfo = clients.get(ws);
             if (userInfo && userInfo.username) {
                onlineUsers.delete(userInfo.username); // Remove from presence map on error too
                broadcastUserStatusUpdate();
            }
            console.error(`[Server] WebSocket error for client ${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}:`, error);
            clients.delete(ws);
        });
    });

    server.on('error', (error) => { console.error('[Server] WebSocket Server Error:', error); if (error.code === 'EADDRINUSE') { console.error(`[Server] Port ${PORT} is already in use.`); process.exit(1); } });
    process.on('SIGINT', async () => { console.log('[Server] Shutting down...'); server.close(() => { console.log('[Server] WebSocket server closed.'); process.exit(0); }); setTimeout(() => { console.log('[Server] Forcing remaining connections closed.'); clients.forEach((userInfo, ws) => ws.terminate()); process.exit(1); }, 3000); });
}

// --- Start the Server ---
startServer();
