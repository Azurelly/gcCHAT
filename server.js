import { WebSocketServer, WebSocket } from 'ws';
import path from 'path'; // Keep for potential future use, though not strictly needed now
import { v4 as uuidv4 } from 'uuid';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'; // Added AWS S3 Client

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://Azurely:po2yOHjRLNJ4Gapv@gcchat.aqgwni3.mongodb.net/chatApp?retryWrites=true&w=majority&appName=gcCHAT';
const DB_NAME = 'chatApp';
const MESSAGES_COLLECTION_NAME = 'messages';
const USERS_COLLECTION_NAME = 'users';
const CHANNELS_COLLECTION_NAME = 'channels';
const SALT_ROUNDS = 10;
const DEFAULT_CHANNEL = 'general';
const TYPING_TIMEOUT_MS = 3000;
const MAX_DATA_URL_LENGTH = 1.5 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB limit

// AWS S3 Configuration (Read from Environment Variables)
const AWS_REGION = process.env.AWS_REGION || 'us-west-1'; // Default to user-provided region
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'gcchat-uploads-unique'; // Updated Default
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID; // Must be set in environment
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY; // Must be set in environment

// --- State ---
let clients = new Map(); // ws -> { username, currentChannel, isAdmin, partyMode }
let onlineUsers = new Map(); // username -> { ws, currentChannel, isAdmin }
let db;
let messagesCollection;
let usersCollection;
let channelsCollection;
let availableChannels = [DEFAULT_CHANNEL];
let typingUsers = new Map();
let s3Client; // S3 Client instance

// --- AWS S3 Client Initialization ---
function initializeS3Client() {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME || !AWS_REGION) {
    console.warn(
      '[Server] WARNING: AWS S3 environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, AWS_REGION) are not fully configured. File uploads will fail.'
    );
    s3Client = null; // Ensure client is null if not configured
    return;
  }
  try {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log(`[Server] AWS S3 Client initialized for region ${AWS_REGION} and bucket ${AWS_S3_BUCKET_NAME}`);
  } catch (error) {
    console.error('[Server] Failed to initialize AWS S3 Client:', error);
    s3Client = null;
  }
}

