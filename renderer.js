// --- DOM Elements ---
// ... (Auth, Chat View, Modals remain the same) ...
const authView = document.getElementById('auth-view');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const authTitle = document.getElementById('auth-title');
// const toggleAuthLink = document.getElementById('toggle-signup'); // Unused
const toggleAuthMessage = document.getElementById('toggle-auth-message');
const authErrorDiv = document.getElementById('auth-error');
const chatView = document.getElementById('chat-view');
const sidebar = document.getElementById('sidebar');
const channelListDiv = document.getElementById('channel-list');
// const mainContent = document.getElementById('main-content'); // Unused
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const currentChannelSpan = document.getElementById('current-channel-name');
const hostInfoSpan = document.getElementById('host-info');
const userInfoSpan = document.getElementById('user-info');
// const partyModeButton = document.getElementById('party-mode-button'); // Removed - using context menu now
const typingIndicatorDiv = document.getElementById('typing-indicator');
const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
// const profileModal = document.getElementById('profile-modal'); // Unused
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileModalAvatar = document.getElementById('profile-modal-avatar');
const profileModalUsername = document.getElementById('profile-modal-username');
const profileModalAboutMe = document.getElementById('profile-modal-aboutme');
const createChannelModalBackdrop = document.getElementById(
  'create-channel-modal-backdrop'
);
// const createChannelModal = document.getElementById('create-channel-modal'); // Unused
const closeCreateChannelModalButton = document.getElementById(
  'close-create-channel-modal'
);
const newChannelNameInput = document.getElementById('new-channel-name');
const cancelCreateChannelButton = document.getElementById(
  'cancel-create-channel-button'
);
const submitCreateChannelButton = document.getElementById(
  'submit-create-channel-button'
);
const deleteChannelModalBackdrop = document.getElementById(
  'delete-channel-modal-backdrop'
);
// const deleteChannelModal = document.getElementById('delete-channel-modal'); // Unused
const closeDeleteChannelModalButton = document.getElementById(
  'close-delete-channel-modal'
);
const deleteChannelNameConfirm = document.getElementById(
  'delete-channel-name-confirm'
);
const cancelDeleteChannelButton = document.getElementById(
  'cancel-delete-channel-button'
);
const submitDeleteChannelButton = document.getElementById(
  'submit-delete-channel-button'
);
const userListOnlineDiv = document.getElementById('user-list-online');
const userListOfflineDiv = document.getElementById('user-list-offline');
// New User Area Elements
const userAreaAvatar = document.getElementById('user-area-avatar');
const userAreaUsername = document.getElementById('user-area-username');
const userSettingsButton = document.getElementById('user-settings-button');
// New Settings Modal Elements
const profileSettingsModalBackdrop = document.getElementById(
  'profile-settings-modal-backdrop'
);
const closeProfileSettingsModalButton = document.getElementById(
  'close-profile-settings-modal'
);
const settingsAboutMeInput = document.getElementById(
  'settings-about-me-input'
);
const cancelProfileSettingsButton = document.getElementById(
  'cancel-profile-settings-button'
);
const saveProfileSettingsButton = document.getElementById(
  'save-profile-settings-button'
);

// --- State ---
let localUsername = '';
let isAdmin = false;
let isLoginMode = true;
let currentChannel = 'general';
let availableChannels = ['general'];
let lastMessageSender = null;
let channelToDelete = null;
let allUsers = [];
let onlineUsers = [];
let partyModeActive = false; // Track own party mode state
let typingTimeout = null;
let currentlyTypingUsers = [];

// --- UI Switching ---
function showAuthView(showLogin = true) {
  /* ... no change ... */ isLoginMode = showLogin;
  authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
  loginButton.style.display = isLoginMode ? 'block' : 'none';
  signupButton.style.display = isLoginMode ? 'none' : 'block';
  toggleAuthMessage.innerHTML = isLoginMode
    ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.`
    : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`;
  attachToggleListeners();
  authView.style.display = 'block';
  chatView.style.display = 'none';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  hideAuthError();
}
function showChatView() {
  /* ... no change ... */ authView.style.display = 'none';
  chatView.style.display = 'flex';
  document.body.style.justifyContent = 'flex-start';
  document.body.style.alignItems = 'stretch';
  messageInput.disabled = false;
  sendButton.disabled = false;
  messageInput.focus();
  updateChannelHighlight();
}
function showAuthError(message) {
  /* ... no change ... */ authErrorDiv.textContent = message;
  authErrorDiv.style.display = 'block';
}
function hideAuthError() {
  /* ... no change ... */ authErrorDiv.textContent = '';
  authErrorDiv.style.display = 'none';
}

