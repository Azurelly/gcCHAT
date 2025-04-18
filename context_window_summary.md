# gcCHAT Project Context Summary (as of 2025-04-06 ~9:10 PM PDT)



## I. Project Goal:



*   Create a real-time, multi-user, multi-channel text chat application named "gcCHAT".
*   Built using Electron for the cross-platform client.
*   Designed to work over the internet via a dedicated server, not just LAN.

## II. Architecture:

### Client (Electron Application)

*   **Location:** `c:/Users/bbenn/Desktop/gcchat/electron-chat-app`
*   **Package Name:** `gcchat-client` (in `package.json`)
*   **Main Process (`main.js`):**
    *   Handles window creation, application lifecycle.
    *   Manages WebSocket connection (`ws` library) to the server (`wss://gcchat.onrender.com`).
    *   Handles IPC communication with the renderer process (`index.html`, `renderer.js`) via `preload.js`.
    *   Manages native context menus (sidebar, channel, message, user).
    *   Relays messages between renderer and WebSocket server.
    *   Logs app version to console and sends it to renderer via `status-update`.
    *   Listens for IPC events: `signup-request`, `login-request`, `send-message`, `edit-message`, `delete-message`, `switch-channel`, `create-channel`, `delete-channel`, `get-user-profile`, `start-typing`, `stop-typing`, `toggle-user-party-mode`, `request-own-profile`, `save-about-me`, `save-profile-picture`, `send-file-attachment`, `request-status`, context menu triggers (`show-sidebar-context-menu`, `show-channel-context-menu`, `show-message-context-menu`, `show-user-context-menu`, `show-attachment-menu`), `show-notification`, `send-weather-message`, `link-riot-account`.
    *   Relays server messages to renderer: `history`, `chat` (now includes `senderRiotMasteryChampionName`), `login-response`, `signup-response`, `channel-list`, `user-profile-response`, `own-profile-response`, `profile-updated`, `message-edited`, `message-deleted`, `user-list-update`, `party-mode-update`, `typing-update`, `error`, `link-riot-account-response`.
    *   Shows desktop notifications via Electron's `Notification` API for mentions when the window is not focused.
    *   Includes basic auto-update check on startup using `electron-updater`. Added console logging for updater events, relayed to renderer via IPC (`log-message`) for visibility in packaged app DevTools.
    *   **Weather:** Fetches weather data from OpenWeatherMap API using `axios` (requires `WEATHER_API_KEY` constant) via `getWeatherByCity` function. Formats and sends weather data as a chat message when triggered by `send-weather-message` IPC event.
    *   **Riot API:** Forwards `link-riot-account` IPC message from renderer to server.
*   **Renderer Process (`index.html`, `renderer.js`, `style.css`):**
    *   Displays the UI (Login/Signup view, Chat view).
    *   Chat view includes: Channel sidebar, main message area, user list sidebar, modals (profile view, profile settings, create/delete channel, weather city input).
    *   Handles user input (login, signup, message sending, file selection, Riot ID/Region linking).
    *   Sends requests via `preload.js` API.
    *   Updates the DOM based on responses/broadcasts from the main process.
    *   Manages display logic for user area (avatar, username, settings button), settings modal (About Me editing, profile picture preview/upload, **Riot account linking UI**), profile view modal (**displays Riot mastery**), channel/user lists, message rendering (including consecutive message styling, attachment links/images, mention highlighting, **Riot Mastery Plaque**), typing indicator, new messages notification bar.
    *   Handles mention suggestions (`@` trigger, filtering, keyboard navigation, selection).
    *   Handles scroll detection to show/hide "New Messages" bar.
    *   Displays app version next to title in sidebar header.
    *   Displays **persistent** channel notifications (using `electron-store` via main process):
        *   **Mentions:** Shows a red badge with mention count next to the channel name; channel name is bold white.
        *   **New Messages (No Mention):** Shows a grey "X new" indicator pushed to the far right; channel name is light grey.
        *   Indicators are cleared when the channel is viewed and scrolled to the bottom.
    *   Ensures channels always load scrolled to the bottom when switched to.
