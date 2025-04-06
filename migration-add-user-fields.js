import { MongoClient, ServerApiVersion } from 'mongodb';

// --- Configuration ---
// !! IMPORTANT !! For security, set MONGODB_URI as an environment variable in your terminal
// before running this script, e.g., using export (Linux/macOS) or set (Windows CMD) or $env: (PowerShell).
// The hardcoded string is a fallback for convenience ONLY and exposes credentials.
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://Azurely:<po2yOHjRLNJ4Gapv>@gcchat.aqgwni3.mongodb.net/chatApp?retryWrites=true&w=majority&appName=gcCHAT'; // Ensure correct password here
const DB_NAME = 'chatApp';
const USERS_COLLECTION_NAME = 'users';

async function runMigration() {
  console.log('[Migration] Starting: Add default user profile fields...');

  if (!MONGODB_URI || MONGODB_URI.includes('<') || MONGODB_URI.includes('>')) {
    console.error(
      '[Migration] ERROR: MongoDB connection string is missing, invalid, or contains a placeholder password.'
    );
    console.error(
      '[Migration] Please set the MONGODB_URI environment variable with your actual connection string.'
    );
    process.exit(1);
  }

  let client; // Declare client outside try block for finally block access

  try {
    // --- Connect to MongoDB ---
    console.log('[Migration] Connecting to MongoDB Atlas...');
    client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    const db = client.db(DB_NAME);
    const usersCollection = db.collection(USERS_COLLECTION_NAME);
    console.log('[Migration] Connected successfully.');

    // --- Perform the Update ---
    console.log(
      '[Migration] Finding users missing default fields (admin, profilePicture, aboutMe)...'
    );

    const filter = {
      // Find documents missing at least one of the fields
      $or: [
        { admin: { $exists: false } },
        { profilePicture: { $exists: false } },
        { aboutMe: { $exists: false } },
      ],
    };

    const updateDoc = {
      $set: {
        // Set the default values
        admin: false,
        profilePicture: null,
        aboutMe: '',
      },
    };

    const result = await usersCollection.updateMany(filter, updateDoc);

    console.log(
      `[Migration] Update complete. Matched ${result.matchedCount} users and modified ${result.modifiedCount} users.`
    );
    if (result.matchedCount > 0 && result.modifiedCount === 0) {
      console.log(
        '[Migration] Note: Users found already had the fields, no modification needed.'
      );
    } else if (result.matchedCount === 0) {
      console.log('[Migration] No users found needing updates.');
    }
  } catch (error) {
    console.error('[Migration] An error occurred:', error);
    process.exitCode = 1; // Indicate error on exit
  } finally {
    // --- Close Connection ---
    if (client) {
      console.log('[Migration] Closing MongoDB connection...');
      await client.close();
      console.log('[Migration] Connection closed.');
    }
  }
}

// --- Run the Migration ---
runMigration();