// --- Modals ---
function showProfileModal(profile) {
  /* ... no change ... */ profileModalUsername.textContent =
    profile.username || 'Unknown User';
  profileModalAboutMe.textContent = profile.aboutMe || '';
  const firstLetter = profile.username?.charAt(0)?.toUpperCase() || '?';
  profileModalAvatar.textContent = firstLetter;
  profileModalAvatar.style.backgroundColor = getAvatarColor(profile.username);
  profileModalBackdrop.style.display = 'flex';
}
function hideProfileModal() {
  /* ... no change ... */ profileModalBackdrop.style.display = 'none';
  profileModalUsername.textContent = '';
  profileModalAboutMe.textContent = 'Loading...';
  profileModalAvatar.textContent = '?';
  profileModalAvatar.style.backgroundColor = '#7289da';
}
closeProfileModalButton.addEventListener('click', hideProfileModal);
profileModalBackdrop.addEventListener('click', (e) => {
  if (e.target === profileModalBackdrop) hideProfileModal();
});
function showCreateChannelModal() {
  /* ... no change ... */ newChannelNameInput.value = '';
  createChannelModalBackdrop.style.display = 'flex';
  newChannelNameInput.focus();
}
function hideCreateChannelModal() {
  /* ... no change ... */ createChannelModalBackdrop.style.display = 'none';
}
closeCreateChannelModalButton.addEventListener('click', hideCreateChannelModal);
cancelCreateChannelButton.addEventListener('click', hideCreateChannelModal);
createChannelModalBackdrop.addEventListener('click', (e) => {
  if (e.target === createChannelModalBackdrop) hideCreateChannelModal();
});
submitCreateChannelButton.addEventListener('click', () => {
  /* ... no change ... */ const channelName = newChannelNameInput.value.trim();
  if (channelName) {
    window.electronAPI.createChannel(channelName);
    hideCreateChannelModal();
  } else {
    alert('Please enter a channel name.');
  }
});
newChannelNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitCreateChannelButton.click();
});
function showDeleteChannelModal(channelName) {
  /* ... no change ... */ channelToDelete = channelName;
  deleteChannelNameConfirm.textContent = `#${channelName}`;
  deleteChannelModalBackdrop.style.display = 'flex';
}
function hideDeleteChannelModal() {
  /* ... no change ... */ deleteChannelModalBackdrop.style.display = 'none';
  channelToDelete = null;
}
closeDeleteChannelModalButton.addEventListener('click', hideDeleteChannelModal);
cancelDeleteChannelButton.addEventListener('click', hideDeleteChannelModal);
deleteChannelModalBackdrop.addEventListener('click', (e) => {
  if (e.target === deleteChannelModalBackdrop) hideDeleteChannelModal();
});
submitDeleteChannelButton.addEventListener('click', () => {
  if (channelToDelete) {
    window.electronAPI.deleteChannel(channelToDelete);
    hideDeleteChannelModal();
  }
});

// New Settings Modal Logic
function showProfileSettingsModal() {
  // Request current profile data before showing
  window.electronAPI.requestOwnProfile();
  profileSettingsModalBackdrop.style.display = 'flex';
  settingsAboutMeInput.focus(); // Focus the textarea
}
function hideProfileSettingsModal() {
  profileSettingsModalBackdrop.style.display = 'none';
}
closeProfileSettingsModalButton.addEventListener(
  'click',
  hideProfileSettingsModal
);
cancelProfileSettingsButton.addEventListener(
  'click',
  hideProfileSettingsModal
);
profileSettingsModalBackdrop.addEventListener('click', (e) => {
  if (e.target === profileSettingsModalBackdrop) hideProfileSettingsModal();
});
saveProfileSettingsButton.addEventListener('click', () => {
  const newAboutMe = settingsAboutMeInput.value.trim();
  // Add validation if needed (e.g., length check already handled by maxlength)
  window.electronAPI.saveAboutMe(newAboutMe);
  hideProfileSettingsModal(); // Close modal after saving
});