*   **Preload Script (`preload.js`):**
    *   Securely exposes specific IPC channels using `contextBridge`.
    *   Exposed methods: `sendSignup`, `sendLogin`, `sendMessage`, `editMessage`, `deleteMessage`, `sendFileAttachment`, `switchChannel`, `createChannel`, `deleteChannel`, `getUserProfile`, `startTyping`, `stopTyping`, `toggleUserPartyMode`, `requestOwnProfile`, `saveAboutMe`, `saveProfilePicture`, `requestStatus`, `showNotification`, context menu triggers (`showChannelContextMenu`, `showSidebarContextMenu`, `showMessageContextMenu`, `showUserContextMenu`, `showAttachmentMenu`), `sendWeatherMessage`, `linkRiotAccount`.
    *   Exposed listeners: `onSignupResponse`, `onLoginResponse`, `onMessageReceived`, `onMessageEdited`, `onMessageDeleted`, `onLoadHistory`, `onChannelList`, `onUserProfileResponse`, `onOwnProfileResponse`, `onProfileUpdated`, `onUserListUpdate`, `onPartyModeUpdate`, `onTypingUpdate`, `onStatusUpdate`, `onSendError`, `onError`, modal triggers (`onPromptCreateChannel`, `onConfirmDeleteChannel`, `onEditMessagePrompt`), `onTriggerFileUpload`, `onPromptSendWeather`, `onLinkRiotAccountResponse`.
    *   Includes `cleanupListeners` function.
    *   Exposes `getChannelStates` (invoke) and `updateChannelState` (send) for persistent state management.
    *   Exposes `onLogMessage` listener to receive logs from main process.
*   **Configuration Files:**
    *   `eslint.config.js`: ESLint flat config (v9+), extends recommended, integrates Prettier, allows `console.log`.
    *   `.prettierrc.json`: Prettier config (single quotes, semi-colons, tab width 2).
    *   `.gitignore`: Standard Node/Electron ignores, plus `dist/` and `uploads/`.
    *   `package.json`: Defines scripts (`start`, `lint`, `format`, `build:electron`), dependencies (`@aws-sdk/client-s3`, `axios`, `bcrypt`, `electron-store`, `electron-updater`, `mongodb`, `uuid`, `ws`), devDependencies (`@electron/rebuild`, `electron`, `electron-builder`, `@eslint/js`, `eslint`, `eslint-config-prettier`, `eslint-plugin-prettier`, `prettier`). Includes `build` section for `electron-builder` (NSIS target, GitHub publish provider).

### Server (Node.js)

*   **Location:** `c:/Users/bbenn/Desktop/gcchat/electron-chat-app/server.js`
*   **Deployment:** Deployed as a Web Service on Render (`wss://gcchat.onrender.com`). Linked to GitHub repo `https://github.com/Azurelly/gcCHAT.git` for auto-deploy on push to `main`. Uses `process.env.PORT`.
*   **Responsibilities:**
    *   Handles client connections (`ws` library).
    *   User authentication (signup/login using `bcrypt`).
    *   Channel management (creation/deletion, broadcasting list).
    *   Message handling (receiving text/file uploads, storing, broadcasting). Includes sender's Riot mastery champion name (`senderRiotMasteryChampionName`) in broadcasted/history messages if available.
    *   User presence (tracking `onlineUsers`, broadcasting `user-list-update`).
    *   Typing indicators (`start-typing`, `stop-typing`, `typing-update`).
    *   Profile data requests (`get-user-profile`, `get-own-profile`).
    *   Profile updates (`update-about-me`, `update-profile-picture`).
    *   Per-user party mode state (`toggle-user-party-mode`, `party-mode-update`).
    *   File Uploads: Receives file data (`upload-file`), uploads to AWS S3 using `@aws-sdk/client-s3`, stores public S3 URL in message document. Reads credentials/bucket/region from environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, `AWS_REGION`). Sets `ACL: 'public-read'` on uploaded objects.
    *   **Riot Account Linking:** Handles `link-riot-account` request. Uses Riot API (`axios`, requires `RIOT_API_KEY` env var) to fetch PUUID (Account-V1 using correct regional route) and highest mastery champion (Champion-Mastery-V4). Stores Riot data in user document. Fetches champion name mapping from Data Dragon on startup. Sends `link-riot-account-response` on success or failure.
