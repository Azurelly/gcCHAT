// --- DOM Elements ---
// ... (Auth, Chat View, Modals remain the same) ...
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
// User List Elements
const userListOnlineDiv = document.getElementById('user-list-online');
const userListOfflineDiv = document.getElementById('user-list-offline');
const onlineCountSpan = document.getElementById('online-count');
const offlineCountSpan = document.getElementById('offline-count');


// --- State ---
let localUsername = '';
let isAdmin = false;
let isLoginMode = true;
let currentChannel = 'general';
let availableChannels = ['general'];
let lastMessageSender = null;
let channelToDelete = null;
let allUsers = []; // Store all known usernames
let onlineUsers = []; // Store online usernames

// --- UI Switching ---
function showAuthView(showLogin = true) { /* ... no change ... */ isLoginMode = showLogin; authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up'; loginButton.style.display = isLoginMode ? 'block' : 'none'; signupButton.style.display = isLoginMode ? 'none' : 'block'; toggleAuthMessage.innerHTML = isLoginMode ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.` : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`; attachToggleListeners(); authView.style.display = 'block'; chatView.style.display = 'none'; document.body.style.justifyContent = 'center'; document.body.style.alignItems = 'center'; hideAuthError(); }
function showChatView() { /* ... no change ... */ authView.style.display = 'none'; chatView.style.display = 'flex'; document.body.style.justifyContent = 'flex-start'; document.body.style.alignItems = 'stretch'; messageInput.disabled = false; sendButton.disabled = false; messageInput.focus(); updateChannelHighlight(); window.electronAPI.getAllUsers(); /* Request user list on showing chat */ }
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

// --- User List UI ---
function renderUserList() {
    userListOnlineDiv.innerHTML = `<h4>Online — <span id="online-count">${onlineUsers.length}</span></h4>`; // Clear previous online users
    userListOfflineDiv.innerHTML = `<h4>Offline — <span id="offline-count">${allUsers.length - onlineUsers.length}</span></h4>`; // Clear previous offline users

    // Sort all users alphabetically first
    const sortedUsers = [...allUsers].sort((a, b) => a.localeCompare(b));

    sortedUsers.forEach(username => {
        const isOnline = onlineUsers.includes(username);
        const userItem = document.createElement('div');
        userItem.classList.add('user-list-item');
        if (!isOnline) {
            userItem.classList.add('offline');
        }

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('user-avatar');
        avatarDiv.textContent = username.charAt(0)?.toUpperCase() || '?';
        avatarDiv.style.backgroundColor = getAvatarColor(username);

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('user-name');
        nameSpan.textContent = username;

        userItem.appendChild(avatarDiv);
        userItem.appendChild(nameSpan);

        // Add click listener to show profile
        userItem.addEventListener('click', () => {
            window.electronAPI.getUserProfile(username);
        });

        if (isOnline) {
            userListOnlineDiv.appendChild(userItem);
        } else {
            userListOfflineDiv.appendChild(userItem);
        }
    });
}


// --- Message Handling ---
function addMessage(messageData) {
    if (messageData.channel !== currentChannel) return;

    const sender = messageData.sender || 'Unknown';
    const isConsecutive = sender === lastMessageSender;
    const messageId = messageData._id; // Get MongoDB ObjectId string

    let messageGroup;
    let contentDiv;

    if (isConsecutive && messagesDiv.lastElementChild?.classList.contains('message-group')) {
        messageGroup = messagesDiv.lastElementChild;
        contentDiv = messageGroup.querySelector('.message-group-content');
        messageGroup.style.marginTop = '2px';
    } else {
        messageGroup = document.createElement('div');
        messageGroup.classList.add('message-group');
        messageGroup.dataset.sender = sender; // Store sender for potential future use

        const firstLetter = sender.charAt(0)?.toUpperCase() || '?';
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('message-avatar');
        avatarDiv.textContent = firstLetter;
        avatarDiv.style.backgroundColor = getAvatarColor(sender);
        avatarDiv.dataset.username = sender;
        avatarDiv.addEventListener('click', () => window.electronAPI.getUserProfile(sender));
        messageGroup.appendChild(avatarDiv);

        contentDiv = document.createElement('div');
        contentDiv.classList.add('message-group-content');

        const headerDiv = document.createElement('div');
        headerDiv.classList.add('message-header');
        const senderSpan = document.createElement('span');
        senderSpan.classList.add('sender');
        senderSpan.textContent = sender;
        senderSpan.dataset.username = sender;
        senderSpan.addEventListener('click', () => window.electronAPI.getUserProfile(sender));
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
    textDiv.dataset.messageId = messageId; // Store message ID
    textDiv.textContent = messageData.text;

    // Add edited marker if applicable
    if (messageData.edited) {
        const editedSpan = document.createElement('span');
        editedSpan.classList.add('timestamp'); // Reuse timestamp style
        editedSpan.style.marginLeft = '5px';
        editedSpan.style.fontStyle = 'italic';
        editedSpan.textContent = '(edited)';
        // Append after timestamp in header if it's the first message, otherwise append to textDiv?
        // Let's append to textDiv for simplicity
         textDiv.appendChild(editedSpan);
    }


    // Add context menu listener to the text div
    textDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const isOwn = sender === localUsername;
        window.electronAPI.showMessageContextMenu(messageId, isOwn);
    });

    contentDiv.appendChild(textDiv);
    lastMessageSender = sender;

    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 5;
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() { messagesDiv.innerHTML = ''; lastMessageSender = null; }

// --- Message Edit/Delete Handling ---
function handleEditMessage(messageId) {
    const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${messageId}"]`);
    if (!messageTextDiv) return;

    const currentText = messageTextDiv.childNodes[0].textContent; // Get original text, ignoring (edited) span if present

    // Replace text div with an input field
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.value = currentText;
    editInput.classList.add('edit-message-input'); // Add class for styling if needed
    editInput.style.width = '90%'; // Basic styling
    editInput.style.backgroundColor = '#40444b';
    editInput.style.color = '#dcddde';
    editInput.style.border = '1px solid #7289da';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '5px';

    const saveEdit = () => {
        const newText = editInput.value.trim();
        if (newText && newText !== currentText) {
            window.electronAPI.editMessage(messageId, newText);
        }
        // Restore original text div (will be updated by server broadcast)
        messageTextDiv.textContent = currentText; // Put original back temporarily
        messageTextDiv.style.display = ''; // Show original text div
        editInput.replaceWith(messageTextDiv); // Replace input with original div
    };

    const cancelEdit = () => {
         messageTextDiv.textContent = currentText; // Restore original text
         messageTextDiv.style.display = '';
         editInput.replaceWith(messageTextDiv);
    };

    editInput.addEventListener('blur', cancelEdit); // Cancel on blur
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            editInput.removeEventListener('blur', cancelEdit); // Prevent cancel on blur after Enter
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            editInput.removeEventListener('blur', cancelEdit); // Prevent cancel on blur after Esc
            cancelEdit();
        }
    });

    messageTextDiv.style.display = 'none'; // Hide original text div
    messageTextDiv.parentNode.insertBefore(editInput, messageTextDiv.nextSibling); // Insert input after text
    editInput.focus();
    editInput.select();
}

