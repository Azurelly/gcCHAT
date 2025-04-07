import { WebSocketServer, WebSocket } from 'ws';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; // Import axios

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI; // Provided by Render
const DB_NAME = 'chatApp';
const SALT_ROUNDS = 10;
// AWS S3 Config (Ensure these are set on Render)
const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'gcchat-uploads-unique'; // Default if not set
const S3_REGION = process.env.AWS_REGION || 'us-west-1'; // Default if not set
const s3Client = new S3Client({ region: S3_REGION });
// Riot API Config
const RIOT_API_KEY = process.env.RIOT_API_KEY || 'RGAPI-94226430-0b87-459a-a00f-56580bdcebc8'; // TODO: Move to env var on Render!
const RIOT_REGION_MAP = { // Platform to Regional routing
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  na1: 'americas',
  eun1: 'europe',
  euw1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  jp1: 'asia',
  kr: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

// --- State ---
let db;
let usersCollection;
let messagesCollection;
let channelsCollection;
const clients = new Map(); // Map<WebSocket, {username: string, currentChannel: string, isAdmin: boolean, partyMode: boolean}>
const onlineUsers = new Map(); // Map<username, {isAdmin: boolean, partyMode: boolean}>
const userTyping = new Map(); // Map<username, { channel: string, timeout: NodeJS.Timeout }>
let championData = {}; // To store champion ID -> name mapping

// --- Database Connection ---
async function connectDB() {
  if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI environment variable is not set.');
    process.exit(1);
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection('users');
    messagesCollection = db.collection('messages');
    channelsCollection = db.collection('channels');
    await ensureIndexes();
    console.log('[DB] Connected successfully to MongoDB Atlas');
  } catch (err) {
    console.error('[DB] Failed to connect to MongoDB Atlas:', err);
    process.exit(1);
  }
}

async function ensureIndexes() {
  try {
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    await messagesCollection.createIndex({ channel: 1 });
    await messagesCollection.createIndex({ timestamp: -1 });
    await channelsCollection.createIndex({ name: 1 }, { unique: true });
    console.log('[DB] Indexes ensured.');
  } catch (err) {
    console.error('[DB] Error ensuring indexes:', err);
  }
}

// --- Riot API Helpers ---
// Modified to accept regionalRoute
async function getRiotAccountByRiotId(gameName, tagLine, regionalRoute) {
  if (!regionalRoute) {
      throw new Error('Regional route is required for Riot Account API.');
  }
  const url = `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  try {
    console.log(`[Riot API] Fetching account for ${gameName}#${tagLine} via ${regionalRoute}`);
    const response = await axios.get(url, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
    });
    console.log(`[Riot API] Account data received for ${gameName}#${tagLine}`);
    return response.data; // { puuid, gameName, tagLine }
  } catch (error) {
    console.error(`[Riot API] Error fetching account for ${gameName}#${tagLine} via ${regionalRoute}:`, error.response?.status, error.response?.data || error.message);
    if (error.response?.status === 404) {
      throw new Error('Riot ID not found.');
    } else if (error.response?.status === 403) {
       throw new Error('Riot API Key Forbidden or Expired.');
    }
    throw new Error('Failed to fetch Riot account data.');
  }
}

async function getHighestChampionMastery(puuid, platformId) {
  // We need the PLATFORM route for CHAMPION-MASTERY-V4
  if (!platformId || !RIOT_REGION_MAP[platformId.toLowerCase()]) {
      console.error(`[Riot API] Invalid or unsupported platformId: ${platformId}`);
      throw new Error('Invalid or unsupported region provided.');
  }
  const url = `https://${platformId.toLowerCase()}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=1`;
  try {
    console.log(`[Riot API] Fetching top mastery for PUUID ${puuid} on ${platformId}`);
    const response = await axios.get(url, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
    });
    if (response.data && response.data.length > 0) {
      console.log(`[Riot API] Mastery data received for PUUID ${puuid}`);
      return response.data[0]; // { championId, championLevel, championPoints, ... }
    }
    console.log(`[Riot API] No mastery data found for PUUID ${puuid}`);
    return null; // No mastery data found
  } catch (error) {
    console.error(`[Riot API] Error fetching mastery for PUUID ${puuid} on ${platformId}:`, error.response?.status, error.response?.data || error.message);
     if (error.response?.status === 403) {
       throw new Error('Riot API Key Forbidden or Expired.');
    }
    // Don't throw an error if mastery just doesn't exist, return null
    if (error.response?.status !== 404) {
        throw new Error('Failed to fetch Riot champion mastery data.');
    }
    console.log(`[Riot API] Mastery fetch returned ${error.response?.status}, treating as no mastery found.`);
    return null;
  }
}

