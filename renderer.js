// --- DOM Elements ---
// ... (DOM elements remain the same) ...
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
const channelListDiv = document.getElementById('channel-list');
const mainContent = document.getElementById('main-content');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const currentChannelSpan = document.getElementById('current-channel-name');
const hostInfoSpan = document.getElementById('host-info');
const userInfoSpan = document.getElementById('user-info');
const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileModalAvatar = document.getElementById('profile-modal-avatar');
const profileModalUsername = document.getElementById('profile-modal-username');
const profileModalAboutMe = document.getElementById('profile-modal-aboutme');
const createChannelModalBackdrop = document.getElementById('create-channel-modal-backdrop');
const createChannelModal = document.getElementById('create-channel-modal');
const closeCreateChannelModalButton = document.getElementById('close-create-channel-modal');
const newChannelNameInput = document.getElementById('new-channel-name');
const cancelCreateChannelButton = document.getElementById('cancel-create-channel-button');
const submitCreateChannelButton = document.getElementById('submit-create-channel-button');
const deleteChannelModalBackdrop = document.getElementById('delete-channel-modal-backdrop');
const deleteChannelModal = document.getElementById('delete-channel-modal');
const closeDeleteChannelModalButton = document.getElementById('close-delete-channel-modal');
const deleteChannelNameConfirm = document.getElementById('delete-channel-name-confirm');
const cancelDeleteChannelButton = document.getElementById('cancel-delete-channel-button');
const submitDeleteChannelButton = document.getElementById('submit-delete-channel-button');


// --- State ---
let localUsername = '';
let isAdmin = false;
let isLoginMode = true;
let currentChannel = 'general';
let availableChannels = ['general'];
let lastMessageSender = null;
let channelToDelete = null;

// --- UI Switching ---
function showAuthView(showLogin = true) { /* ... no change ... */ isLoginMode = showLogin; authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up'; loginButton.style.display = isLoginMode ? 'block' : 'none'; signupButton.style.display = isLoginMode ? 'none' : 'block'; toggleAuthMessage.innerHTML = isLoginMode ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.` : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`; attachToggleListeners(); authView.style.display = 'block'; chatView.style.display = 'none'; document.body.style.justifyContent = 'center'; document.body.style.alignItems = 'center'; hideAuthError(); }
function showChatView() { /* ... no change ... */ authView.style.display = 'none'; chatView.style.display = 'flex'; document.body.style.justifyContent = 'flex-start'; document.body.style.alignItems = 'stretch'; messageInput.disabled = false; sendButton.disabled = false; messageInput.focus(); updateChannelHighlight(); }
function showAuthError(message) { /* ... no change ... */ authErrorDiv.textContent = message; authErrorDiv.style.display = 'block'; }
function hideAuthError() { /* ... no change ... */ authErrorDiv.textContent = ''; authErrorDiv.style.display = 'none'; }

// --- Modals ---
function showProfileModal(profile) { /* ... no change ... */ profileModalUsername.textContent = profile.username || 'Unknown User'; profileModalAboutMe.textContent = profile.aboutMe || ''; const firstLetter = profile.username?.charAt(0)?.toUpperCase() || '?'; profileModalAvatar.textContent = firstLetter; profileModalAvatar.style.backgroundColor = getAvatarColor(profile.username); profileModalBackdrop.style.display = 'flex'; }
function hideProfileModal() { /* ... no change ... */ profileModalBackdrop.style.display = 'none'; profileModalUsername.textContent = ''; profileModalAboutMe.textContent = 'Loading...'; profileModalAvatar.textContent = '?'; profileModalAvatar.style.backgroundColor = '#7289da'; }
closeProfileModalButton.addEventListener('click', hideProfileModal);
profileModalBackdrop.addEventListener('click', (e) => { if (e.target === profileModalBackdrop) hideProfileModal(); });
function showCreateChannelModal() { /* ... no change ... */ newChannelNameInput.value = ''; createChannelModalBackdrop.style.display = 'flex'; newChannelNameInput.focus(); }
function hideCreateChannelModal() { /* ... no change ... */ createChannelModalBackdrop.style.display = 'none'; }
closeCreateChannelModalButton.addEventListener('click', hideCreateChannelModal);
cancelCreateChannelButton.addEventListener('click', hideCreateChannelModal);
createChannelModalBackdrop.addEventListener('click', (e) => { if (e.target === createChannelModalBackdrop) hideCreateChannelModal(); });
submitCreateChannelButton.addEventListener('click', () => { /* ... no change ... */ const channelName = newChannelNameInput.value.trim(); if (channelName) { window.electronAPI.createChannel(channelName); hideCreateChannelModal(); } else { alert("Please enter a channel name."); } });
newChannelNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitCreateChannelButton.click(); });
function showDeleteChannelModal(channelName) { /* ... no change ... */ channelToDelete = channelName; deleteChannelNameConfirm.textContent = `#${channelName}`; deleteChannelModalBackdrop.style.display = 'flex'; }
function hideDeleteChannelModal() { /* ... no change ... */ deleteChannelModalBackdrop.style.display = 'none'; channelToDelete = null; }
closeDeleteChannelModalButton.addEventListener('click', hideDeleteChannelModal);
cancelDeleteChannelButton.addEventListener('click', hideDeleteChannelModal);
deleteChannelModalBackdrop.addEventListener('click', (e) => { if (e.target === deleteChannelModalBackdrop) hideDeleteChannelModal(); });
submitDeleteChannelButton.addEventListener('click', () => { if (channelToDelete) { window.electronAPI.deleteChannel(channelToDelete); hideDeleteChannelModal(); } });