// --- MongoDB Connection ---
async function connectDB() {
  if (!MONGODB_URI || MONGODB_URI.includes('<') || MONGODB_URI.includes('>')) {
    console.error(
      '[Server] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password.'
    );
    process.exit(1);
  }
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    db = client.db(DB_NAME);
    messagesCollection = db.collection(MESSAGES_COLLECTION_NAME);
    usersCollection = db.collection(USERS_COLLECTION_NAME);
    channelsCollection = db.collection(CHANNELS_COLLECTION_NAME);
    console.log('[Server] Successfully connected to MongoDB Atlas!');

    await messagesCollection.createIndex({ timestamp: 1 });
    await messagesCollection.createIndex({ channel: 1, timestamp: 1 });
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    await channelsCollection.createIndex({ name: 1 }, { unique: true });

    await ensureDefaultChannel();
    await loadChannels();
    console.log('[Server] Database indexes and channels checked/created.');
  } catch (error) {
    console.error('[Server] Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// --- Channel Management ---
async function ensureDefaultChannel() {
  try {
    const defaultChannelExists = await channelsCollection.findOne({
      name: DEFAULT_CHANNEL,
    });
    if (!defaultChannelExists) {
      await channelsCollection.insertOne({
        name: DEFAULT_CHANNEL,
        createdAt: new Date(),
      });
      console.log(`[Server] Default channel '${DEFAULT_CHANNEL}' created.`);
    }
  } catch (error) {
    console.error('[Server] Error ensuring default channel:', error);
  }
}
async function loadChannels() {
  if (!channelsCollection) return;
  try {
    const channels = await channelsCollection
      .find({}, { projection: { name: 1, _id: 0 } })
      .toArray();
    availableChannels = channels.map((c) => c.name);
    console.log('[Server] Loaded channels:', availableChannels);
  } catch (error) {
    console.error('[Server] Error loading channels:', error);
    availableChannels = [DEFAULT_CHANNEL];
  }
}

// --- History Handling (DB) ---
async function loadHistoryFromDB(channel = DEFAULT_CHANNEL, limit = 100) {
  if (!messagesCollection) return [];
  try {
    const history = await messagesCollection
      .find({ channel: channel })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return history.reverse();
  } catch (error) {
    console.error(
      `[Server] Error loading history for channel '${channel}':`,
      error
    );
    return [];
  }
}
async function saveMessageToDB(messageData) {
  if (!messagesCollection || !messageData.channel) return;
  try {
    const result = await messagesCollection.insertOne(messageData);
    return result.insertedId; // Return the ID of the saved message
  } catch (error) {
    console.error('[Server] Error saving message to database:', error);
    return null;
  }
}

// --- Broadcast Logic ---
function broadcast(message) {
  const messageString = JSON.stringify(message);
  clients.forEach((userInfo, ws) => {
    if (userInfo && userInfo.username && ws.readyState === WebSocket.OPEN) {
      ws.send(messageString);
    }
  });
}
function broadcastChannelList() {
  const message = { type: 'channel-list', payload: availableChannels };
  console.log('[Server] Broadcasting updated channel list:', availableChannels);
  broadcast(message);
}
async function broadcastUserListUpdate() {
  try {
    const allUsersCursor = usersCollection.find(
      {},
      { projection: { username: 1, profilePicture: 1, _id: 0 } }
    );
    const allUserDocs = await allUsersCursor.toArray();
    const allUserDetails = allUserDocs.map(u => ({ username: u.username, profilePicture: u.profilePicture }));
    const onlineUsernames = Array.from(onlineUsers.keys());

    console.log(
      '[Server] Broadcasting user list update. All:',
      allUserDetails.length,
      'Online:',
      onlineUsernames.length
    );
    broadcast({
      type: 'user-list-update',
      payload: { all: allUserDetails, online: onlineUsernames },
    });
  } catch (error) {
    console.error('[Server] Error fetching or broadcasting user list:', error);
  }
}
function broadcastTypingUpdate() {
  const currentlyTyping = Array.from(typingUsers.keys());
  broadcast({ type: 'typing-update', payload: { typing: currentlyTyping } });
}

// --- Authentication Logic ---
async function handleSignup(ws, data) {
  if (clients.get(ws)?.username)
    return ws.send(
      JSON.stringify({
        type: 'signup-response',
        success: false,
        error: 'Already logged in',
      })
    );
  const { username, password } = data;
  if (!username || !password)
    return ws.send(
      JSON.stringify({
        type: 'signup-response',
        success: false,
        error: 'Username and password required',
      })
    );
  try {
    const existingUser = await usersCollection.findOne({
      username: username.toLowerCase(),
    });
    if (existingUser)
      return ws.send(
        JSON.stringify({
          type: 'signup-response',
          success: false,
          error: 'Username already taken',
        })
      );
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await usersCollection.insertOne({
      username: username.toLowerCase(),
      password: hashedPassword,
      admin: false,
      profilePicture: null,
      aboutMe: '',
      createdAt: new Date(),
    });
    console.log(`[Server] User created: ${username}`);
    ws.send(JSON.stringify({ type: 'signup-response', success: true }));
  } catch (error) {
    console.error('[Server] Signup error:', error);
    ws.send(
      JSON.stringify({
        type: 'signup-response',
        success: false,
        error: 'Server error during signup',
      })
    );
  }
}

async function handleLogin(ws, data) {
  if (clients.get(ws)?.username)
    return ws.send(
      JSON.stringify({
        type: 'login-response',
        success: false,
        error: 'Already logged in',
      })
    );
  const { username, password } = data;
  if (!username || !password)
    return ws.send(
      JSON.stringify({
        type: 'login-response',
        success: false,
        error: 'Username and password required',
      })
    );
  try {
    const user = await usersCollection.findOne({
      username: username.toLowerCase(),
    });
    if (!user)
      return ws.send(
        JSON.stringify({
          type: 'login-response',
          success: false,
          error: 'Invalid username or password',
        })
      );
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return ws.send(
        JSON.stringify({
          type: 'login-response',
          success: false,
          error: 'Invalid username or password',
        })
      );

    const currentChannel = DEFAULT_CHANNEL;
    const userInfo = {
      username: user.username,
      currentChannel: currentChannel,
      isAdmin: user.admin || false,
      partyMode: false,
    };
    clients.set(ws, userInfo);
    onlineUsers.set(user.username, {
      ws: ws,
      currentChannel: currentChannel,
      isAdmin: userInfo.isAdmin,
    });
    console.log(
      `[Server] User logged in: ${user.username} (Admin: ${userInfo.isAdmin}), joined channel: ${currentChannel}`
    );

    const initialHistory = await loadHistoryFromDB(currentChannel);
    ws.send(
      JSON.stringify({
        type: 'login-response',
        success: true,
        username: user.username,
        isAdmin: userInfo.isAdmin,
        profilePicture: user.profilePicture,
        aboutMe: user.aboutMe,
      })
    );
    ws.send(
      JSON.stringify({ type: 'channel-list', payload: availableChannels })
    );
    ws.send(
      JSON.stringify({
        type: 'history',
        channel: currentChannel,
        payload: initialHistory,
      })
    );
    broadcastUserListUpdate();
  } catch (error) {
    console.error('[Server] Login error:', error);
    ws.send(
      JSON.stringify({
        type: 'login-response',
        success: false,
        error: 'Server error during login',
      })
    );
  }
}

// --- Message & Action Handling ---
async function handleChatMessage(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const targetChannel = userInfo.currentChannel;
  if (data.text && targetChannel) {
    const messageData = {
      type: 'chat',
      channel: targetChannel,
      text: data.text,
      sender: userInfo.username,
      timestamp: Date.now(),
      edited: false,
    };
    const insertedId = await saveMessageToDB(messageData);
    if (insertedId) {
      messageData._id = insertedId;
      broadcast(messageData);
    }
  } else {
    console.warn(
      '[Server] Received invalid chat message format or missing channel:',
      data
    );
  }
}
async function handleSwitchChannel(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const requestedChannel = data.channel;
  if (!requestedChannel || !availableChannels.includes(requestedChannel)) {
    console.warn(
      `[Server] User ${userInfo.username} requested invalid channel: ${requestedChannel}`
    );
    return;
  }
  userInfo.currentChannel = requestedChannel;
  clients.set(ws, userInfo);
  onlineUsers.set(userInfo.username, {
    ...onlineUsers.get(userInfo.username),
    currentChannel: requestedChannel,
  });
  console.log(
    `[Server] User ${userInfo.username} switched to channel: ${requestedChannel}`
  );
  const channelHistory = await loadHistoryFromDB(requestedChannel);
  ws.send(
    JSON.stringify({
      type: 'history',
      channel: requestedChannel,
      payload: channelHistory,
    })
  );
}
async function handleCreateChannel(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.isAdmin) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Permission denied: Admin required',
      })
    );
  }
  const channelName = data.name?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!channelName) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Invalid channel name' })
    );
  }
  if (availableChannels.includes(channelName)) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: `Channel '#${channelName}' already exists`,
      })
    );
  }
  try {
    await channelsCollection.insertOne({
      name: channelName,
      createdAt: new Date(),
    });
    console.log(
      `[Server] Admin ${userInfo.username} created channel: ${channelName}`
    );
    await loadChannels();
    broadcastChannelList();
  } catch (error) {
    console.error(`[Server] Error creating channel ${channelName}:`, error);
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Server error creating channel',
      })
    );
  }
}
async function handleDeleteChannel(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.isAdmin) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Permission denied: Admin required',
      })
    );
  }
  const channelName = data.channel;
  if (!channelName || channelName === DEFAULT_CHANNEL) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Invalid channel or cannot delete default channel',
      })
    );
  }
  if (!availableChannels.includes(channelName)) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: `Channel '#${channelName}' does not exist`,
      })
    );
  }
  try {
    const deleteChannelResult = await channelsCollection.deleteOne({
      name: channelName,
    });
    const deleteMessagesResult = await messagesCollection.deleteMany({
      channel: channelName,
    });
    console.log(
      `[Server] Admin ${userInfo.username} deleted channel: ${channelName}. Channel deleted: ${deleteChannelResult.deletedCount}, Messages deleted: ${deleteMessagesResult.deletedCount}`
    );
    await loadChannels();
    broadcastChannelList();
  } catch (error) {
    console.error(`[Server] Error deleting channel ${channelName}:`, error);
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Server error deleting channel',
      })
    );
  }
}
async function handleGetUserProfile(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const targetUsername = data.username;
  if (!targetUsername) return;
  try {
    const profile = await usersCollection.findOne(
      { username: targetUsername.toLowerCase() },
      { projection: { username: 1, aboutMe: 1, profilePicture: 1, _id: 0 } }
    );
    if (profile) {
      ws.send(
        JSON.stringify({
          type: 'user-profile-response',
          success: true,
          profile: profile,
        })
      );
    } else {
      ws.send(
        JSON.stringify({
          type: 'user-profile-response',
          success: false,
          error: 'User not found',
        })
      );
    }
  } catch (error) {
    console.error(
      `[Server] Error fetching profile for ${targetUsername}:`,
      error
    );
    ws.send(
      JSON.stringify({
        type: 'user-profile-response',
        success: false,
        error: 'Server error fetching profile',
      })
    );
  }
}
async function handleEditMessage(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const { messageId, newText } = data;
  if (!messageId || !newText?.trim()) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Invalid edit request' })
    );
  }
  try {
    const messageObjectId = new ObjectId(messageId);
    const message = await messagesCollection.findOne({ _id: messageObjectId });
    if (!message) {
      return ws.send(
        JSON.stringify({ type: 'error', message: 'Message not found' })
      );
    }
    if (message.sender !== userInfo.username) {
      return ws.send(
        JSON.stringify({
          type: 'error',
          message: 'You can only edit your own messages',
        })
      );
    }
    const updateResult = await messagesCollection.updateOne(
      { _id: messageObjectId },
      {
        $set: {
          text: newText.trim(),
          edited: true,
          editedTimestamp: Date.now(),
        },
      }
    );
    if (updateResult.modifiedCount === 1) {
      console.log(
        `[Server] User ${userInfo.username} edited message ${messageId}`
      );
      broadcast({
        type: 'message-edited',
        payload: {
          _id: messageId,
          channel: message.channel,
          text: newText.trim(),
          edited: true,
        },
      });
    } else {
      ws.send(
        JSON.stringify({ type: 'error', message: 'Failed to edit message' })
      );
    }
  } catch (error) {
    console.error(`[Server] Error editing message ${messageId}:`, error);
    ws.send(
      JSON.stringify({ type: 'error', message: 'Server error editing message' })
    );
  }
}
async function handleDeleteMessage(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const { messageId } = data;
  if (!messageId) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Invalid delete request' })
    );
  }
  try {
    const messageObjectId = new ObjectId(messageId);
    const message = await messagesCollection.findOne({ _id: messageObjectId });
    if (!message) {
      return;
    }
    if (message.sender !== userInfo.username) {
      return ws.send(
        JSON.stringify({
          type: 'error',
          message: 'You can only delete your own messages',
        })
      );
    }
    const deleteResult = await messagesCollection.deleteOne({
      _id: messageObjectId,
    });
    if (deleteResult.deletedCount === 1) {
      console.log(
        `[Server] User ${userInfo.username} deleted message ${messageId}`
      );
      broadcast({
        type: 'message-deleted',
        payload: { _id: messageId, channel: message.channel },
      });
    } else {
      console.warn(
        `[Server] Message ${messageId} not found for deletion, possibly already deleted.`
      );
    }
  } catch (error) {
    console.error(`[Server] Error deleting message ${messageId}:`, error);
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Server error deleting message',
      })
    );
  }
}
function handleStartTyping(ws, _data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const username = userInfo.username;
  if (typingUsers.has(username)) {
    clearTimeout(typingUsers.get(username));
  }
  const timeoutId = setTimeout(() => {
    typingUsers.delete(username);
    broadcastTypingUpdate();
  }, TYPING_TIMEOUT_MS);
  typingUsers.set(username, timeoutId);
  broadcastTypingUpdate();
}
function handleStopTyping(ws, _data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) return;
  const username = userInfo.username;
  if (typingUsers.has(username)) {
    clearTimeout(typingUsers.get(username));
    typingUsers.delete(username);
    broadcastTypingUpdate();
  }
}