// --- Champion Data Fetching ---
async function fetchChampionData() {
    try {
        // Find the latest version
        const versionsUrl = 'https://ddragon.leagueoflegends.com/api/versions.json';
        const versionsResponse = await axios.get(versionsUrl);
        const latestVersion = versionsResponse.data[0];
        console.log(`[Data Dragon] Latest version: ${latestVersion}`);

        // Fetch champion data for the latest version
        const championDataUrl = `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`;
        const championResponse = await axios.get(championDataUrl);
        const champions = championResponse.data.data; // Object where keys are champion names

        // Create ID -> Name mapping
        const idToNameMap = {};
        for (const champName in champions) {
            const champInfo = champions[champName];
            idToNameMap[champInfo.key] = champInfo.name; // champInfo.key is the numerical ID as a string
        }
        championData = idToNameMap;
        console.log(`[Data Dragon] Successfully loaded data for ${Object.keys(championData).length} champions.`);
    } catch (error) {
        console.error('[Data Dragon] Failed to fetch champion data:', error.message);
        // Handle error appropriately, maybe retry or use fallback data
        championData = {}; // Ensure it's empty on failure
    }
}

function getChampionNameById(championId) {
    return championData[championId] || 'Unknown Champion'; // Return name or fallback
}


// --- WebSocket Server Logic ---
const wss = new WebSocketServer({ port: PORT });
console.log(`[Server] WebSocket server started on port ${PORT}`);

wss.on('connection', (ws) => {
  console.log('[Server] Client connected');
  clients.set(ws, { username: null, currentChannel: null, isAdmin: false, partyMode: false });

  ws.on('message', async (message) => {
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
      // console.log('[Server] Received:', parsedMessage); // Debug: Log all messages

      const clientData = clients.get(ws);
      if (!clientData) return; // Should not happen

      switch (parsedMessage.type) {
        case 'signup':
          await handleSignup(ws, parsedMessage);
          break;
        case 'login':
          await handleLogin(ws, parsedMessage);
          break;
        // --- Authenticated Routes ---
        case 'chat':
          if (clientData.username && clientData.currentChannel) {
            await handleChatMessage(ws, parsedMessage.text);
          }
          break;
        case 'upload-file':
           if (clientData.username && clientData.currentChannel && parsedMessage.buffer) {
             // Convert the received plain object buffer back to a Node.js Buffer
             const nodeBuffer = Buffer.from(parsedMessage.buffer.data);
             await handleFileUpload(ws, parsedMessage.name, parsedMessage.fileType, nodeBuffer);
           }
           break;
        case 'switch-channel':
          if (clientData.username) {
            await handleSwitchChannel(ws, parsedMessage.channel);
          }
          break;
        case 'create-channel':
          if (clientData.isAdmin) {
            await handleCreateChannel(ws, parsedMessage.name);
          } else {
            sendError(ws, 'Permission denied: Admin required');
          }
          break;
        case 'delete-channel':
          if (clientData.isAdmin) {
            await handleDeleteChannel(ws, parsedMessage.channel);
          } else {
            sendError(ws, 'Permission denied: Admin required');
          }
          break;
        case 'get-user-profile':
          if (clientData.username) {
            await handleGetUserProfile(ws, parsedMessage.username);
          }
          break;
        case 'get-own-profile': // New handler for settings
          if (clientData.username) {
            await handleGetOwnProfile(ws);
          }
          break;
        case 'update-about-me':
          if (clientData.username) {
            await handleUpdateAboutMe(ws, parsedMessage.aboutMe);
          }
          break;
        case 'update-profile-picture':
          if (clientData.username) {
            await handleUpdateProfilePicture(ws, parsedMessage.profilePicture);
          }
          break;
        case 'edit-message':
          if (clientData.username) {
            await handleEditMessage(ws, parsedMessage.messageId, parsedMessage.newText);
          }
          break;
        case 'delete-message':
          if (clientData.username) {
            await handleDeleteMessage(ws, parsedMessage.messageId);
          }
          break;
        case 'start-typing':
          if (clientData.username && clientData.currentChannel) {
            handleStartTyping(ws);
          }
          break;
        case 'stop-typing':
          if (clientData.username) {
            handleStopTyping(ws);
          }
          break;
        case 'toggle-user-party-mode':
          if (clientData.isAdmin) {
            await handleTogglePartyMode(ws, parsedMessage.username);
          } else {
            sendError(ws, 'Permission denied: Admin required');
          }
          break;
        case 'link-riot-account': // New Handler
          if (clientData.username) {
            await handleLinkRiotAccount(ws, parsedMessage.gameName, parsedMessage.tagLine, parsedMessage.platformId);
          }
          break;
        default:
          console.log(`[Server] Unknown message type: ${parsedMessage.type}`);
      }
    } catch (e) {
      console.error('[Server] Failed to parse message or handle client request:', e);
      sendError(ws, 'Invalid message format or server error.');
    }
  });

  ws.on('close', () => {
    console.log('[Server] Client disconnected');
    handleDisconnect(ws);
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[Server] WebSocket error:', error);
    handleDisconnect(ws); // Clean up on error too
    clients.delete(ws);
  });

  // Send initial channel list on connection
  sendChannelList(ws);
});

