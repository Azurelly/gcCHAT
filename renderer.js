// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const authTitle = document.getElementById('auth-title');
const toggleAuthLink = document.getElementById('toggle-signup');
const toggleAuthMessage = document.getElementById('toggle-auth-message');
const authErrorDiv = document.getElementById('auth-error');

const chatView = document.getElementById('chat-view');
const sidebar = document.getElementById('sidebar');
const serverHeader = document.getElementById('server-header'); // Added server header
const channelListDiv = document.getElementById('channel-list');
const mainContent = document.getElementById('main-content');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const currentChannelSpan = document.getElementById('current-channel-name');
const hostInfoSpan = document.getElementById('host-info');
const userInfoSpan = document.getElementById('user-info');

// Profile Modal Elements
const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileModalAvatar = document.getElementById('profile-modal-avatar');
const profileModalUsername = document.getElementById('profile-modal-username');
const profileModalAboutMe = document.getElementById('profile-modal-aboutme');


// --- State ---
let localUsername = '';
let isAdmin = false; // Track admin status
let isLoginMode = true;
let currentChannel = 'general';
let availableChannels = ['general'];
let lastMessageSender = null; // For message grouping

// --- UI Switching ---
function showAuthView(showLogin = true) { /* ... no change ... */ isLoginMode = showLogin; authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up'; loginButton.style.display = isLoginMode ? 'block' : 'none'; signupButton.style.display = isLoginMode ? 'none' : 'block'; toggleAuthMessage.innerHTML = isLoginMode ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.` : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`; attachToggleListeners(); authView.style.display = 'block'; chatView.style.display = 'none'; document.body.style.justifyContent = 'center'; document.body.style.alignItems = 'center'; hideAuthError(); }
function showChatView() { /* ... no change ... */ authView.style.display = 'none'; chatView.style.display = 'flex'; document.body.style.justifyContent = 'flex-start'; document.body.style.alignItems = 'stretch'; messageInput.disabled = false; sendButton.disabled = false; messageInput.focus(); updateChannelHighlight(); }
function showAuthError(message) { /* ... no change ... */ authErrorDiv.textContent = message; authErrorDiv.style.display = 'block'; }
function hideAuthError() { /* ... no change ... */ authErrorDiv.textContent = ''; authErrorDiv.style.display = 'none'; }

// --- Profile Modal ---
function showProfileModal(profile) {
    profileModalUsername.textContent = profile.username || 'Unknown User';
    profileModalAboutMe.textContent = profile.aboutMe || ''; // Display empty string if null/undefined
    // Avatar
    const firstLetter = profile.username?.charAt(0)?.toUpperCase() || '?';
    profileModalAvatar.textContent = firstLetter;
    profileModalAvatar.style.backgroundColor = getAvatarColor(profile.username);

    profileModalBackdrop.style.display = 'flex'; // Show the modal
}
function hideProfileModal() {
    profileModalBackdrop.style.display = 'none';
    // Clear content
    profileModalUsername.textContent = '';
    profileModalAboutMe.textContent = 'Loading...';
    profileModalAvatar.textContent = '?';
    profileModalAvatar.style.backgroundColor = '#7289da';
}
closeProfileModalButton.addEventListener('click', hideProfileModal);
profileModalBackdrop.addEventListener('click', (e) => { // Close on backdrop click
    if (e.target === profileModalBackdrop) {
        hideProfileModal();
    }
});


// --- Channel UI ---
function renderChannelList() {
    channelListDiv.innerHTML = '';
    availableChannels.forEach(channelName => {
        const channelLink = document.createElement('a');
        channelLink.href = '#';
        channelLink.classList.add('channel-item');
        channelLink.dataset.channel = channelName;
        channelLink.textContent = channelName;

        channelLink.addEventListener('click', (e) => { /* ... no change ... */ e.preventDefault(); if (channelName !== currentChannel) { window.electronAPI.switchChannel(channelName); } });

        // Add context menu listener for admins (not on #general)
        if (isAdmin && channelName !== 'general') {
            channelLink.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                window.electronAPI.showChannelContextMenu(channelName);
            });
        }

        channelListDiv.appendChild(channelLink);
    });
    updateChannelHighlight();
}

function updateChannelHighlight() { /* ... no change ... */ document.querySelectorAll('.channel-item').forEach(item => { if (item.dataset.channel === currentChannel) item.classList.add('active'); else item.classList.remove('active'); }); currentChannelSpan.textContent = currentChannel; messageInput.placeholder = `Message #${currentChannel}`; }