// --- Channel UI ---
function renderChannelList() {
  /* ... no change ... */ channelListDiv.innerHTML = '';
  availableChannels.forEach((channelName) => {
    const channelLink = document.createElement('a');
    channelLink.href = '#';
    channelLink.classList.add('channel-item');
    channelLink.dataset.channel = channelName;
    channelLink.textContent = channelName;
    channelLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (channelName !== currentChannel)
        window.electronAPI.switchChannel(channelName);
    });
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
function updateChannelHighlight() {
  /* ... no change ... */ document
    .querySelectorAll('.channel-item')
    .forEach((item) => {
      if (item.dataset.channel === currentChannel) item.classList.add('active');
      else item.classList.remove('active');
    });
  currentChannelSpan.textContent = currentChannel;
  messageInput.placeholder = `Message #${currentChannel}`;
}
sidebar.addEventListener('contextmenu', (e) => {
  /* ... no change ... */ if (
    e.target.closest('.channel-item') ||
    e.target.closest('#user-area')
  )
    return;
  e.preventDefault();
  if (isAdmin) window.electronAPI.showSidebarContextMenu();
});

// --- User List UI ---
function renderUserList() {
  const onlineCount = onlineUsers.length;
  const offlineCount = allUsers.length - onlineCount;
  userListOnlineDiv.innerHTML = `<h4>Online — <span id="online-count">${onlineCount}</span></h4>`;
  userListOfflineDiv.innerHTML = `<h4>Offline — <span id="offline-count">${offlineCount < 0 ? 0 : offlineCount}</span></h4>`;
  const sortedUsers = [...allUsers].sort((a, b) => a.localeCompare(b));

  sortedUsers.forEach((username) => {
    const isOnline = onlineUsers.includes(username);
    const userItem = document.createElement('div');
    userItem.classList.add('user-list-item');
    userItem.classList.toggle('offline', !isOnline);
    userItem.dataset.username = username; // Store username for context menu

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('user-avatar');
    avatarDiv.textContent = username.charAt(0)?.toUpperCase() || '?';
    avatarDiv.style.backgroundColor = getAvatarColor(username);

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('user-name');
    nameSpan.textContent = username;

    userItem.appendChild(avatarDiv);
    userItem.appendChild(nameSpan);
    userItem.addEventListener('click', () =>
      window.electronAPI.getUserProfile(username)
    );

    // Add context menu listener for admins (not on self)
    if (isAdmin && username !== localUsername) {
      userItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.electronAPI.showUserContextMenu(username);
      });
    }

    if (isOnline) userListOnlineDiv.appendChild(userItem);
    else userListOfflineDiv.appendChild(userItem);
  });
}

// --- Message Handling ---
function addMessage(messageData) {
  /* ... no change ... */ if (messageData.channel !== currentChannel) return;
  const sender = messageData.sender || 'Unknown';
  const isConsecutive = sender === lastMessageSender;
  const messageId = messageData._id;
  let messageGroup;
  let contentDiv;
  if (
    isConsecutive &&
    messagesDiv.lastElementChild?.classList.contains('message-group')
  ) {
    messageGroup = messagesDiv.lastElementChild;
    contentDiv = messageGroup.querySelector('.message-group-content');
    messageGroup.style.marginTop = '2px';
  } else {
    messageGroup = document.createElement('div');
    messageGroup.classList.add('message-group');
    messageGroup.dataset.sender = sender;
    const firstLetter = sender.charAt(0)?.toUpperCase() || '?';
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('message-avatar');
    avatarDiv.textContent = firstLetter;
    avatarDiv.style.backgroundColor = getAvatarColor(sender);
    avatarDiv.dataset.username = sender;
    avatarDiv.addEventListener('click', () =>
      window.electronAPI.getUserProfile(sender)
    );
    messageGroup.appendChild(avatarDiv);
    contentDiv = document.createElement('div');
    contentDiv.classList.add('message-group-content');
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('message-header');
    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender');
    senderSpan.textContent = sender;
    senderSpan.dataset.username = sender;
    senderSpan.addEventListener('click', () => {
      window.electronAPI.getUserProfile(sender);
    });
    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = messageData.timestamp
      ? new Date(messageData.timestamp).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
    headerDiv.appendChild(senderSpan);
    headerDiv.appendChild(timestampSpan);
    contentDiv.appendChild(headerDiv);
    messageGroup.appendChild(contentDiv);
    messagesDiv.appendChild(messageGroup);
  }
  const textDiv = document.createElement('div');
  textDiv.classList.add('message-text');
  textDiv.dataset.messageId = messageId;
  textDiv.textContent = messageData.text;
  if (messageData.edited) {
    const editedSpan = document.createElement('span');
    editedSpan.classList.add('timestamp');
    editedSpan.style.marginLeft = '5px';
    editedSpan.style.fontStyle = 'italic';
    editedSpan.textContent = '(edited)';
    textDiv.appendChild(editedSpan);
  }
  textDiv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const isOwn = sender === localUsername;
    window.electronAPI.showMessageContextMenu(messageId, isOwn);
  });
  contentDiv.appendChild(textDiv);
  lastMessageSender = sender;
  const isScrolledToBottom =
    messagesDiv.scrollHeight - messagesDiv.clientHeight <=
    messagesDiv.scrollTop + 5;
  if (isScrolledToBottom) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}