// --- Message Handlers ---

async function handleSignup(ws, credentials) {
  const { username, password } = credentials;
  if (!username || !password) {
    return sendResponse(ws, 'signup-response', { success: false, error: 'Username and password required' });
  }
  const lowerCaseUsername = username.toLowerCase();
  try {
    const existingUser = await usersCollection.findOne({ username: lowerCaseUsername });
    if (existingUser) {
      return sendResponse(ws, 'signup-response', { success: false, error: 'Username already taken' });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
      username: lowerCaseUsername,
      password: hashedPassword,
      admin: false, // Default to non-admin
      profilePicture: null, // Default PFP
      aboutMe: '', // Default About Me
      createdAt: new Date(),
      // Riot fields initialized to null/empty
      riotPuuid: null,
      riotGameName: null,
      riotTagLine: null,
      riotPlatformId: null,
      riotHighestMasteryChampionId: null,
      riotHighestMasteryPoints: null,
    };
    await usersCollection.insertOne(newUser);
    console.log(`[Auth] User ${lowerCaseUsername} signed up successfully.`);
    sendResponse(ws, 'signup-response', { success: true });
  } catch (err) {
    console.error('[Auth] Signup error:', err);
    sendResponse(ws, 'signup-response', { success: false, error: 'Server error during signup' });
  }
}

async function handleLogin(ws, credentials) {
  const { username, password } = credentials;
  if (!username || !password) {
    return sendResponse(ws, 'login-response', { success: false, error: 'Username and password required' });
  }
  const lowerCaseUsername = username.toLowerCase();
  try {
    const user = await usersCollection.findOne({ username: lowerCaseUsername });
    if (!user) {
      return sendResponse(ws, 'login-response', { success: false, error: 'Invalid username or password' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      console.log(`[Auth] User ${lowerCaseUsername} logged in successfully.`);
      const clientData = clients.get(ws);
      if (clientData) {
        clientData.username = user.username;
        clientData.isAdmin = user.admin || false;
        clientData.currentChannel = 'general'; // Default channel
        clientData.partyMode = false; // Reset party mode on login
        onlineUsers.set(user.username, { isAdmin: clientData.isAdmin, partyMode: clientData.partyMode });
        broadcastUserList();
        sendResponse(ws, 'login-response', {
          success: true,
          username: user.username,
          isAdmin: clientData.isAdmin,
          profilePicture: user.profilePicture, // Send PFP on login
          aboutMe: user.aboutMe, // Send About Me on login
          // Send Riot data if available
          riotHighestMasteryChampionName: user.riotHighestMasteryChampionId ? getChampionNameById(user.riotHighestMasteryChampionId) : null,
          riotHighestMasteryPoints: user.riotHighestMasteryPoints,
        });
        await sendChannelHistory(ws, 'general'); // Send history for default channel
      }
    } else {
      sendResponse(ws, 'login-response', { success: false, error: 'Invalid username or password' });
    }
  } catch (err) {
    console.error('[Auth] Login error:', err);
    sendResponse(ws, 'login-response', { success: false, error: 'Server error during login' });
  }
}

async function handleChatMessage(ws, text) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || !clientData.currentChannel || !text) return;

  const senderUsername = clientData.username;
  const channel = clientData.currentChannel;

  try {
    // Fetch sender's Riot mastery info
    const senderUser = await usersCollection.findOne({ username: senderUsername });
    const senderRiotMasteryChampionName = senderUser?.riotHighestMasteryChampionId
      ? getChampionNameById(senderUser.riotHighestMasteryChampionId)
      : null;

    const message = {
      channel: channel,
      sender: senderUsername,
      text: text,
      timestamp: Date.now(),
      edited: false,
      attachment: null, // Ensure attachment is null for text messages
      // Add mastery name if available
      senderRiotMasteryChampionName: senderRiotMasteryChampionName,
    };

    const result = await messagesCollection.insertOne({
        ...message,
        // Don't store the derived champion name in the DB, only broadcast it
        senderRiotMasteryChampionName: undefined
    });
    message._id = result.insertedId; // Add the ID for broadcasting

    // Broadcast the message *with* the champion name included
    broadcastMessage(channel, message);
    console.log(`[Chat] Message from ${senderUsername} in #${channel}: ${text}`);
  } catch (err) {
    console.error('[Chat] Error saving/broadcasting message:', err);
    sendError(ws, 'Failed to save message.');
  }
}

