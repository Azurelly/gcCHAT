// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const authTitle = document.getElementById('auth-title');
const toggleAuthMessage = document.getElementById('toggle-auth-message');
const authErrorDiv = document.getElementById('auth-error');
const chatView = document.getElementById('chat-view');
const sidebar = document.getElementById('sidebar');
const channelListDiv = document.getElementById('channel-list');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
// const sendButton = document.getElementById('send-button'); // Removed
const connectionStatusSpan = document.getElementById('connection-status');
const currentChannelSpan = document.getElementById('current-channel-name');
const hostInfoSpan = document.getElementById('host-info');
const typingIndicatorDiv = document.getElementById('typing-indicator');
const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileModalAvatar = document.getElementById('profile-modal-avatar');
const profileModalUsername = document.getElementById('profile-modal-username');
const profileModalAboutMe = document.getElementById('profile-modal-aboutme');
const createChannelModalBackdrop = document.getElementById(
  'create-channel-modal-backdrop'
);
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
// User Area Elements
const userAreaAvatar = document.getElementById('user-area-avatar');
const userAreaUsername = document.getElementById('user-area-username');
const userSettingsButton = document.getElementById('user-settings-button');
// Settings Modal Elements
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
const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
const profilePictureInput = document.getElementById('profile-picture-input');
const attachmentButton = document.getElementById('attachment-button');
const attachmentInput = document.getElementById('attachment-input');
const newMessagesBar = document.getElementById('new-messages-bar'); // Added

// --- State ---
let localUsername = '';
let isAdmin = false;
let isLoginMode = true;
let currentChannel = 'general';
let availableChannels = ['general'];
let lastMessageSender = null;
let channelToDelete = null;
let allUserDetails = []; // Store { username, profilePicture }
let onlineUsers = []; // Store just usernames
let partyModeActive = false;
let typingTimeout = null;
let currentlyTypingUsers = [];
let currentProfileData = null; // Store own fetched profile data
let isScrolledNearBottom = true; // Track if user is near the bottom
let newMessagesCount = 0; // Count unseen messages
let scrollTimeout = null; // Debounce scroll listener

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
  chatView.style.display = 'none';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  hideAuthError();
}
function showChatView() {
  authView.style.display = 'none';
  chatView.style.display = 'flex';
  document.body.style.justifyContent = 'flex-start';
  document.body.style.alignItems = 'stretch';
  messageInput.disabled = false;
  attachmentButton.disabled = false;
  messageInput.focus();
  updateChannelHighlight();
}
function showAuthError(message) {
  authErrorDiv.textContent = message;
  authErrorDiv.style.display = 'block';
}
function hideAuthError() {
  authErrorDiv.textContent = '';
  authErrorDiv.style.display = 'none';
}

// --- Modals ---
function showProfileModal(profile) {
  profileModalUsername.textContent = profile.username || 'Unknown User';
  profileModalAboutMe.textContent = profile.aboutMe || '';
  if (profile.profilePicture) {
    profileModalAvatar.textContent = '';
    profileModalAvatar.style.backgroundImage = `url('${profile.profilePicture}')`;
    profileModalAvatar.style.backgroundColor = '';
  } else {
    profileModalAvatar.textContent = profile.username?.charAt(0)?.toUpperCase() || '?';
    profileModalAvatar.style.backgroundImage = '';
    profileModalAvatar.style.backgroundColor = getAvatarColor(profile.username);
  }
  profileModalBackdrop.style.display = 'flex';
}
function hideProfileModal() {
  profileModalBackdrop.style.display = 'none';
  profileModalUsername.textContent = '';
  profileModalAboutMe.textContent = 'Loading...';
  profileModalAvatar.textContent = '?';
  profileModalAvatar.style.backgroundImage = '';
  profileModalAvatar.style.backgroundColor = '#7289da';
}
closeProfileModalButton.addEventListener('click', hideProfileModal);
profileModalBackdrop.addEventListener('click', (e) => {
  if (e.target === profileModalBackdrop) hideProfileModal();
});

