// --- DOM Elements ---
// Auth View
const authView = document.getElementById('auth-view');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const authTitle = document.getElementById('auth-title');
const toggleAuthLink = document.getElementById('toggle-signup');
const toggleAuthMessage = document.getElementById('toggle-auth-message');
const authErrorDiv = document.getElementById('auth-error');

// Chat View
const chatView = document.getElementById('chat-view');
const sidebar = document.getElementById('sidebar'); // Added sidebar
const channelListDiv = document.getElementById('channel-list'); // Added channel list container
const mainContent = document.getElementById('main-content'); // Added main content area
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const currentChannelSpan = document.getElementById('current-channel-name'); // Added current channel display
const hostInfoSpan = document.getElementById('host-info'); // Server URL
const userInfoSpan = document.getElementById('user-info'); // Logged in user (in sidebar)

// --- State ---
let localUsername = '';
let isLoginMode = true;
let currentChannel = 'general'; // Track currently viewed channel
let availableChannels = ['general']; // Store available channels

// --- UI Switching ---
function showAuthView(showLogin = true) {
    isLoginMode = showLogin;
    authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
    loginButton.style.display = isLoginMode ? 'block' : 'none';
    signupButton.style.display = isLoginMode ? 'none' : 'block';
    toggleAuthMessage.innerHTML = isLoginMode
        ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.`
        : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`;
    attachToggleListeners();
    authView.style.display = 'block';
    chatView.style.display = 'none'; // Hide chat view
    document.body.style.justifyContent = 'center';
    document.body.style.alignItems = 'center';
    hideAuthError();
}

function showChatView() {
    authView.style.display = 'none';
    chatView.style.display = 'flex'; // Show chat view (flex layout)
    document.body.style.justifyContent = 'flex-start';
    document.body.style.alignItems = 'stretch';
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
    updateChannelHighlight(); // Highlight the current channel
}

function showAuthError(message) {
    authErrorDiv.textContent = message;
    authErrorDiv.style.display = 'block';
}

function hideAuthError() {
    authErrorDiv.textContent = '';
    authErrorDiv.style.display = 'none';
}


// --- Channel UI ---
function renderChannelList() {
    channelListDiv.innerHTML = ''; // Clear existing list
    availableChannels.forEach(channelName => {
        const channelLink = document.createElement('a');
        channelLink.href = '#';
        channelLink.classList.add('channel-item');
        channelLink.dataset.channel = channelName; // Store channel name in data attribute
        channelLink.textContent = channelName;

        channelLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (channelName !== currentChannel) {
                console.log(`Requesting switch to channel: ${channelName}`);
                window.electronAPI.switchChannel(channelName);
                // History will be loaded via IPC response
            }
        });

        channelListDiv.appendChild(channelLink);
    });
    updateChannelHighlight(); // Update highlight after rendering
}