async function handleFileUpload(ws, fileName, fileType, fileBuffer) {
    const clientData = clients.get(ws);
    if (!clientData || !clientData.username || !clientData.currentChannel) return;

    const uniqueFileName = `${uuidv4()}-${fileName}`;
    const s3Params = {
        Bucket: S3_BUCKET_NAME,
        Key: uniqueFileName,
        Body: fileBuffer,
        ContentType: fileType,
        ACL: 'public-read', // Make file publicly accessible
    };

    try {
        console.log(`[S3] Uploading ${uniqueFileName} to ${S3_BUCKET_NAME}...`);
        await s3Client.send(new PutObjectCommand(s3Params));
        const fileUrl = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${uniqueFileName}`;
        console.log(`[S3] Upload successful: ${fileUrl}`);

        // Fetch sender's Riot mastery info
        const senderUser = await usersCollection.findOne({ username: clientData.username });
        const senderRiotMasteryChampionName = senderUser?.riotHighestMasteryChampionId
          ? getChampionNameById(senderUser.riotHighestMasteryChampionId)
          : null;

        // Save message to DB with attachment info
        const message = {
            channel: clientData.currentChannel,
            sender: clientData.username,
            text: '', // Text is empty for file uploads
            timestamp: Date.now(),
            edited: false,
            attachment: {
                url: fileUrl,
                name: fileName,
                type: fileType,
                size: fileBuffer.length,
            },
            // Add mastery name if available
            senderRiotMasteryChampionName: senderRiotMasteryChampionName,
        };
        const result = await messagesCollection.insertOne({
            ...message,
            // Don't store the derived champion name in the DB, only broadcast it
            senderRiotMasteryChampionName: undefined
        });
        message._id = result.insertedId; // Add ID for broadcasting

        // Broadcast the message *with* the champion name included
        broadcastMessage(clientData.currentChannel, message);
        console.log(`[Chat] File attachment from ${clientData.username} in #${clientData.currentChannel}: ${fileName}`);

    } catch (err) {
        console.error('[S3] Error uploading file or broadcasting:', err);
        sendError(ws, `Failed to upload file: ${err.message}`);
    }
}


async function handleSwitchChannel(ws, channelName) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username) return;

  // Validate channel exists (optional but good practice)
  const channelExists = await channelsCollection.findOne({ name: channelName });
  if (!channelExists) {
    return sendError(ws, `Channel #${channelName} does not exist.`);
  }

  // Leave typing status in old channel
  handleStopTyping(ws);

  clientData.currentChannel = channelName;
  console.log(`[Channel] User ${clientData.username} switched to #${channelName}`);
  await sendChannelHistory(ws, channelName);
  // Broadcast typing status for the new channel (initially empty)
  broadcastTypingStatus(channelName);
}

async function handleCreateChannel(ws, channelName) {
  if (!channelName || typeof channelName !== 'string' || channelName.trim().length === 0) {
    return sendError(ws, 'Invalid channel name.');
  }
  const trimmedName = channelName.trim().toLowerCase().replace(/\s+/g, '-'); // Basic sanitization
  try {
    const existing = await channelsCollection.findOne({ name: trimmedName });
    if (existing) {
      return sendError(ws, `Channel #${trimmedName} already exists.`);
    }
    await channelsCollection.insertOne({ name: trimmedName, createdAt: new Date() });
    console.log(`[Channel] Admin ${clients.get(ws)?.username} created channel #${trimmedName}`);
    broadcastChannelList(); // Inform all clients of the new list
  } catch (err) {
    console.error('[Channel] Error creating channel:', err);
    sendError(ws, 'Server error creating channel.');
  }
}