function clearMessages() {
  /* ... no change ... */ messagesDiv.innerHTML = '';
  lastMessageSender = null;
}
function handleEditMessage(messageId) {
  /* ... no change ... */ const messageTextDiv = messagesDiv.querySelector(
    `.message-text[data-message-id="${messageId}"]`
  );
  if (!messageTextDiv) return;
  const currentText = messageTextDiv.childNodes[0].textContent;
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.value = currentText;
  editInput.classList.add('edit-message-input');
  editInput.style.width = '90%';
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
    messageTextDiv.textContent = currentText;
    messageTextDiv.style.display = '';
    editInput.replaceWith(messageTextDiv);
  };
  const cancelEdit = () => {
    messageTextDiv.textContent = currentText;
    messageTextDiv.style.display = '';
    editInput.replaceWith(messageTextDiv);
  };
  editInput.addEventListener('blur', cancelEdit);
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editInput.removeEventListener('blur', cancelEdit);
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editInput.removeEventListener('blur', cancelEdit);
      cancelEdit();
    }
  });
  messageTextDiv.style.display = 'none';
  messageTextDiv.parentNode.insertBefore(editInput, messageTextDiv.nextSibling);
  editInput.focus();
  editInput.select();
}
function updateEditedMessage(payload) {
  /* ... no change ... */ const messageTextDiv = messagesDiv.querySelector(
    `.message-text[data-message-id="${payload._id}"]`
  );
  if (messageTextDiv && payload.channel === currentChannel) {
    messageTextDiv.textContent = payload.text;
    if (payload.edited && !messageTextDiv.querySelector('.timestamp')) {
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
  /* ... no change ... */ const messageTextDiv = messagesDiv.querySelector(
    `.message-text[data-message-id="${payload._id}"]`
  );
  if (messageTextDiv && payload.channel === currentChannel) {
    const groupContent = messageTextDiv.closest('.message-group-content');
    const messageGroup = messageTextDiv.closest('.message-group');
    messageTextDiv.remove();
    if (groupContent && groupContent.childElementCount === 0) {
      messageGroup?.remove();
      if (messagesDiv.lastElementChild !== messageGroup) {
        lastMessageSender =
          messagesDiv.lastElementChild?.dataset.sender || null;
      } else {
        lastMessageSender = null;
      }
    }
  }
}

// --- Status Update ---
function updateStatus(status) {
  console.log('Status Update:', status);
  let statusText = '';
  let serverInfoText = '';
  let userInfoText = '';
  if (status.username) localUsername = status.username;
  if (status.isAdmin !== undefined) isAdmin = status.isAdmin;
  if (status.currentChannel) currentChannel = status.currentChannel;

  if (status.connected) {
    statusText = 'Online';
    serverInfoText = '';
    // Update new user area
    userAreaUsername.textContent = localUsername;
    userAreaAvatar.textContent = localUsername.charAt(0)?.toUpperCase() || '?';
    userAreaAvatar.style.backgroundColor = getAvatarColor(localUsername);
  } else if (status.wsConnected) {
    statusText = 'Authenticating...';
    serverInfoText = '';
    // Clear user area on disconnect/auth
    userAreaUsername.textContent = 'Connecting...';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundColor = '#7289da';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else if (status.connecting) {
    statusText = `Connecting...`;
    serverInfoText = '';
    userAreaUsername.textContent = 'Connecting...';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundColor = '#7289da';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else if (status.error) {
    statusText = `Error: ${status.error}`;
    serverInfoText = '';
    userAreaUsername.textContent = 'Error';
    userAreaAvatar.textContent = '!';
    userAreaAvatar.style.backgroundColor = '#f04747';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else {
    statusText = 'Disconnected';
    serverInfoText = '';
    userAreaUsername.textContent = 'Offline';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundColor = '#72767d';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  }
  connectionStatusSpan.textContent = statusText;
  hostInfoSpan.textContent = serverInfoText;
  // userInfoSpan.textContent = userInfoText; // Replaced by userAreaUsername
  currentChannelSpan.textContent = currentChannel || '...';
  const isLoggedIn = !!localUsername && status.connected; // Ensure connected status too
  messageInput.disabled = !isLoggedIn;
  // sendButton.disabled = !isLoggedIn; // Send button removed
  if (isLoggedIn) {
    updateChannelHighlight();
    renderChannelList(); // Render channels only when logged in
    userSettingsButton.style.display = 'block'; // Show settings button
  } else {
    channelListDiv.innerHTML = ''; // Clear channels if not logged in
    userSettingsButton.style.display = 'none'; // Hide settings button
  }
}

// --- Typing Indicator ---
function updateTypingIndicator() {
  /* ... no change ... */ const typingNames = currentlyTypingUsers.filter(
    (name) => name !== localUsername
  );
  let text = '';
  if (typingNames.length === 1) {
    text = `<span>${typingNames[0]}</span> is typing<span class="dots"><span>.</span><span>.</span><span>.</span></span>`;
  } else if (typingNames.length === 2) {
    text = `<span>${typingNames[0]}</span> and <span>${typingNames[1]}</span> are typing<span class="dots"><span>.</span><span>.</span><span>.</span></span>`;
  } else if (typingNames.length === 3) {
    text = `<span>${typingNames[0]}</span>, <span>${typingNames[1]}</span>, and <span>${typingNames[2]}</span> are typing<span class="dots"><span>.</span><span>.</span><span>.</span></span>`;
  } else if (typingNames.length > 3) {
    text = `Multiple people are typing<span class="dots"><span>.</span><span>.</span><span>.</span></span>`;
  }
  typingIndicatorDiv.innerHTML = text;
}

// --- Event Listeners ---
loginButton.addEventListener('click', () => {
  /* ... no change ... */ const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (username && password) {
    hideAuthError();
    window.electronAPI.sendLogin({ username, password });
  } else {
    showAuthError('Please enter both username and password.');
  }
});
signupButton.addEventListener('click', () => {
  /* ... no change ... */ const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (username && password) {
    hideAuthError();
    window.electronAPI.sendSignup({ username, password });
  } else {
    showAuthError('Please enter both username and password.');
  }
});
function attachToggleListeners() {
  /* ... no change ... */ const signupLink =
    document.getElementById('toggle-signup');
  const loginLink = document.getElementById('toggle-login');
  if (signupLink)
    signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthView(false);
    });
  if (loginLink)
    loginLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthView(true);
    });
}
attachToggleListeners();
sendButton.addEventListener('click', () => {
  /* ... no change ... */ const text = messageInput.value.trim();
  if (text && !messageInput.disabled) {
    window.electronAPI.sendMessage(text);
    messageInput.value = '';
    window.electronAPI.stopTyping();
  }
});
messageInput.addEventListener('keypress', (e) => {
  /* ... no change ... */ if (
    e.key === 'Enter' &&
    !e.shiftKey &&
    !messageInput.disabled
  ) {
    e.preventDefault();
    sendButton.click();
  }
});
passwordInput.addEventListener('keypress', (e) => {
  /* ... no change ... */ if (e.key === 'Enter') {
    if (isLoginMode) loginButton.click();
    else signupButton.click();
  }
});
messageInput.addEventListener('input', () => {
  /* ... no change ... */ if (!messageInput.disabled) {
    window.electronAPI.startTyping();
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      window.electronAPI.stopTyping();
    }, 2500);
  }
});
// Removed party mode button listener
userSettingsButton.addEventListener('click', showProfileSettingsModal); // Add listener for settings button