// --- Channel UI ---
function renderChannelList() { /* ... no change ... */ channelListDiv.innerHTML = ''; availableChannels.forEach(channelName => { const channelLink = document.createElement('a'); channelLink.href = '#'; channelLink.classList.add('channel-item'); channelLink.dataset.channel = channelName; channelLink.textContent = channelName; channelLink.addEventListener('click', (e) => { e.preventDefault(); if (channelName !== currentChannel) window.electronAPI.switchChannel(channelName); }); if (isAdmin && channelName !== 'general') { channelLink.addEventListener('contextmenu', (e) => { e.preventDefault(); window.electronAPI.showChannelContextMenu(channelName); }); } channelListDiv.appendChild(channelLink); }); updateChannelHighlight(); }
function updateChannelHighlight() { /* ... no change ... */ document.querySelectorAll('.channel-item').forEach(item => { if (item.dataset.channel === currentChannel) item.classList.add('active'); else item.classList.remove('active'); }); currentChannelSpan.textContent = currentChannel; messageInput.placeholder = `Message #${currentChannel}`; }
sidebar.addEventListener('contextmenu', (e) => { /* ... no change ... */ if (e.target.closest('.channel-item') || e.target.closest('#user-area')) return; e.preventDefault(); if (isAdmin) window.electronAPI.showSidebarContextMenu(); });


// --- Message Handling ---
function addMessage(messageData) {
    // *** DEBUG LOGGING ADDED ***
    console.log(`[Renderer] addMessage called. Current channel: ${currentChannel}. Message channel: ${messageData.channel}`);

    // Only display messages for the currently viewed channel
    if (messageData.channel !== currentChannel) {
        console.log(`[Renderer] Message ignored (wrong channel).`); // *** DEBUG LOGGING ADDED ***
        return;
    }
    console.log(`[Renderer] Message accepted for display.`); // *** DEBUG LOGGING ADDED ***


    const sender = messageData.sender || 'Unknown';
    const isConsecutive = sender === lastMessageSender;

    let messageGroup;
    let contentDiv;

    if (isConsecutive && messagesDiv.lastElementChild?.classList.contains('message-group')) {
        messageGroup = messagesDiv.lastElementChild;
        contentDiv = messageGroup.querySelector('.message-group-content');
        messageGroup.style.marginTop = '2px';
    } else {
        messageGroup = document.createElement('div');
        messageGroup.classList.add('message-group');
        const firstLetter = sender.charAt(0)?.toUpperCase() || '?';
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('message-avatar');
        avatarDiv.textContent = firstLetter;
        avatarDiv.style.backgroundColor = getAvatarColor(sender);
        avatarDiv.dataset.username = sender;
        avatarDiv.addEventListener('click', () => { window.electronAPI.getUserProfile(sender); });
        messageGroup.appendChild(avatarDiv);
        contentDiv = document.createElement('div');
        contentDiv.classList.add('message-group-content');
        const headerDiv = document.createElement('div');
        headerDiv.classList.add('message-header');
        const senderSpan = document.createElement('span');
        senderSpan.classList.add('sender');
        senderSpan.textContent = sender;
        senderSpan.dataset.username = sender;
        senderSpan.addEventListener('click', () => { window.electronAPI.getUserProfile(sender); });
        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('timestamp');
        timestampSpan.textContent = messageData.timestamp ? new Date(messageData.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        headerDiv.appendChild(senderSpan);
        headerDiv.appendChild(timestampSpan);
        contentDiv.appendChild(headerDiv);
        messageGroup.appendChild(contentDiv);
        messagesDiv.appendChild(messageGroup);
    }

    const textDiv = document.createElement('div');
    textDiv.classList.add('message-text');
    textDiv.textContent = messageData.text;
    contentDiv.appendChild(textDiv);

    lastMessageSender = sender;

    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 5;
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() { /* ... no change ... */ messagesDiv.innerHTML = ''; lastMessageSender = null; }

// --- Status Update ---
function updateStatus(status) { /* ... no change ... */ console.log("Status Update:", status); let statusText = ''; let serverInfoText = ''; let userInfoText = ''; if (status.username) localUsername = status.username; if (status.isAdmin) isAdmin = status.isAdmin; if (status.currentChannel) currentChannel = status.currentChannel; if (status.connected) { statusText = 'Online'; serverInfoText = ''; userInfoText = `${localUsername}`; } else if (status.wsConnected) { statusText = 'Authenticating...'; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); } else if (status.connecting) { statusText = `Connecting...`; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); } else if (status.error) { statusText = `Error: ${status.error}`; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); } else { statusText = 'Disconnected'; serverInfoText = ''; userInfoText = ''; if (authView.style.display === 'none') showAuthView(isLoginMode); } connectionStatusSpan.textContent = statusText; hostInfoSpan.textContent = serverInfoText; userInfoSpan.textContent = userInfoText; currentChannelSpan.textContent = currentChannel || '...'; const isLoggedIn = !!localUsername; messageInput.disabled = !isLoggedIn; sendButton.disabled = !isLoggedIn; if (isLoggedIn) updateChannelHighlight(); if (isLoggedIn) renderChannelList(); }


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