function updateChannelHighlight() {
    document.querySelectorAll('.channel-item').forEach(item => {
        if (item.dataset.channel === currentChannel) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    // Update status bar channel name
    currentChannelSpan.textContent = currentChannel;
    // Update message input placeholder
    messageInput.placeholder = `Message #${currentChannel}`;
}


// --- Message Handling ---
function addMessage(messageData) {
    // Only display messages for the currently viewed channel
    if (messageData.channel !== currentChannel) {
        // console.log(`Ignoring message for channel ${messageData.channel}, current is ${currentChannel}`);
        return;
    }

    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message');
    // ... (rest of addMessage logic remains the same) ...
    const sender = messageData.sender || 'Unknown';
    const firstLetter = sender.charAt(0) || '?';
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('message-avatar');
    avatarDiv.textContent = firstLetter;
    avatarDiv.style.backgroundColor = getAvatarColor(sender);
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('message-header');
    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender');
    senderSpan.textContent = sender;
    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = messageData.timestamp ? new Date(messageData.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    headerDiv.appendChild(senderSpan);
    headerDiv.appendChild(timestampSpan);
    const textDiv = document.createElement('div');
    textDiv.classList.add('message-text');
    textDiv.textContent = messageData.text;
    contentDiv.appendChild(headerDiv);
    contentDiv.appendChild(textDiv);
    messageContainer.appendChild(avatarDiv);
    messageContainer.appendChild(contentDiv);
    messagesDiv.appendChild(messageContainer);

    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 5;
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() {
    messagesDiv.innerHTML = '';
}

// --- Status Update ---
function updateStatus(status) {
    console.log("Status Update:", status);
    let statusText = '';
    let serverInfoText = '';
    let userInfoText = '';

    if (status.username) localUsername = status.username;
    if (status.currentChannel) currentChannel = status.currentChannel; // Update current channel from status

    if (status.connected) { // Logged in
        statusText = 'Online';
        serverInfoText = ''; // Hide server URL in status bar
        userInfoText = `${localUsername}`;
    } else if (status.wsConnected) { // Socket connected, not logged in
        statusText = 'Authenticating...';
        serverInfoText = '';
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else if (status.connecting) {
        statusText = `Connecting...`;
        serverInfoText = '';
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else if (status.error) {
        statusText = `Error: ${status.error}`;
        serverInfoText = '';
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else { // Disconnected
        statusText = 'Disconnected';
        serverInfoText = '';
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
    }

    connectionStatusSpan.textContent = statusText;
    hostInfoSpan.textContent = serverInfoText; // Server URL hidden via CSS now
    userInfoSpan.textContent = userInfoText;
    currentChannelSpan.textContent = currentChannel || '...'; // Show current channel

    const isLoggedIn = !!localUsername;
    messageInput.disabled = !isLoggedIn;
    sendButton.disabled = !isLoggedIn;
    if (isLoggedIn) updateChannelHighlight(); // Ensure highlight is correct on status update
}


// --- Event Listeners ---
loginButton.addEventListener('click', () => { /* ... no change ... */
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) { hideAuthError(); window.electronAPI.sendLogin({ username, password }); }
    else { showAuthError('Please enter both username and password.'); }
});
signupButton.addEventListener('click', () => { /* ... no change ... */
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) { hideAuthError(); window.electronAPI.sendSignup({ username, password }); }
    else { showAuthError('Please enter both username and password.'); }
});
function attachToggleListeners() { /* ... no change ... */
    const signupLink = document.getElementById('toggle-signup');
    const loginLink = document.getElementById('toggle-login');
    if (signupLink) signupLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(false); });
    if (loginLink) loginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(true); });
}
attachToggleListeners();
sendButton.addEventListener('click', () => { /* ... no change ... */
    const text = messageInput.value.trim();
    if (text && !messageInput.disabled) { window.electronAPI.sendMessage(text); messageInput.value = ''; }
});
messageInput.addEventListener('keypress', (e) => { /* ... no change ... */
    if (e.key === 'Enter' && !e.shiftKey && !messageInput.disabled) { e.preventDefault(); sendButton.click(); }
});
passwordInput.addEventListener('keypress', (e) => { /* ... no change ... */
    if (e.key === 'Enter') { if (isLoginMode) loginButton.click(); else signupButton.click(); }
});


// --- IPC Listeners ---
window.electronAPI.onSignupResponse(response => { /* ... no change ... */
    console.log('Signup Response:', response);
    if (response.success) { showAuthView(true); alert('Signup successful! Please log in.'); }
    else { showAuthError(response.error || 'Signup failed.'); }
});

window.electronAPI.onLoginResponse(response => {
    console.log('Login Response:', response);
    if (response.success) {
        localUsername = response.username;
        currentChannel = 'general'; // Assume default channel initially
        hideAuthError();
        showChatView(); // Switch view
        userInfoSpan.textContent = `${localUsername}`;
        connectionStatusSpan.textContent = 'Online';
        // Channel list and history are loaded via separate messages now
    } else {
        showAuthError(response.error || 'Login failed.');
    }
});

// Handle channel list from server
window.electronAPI.onChannelList(response => {
    console.log('Channel List:', response.payload);
    availableChannels = response.payload || ['general'];
    renderChannelList(); // Render the list in the sidebar
});

// Handle incoming messages (now includes channel)
window.electronAPI.onMessageReceived((messageData) => {
    addMessage(messageData); // addMessage now filters by currentChannel
});

// Handle history loading (now includes channel)
window.electronAPI.onLoadHistory((data) => {
    console.log(`Loading history for channel: ${data.channel}`);
    // Only clear and load if the history is for the currently viewed channel
    if (data.channel === currentChannel) {
        clearMessages();
        data.payload.forEach(msg => addMessage(msg));
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll down after loading
    }
    // Update current channel state and UI highlight (in case switch was initiated)
    currentChannel = data.channel;
    updateChannelHighlight();
});

window.electronAPI.onStatusUpdate((status) => { updateStatus(status); });
window.electronAPI.onSendError((errorMsg) => { /* ... no change ... */
    console.error('Send Error:', errorMsg);
    if (chatView.style.display !== 'none') {
        const errorDiv = document.createElement('div'); errorDiv.style.color = '#f04747'; errorDiv.style.fontStyle = 'italic'; errorDiv.style.padding = '5px 20px'; errorDiv.textContent = `Error: ${errorMsg}`; messagesDiv.appendChild(errorDiv); messagesDiv.scrollTop = messagesDiv.scrollHeight; setTimeout(() => { if (errorDiv.parentNode === messagesDiv) messagesDiv.removeChild(errorDiv); }, 5000);
    } else { showAuthError(`Send Error: ${errorMsg}`); }
});

// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => { window.electronAPI.cleanupListeners(); });
// Initialize view
showAuthView(true);

console.log('renderer.js loaded with channel logic');

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash |= 0; } return Math.abs(hash); }
function getAvatarColor(username) { const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#1abc9c', '#e91e63', '#f1c40f']; const hash = simpleHash(username || 'default'); return colors[hash % colors.length]; }