// --- Profile Settings Handlers ---
async function handleGetOwnProfile(ws) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Not logged in' })
    );
  }
  try {
    const profile = await usersCollection.findOne(
      { username: userInfo.username },
      { projection: { username: 1, aboutMe: 1, profilePicture: 1, _id: 0 } }
    );
    if (profile) {
      ws.send(
        JSON.stringify({ type: 'own-profile-response', profile: profile })
      );
    } else {
      console.error(`[Server] Could not find profile for logged-in user: ${userInfo.username}`);
      ws.send(
        JSON.stringify({ type: 'own-profile-response', profile: null })
      );
    }
  } catch (error) {
    console.error(`[Server] Error fetching own profile for ${userInfo.username}:`, error);
    ws.send(
      JSON.stringify({ type: 'own-profile-response', profile: null })
    );
  }
}

async function handleUpdateAboutMe(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Not logged in' })
    );
  }
  const newAboutMe = data.aboutMe?.trim() ?? '';
  if (newAboutMe.length > 190) {
     return ws.send(
      JSON.stringify({ type: 'error', message: 'About Me text exceeds 190 characters.' })
    );
  }
  try {
    const updateResult = await usersCollection.updateOne(
      { username: userInfo.username },
      { $set: { aboutMe: newAboutMe } }
    );
    if (updateResult.modifiedCount === 1) {
      console.log(`[Server] User ${userInfo.username} updated their About Me.`);
    } else if (updateResult.matchedCount === 1 && updateResult.modifiedCount === 0) {
      console.log(`[Server] User ${userInfo.username} About Me unchanged.`);
    } else {
       console.warn(`[Server] Failed to update About Me for user ${userInfo.username}. Matched: ${updateResult.matchedCount}`);
       ws.send(JSON.stringify({ type: 'error', message: 'Failed to update profile.' }));
    }
  } catch (error) {
     console.error(`[Server] Error updating About Me for ${userInfo.username}:`, error);
     ws.send(JSON.stringify({ type: 'error', message: 'Server error updating profile.' }));
  }
}