function showCreateChannelModal() {
  newChannelNameInput.value = '';
  createChannelModalBackdrop.style.display = 'flex';
  newChannelNameInput.focus();
}
function hideCreateChannelModal() {
  createChannelModalBackdrop.style.display = 'none';
}
closeCreateChannelModalButton.addEventListener('click', hideCreateChannelModal);
cancelCreateChannelButton.addEventListener('click', hideCreateChannelModal);
createChannelModalBackdrop.addEventListener('click', (e) => {
  if (e.target === createChannelModalBackdrop) hideCreateChannelModal();
});
submitCreateChannelButton.addEventListener('click', () => {
  const channelName = newChannelNameInput.value.trim();
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
  channelToDelete = channelName;
  deleteChannelNameConfirm.textContent = `#${channelName}`;
  deleteChannelModalBackdrop.style.display = 'flex';
}
function hideDeleteChannelModal() {
  deleteChannelModalBackdrop.style.display = 'none';
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

// Settings Modal Logic
function showProfileSettingsModal() {
  window.electronAPI.requestOwnProfile();
  profileSettingsModalBackdrop.style.display = 'flex';
}
function hideProfileSettingsModal() {
  profileSettingsModalBackdrop.style.display = 'none';
  // Reset preview on close
  if (currentProfileData && currentProfileData.profilePicture) {
     settingsAvatarPreview.style.backgroundImage = `url('${currentProfileData.profilePicture}')`;
     settingsAvatarPreview.textContent = '';
  } else if (currentProfileData) {
     settingsAvatarPreview.textContent = localUsername.charAt(0)?.toUpperCase() || '?';
     settingsAvatarPreview.style.backgroundImage = '';
     settingsAvatarPreview.style.backgroundColor = getAvatarColor(localUsername);
  }
}
closeProfileSettingsModalButton.addEventListener('click', hideProfileSettingsModal);
cancelProfileSettingsButton.addEventListener('click', hideProfileSettingsModal);
profileSettingsModalBackdrop.addEventListener('click', (e) => {
  if (e.target === profileSettingsModalBackdrop) hideProfileSettingsModal();
});
saveProfileSettingsButton.addEventListener('click', () => {
  const newAboutMe = settingsAboutMeInput.value.trim();
  window.electronAPI.saveAboutMe(newAboutMe);
  hideProfileSettingsModal();
});

// Profile Picture Upload Logic
settingsAvatarPreview.addEventListener('click', () => {
  profilePictureInput.click();
});
profilePictureInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageDataUrl = e.target.result;
      if (imageDataUrl.length > 1.5 * 1024 * 1024) {
         alert('Image size is too large. Please choose an image under 1.5MB.');
         event.target.value = null;
         return;
      }
      settingsAvatarPreview.style.backgroundImage = `url('${imageDataUrl}')`;
      settingsAvatarPreview.textContent = '';
      window.electronAPI.saveProfilePicture(imageDataUrl);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      alert('Error reading image file.');
    };
    reader.readAsDataURL(file);
  } else if (file) {
    alert('Please select a valid image file (e.g., JPG, PNG, GIF).');
  }
  event.target.value = null;
});

// --- Channel UI ---
function renderChannelList() {
  channelListDiv.innerHTML = '';
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
  document.querySelectorAll('.channel-item').forEach((item) => {
    if (item.dataset.channel === currentChannel) item.classList.add('active');
    else item.classList.remove('active');
  });
  currentChannelSpan.textContent = currentChannel;
  messageInput.placeholder = `Message #${currentChannel}`;
}
sidebar.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.channel-item') || e.target.closest('#user-area'))
    return;
  e.preventDefault();
  if (isAdmin) window.electronAPI.showSidebarContextMenu();
});