async function handleDeleteChannel(ws, channelName) {
  if (!channelName || channelName === 'general') {
    return sendError(ws, 'Cannot delete the general channel or invalid name.');
  }
  try {
    const result = await channelsCollection.deleteOne({ name: channelName });
    if (result.deletedCount === 1) {
      console.log(`[Channel] Admin ${clients.get(ws)?.username} deleted channel #${channelName}`);
      // Optional: Delete messages from that channel? For now, just remove the channel.
      // await messagesCollection.deleteMany({ channel: channelName });
      broadcastChannelList(); // Inform all clients
      // Maybe force clients out of the deleted channel?
      clients.forEach((clientData, clientWs) => {
        if (clientData.currentChannel === channelName) {
          handleSwitchChannel(clientWs, 'general'); // Switch them to general
        }
      });
    } else {
      sendError(ws, `Channel #${channelName} not found.`);
    }
  } catch (err) {
    console.error('[Channel] Error deleting channel:', err);
    sendError(ws, 'Server error deleting channel.');
  }
}

async function handleGetUserProfile(ws, targetUsername) {
  if (!targetUsername) return;
  try {
    const user = await usersCollection.findOne(
      { username: targetUsername.toLowerCase() },
      { projection: { password: 0 } } // Exclude password
    );
    if (user) {
      sendResponse(ws, 'user-profile-response', {
        success: true,
        profile: {
          username: user.username,
          aboutMe: user.aboutMe,
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
          // Include Riot data if available
          riotHighestMasteryChampionName: user.riotHighestMasteryChampionId ? getChampionNameById(user.riotHighestMasteryChampionId) : null,
          riotHighestMasteryPoints: user.riotHighestMasteryPoints,
        }
      });
    } else {
      sendResponse(ws, 'user-profile-response', { success: false, error: 'User not found' });
    }
  } catch (err) {
    console.error('[Profile] Error fetching user profile:', err);
    sendResponse(ws, 'user-profile-response', { success: false, error: 'Server error fetching profile' });
  }
}

async function handleGetOwnProfile(ws) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username) return;
  try {
    const user = await usersCollection.findOne(
      { username: clientData.username },
      { projection: { password: 0 } } // Exclude password
    );
    if (user) {
      sendResponse(ws, 'own-profile-response', {
        profile: { // Nest under 'profile' for consistency
          username: user.username,
          aboutMe: user.aboutMe,
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
          // Include Riot data if available
          riotGameName: user.riotGameName,
          riotTagLine: user.riotTagLine,
          riotPlatformId: user.riotPlatformId,
          riotHighestMasteryChampionName: user.riotHighestMasteryChampionId ? getChampionNameById(user.riotHighestMasteryChampionId) : null,
          riotHighestMasteryPoints: user.riotHighestMasteryPoints,
        }
      });
    } else {
      sendError(ws, 'Could not find own profile data.'); // Should not happen if logged in
    }
  } catch (err) {
    console.error('[Profile] Error fetching own profile:', err);
    sendError(ws, 'Server error fetching own profile.');
  }
}


async function handleUpdateAboutMe(ws, aboutMeText) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || typeof aboutMeText !== 'string') return;
  const trimmedAboutMe = aboutMeText.substring(0, 190); // Enforce max length
  try {
    await usersCollection.updateOne(
      { username: clientData.username },
      { $set: { aboutMe: trimmedAboutMe } }
    );
    console.log(`[Profile] User ${clientData.username} updated About Me.`);
    // No broadcast needed for About Me, refetched on profile view
    // Optionally send a success confirmation?
  } catch (err) {
    console.error('[Profile] Error updating About Me:', err);
    sendError(ws, 'Server error updating About Me.');
  }
}