// Add context menu listener to sidebar header for admins
serverHeader.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isAdmin) {
        window.electronAPI.showSidebarContextMenu();
    }
});


// --- Message Handling ---
function addMessage(messageData) {
    if (messageData.channel !== currentChannel) return;

    const sender = messageData.sender || 'Unknown';
    const isConsecutive = sender === lastMessageSender; // Check if same sender as last message

    let messageGroup;
    let contentDiv;

    if (isConsecutive && messagesDiv.lastElementChild?.classList.contains('message-group')) {
        // Append to the existing group
        messageGroup = messagesDiv.lastElementChild;
        contentDiv = messageGroup.querySelector('.message-group-content');
        // Remove margin-top from subsequent messages within a group
        messageGroup.style.marginTop = '2px';
    } else {
        // Start a new group
        messageGroup = document.createElement('div');
        messageGroup.classList.add('message-group');

        // Avatar Div (only for new groups)
        const firstLetter = sender.charAt(0)?.toUpperCase() || '?';
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('message-avatar');
        avatarDiv.textContent = firstLetter;
        avatarDiv.style.backgroundColor = getAvatarColor(sender);
        avatarDiv.dataset.username = sender; // Store username for click listener
        avatarDiv.addEventListener('click', () => {
            window.electronAPI.getUserProfile(sender);
        });
        messageGroup.appendChild(avatarDiv);

        // Content Div (holds header and messages)
        contentDiv = document.createElement('div');
        contentDiv.classList.add('message-group-content');

        // Header Div (Sender + Timestamp - only for new groups)
        const headerDiv = document.createElement('div');
        headerDiv.classList.add('message-header');
        const senderSpan = document.createElement('span');
        senderSpan.classList.add('sender');
        senderSpan.textContent = sender;
        senderSpan.dataset.username = sender; // Store username for click listener
        senderSpan.addEventListener('click', () => {
             window.electronAPI.getUserProfile(sender);
        });
        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('timestamp');
        timestampSpan.textContent = messageData.timestamp ? new Date(messageData.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        headerDiv.appendChild(senderSpan);
        headerDiv.appendChild(timestampSpan);
        contentDiv.appendChild(headerDiv);

        messageGroup.appendChild(contentDiv);
        messagesDiv.appendChild(messageGroup);
    }

    // Text Div (always add this)
    const textDiv = document.createElement('div');
    textDiv.classList.add('message-text');
    textDiv.textContent = messageData.text;
    contentDiv.appendChild(textDiv); // Append text to the content div

    lastMessageSender = sender; // Update last sender

    // Scroll to bottom
    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 5;
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() {
    messagesDiv.innerHTML = '';
    lastMessageSender = null; // Reset grouping on clear
}

// --- Status Update ---
function updateStatus(status) { /* ... no change needed here for new features ... */
    console.log("Status Update:", status); let statusText = ''; let serverInfoText = ''; let userInfoText = '';
    if (status.username) localUsername = status.username;
    if (status.isAdmin) isAdmin = status.isAdmin; // Store admin status
    if (status.currentChannel) currentChannel = status.currentChannel;
    if (status.connected) { statusText = 'Online'; serverInfoText = ''; userInfoText = `${localUsername}`; }
    else if (status.wsConnected) { statusText = 'Authenticating...'; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); }
    else if (status.connecting) { statusText = `Connecting...`; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); }
    else if (status.error) { statusText = `Error: ${status.error}`; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); }
    else { statusText = 'Disconnected'; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); }
    connectionStatusSpan.textContent = statusText; hostInfoSpan.textContent = serverInfoText; userInfoSpan.textContent = userInfoText; currentChannelSpan.textContent = currentChannel || '...';
    const isLoggedIn = !!localUsername; messageInput.disabled = !isLoggedIn; sendButton.disabled = !isLoggedIn;
    if (isLoggedIn) updateChannelHighlight();
    // Re-render channel list in case admin status changed (e.g., on login)
    // This is slightly inefficient but ensures context menus are added/removed correctly
    if (isLoggedIn) renderChannelList();
}


