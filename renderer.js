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
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button'); // Still exists, just hidden by CSS
const connectionStatusSpan = document.getElementById('connection-status');
const hostInfoSpan = document.getElementById('host-info'); // Server URL
const userInfoSpan = document.getElementById('user-info'); // Logged in user

// --- State ---
let localUsername = '';
let isLoginMode = true;

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
    sendButton.disabled = false; // Enable hidden button too
    messageInput.focus();
}

function showAuthError(message) {
    authErrorDiv.textContent = message;
    authErrorDiv.style.display = 'block';
}

function hideAuthError() {
    authErrorDiv.textContent = '';
    authErrorDiv.style.display = 'none';
}


// --- Helper Functions ---
// Simple hash function for consistent avatar colors (optional)
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Generate a color based on username hash (optional)
function getAvatarColor(username) {
    const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#1abc9c', '#e91e63', '#f1c40f'];
    const hash = simpleHash(username || 'default');
    return colors[hash % colors.length];
}


function addMessage(messageData) {
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message');

    const sender = messageData.sender || 'Unknown';
    const firstLetter = sender.charAt(0) || '?';

    // Avatar Div
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('message-avatar');
    avatarDiv.textContent = firstLetter;
    avatarDiv.style.backgroundColor = getAvatarColor(sender); // Assign color based on username

    // Content Div
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    // Header Div (Sender + Timestamp)
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('message-header');

    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender');
    senderSpan.textContent = sender; // Display full username

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = messageData.timestamp ? new Date(messageData.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; // Format time

    headerDiv.appendChild(senderSpan);
    headerDiv.appendChild(timestampSpan);

    // Text Div
    const textDiv = document.createElement('div');
    textDiv.classList.add('message-text');
    textDiv.textContent = messageData.text; // Use textContent to prevent HTML injection

    // Assemble Content
    contentDiv.appendChild(headerDiv);
    contentDiv.appendChild(textDiv);

    // Assemble Message
    messageContainer.appendChild(avatarDiv);
    messageContainer.appendChild(contentDiv);

    messagesDiv.appendChild(messageContainer);

    // Scroll to bottom
    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 5; // Add tolerance
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() {
    messagesDiv.innerHTML = '';
}

function updateStatus(status) {
    console.log("Status Update:", status);
    let statusText = '';
    let serverInfoText = '';
    let userInfoText = '';

    if (status.username) {
         localUsername = status.username; // Keep track of own username
    }

    if (status.connected) {
        statusText = 'Online';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = `${localUsername}`; // Just show username
        // Don't call showChatView here - let login response handle it
    } else if (status.wsConnected) {
        statusText = 'Connected (Not Logged In)';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else if (status.connecting) {
        statusText = `Connecting...`; // Simpler connecting message
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else if (status.error) {
        statusText = `Error: ${status.error}`;
        serverInfoText = '';
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else {
        statusText = 'Disconnected';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
    }

    connectionStatusSpan.textContent = statusText;
    hostInfoSpan.textContent = serverInfoText;
    userInfoSpan.textContent = userInfoText; // Update user info span

    const isLoggedIn = !!localUsername; // Base disabled state on localUsername
    messageInput.disabled = !isLoggedIn;
    sendButton.disabled = !isLoggedIn;
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
    if (signupLink) {
        signupLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(false); });
    }
    if (loginLink) {
        loginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthView(true); });
    }
}
attachToggleListeners();


sendButton.addEventListener('click', () => { // Still needed for Enter key fallback
    const text = messageInput.value.trim();
    if (text && !messageInput.disabled) {
        window.electronAPI.sendMessage(text);
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    // Send on Enter, but not Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey && !messageInput.disabled) {
        e.preventDefault(); // Prevent newline in input
        sendButton.click(); // Trigger send logic
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (isLoginMode) loginButton.click();
        else signupButton.click();
    }
});


// --- IPC Listeners ---
window.electronAPI.onSignupResponse(response => {
    console.log('Signup Response:', response);
    if (response.success) {
        showAuthView(true);
        alert('Signup successful! Please log in.');
    } else {
        showAuthError(response.error || 'Signup failed.');
    }
});

window.electronAPI.onLoginResponse(response => {
    console.log('Login Response:', response);
    if (response.success) {
        localUsername = response.username; // Store username
        hideAuthError();
        showChatView();
        userInfoSpan.textContent = `${localUsername}`; // Update user info immediately
        connectionStatusSpan.textContent = 'Online';
    } else {
        showAuthError(response.error || 'Login failed.');
    }
});


window.electronAPI.onMessageReceived((messageData) => {
    addMessage(messageData);
});

window.electronAPI.onLoadHistory((history) => {
    console.log('Renderer loading history:', history);
    clearMessages();
    history.forEach(msg => addMessage(msg));
    // Scroll to bottom after loading history
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

window.electronAPI.onStatusUpdate((status) => {
    updateStatus(status);
});

window.electronAPI.onSendError((errorMsg) => {
    console.error('Send Error:', errorMsg);
    if (chatView.style.display !== 'none') {
        const errorDiv = document.createElement('div');
        errorDiv.style.color = '#f04747'; // Use Discord red
        errorDiv.style.fontStyle = 'italic';
        errorDiv.style.padding = '5px 20px'; // Match message padding
        errorDiv.textContent = `Error: ${errorMsg}`;
        messagesDiv.appendChild(errorDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        setTimeout(() => {
            if (errorDiv.parentNode === messagesDiv) {
                messagesDiv.removeChild(errorDiv);
            }
        }, 5000);
    } else {
        showAuthError(`Send Error: ${errorMsg}`);
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

console.log('renderer.js loaded with Discord UI logic');