async function handleUpdateProfilePicture(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Not logged in' })
    );
  }
  const imageDataUrl = data.profilePicture;
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/') || imageDataUrl.length > MAX_DATA_URL_LENGTH) {
     console.warn(`[Server] Invalid profile picture data received from ${userInfo.username}. Length: ${imageDataUrl?.length}`);
     return ws.send(
      JSON.stringify({ type: 'error', message: 'Invalid or too large image data.' })
    );
  }

  try {
    const updateResult = await usersCollection.updateOne(
      { username: userInfo.username },
      { $set: { profilePicture: imageDataUrl } }
    );
    if (updateResult.modifiedCount === 1) {
      console.log(`[Server] User ${userInfo.username} updated their profile picture.`);
      broadcast({
        type: 'profile-updated',
        payload: {
          username: userInfo.username,
          profilePicture: imageDataUrl,
        },
      });
    } else {
       console.warn(`[Server] Failed to update profile picture for user ${userInfo.username}. Matched: ${updateResult.matchedCount}`);
       ws.send(JSON.stringify({ type: 'error', message: 'Failed to update profile picture.' }));
    }
  } catch (error) {
     console.error(`[Server] Error updating profile picture for ${userInfo.username}:`, error);
     ws.send(JSON.stringify({ type: 'error', message: 'Server error updating profile picture.' }));
  }
}