function updateEditedMessage(payload) {
    const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${payload._id}"]`);
    if (messageTextDiv && payload.channel === currentChannel) {
        messageTextDiv.textContent = payload.text; // Update text
        // Add (edited) marker if not already there
        if (payload.edited && !messageTextDiv.querySelector('.timestamp')) { // Check if marker exists
             const editedSpan = document.createElement('span');
             editedSpan.classList.add('timestamp');
             editedSpan.style.marginLeft = '5px';
             editedSpan.style.fontStyle = 'italic';
             editedSpan.textContent = '(edited)';
             messageTextDiv.appendChild(editedSpan);
        }
    }
}

function deleteMessageUI(payload) {
    const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${payload._id}"]`);
    if (messageTextDiv && payload.channel === currentChannel) {
        const groupContent = messageTextDiv.closest('.message-group-content');
        const messageGroup = messageTextDiv.closest('.message-group');

        // Remove just the text div
        messageTextDiv.remove();

        // If the content div is now empty (no header or other text), remove the whole group
        if (groupContent && groupContent.childElementCount === 0) {
            messageGroup?.remove();
            // Reset last sender if the deleted message was the last one shown
            if (messagesDiv.lastElementChild !== messageGroup) {
                 lastMessageSender = messagesDiv.lastElementChild?.dataset.sender || null;
            } else {
                 lastMessageSender = null;
            }

        }
         // TODO: Handle case where header should be removed if it was the only message in group
         // This requires more complex logic to check siblings or message counts per group
    }
}


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
window.electronAPI.onLoginResponse(response => { /* ... no change ... */ console.log('Login Response:', response); if (response.success) { localUsername = response.username; isAdmin = response.isAdmin || false; currentChannel = 'general'; hideAuthError(); showChatView(); userInfoSpan.textContent = `${localUsername}`; connectionStatusSpan.textContent = 'Online'; window.electronAPI.getAllUsers(); /* Request user list on login */ } else { showAuthError(response.error || 'Login failed.'); } });
window.electronAPI.onChannelList(response => { /* ... no change ... */ console.log('Channel List:', response.payload); availableChannels = response.payload || ['general']; renderChannelList(); });
window.electronAPI.onMessageReceived((messageData) => { addMessage(messageData); });
window.electronAPI.onLoadHistory((data) => { /* ... no change ... */ console.log(`Loading history for channel: ${data.channel}`); currentChannel = data.channel; updateChannelHighlight(); clearMessages(); data.payload.forEach(msg => addMessage(msg)); messagesDiv.scrollTop = messagesDiv.scrollHeight; });
window.electronAPI.onStatusUpdate((status) => { updateStatus(status); });
window.electronAPI.onSendError((errorMsg) => { /* ... no change ... */ console.error('Send Error:', errorMsg); if (chatView.style.display !== 'none') { const errorDiv = document.createElement('div'); errorDiv.style.color = '#f04747'; errorDiv.style.fontStyle = 'italic'; errorDiv.style.padding = '5px 20px'; errorDiv.textContent = `Error: ${errorMsg}`; messagesDiv.appendChild(errorDiv); messagesDiv.scrollTop = messagesDiv.scrollHeight; setTimeout(() => { if (errorDiv.parentNode === messagesDiv) messagesDiv.removeChild(errorDiv); }, 5000); } else { showAuthError(`Send Error: ${errorMsg}`); } });
window.electronAPI.onUserProfileResponse(response => { /* ... no change ... */ if (response.success) { showProfileModal(response.profile); } else { alert(`Error fetching profile: ${response.error}`); } });
window.electronAPI.onError(errorData => { /* ... no change ... */ alert(`Server Error: ${errorData.message}`); });
window.electronAPI.onPromptCreateChannel(() => { /* ... no change ... */ showCreateChannelModal(); });
window.electronAPI.onConfirmDeleteChannel((channelName) => { /* ... no change ... */ showDeleteChannelModal(channelName); });

// New listeners for edit/delete/presence
window.electronAPI.onMessageEdited((payload) => {
    console.log("Received message edit:", payload);
    updateEditedMessage(payload);
});
window.electronAPI.onMessageDeleted((payload) => {
     console.log("Received message delete:", payload);
     deleteMessageUI(payload);
});
window.electronAPI.onAllUsersList((payload) => {
    console.log("Received all users list:", payload);
    allUsers = payload.all || [];
    onlineUsers = payload.online || [];
    renderUserList();
});
window.electronAPI.onUserStatusUpdate((payload) => {
     console.log("Received user status update:", payload);
     onlineUsers = payload.online || [];
     renderUserList(); // Re-render the list with updated online status
});
window.electronAPI.onEditMessagePrompt((messageId) => {
    handleEditMessage(messageId); // Trigger the edit UI
});


// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => { window.electronAPI.cleanupListeners(); });
// Initialize view
showAuthView(true);

console.log('renderer.js loaded with final UI logic, IPC fixes, modals, edit/delete, presence');

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash |= 0; } return Math.abs(hash); }
function getAvatarColor(username) { const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#1abc9c', '#e91e63', '#f1c40f']; const hash = simpleHash(username || 'default'); return colors[hash % colors.length]; }