async function handleUpdateProfilePicture(ws, imageDataUrl) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || (imageDataUrl !== null && typeof imageDataUrl !== 'string')) return;
  // Basic validation: check if it's null or looks like a data URL
  if (imageDataUrl !== null && !imageDataUrl.startsWith('data:image/')) {
      return sendError(ws, 'Invalid image data format.');
  }
  // Add size check? Data URLs can be large. Limit on client is better.

  try {
    await usersCollection.updateOne(
      { username: clientData.username },
      { $set: { profilePicture: imageDataUrl } } // Store null or the Data URL string
    );
    console.log(`[Profile] User ${clientData.username} updated profile picture.`);
    // Broadcast the update to all clients
    broadcast({
      type: 'profile-updated',
      payload: {
        username: clientData.username,
        profilePicture: imageDataUrl
      }
    });
  } catch (err) {
    console.error('[Profile] Error updating profile picture:', err);
    sendError(ws, 'Server error updating profile picture.');
  }
}

async function handleEditMessage(ws, messageId, newText) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || !messageId || typeof newText !== 'string') return;
  try {
    const objectId = new ObjectId(messageId);
    const message = await messagesCollection.findOne({ _id: objectId });
    if (!message) return sendError(ws, 'Message not found.');
    if (message.sender !== clientData.username) return sendError(ws, 'Permission denied.');
    if (message.attachment) return sendError(ws, 'Cannot edit messages with attachments.'); // Disallow editing attachment messages

    const result = await messagesCollection.updateOne(
      { _id: objectId },
      { $set: { text: newText, edited: true } }
    );
    if (result.modifiedCount === 1) {
      console.log(`[Chat] User ${clientData.username} edited message ${messageId}`);
      broadcast({
        type: 'message-edited',
        payload: { _id: messageId, channel: message.channel, text: newText, edited: true }
      });
    }
  } catch (err) {
    console.error('[Chat] Error editing message:', err);
    sendError(ws, 'Server error editing message.');
  }
}

async function handleDeleteMessage(ws, messageId) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || !messageId) return;
  try {
    const objectId = new ObjectId(messageId);
    const message = await messagesCollection.findOne({ _id: objectId });
    if (!message) return sendError(ws, 'Message not found.');
    // Allow admin or original sender to delete
    if (message.sender !== clientData.username && !clientData.isAdmin) {
      return sendError(ws, 'Permission denied.');
    }

    const result = await messagesCollection.deleteOne({ _id: objectId });
    if (result.deletedCount === 1) {
      console.log(`[Chat] User ${clientData.username} deleted message ${messageId}`);
      broadcast({
        type: 'message-deleted',
        payload: { _id: messageId, channel: message.channel }
      });
    }
  } catch (err) {
    console.error('[Chat] Error deleting message:', err);
    sendError(ws, 'Server error deleting message.');
  }
}

function handleStartTyping(ws) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username || !clientData.currentChannel) return;

  const username = clientData.username;
  const channel = clientData.currentChannel;

  // Clear existing timeout if user types again
  if (userTyping.has(username)) {
    clearTimeout(userTyping.get(username).timeout);
  }

  // Set new timeout
  const timeout = setTimeout(() => {
    userTyping.delete(username);
    broadcastTypingStatus(channel);
  }, 3000); // User stops typing if no event for 3 seconds

  userTyping.set(username, { channel, timeout });
  broadcastTypingStatus(channel);
}

function handleStopTyping(ws) {
  const clientData = clients.get(ws);
  if (!clientData || !clientData.username) return;

  const username = clientData.username;
  if (userTyping.has(username)) {
    const { channel, timeout } = userTyping.get(username);
    clearTimeout(timeout);
    userTyping.delete(username);
    broadcastTypingStatus(channel);
  }
}

async function handleTogglePartyMode(ws, targetUsername) {
  const adminData = clients.get(ws);
  if (!adminData || !adminData.isAdmin) return sendError(ws, 'Permission denied.');
  if (!targetUsername) return sendError(ws, 'Target username required.');

  let targetWs = null;
  let targetClientData = null;

  // Find the target client's WebSocket and data
  for (const [clientWs, clientData] of clients.entries()) {
    if (clientData.username === targetUsername) {
      targetWs = clientWs;
      targetClientData = clientData;
      break;
    }
  }

  if (!targetClientData) return sendError(ws, `User ${targetUsername} not found or not online.`);

  // Toggle the party mode state
  targetClientData.partyMode = !targetClientData.partyMode;
  // Update onlineUsers map as well
  if (onlineUsers.has(targetUsername)) {
      onlineUsers.get(targetUsername).partyMode = targetClientData.partyMode;
  }

  console.log(`[Party] Admin ${adminData.username} toggled party mode for ${targetUsername} to ${targetClientData.partyMode}`);

  // Send the update specifically to the target client
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    sendResponse(targetWs, 'party-mode-update', { active: targetClientData.partyMode });
  }
  // Also broadcast the updated user list so everyone sees the potential change (e.g., if UI reflects party mode)
  broadcastUserList();
}