// --- IPC Listeners ---
window.electronAPI.onSignupResponse((response) => {
  /* ... no change ... */ console.log('Signup Response:', response);
  if (response.success) {
    showAuthView(true);
    alert('Signup successful! Please log in.');
  } else {
    showAuthError(response.error || 'Signup failed.');
  }
});
window.electronAPI.onLoginResponse((response) => {
  /* ... no change ... */ console.log('Login Response:', response);
  if (response.success) {
    localUsername = response.username;
    isAdmin = response.isAdmin || false;
    currentChannel = 'general';
    hideAuthError();
    showChatView();
    // Update new user area on login
    userAreaUsername.textContent = localUsername;
    userAreaAvatar.textContent = localUsername.charAt(0)?.toUpperCase() || '?';
    userAreaAvatar.style.backgroundColor = getAvatarColor(localUsername);
    connectionStatusSpan.textContent = 'Online';
    userSettingsButton.style.display = 'block'; // Explicitly show button on successful login
  } else {
    showAuthError(response.error || 'Login failed.');
  }
});
window.electronAPI.onChannelList((response) => {
  /* ... no change ... */ console.log('Channel List:', response.payload);
  availableChannels = response.payload || ['general'];
  renderChannelList();
});
window.electronAPI.onMessageReceived((messageData) => {
  addMessage(messageData);
});
window.electronAPI.onLoadHistory((data) => {
  /* ... no change ... */ console.log(
    `Loading history for channel: ${data.channel}`
  );
  currentChannel = data.channel;
  updateChannelHighlight();
  clearMessages();
  data.payload.forEach((msg) => addMessage(msg));
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});
window.electronAPI.onStatusUpdate((status) => {
  updateStatus(status);
});
window.electronAPI.onSendError((errorMsg) => {
  /* ... no change ... */ console.error('Send Error:', errorMsg);
  if (chatView.style.display !== 'none') {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = '#f04747';
    errorDiv.style.fontStyle = 'italic';
    errorDiv.style.padding = '5px 20px';
    errorDiv.textContent = `Error: ${errorMsg}`;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    setTimeout(() => {
      if (errorDiv.parentNode === messagesDiv)
        messagesDiv.removeChild(errorDiv);
    }, 5000);
  } else {
    showAuthError(`Send Error: ${errorMsg}`);
  }
});
window.electronAPI.onUserProfileResponse((response) => {
  /* ... no change ... */ if (response.success) {
    showProfileModal(response.profile);
  } else {
    alert(`Error fetching profile: ${response.error}`);
  }
});
window.electronAPI.onError((errorData) => {
  /* ... no change ... */ alert(`Server Error: ${errorData.message}`);
});
window.electronAPI.onPromptCreateChannel(() => {
  /* ... no change ... */ showCreateChannelModal();
});
window.electronAPI.onConfirmDeleteChannel((channelName) => {
  /* ... no change ... */ showDeleteChannelModal(channelName);
});
window.electronAPI.onMessageEdited((payload) => {
  updateEditedMessage(payload);
});
window.electronAPI.onMessageDeleted((payload) => {
  deleteMessageUI(payload);
});
window.electronAPI.onEditMessagePrompt((messageId) => {
  handleEditMessage(messageId);
});
window.electronAPI.onUserListUpdate((payload) => {
  /* ... no change ... */ console.log('Received user list update:', payload);
  allUsers = payload.all || [];
  onlineUsers = payload.online || [];
  renderUserList();
});