// --- User List UI ---
function renderUserList() {
  const onlineCount = onlineUsers.length;
  const offlineCount = allUserDetails.length - onlineCount;
  userListOnlineDiv.innerHTML = `<h4>Online — <span id="online-count">${onlineCount}</span></h4>`;
  userListOfflineDiv.innerHTML = `<h4>Offline — <span id="offline-count">${offlineCount < 0 ? 0 : offlineCount}</span></h4>`;

  const sortedUserDetails = [...allUserDetails].sort((a, b) => a.username.localeCompare(b.username));

  // Clear previous lists
  while (userListOnlineDiv.childElementCount > 1) userListOnlineDiv.lastChild.remove();
  while (userListOfflineDiv.childElementCount > 1) userListOfflineDiv.lastChild.remove();

  sortedUserDetails.forEach((userDetail) => {
    const username = userDetail.username;
    const profilePicture = userDetail.profilePicture;
    const isOnline = onlineUsers.includes(username);

    const userItem = document.createElement('div');
    userItem.classList.add('user-list-item');
    userItem.classList.toggle('offline', !isOnline);
    userItem.dataset.username = username;

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('user-avatar');
    if (profilePicture) {
      avatarDiv.style.backgroundImage = `url('${profilePicture}')`;
      avatarDiv.textContent = '';
    } else {
      avatarDiv.textContent = username.charAt(0)?.toUpperCase() || '?';
      avatarDiv.style.backgroundColor = getAvatarColor(username);
      avatarDiv.style.backgroundImage = ''; // Ensure no leftover image
    }

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('user-name');
    nameSpan.textContent = username;

    userItem.appendChild(avatarDiv);
    userItem.appendChild(nameSpan);
    userItem.addEventListener('click', () =>
      window.electronAPI.getUserProfile(username)
    );

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
  if (messageData.channel !== currentChannel) return;
  const sender = messageData.sender || 'Unknown';
  const isConsecutive = sender === lastMessageSender;
  const messageId = messageData._id;
  let messageGroup;
  let contentDiv;

  const senderDetails = allUserDetails.find(u => u.username === sender);

  if (isConsecutive && messagesDiv.lastElementChild?.classList.contains('message-group')) {
    messageGroup = messagesDiv.lastElementChild;
    contentDiv = messageGroup.querySelector('.message-group-content');
    messageGroup.style.marginTop = '2px';
  } else {
    messageGroup = document.createElement('div');
    messageGroup.classList.add('message-group');
    messageGroup.dataset.sender = sender;

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('message-avatar');
    if (senderDetails?.profilePicture) {
      avatarDiv.style.backgroundImage = `url('${senderDetails.profilePicture}')`;
      avatarDiv.textContent = '';
    } else {
      avatarDiv.textContent = sender.charAt(0)?.toUpperCase() || '?';
      avatarDiv.style.backgroundColor = getAvatarColor(sender);
      avatarDiv.style.backgroundImage = '';
    }
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
  textDiv.dataset.messageId = messageId;

  // Check if it's an attachment message
  if (messageData.attachment) {
    const attachment = messageData.attachment;
    // Check if it's an image type
    if (attachment.type && attachment.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = attachment.url;
      img.alt = attachment.name;
      img.title = `${attachment.name} (${formatFileSize(attachment.size)})`;
      img.classList.add('message-attachment-image');
      // Optional: Add click to open full image? For now, just display.
      textDiv.appendChild(img);
    } else {
      // Generic attachment link for non-images
      const link = document.createElement('a');
      link.href = attachment.url;
      link.textContent = `${attachment.name} (${formatFileSize(attachment.size)})`;
      link.target = '_blank'; // Open in default browser
      link.rel = 'noopener noreferrer';
      link.title = `Type: ${attachment.type}\nClick to download/view`;
      link.classList.add('attachment-link');
      textDiv.appendChild(link);
    }
  } else {
    // Regular text message
    textDiv.textContent = messageData.text;
  }

  if (messageData.edited && !messageData.attachment) { // Don't show (edited) for attachments for now
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

  const wasNearBottom = isScrolledNearBottom; // Check before adding the message

  // (Keep existing message group logic...)
  // ... [avatar, header, contentDiv setup] ...

  contentDiv.appendChild(textDiv);
  lastMessageSender = sender;

  // Scroll logic
  if (sender === localUsername || wasNearBottom) {
    // If sent by self OR user was already near bottom, scroll down
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    isScrolledNearBottom = true; // Ensure state is correct
    hideNewMessagesBar(); // Hide bar if we auto-scrolled
  } else {
    // User is scrolled up, show/update notification bar
    newMessagesCount++;
    showNewMessagesBar();
  }
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  hideNewMessagesBar();
}

function showNewMessagesBar() {
  if (newMessagesCount > 0) {
    newMessagesBar.querySelector('span').textContent = `${newMessagesCount} New Message${newMessagesCount > 1 ? 's' : ''} Below`;
    newMessagesBar.style.display = 'block';
  }
}

function hideNewMessagesBar() {
  newMessagesCount = 0;
  newMessagesBar.style.display = 'none';
}

function clearMessages() {
  messagesDiv.innerHTML = '';
  lastMessageSender = null;
  isScrolledNearBottom = true; // Reset scroll state
  hideNewMessagesBar(); // Hide bar on clear
}
function handleEditMessage(messageId) {
  const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${messageId}"]`);
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
  const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${payload._id}"]`);
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
  const messageTextDiv = messagesDiv.querySelector(`.message-text[data-message-id="${payload._id}"]`);
  if (messageTextDiv && payload.channel === currentChannel) {
    const groupContent = messageTextDiv.closest('.message-group-content');
    const messageGroup = messageTextDiv.closest('.message-group');
    messageTextDiv.remove();
    if (groupContent && groupContent.querySelectorAll('.message-text').length === 0) {
      messageGroup?.remove();
      if (messagesDiv.lastElementChild !== messageGroup) {
         lastMessageSender = messagesDiv.lastElementChild?.dataset.sender || null;
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

  if (status.username) localUsername = status.username;
  if (status.isAdmin !== undefined) isAdmin = status.isAdmin;
  if (status.currentChannel) currentChannel = status.currentChannel;
  // Update local profile data cache if picture comes from status
  if (status.profilePicture !== undefined) {
     if (!currentProfileData) currentProfileData = {};
     currentProfileData.profilePicture = status.profilePicture;
  }

  if (status.connected) {
    statusText = 'Online';
    serverInfoText = '';
    userAreaUsername.textContent = localUsername;
    // Update user area avatar
    if (currentProfileData?.profilePicture) {
      userAreaAvatar.textContent = '';
      userAreaAvatar.style.backgroundImage = `url('${currentProfileData.profilePicture}')`;
      userAreaAvatar.style.backgroundColor = '';
    } else {
      userAreaAvatar.textContent = localUsername.charAt(0)?.toUpperCase() || '?';
      userAreaAvatar.style.backgroundImage = '';
      userAreaAvatar.style.backgroundColor = getAvatarColor(localUsername);
    }
  } else if (status.wsConnected) {
    statusText = 'Authenticating...';
    serverInfoText = '';
    userAreaUsername.textContent = 'Connecting...';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundImage = '';
    userAreaAvatar.style.backgroundColor = '#7289da';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else if (status.connecting) {
    statusText = `Connecting...`;
    serverInfoText = '';
    userAreaUsername.textContent = 'Connecting...';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundImage = '';
    userAreaAvatar.style.backgroundColor = '#7289da';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else if (status.error) {
    statusText = `Error: ${status.error}`;
    serverInfoText = '';
    userAreaUsername.textContent = 'Error';
    userAreaAvatar.textContent = '!';
    userAreaAvatar.style.backgroundImage = '';
    userAreaAvatar.style.backgroundColor = '#f04747';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  } else { // Disconnected state
    statusText = 'Disconnected';
    serverInfoText = '';
    userAreaUsername.textContent = 'Offline';
    userAreaAvatar.textContent = '?';
    userAreaAvatar.style.backgroundImage = '';
    userAreaAvatar.style.backgroundColor = '#72767d';
    if (authView.style.display === 'none') showAuthView(isLoginMode);
  }

  connectionStatusSpan.textContent = statusText;
  hostInfoSpan.textContent = serverInfoText;
  currentChannelSpan.textContent = currentChannel || '...';
  const isLoggedIn = !!localUsername && status.connected;
  messageInput.disabled = !isLoggedIn;
  attachmentButton.disabled = !isLoggedIn;

  if (isLoggedIn) {
    updateChannelHighlight();
    renderChannelList();
    userSettingsButton.style.display = 'block';
  } else {
    channelListDiv.innerHTML = '';
    userSettingsButton.style.display = 'none';
  }
}

// --- Typing Indicator ---
function updateTypingIndicator() {
  const typingNames = currentlyTypingUsers.filter((name) => name !== localUsername);
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
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (username && password) {
    hideAuthError();
    window.electronAPI.sendLogin({ username, password });
  } else {
    showAuthError('Please enter both username and password.');
  }
});
signupButton.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (username && password) {
    hideAuthError();
    window.electronAPI.sendSignup({ username, password });
  } else {
    showAuthError('Please enter both username and password.');
  }
});
function attachToggleListeners() {
  const signupLink = document.getElementById('toggle-signup');
  const loginLink = document.getElementById('toggle-login');
  if (signupLink) signupLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(false); });
  if (loginLink) loginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(true); });
}
attachToggleListeners();
// Send button removed
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !messageInput.disabled) {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text) {
      window.electronAPI.sendMessage(text);
      messageInput.value = '';
      window.electronAPI.stopTyping();
    }
  }
});
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (isLoginMode) loginButton.click();
    else signupButton.click();
  }
});
messageInput.addEventListener('input', () => {
  if (!messageInput.disabled) {
    window.electronAPI.startTyping();
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      window.electronAPI.stopTyping();
    }, 2500);
  }
});
userSettingsButton.addEventListener('click', showProfileSettingsModal);
attachmentButton.addEventListener('click', () => {
  if (!attachmentButton.disabled) {
    attachmentInput.click(); // Trigger hidden file input
  }
});