// --- Per-User Party Mode Handler ---
function handleToggleUserPartyMode(ws, data) {
  const adminInfo = clients.get(ws);
  if (!adminInfo || !adminInfo.isAdmin) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Permission denied: Admin required',
      })
    );
  }
  const targetUsername = data.username;
  if (!targetUsername) {
    return ws.send(
      JSON.stringify({ type: 'error', message: 'Target username required' })
    );
  }
  const targetClientInfo = onlineUsers.get(targetUsername);
  if (!targetClientInfo || !targetClientInfo.ws) {
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: `User '${targetUsername}' is not online`,
      })
    );
  }
  const targetWs = targetClientInfo.ws;
  const fullTargetInfo = clients.get(targetWs);
  if (!fullTargetInfo) {
    console.error(
      `[Server] Inconsistency: User ${targetUsername} found in onlineUsers but not in clients map.`
    );
    return ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Internal server error finding user state',
      })
    );
  }
  fullTargetInfo.partyMode = !fullTargetInfo.partyMode;
  clients.set(targetWs, fullTargetInfo);
  console.log(
    `[Server] Admin ${adminInfo.username} toggled party mode for ${targetUsername} to ${fullTargetInfo.partyMode}`
  );
  if (targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(
      JSON.stringify({
        type: 'party-mode-update',
        payload: { active: fullTargetInfo.partyMode },
      })
    );
  }
}