// Listen for party mode update for THIS client
window.electronAPI.onPartyModeUpdate((payload) => {
  partyModeActive = payload.active;
  document.body.classList.toggle('party-mode', partyModeActive);
  // partyModeButton.classList.toggle('active', partyModeActive); // Button removed
  console.log(
    `Party mode for this client is now ${partyModeActive ? 'ON' : 'OFF'}`
  );
});

window.electronAPI.onTypingUpdate((payload) => {
  /* ... no change ... */ console.log('Received typing update:', payload);
  currentlyTypingUsers = payload.typing || [];
  updateTypingIndicator();
});

// Listener for own profile data (for settings modal)
window.electronAPI.onOwnProfileResponse((profile) => {
  if (profile) {
    settingsAboutMeInput.value = profile.aboutMe || '';
    // Populate other fields here later if added
  } else {
    // Handle error case? Maybe disable save button?
    console.error('Failed to load own profile data for settings.');
    settingsAboutMeInput.value = 'Error loading profile.';
    settingsAboutMeInput.disabled = true;
    saveProfileSettingsButton.disabled = true;
  }
});

// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => {
  window.electronAPI.cleanupListeners();
});
// Initialize view
showAuthView(true);

console.log(
  'renderer.js loaded with final UI logic, IPC fixes, modals, edit/delete, presence, party, typing, debug'
);

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
function getAvatarColor(username) {
  const colors = [
    '#7289da',
    '#43b581',
    '#faa61a',
    '#f04747',
    '#1abc9c',
    '#e91e63',
    '#f1c40f',
  ];
  const hash = simpleHash(username || 'default');
  return colors[hash % colors.length];
}