window.electronAPI.onMessageReceived((messageData) => {
    // *** DEBUG LOGGING ADDED ***
    console.log(`[Renderer] Received message via IPC: Channel=${messageData.channel}, Sender=${messageData.sender}`);
    addMessage(messageData); // Call the function which includes the filter
});

window.electronAPI.onLoadHistory((data) => {
    console.log(`[Renderer] Loading history for channel: ${data.channel}. Current view is: ${currentChannel}`);
    // Update current channel state FIRST
    currentChannel = data.channel;
    updateChannelHighlight(); // Update UI highlight and placeholder
    clearMessages(); // Clear previous messages
    data.payload.forEach(msg => addMessage(msg)); // Add messages (addMessage will filter again, but that's ok)
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll down after loading
});

window.electronAPI.onStatusUpdate((status) => { updateStatus(status); });
window.electronAPI.onSendError((errorMsg) => { /* ... no change ... */ console.error('Send Error:', errorMsg); if (chatView.style.display !== 'none') { const errorDiv = document.createElement('div'); errorDiv.style.color = '#f04747'; errorDiv.style.fontStyle = 'italic'; errorDiv.style.padding = '5px 20px'; errorDiv.textContent = `Error: ${errorMsg}`; messagesDiv.appendChild(errorDiv); messagesDiv.scrollTop = messagesDiv.scrollHeight; setTimeout(() => { if (errorDiv.parentNode === messagesDiv) messagesDiv.removeChild(errorDiv); }, 5000); } else { showAuthError(`Send Error: ${errorMsg}`); } });
window.electronAPI.onUserProfileResponse(response => { /* ... no change ... */ if (response.success) { showProfileModal(response.profile); } else { alert(`Error fetching profile: ${response.error}`); } });
window.electronAPI.onError(errorData => { /* ... no change ... */ alert(`Server Error: ${errorData.message}`); });
window.electronAPI.onPromptCreateChannel(() => { /* ... no change ... */ showCreateChannelModal(); });
window.electronAPI.onConfirmDeleteChannel((channelName) => { /* ... no change ... */ showDeleteChannelModal(channelName); });


// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => { window.electronAPI.cleanupListeners(); });
// Initialize view
showAuthView(true);

console.log('renderer.js loaded with final UI logic, IPC fixes, modals, and debug logs');

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash |= 0; } return Math.abs(hash); }
function getAvatarColor(username) { const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#1abc9c', '#e91e63', '#f1c40f']; const hash = simpleHash(username || 'default'); return colors[hash % colors.length]; }