// --- File Upload Handler (AWS S3) ---
async function handleUploadFile(ws, data) {
  const userInfo = clients.get(ws);
  if (!userInfo || !userInfo.username) {
    return ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
  }
  if (!s3Client) {
    console.error('[Server] S3 client not initialized. Cannot upload file.');
    return ws.send(JSON.stringify({ type: 'error', message: 'File upload service not configured.' }));
  }
  const targetChannel = userInfo.currentChannel;
  if (!targetChannel) {
    return ws.send(JSON.stringify({ type: 'error', message: 'No active channel' }));
  }

  if (!data.buffer || data.buffer.type !== 'Buffer' || !Array.isArray(data.buffer.data)) {
     console.error('[Server] Invalid buffer format received for file upload:', data.buffer);
     return ws.send(JSON.stringify({ type: 'error', message: 'Invalid file data format received.' }));
  }
  const fileBuffer = Buffer.from(data.buffer.data);

  const fileName = data.name || 'upload';
  const fileType = data.fileType || 'application/octet-stream';
  const fileSize = fileBuffer.length;

  if (fileSize > MAX_UPLOAD_SIZE) {
    return ws.send(JSON.stringify({ type: 'error', message: `File size exceeds limit (${MAX_UPLOAD_SIZE / 1024 / 1024}MB)` }));
  }

  const uniqueFilename = `${uuidv4()}-${fileName}`; // S3 Object Key

  const params = {
    Bucket: AWS_S3_BUCKET_NAME,
    Key: uniqueFilename,
    Body: fileBuffer,
    ContentType: fileType,
    ACL: 'public-read', // Explicitly set object ACL to public-read
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    console.log(`[Server] User ${userInfo.username} uploaded file to S3: ${uniqueFilename} (${fileSize} bytes)`);

    // Construct the public URL
    // Note: Ensure your bucket policy allows public reads or use pre-signed URLs for more security
    const fileUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${uniqueFilename}`;

    const messageData = {
      type: 'chat',
      channel: targetChannel,
      sender: userInfo.username,
      timestamp: Date.now(),
      edited: false,
      attachment: {
        url: fileUrl, // Public S3 URL
        name: fileName,
        type: fileType,
        size: fileSize,
      },
      text: '',
    };

    const insertedId = await saveMessageToDB(messageData);
    if (insertedId) {
      messageData._id = insertedId;
      broadcast(messageData);
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to save attachment message to DB.' }));
      // TODO: Consider deleting the uploaded S3 object if DB save fails
    }
  } catch (error) {
    console.error(`[Server] Error uploading file ${uniqueFilename} to S3:`, error);
    ws.send(JSON.stringify({ type: 'error', message: 'Server error uploading file.' }));
  }
}


// --- Server Setup ---
async function startServer() {
  initializeS3Client(); // Initialize S3 client on startup
  await connectDB();
  // ensureUploadsDirectory(); // No longer needed for S3
  const server = new WebSocketServer({ port: PORT });
  server.on('listening', () =>
    console.log(
      `[Server] WebSocket server started and listening on port ${PORT}`
    )
  );

  server.on('connection', (ws, req) => {
    const clientIdentifier =
      req.headers['x-forwarded-for'] || req.socket.remoteAddress;
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
          case 'get-own-profile': await handleGetOwnProfile(ws); break;
          case 'update-about-me': await handleUpdateAboutMe(ws, parsedMessage); break;
          case 'update-profile-picture': await handleUpdateProfilePicture(ws, parsedMessage); break;
          case 'edit-message': await handleEditMessage(ws, parsedMessage); break;
          case 'delete-message': await handleDeleteMessage(ws, parsedMessage); break;
          case 'start-typing': handleStartTyping(ws, parsedMessage); break;
          case 'stop-typing': handleStopTyping(ws, parsedMessage); break;
          case 'toggle-user-party-mode': handleToggleUserPartyMode(ws, parsedMessage); break;
          case 'upload-file': await handleUploadFile(ws, parsedMessage); break; // Handles S3 upload
          default:
            console.warn(
              `[Server] Received unknown message type: ${parsedMessage.type}`
            );
        }
      } catch (e) {
        console.error(
          '[Server] Failed to parse message or process:',
          message.toString(),
          e
        );
      }
    });

    ws.on('close', () => {
      const userInfo = clients.get(ws);
      const clientDesc = `${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}`;
      console.log(`[Server] Client disconnected: ${clientDesc}`);
      if (userInfo && userInfo.username) {
        if (typingUsers.has(userInfo.username)) {
          clearTimeout(typingUsers.get(userInfo.username));
          typingUsers.delete(userInfo.username);
          broadcastTypingUpdate();
        }
        onlineUsers.delete(userInfo.username);
        broadcastUserListUpdate();
      }
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      const userInfo = clients.get(ws);
      const clientDesc = `${clientIdentifier}${userInfo?.username ? ` (${userInfo.username})` : ''}`;
      console.error(`[Server] WebSocket error for client ${clientDesc}:`, error);
      if (userInfo && userInfo.username) {
        if (typingUsers.has(userInfo.username)) {
          clearTimeout(typingUsers.get(userInfo.username));
          typingUsers.delete(userInfo.username);
          broadcastTypingUpdate();
        }
        onlineUsers.delete(userInfo.username);
        broadcastUserListUpdate();
      }
      clients.delete(ws);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    });
  });

  server.on('error', (error) => {
    console.error('[Server] WebSocket Server Error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(
        `[Server] Port ${PORT} is already in use. Is another instance running?`
      );
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
      clients.forEach((_userInfo, ws) => ws.terminate());
      process.exit(1);
    }, 3000);
  });
}

// --- Start the Server ---
startServer();