// Listener for the hidden file input
attachmentInput.addEventListener('change', (event) => {
  const files = event.target.files;
  if (files.length > 0) {
    console.log('Files selected:', files);

    for (const file of files) {
      // Basic size check (e.g., 10MB limit for now)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`File "${file.name}" is too large (max ${maxSize / 1024 / 1024}MB).`);
        continue; // Skip this file
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        console.log(`Read file "${file.name}" (${arrayBuffer.byteLength} bytes)`);
        // Send file data via IPC
        window.electronAPI.sendFileAttachment({
          name: file.name,
          type: file.type,
          data: arrayBuffer, // Send ArrayBuffer directly
        });
      };

      reader.onerror = (error) => {
        console.error(`Error reading file "${file.name}":`, error);
        alert(`Error reading file "${file.name}".`);
      };

      reader.readAsArrayBuffer(file); // Read as ArrayBuffer
    }

    // Reset the input value so the same file can be selected again if needed
    event.target.value = null;
  }
});

// Scroll listener for messages div
messagesDiv.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    const threshold = 100; // Pixels from bottom to be considered "near"
    const position = messagesDiv.scrollTop + messagesDiv.clientHeight;
    const height = messagesDiv.scrollHeight;
    isScrolledNearBottom = position >= height - threshold;

    if (isScrolledNearBottom) {
      hideNewMessagesBar(); // Hide bar if user scrolls down manually
    }
    // console.log('Scroll Pos:', messagesDiv.scrollTop, 'Near Bottom:', isScrolledNearBottom); // Debugging
  }, 100); // Debounce scroll checks
});