*   **Database:** MongoDB Atlas (free tier).
    *   **Connection:** Configured via `MONGODB_URI` environment variable on Render. DB Name: `chatApp`.
    *   **Collections:**
        *   `users`: `username` (lowercase, unique index), `password` (hashed), `admin` (boolean), `profilePicture` (Data URL string or null), `aboutMe` (string, max 190 chars), `createdAt` (date), `riotPuuid` (string), `riotGameName` (string), `riotTagLine` (string), `riotPlatformId` (string), `riotHighestMasteryChampionId` (number), `riotHighestMasteryPoints` (number).
        *   `messages`: `channel` (string, indexed), `text` (string), `sender` (string), `timestamp` (number, indexed), `edited` (boolean), `_id` (ObjectId), `attachment` (object: `url`, `name`, `type`, `size`).
        *   `channels`: `name` (string, unique index), `createdAt` (date).

## III. Key Implementation Steps & Features:

*   **Initial Setup & Pivot:** Started LAN-based, pivoted to dedicated server on Render.
*   **Server Deployment & DB:** Configured Render, added MongoDB Atlas, refactored from file storage.
*   **User Auth:** Implemented signup/login (client UI, server logic, hashing).
*   **Multi-Channel Chat:** Server manages channels, stores/filters messages. Client displays sidebar, allows switching.
*   **Admin Features:** `admin` flag, context menus for channel create/delete via modals.
*   **Message Editing/Deletion:** Implemented via context menu, server validation, DB update, broadcast.
*   **User Profiles (View/Edit):** Click avatars/usernames for view modal. Settings modal allows editing "About Me", uploading/previewing profile pictures (stored as Data URLs in DB), and **linking Riot account (input Riot ID + Region)**. Profile picture updates broadcast via `profile-updated`. Profile view modal displays highest mastery champion if linked.
*   **User List:** Right sidebar shows Online/Offline users with avatars.
*   **Typing Indicator:** Client sends events, server manages state, client displays indicator (shows own typing).
*   **Party Mode:** Admin context menu toggles state via server broadcast.
*   **UI/UX:** Discord-inspired dark theme, message grouping, styled scrollbars, fixed various layout issues (typing indicator position, message spacing, avatar centering, attachment button alignment, channel name alignment in sidebar). **Added Riot Mastery Plaque** (`<ChampionName> Main`) next to sender name in chat messages if account is linked (styled box with text).
*   **Code Quality:** ESLint/Prettier configured and applied.
*   **Attachments:**
    *   **File Uploads (S3):** '+' button now shows a context menu. Selecting "Upload File..." triggers a hidden file input. Reads file (<=10MB), sends via IPC/WebSocket. Server uploads to S3, saves URL. Client displays images/links.
    *   **Weather:** Selecting "Send Weather..." from attachment menu opens a modal dialog prompting the user for a city name. Main process fetches data from OpenWeatherMap API (using `axios` and API key), formats it, and sends as a chat message.
*   **Mentions:**
    *   Client: `@` triggers suggestion popup, filters users, allows keyboard navigation (Arrows/Enter/Tab/Esc) and selection.
    *   Client: Messages mentioning the user (`@localUsername`) have the specific message text highlighted with a subtle background/border.
    *   Client: The `@username` text itself is highlighted distinctly and is clickable to open the user's profile.
    *   Main: Basic desktop notifications triggered for mentions when app window is not focused.