async function handleLinkRiotAccount(ws, gameName, tagLine, platformId) {
    console.log(`[Profile] handleLinkRiotAccount started for user: ${clients.get(ws)?.username}`);
    const clientData = clients.get(ws);

    // Initial Validations (Send specific response type)
    if (!clientData || !clientData.username) {
        console.log('[Profile] User not logged in, sending error response.');
        sendResponse(ws, 'link-riot-account-response', { success: false, error: 'Not logged in.' });
        return; // Exit function
    }
    if (!gameName || !tagLine || !platformId) {
        console.log('[Profile] Missing input fields, sending error response.');
        sendResponse(ws, 'link-riot-account-response', { success: false, error: 'Game Name, Tag Line, and Region are required.' });
        return; // Exit function
    }

    const lowerPlatformId = platformId.toLowerCase();
    const regionalRoute = RIOT_REGION_MAP[lowerPlatformId]; // Determine regional route from platform ID

    if (!regionalRoute) { // Check if the lookup was successful
        console.log(`[Profile] Invalid region/platformId: ${platformId}, sending error response.`);
        sendResponse(ws, 'link-riot-account-response', { success: false, error: 'Invalid region selected.' });
        return; // Exit function
    }

    try {
        console.log(`[Profile] Attempting to fetch Riot account for ${gameName}#${tagLine} using route ${regionalRoute}`);
        // 1. Get PUUID from Riot ID using the correct regional route
        const accountData = await getRiotAccountByRiotId(gameName, tagLine, regionalRoute);
        const puuid = accountData.puuid;
        if (!puuid) throw new Error('Could not retrieve PUUID.');
        console.log(`[Profile] PUUID found: ${puuid}`);

        // 2. Get Highest Mastery Champion
        console.log(`[Profile] Attempting to fetch mastery for ${puuid} on ${lowerPlatformId}`);
        const masteryData = await getHighestChampionMastery(puuid, lowerPlatformId);
        const highestMasteryChampionId = masteryData ? masteryData.championId : null;
        const highestMasteryPoints = masteryData ? masteryData.championPoints : null;
        console.log(`[Profile] Mastery data: Champion ID ${highestMasteryChampionId}, Points ${highestMasteryPoints}`);

        // 3. Update User in DB
        console.log(`[Profile] Attempting to update DB for user ${clientData.username}`);
        const updateResult = await usersCollection.updateOne(
            { username: clientData.username },
            {
                $set: {
                    riotPuuid: puuid,
                    riotGameName: accountData.gameName,
                    riotTagLine: accountData.tagLine,
                    riotPlatformId: lowerPlatformId,
                    riotHighestMasteryChampionId: highestMasteryChampionId,
                    riotHighestMasteryPoints: highestMasteryPoints,
                }
            }
        );

        if (updateResult.modifiedCount >= 0) { // Treat 0 modified (already linked/same data) as success
            console.log(`[Profile] DB update successful (Modified: ${updateResult.modifiedCount}) for user ${clientData.username}. Sending success response.`);
            sendResponse(ws, 'link-riot-account-response', {
                success: true,
                profile: {
                    riotGameName: accountData.gameName,
                    riotTagLine: accountData.tagLine,
                    riotPlatformId: lowerPlatformId,
                    riotHighestMasteryChampionName: highestMasteryChampionId ? getChampionNameById(highestMasteryChampionId) : null,
                    riotHighestMasteryPoints: highestMasteryPoints,
                }
            });
        } else {
             console.error(`[Profile] DB update failed for user ${clientData.username}. Result:`, updateResult);
             throw new Error('Failed to update user document in database.');
        }

    } catch (error) {
        console.error(`[Profile] Error in handleLinkRiotAccount for ${clientData.username}:`, error.message);
        // Send specific error response back to the client
        sendResponse(ws, 'link-riot-account-response', { success: false, error: `Failed to link Riot account: ${error.message}` });
    }
}


function handleDisconnect(ws) {
  const clientData = clients.get(ws);
  if (clientData && clientData.username) {
    console.log(`[Server] User ${clientData.username} disconnected.`);
    handleStopTyping(ws); // Ensure typing status is cleared
    onlineUsers.delete(clientData.username);
    broadcastUserList();
  }
}