// Click listener for the new messages bar
newMessagesBar.addEventListener('click', scrollToBottom);


// --- IPC Listeners ---
window.electronAPI.onSignupResponse((response) => {
  console.log('Signup Response:', response);
  if (response.success) {
    showAuthView(true);
    alert('Signup successful! Please log in.');
  } else {
    showAuthError(response.error || 'Signup failed.');
  }
});
window.electronAPI.onLoginResponse((response) => {
  console.log('Login Response:', response);
  if (response.success) {
    localUsername = response.username;
    isAdmin = response.isAdmin || false;
    currentChannel = 'general';
    currentProfileData = {
       username: response.username,
       isAdmin: response.isAdmin,
       profilePicture: response.profilePicture,
       aboutMe: response.aboutMe
    };
    hideAuthError();
    showChatView();
    updateStatus({
       connected: true,
       username: localUsername,
       isAdmin: isAdmin,
       currentChannel: currentChannel,
       profilePicture: currentProfileData.profilePicture
    });
    connectionStatusSpan.textContent = 'Online';
    userSettingsButton.style.display = 'block';
  } else {
    showAuthError(response.error || 'Login failed.');
  }
});
window.electronAPI.onChannelList((response) => {
  console.log('Channel List:', response.payload);
  availableChannels = response.payload || ['general'];
  renderChannelList();
});
window.electronAPI.onMessageReceived((messageData) => {
  addMessage(messageData);
});
window.electronAPI.onLoadHistory((data) => {
  console.log(`Loading history for channel: ${data.channel}`);
  currentChannel = data.channel;
  updateChannelHighlight();
  clearMessages(); // Resets scroll state and hides bar
  data.payload.forEach((msg) => addMessage(msg));
  // Ensure initial scroll to bottom after history load
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  isScrolledNearBottom = true; // Explicitly set after load
});
window.electronAPI.onStatusUpdate((status) => {
  updateStatus(status);
});
window.electronAPI.onSendError((errorMsg) => {
  console.error('Send Error:', errorMsg);
  if (chatView.style.display !== 'none') {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = '#f04747';
    errorDiv.style.fontStyle = 'italic';
    errorDiv.style.padding = '5px 20px';
    errorDiv.textContent = `Error: ${errorMsg}`;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    setTimeout(() => {
      if (errorDiv.parentNode === messagesDiv) messagesDiv.removeChild(errorDiv);
    }, 5000);
  } else {
    showAuthError(`Send Error: ${errorMsg}`);
  }
});
window.electronAPI.onUserProfileResponse((response) => {
  if (response.success) {
    showProfileModal(response.profile);
  } else {
    alert(`Error fetching profile: ${response.error}`);
  }
});
window.electronAPI.onError((errorData) => {
  alert(`Server Error: ${errorData.message}`);
});
window.electronAPI.onPromptCreateChannel(() => {
  showCreateChannelModal();
});
window.electronAPI.onConfirmDeleteChannel((channelName) => {
  showDeleteChannelModal(channelName);
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
  console.log('Received user list update:', payload);
  allUserDetails = payload.all || []; // Store detailed user list
  onlineUsers = payload.online || [];
  renderUserList(); // Re-render user list
});
window.electronAPI.onPartyModeUpdate((payload) => {
  partyModeActive = payload.active;
  document.body.classList.toggle('party-mode', partyModeActive);
  console.log(`Party mode for this client is now ${partyModeActive ? 'ON' : 'OFF'}`);
});
window.electronAPI.onTypingUpdate((payload) => {
  console.log('Received typing update:', payload);
  currentlyTypingUsers = payload.typing || [];
  updateTypingIndicator();
});
window.electronAPI.onOwnProfileResponse((profile) => {
  if (profile) {
    currentProfileData = profile;
    settingsAboutMeInput.value = profile.aboutMe || '';
    if (profile.profilePicture) {
      settingsAvatarPreview.style.backgroundImage = `url('${profile.profilePicture}')`;
      settingsAvatarPreview.textContent = '';
    } else {
      settingsAvatarPreview.textContent = localUsername.charAt(0)?.toUpperCase() || '?';
      settingsAvatarPreview.style.backgroundImage = '';
      settingsAvatarPreview.style.backgroundColor = getAvatarColor(localUsername);
    }
    settingsAboutMeInput.disabled = false;
    saveProfileSettingsButton.disabled = false;
    settingsAboutMeInput.focus();
  } else {
    console.error('Failed to load own profile data for settings.');
    settingsAboutMeInput.value = 'Error loading profile.';
    settingsAboutMeInput.disabled = true;
    saveProfileSettingsButton.disabled = true;
  }
});