*   **Scrolling:** Auto-scrolls on send or when receiving messages while near bottom. "New Messages" bar appears when scrolled up. Channels now always load scrolled to the bottom when switched to.
*   **Channel Notifications:** Refined client-side tracking and display of channel notifications with distinct styles and positions for mentions (red badge next to name, bold white text) vs. regular new messages (grey "X new" indicator on far right, light grey text). Status is persistent across restarts using `electron-store`. Indicators clear automatically when the user switches to the channel and scrolls to the bottom. Fixed channel name alignment issue where it was pushed too far right.
*   **Auto-Updates:** Basic implementation added using `electron-updater`. Checks for updates on startup and notifies the user if one is available and downloaded. Requires publishing builds to GitHub Releases.
*   **Build Process:** Uses `electron-builder` (NSIS target). Configured to publish to GitHub Releases for auto-updates.

## IV. Current State & Last Actions (as of 2025-04-07 ~3:17 AM PDT):

*   **Added:** Riot Mastery Plaque feature:
    *   Server (`server.js`) now includes `senderRiotMasteryChampionName` in `chat` and `history` message payloads if the sender has linked their Riot account.
    *   Client (`renderer.js`) now displays a styled plaque (`<ChampionName> Main`) next to the sender's username in the message header if `senderRiotMasteryChampionName` is present.
    *   Client (`style.css`) includes styles for `.plaque` and `.riot-mastery-plaque`.
*   **Previous (Riot Linking & Fixes):**
    *   Fixed Riot account linking error handling on server.
    *   Fixed Riot account linking regional routing.
    *   Fixed Profile modal JS error.
    *   Fixed Missing IPC handler for `link-riot-account`.
    *   Added Riot account linking feature (server API calls, DB storage, client UI in settings/profile modals).
    *   Fixed Weather feature to use a modal dialog.
    *   Fixed Channel name alignment.
    *   Added Attachment context menu.
*   **Added:** `axios` dependency.
*   **Configured:** OpenWeatherMap API key added to `main.js`.
*   **Previous:** Code pushed (commit `7c17511`), app rebuilt. S3 bucket confirmed. `electron-store` and `electron-updater` added.

## V. Workflow Reminders:

*   **Working Directory:** `c:/Users/bbenn/Desktop/gcchat/electron-chat-app` (Use `cd electron-chat-app ; ...` for commands).
*   **Git (Standard Commit):** `git add .` -> `git commit -m "..."` -> `git push origin main` (requires approval). Use this for regular development commits.
*   **Build (Local/Test):** `npm run build:electron` (requires approval). Use this for creating local builds for testing that are *not* intended for auto-update distribution.
*   **Release Workflow (for Auto-Update):** When creating a new version for users to automatically update to:
    1.  **Commit Changes:** Ensure all desired code changes for the release are committed first (e.g., `git add . ; git commit -m "feat: Add new feature"`).
    2.  **Run Release Command:** Execute the following single command (requires approval). This handles versioning, pushing, and building/uploading to a draft release:
        ```bash
        cd electron-chat-app ; npm version patch -m "chore: Release v%s" ; git push origin main --follow-tags ; npx electron-builder --publish always
        ```
        *(Note: This requires a `GH_TOKEN` environment variable set locally with `repo` scope permissions for the `electron-builder` publish step).*
    3.  **Publish Draft Release:** The user must manually go to the GitHub Releases page, find the newly created draft release, edit notes if desired, and publish it.
*   **Server Deploy:** Pushing `server.js` changes to `main` triggers Render auto-deploy. Check Render dashboard for status and ensure environment variables are set.

*   **Standard Workflow:** For typical feature additions or bug fixes that don't require a new user-facing release immediately, use the standard Git commit and `npm run build:electron` (without publishing). Only use the Release Workflow when explicitly asked to create a distributable update.
*   **Reminder:** Every time a task involving code changes is complete, automatically push the changes to git (`git add . ; git commit -m "..." ; git push origin main`) and rebuild locally (`npm run build:electron`). Only perform the full Release Workflow when explicitly asked to create a distributable update.