// --- Broadcasting & Sending ---

function sendResponse(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function sendError(ws, message) {
  sendResponse(ws, 'error', { message });
}

function broadcast(message) {
  const messageString = JSON.stringify(message);
  // console.log('[Server] Broadcasting:', message); // Debug: Log broadcasts
  clients.forEach((clientData, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // Basic broadcast - send to everyone
      clientWs.send(messageString);
    }
  });
}

// Modified broadcastMessage to accept the full message object including potential mastery name
function broadcastMessage(channel, messageObject) {
  // Ensure the message object includes the type
  const fullMessage = { type: 'chat', ...messageObject };
  const messageString = JSON.stringify(fullMessage);
  clients.forEach((clientData, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN && clientData.currentChannel === channel) {
      clientWs.send(messageString);
    }
  });
}

async function sendChannelHistory(ws, channelName) {
  try {
    const history = await messagesCollection.find({ channel: channelName })
      .sort({ timestamp: 1 }) // Sort by oldest first
      .limit(100) // Limit history length
      .toArray();

    // Efficiently fetch Riot mastery names for all unique senders in the history
    const senderUsernames = [...new Set(history.map(msg => msg.sender))];
    const senderUsers = await usersCollection.find({ username: { $in: senderUsernames } }).toArray();
    const masteryNameMap = senderUsers.reduce((map, user) => {
        if (user.riotHighestMasteryChampionId) {
            map[user.username] = getChampionNameById(user.riotHighestMasteryChampionId);
        }
        return map;
    }, {});

    // Add the mastery name to each message object before sending
    const historyWithMastery = history.map(msg => ({
        ...msg,
        senderRiotMasteryChampionName: masteryNameMap[msg.sender] || null,
    }));

    sendResponse(ws, 'history', { channel: channelName, payload: historyWithMastery });
  } catch (err) {
    console.error(`[History] Error fetching/processing history for #${channelName}:`, err);
    sendError(ws, `Failed to load history for #${channelName}.`);
  }
}

async function sendChannelList(ws) {
  try {
    const channels = await channelsCollection.find({}, { projection: { name: 1, _id: 0 } }).toArray();
    const channelNames = channels.map(c => c.name);
    if (!channelNames.includes('general')) {
      channelNames.unshift('general'); // Ensure 'general' is always first
    }
    sendResponse(ws, 'channel-list', { payload: channelNames });
  } catch (err) {
    console.error('[Channel] Error fetching channel list:', err);
    // Don't send error to client, maybe just log
  }
}

function broadcastChannelList() {
  // Fetch and broadcast the updated list to all connected clients
  channelsCollection.find({}, { projection: { name: 1, _id: 0 } }).toArray()
    .then(channels => {
      const channelNames = channels.map(c => c.name);
      if (!channelNames.includes('general')) {
        channelNames.unshift('general');
      }
      broadcast({ type: 'channel-list', payload: channelNames });
    })
    .catch(err => console.error('[Channel] Error broadcasting channel list:', err));
}

async function broadcastUserList() {
    // Fetch necessary details for all users (username, profilePicture)
    // This could be optimized by caching, but fine for now.
    try {
        const allUsersDetails = await usersCollection.find({}, {
            projection: { _id: 0, username: 1, profilePicture: 1 }
        }).toArray();

        const onlineUsernames = Array.from(onlineUsers.keys());

        broadcast({
            type: 'user-list-update',
            payload: {
                all: allUsersDetails, // Send details for all users
                online: onlineUsernames // Send just usernames of online users
            }
        });
    } catch (err) {
        console.error('[Users] Error fetching user details for broadcast:', err);
    }
}


function broadcastTypingStatus(channel) {
  const typingInChannel = [];
  userTyping.forEach((status, username) => {
    if (status.channel === channel) {
      typingInChannel.push(username);
    }
  });

  const message = {
    type: 'typing-update',
    payload: { channel: channel, typing: typingInChannel }
  };
  const messageString = JSON.stringify(message);

  clients.forEach((clientData, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN && clientData.currentChannel === channel) {
      clientWs.send(messageString);
    }
  });
}


// --- Initialization ---
async function initialize() {
  await connectDB();
  await fetchChampionData(); // Fetch champion data on startup
  // Start listening for connections
}

initialize();