// Listener for profile updates (e.g., picture change)
window.electronAPI.onProfileUpdated((payload) => {
   console.log('Profile updated:', payload);
   // Update local cache for all users
   const userIndex = allUserDetails.findIndex(u => u.username === payload.username);
   if (userIndex !== -1) {
      allUserDetails[userIndex].profilePicture = payload.profilePicture;
   }
   // Update own profile data if it's us
   if (payload.username === localUsername) {
      if (currentProfileData) currentProfileData.profilePicture = payload.profilePicture;
      // Update user area avatar immediately
      updateStatus({ connected: true, username: localUsername, profilePicture: payload.profilePicture });
   }
   // Re-render lists/messages to show new avatar
   renderUserList();
   // Re-render messages currently in view to update avatar
   document.querySelectorAll(`.message-group[data-sender="${payload.username}"] .message-avatar`).forEach(avatarDiv => {
       if (payload.profilePicture) {
           avatarDiv.style.backgroundImage = `url('${payload.profilePicture}')`;
           avatarDiv.textContent = '';
       } else {
           avatarDiv.textContent = payload.username.charAt(0)?.toUpperCase() || '?';
           avatarDiv.style.backgroundImage = '';
           avatarDiv.style.backgroundColor = getAvatarColor(payload.username);
       }
   });
});


// Request initial status
window.electronAPI.requestStatus();
// Clean up listeners
window.addEventListener('beforeunload', () => {
  window.electronAPI.cleanupListeners();
});
// Initialize view
showAuthView(true);

console.log('renderer.js updated with profile picture display logic');

// --- Utility Functions (Avatar Color) ---
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
function formatFileSize(bytes, si = false, dp = 1) {
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }
  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10 ** dp;
  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );
  return bytes.toFixed(dp) + ' ' + units[u];
}
function getAvatarColor(username) {
  const colors = [
    '#7289da', '#43b581', '#faa61a', '#f04747',
    '#1abc9c', '#e91e63', '#f1c40f', '#3498db',
    '#9b59b6', '#e74c3c', '#11806a', '#95a5a6'
  ];
  const hash = simpleHash(username || 'default');
  return colors[hash % colors.length];
}