// --- Event Listeners ---
loginButton.addEventListener('click', () => { /* ... no change ... */ const username = usernameInput.value.trim(); const password = passwordInput.value.trim(); if (username && password) { hideAuthError(); window.electronAPI.sendLogin({ username, password }); } else { showAuthError('Please enter both username and password.'); } });
signupButton.addEventListener('click', () => { /* ... no change ... */ const username = usernameInput.value.trim(); const password = passwordInput.value.trim(); if (username && password) { hideAuthError(); window.electronAPI.sendSignup({ username, password }); } else { showAuthError('Please enter both username and password.'); } });
function attachToggleListeners() { /* ... no change ... */ const signupLink = document.getElementById('toggle-signup'); const loginLink = document.getElementById('toggle-login'); if (signupLink) signupLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(false); }); if (loginLink) loginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(true); }); }
attachToggleListeners();
sendButton.addEventListener('click', () => { /* ... no change ... */ const text = messageInput.value.trim(); if (text && !messageInput.disabled) { window.electronAPI.sendMessage(text); messageInput.value = ''; } });
messageInput.addEventListener('keypress', (e) => { /* ... no change ... */ if (e.key === 'Enter' && !e.shiftKey && !messageInput.disabled) { e.preventDefault(); sendButton.click(); } });
passwordInput.addEventListener('keypress', (e) => { /* ... no change ... */ if (e.key === 'Enter') { if (isLoginMode) loginButton.click(); else signupButton.click(); } });


// --- IPC Listeners ---
window.electronAPI.onSignupResponse(response => { /* ... no change ... */ console.log('Signup Response:', response); if (response.success) { showAuthView(true); alert('Signup successful! Please log in.'); } else { showAuthError(response.error || 'Signup failed.'); } });
window.electronAPI.onLoginResponse(response => { /* ... no change ... */ console.log('Login Response:', response); if (response.success) { localUsername = response.username; isAdmin = response.isAdmin || false; currentChannel = 'general'; hideAuthError(); showChatView(); userInfoSpan.textContent = `${localUsername}`; connectionStatusSpan.textContent = 'Online'; } else { showAuthError(response.error || 'Login failed.'); } });
window.electronAPI.onChannelList(response => { /* ... no change ... */ console.log('Channel List:', response.payload); availableChannels = response.payload || ['general']; renderChannelList(); });
window.electronAPI.onMessageReceived((messageData) => { addMessage(messageData); });
window.electronAPI.onLoadHistory((data) => { /* ... no change ... */ console.log(`Loading history for channel: ${data.channel}`); if (data.channel === currentChannel) { clearMessages(); data.payload.forEach(msg => addMessage(msg)); messagesDiv.scrollTop = messagesDiv.scrollHeight; } currentChannel = data.channel; updateChannelHighlight(); });
window.electronAPI.onStatusUpdate((status) => { updateStatus(status); });
window.electronAPI.onSendError((errorMsg) => { /* ... no change ... */ console.error('Send Error:', errorMsg); if (chatView.style.display !== 'none') { const errorDiv = document.createElement('div'); errorDiv.style.color = '#f04747'; errorDiv.style.fontStyle = 'italic'; errorDiv.style.padding = '5px 20px'; errorDiv.textContent = `Error: ${errorMsg}`; messagesDiv.appendChild(errorDiv); messagesDiv.scrollTop = messagesDiv.scrollHeight; setTimeout(() => { if (errorDiv.parentNode === messagesDiv) messagesDiv.removeChild(errorDiv); }, 5000); } else { showAuthError(`Send Error: ${errorMsg}`); } });

// Listen for profile data
window.electronAPI.onUserProfileResponse(response => {
    if (response.success) {
        showProfileModal(response.profile);
    } else {
        alert(`Error fetching profile: ${response.error}`); // Simple alert for now
    }
});

// Listen for general errors from server (e.g., permission denied)
window.electronAPI.onError(errorData => {
    alert(`Server Error: ${errorData.message}`); // Simple alert for now
});

// Listen for prompts/confirmations from main process context menus
ipcRenderer.on('prompt-create-channel', () => {
    const channelName = prompt("Enter new channel name:");
    if (channelName && channelName.trim()) {
        window.electronAPI.createChannel(channelName.trim());
    }
});
ipcRenderer.on('confirm-delete-channel', (event, channelName) => {
    if (confirm(`Are you sure you want to delete the channel '#${channelName}'? This will remove all messages within it.`)) {
        window.electronAPI.deleteChannel(channelName);
    }
});


// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => { window.electronAPI.cleanupListeners(); });
// Initialize view
showAuthView(true);

console.log('renderer.js loaded with channel, profile, context menu logic');

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash |= 0; } return Math.abs(hash); }
function getAvatarColor(username) { const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#1abc9c', '#e91e63', '#f1c40f']; const hash = simpleHash(username || 'default'); return colors[hash % colors.length]; }
